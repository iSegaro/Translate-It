# Streaming + Placeholder Integration Specification

## Overview

This specification defines how the streaming translation workflow integrates with the placeholder-based extraction system. The goal is to enable real-time streaming feedback while preserving inline elements during translation.

## Problem Statement

### Original Conflict

The placeholder system and streaming system were fundamentally incompatible:

| Aspect | Placeholder System | Streaming System |
|--------|-------------------|------------------|
| **DOM Modification** | Single complete update at end | Progressive updates during translation |
| **Element Preservation** | Expects original structure intact | Replaces nodes immediately |
| **Timing** | After translation completes | During translation |
| **Reassembly** | Uses registry references | Uses node matching |

### Current State (Problematic)

```
1. Extraction: "Hello [0] world [1]" with registry [0]→<em>, [1]→<strong>
2. API Request: Send to provider with placeholders
3. STREAMING STARTS:
   - Update 1 arrives: "سلام [0] جهان [1]"
   - StreamingUpdateService applies directly to TEXT_NODES
   - Creates wrappers, modifies DOM, LOSES registry references
4. STREAMING ENDS:
   - _handlePlaceholderTranslation tries to reassemble
   - But original structure is GONE (modified by streaming)
   - Registry references point to missing elements
5. RESULT: Broken page, misplaced content
```

### Current Workaround

The current implementation detects placeholder translations and skips streaming:

```javascript
// In StreamEndService._handleStreamEndSuccess (line 112-124)
if (request.placeholderRegistry && request.blockContainer) {
  // Route to placeholder handler (non-streaming)
  await this._handlePlaceholderTranslation(request, data, targetLanguage);
  return;
}
```

**Problem**: This disables real-time streaming feedback for placeholder translations.

## Solution Architecture

### Design Principles

1. **DOM Structure Preservation**: Never replace block container innerHTML during streaming
2. **Text-Only Streaming**: Only update text portions between placeholders, preserve placeholder markers
3. **Placeholder Marker Protection**: Never modify `[0]`, `[1]` markers during streaming
4. **Final Reassembly Authority**: Only perform DOM modification at stream completion
5. **Graceful Fallback**: Detect placeholder loss and fall back to atomic extraction

### Integration Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 1: EXTRACTION                                             │
├─────────────────────────────────────────────────────────────────┤
│ 1. Detect block container: <p>Agent <em>Zero</em> AI</p>       │
│ 2. Extract text with placeholders: "Agent [0] AI"              │
│ 3. Build PlaceholderRegistry: [0] → <em>Zero</em>              │
│ 4. Mark request: request.placeholderRegistry = registry        │
│ 5. Mark request: request.blockContainer = pElement              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 2: STREAMING (Placeholder-Aware)                         │
├─────────────────────────────────────────────────────────────────┤
│ For each streaming update:                                       │
│   1. Check if request.placeholderRegistry exists                │
│   2. If YES → Use placeholder-aware streaming:                  │
│      - Parse translated text for placeholders: "سلام [0] هوش"  │
│      - Extract text portions between placeholders               │
│      - Update text content ONLY, preserve placeholder markers   │
│      - NEVER modify block container innerHTML                   │
│   3. If NO → Use regular streaming:                             │
│      - Apply translations to individual text nodes              │
│      - Create wrappers as needed                                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 3: STREAM END (Reassembly)                               │
├─────────────────────────────────────────────────────────────────┤
│ If request.placeholderRegistry exists:                          │
│   1. Collect all streaming results                             │
│   2. Parse final translation for placeholder markers           │
│   3. Validate all placeholders present                         │
│   4. Replace placeholders with original DOM elements           │
│   5. Apply complete HTML to block container (ONCE)             │
│   6. Clear placeholder registry                                │
│ Else:                                                           │
│   - Use regular streaming result handling                      │
└─────────────────────────────────────────────────────────────────┘
```

## Component Specifications

### 1. PlaceholderRegistry (Enhanced)

**File**: `src/features/element-selection/utils/PlaceholderRegistry.js`

**New Properties**:
```javascript
export class PlaceholderRegistry {
  constructor() {
    this.placeholders = new Map(); // Map<number, HTMLElement>
    this.counter = 0;
    this.isStreaming = false; // NEW: Track streaming state
    this.streamingUpdates = []; // NEW: Track streaming update history
  }

  // NEW: Mark registry as active for streaming
  startStreaming() {
    this.isStreaming = true;
    this.streamingUpdates = [];
  }

  // NEW: Store streaming update
  addStreamingUpdate(update) {
    if (!this.isStreaming) return;
    this.streamingUpdates.push({
      timestamp: Date.now(),
      ...update
    });
  }

  // NEW: Complete streaming and return history
  endStreaming() {
    this.isStreaming = false;
    const history = [...this.streamingUpdates];
    this.streamingUpdates = [];
    return history;
  }
}
```

### 2. StreamingUpdateService (Modified)

**File**: `src/features/element-selection/managers/services/StreamingUpdateService.js`

**New Method**: `_applyPlaceholderAwareStreaming`

```javascript
/**
 * Apply streaming translations while preserving placeholder structure
 * @private
 * @param {Array} textNodes - Text nodes to update
 * @param {Map} newTranslations - New translations to apply
 * @param {Object} request - Translation request with placeholderRegistry
 */
async _applyPlaceholderAwareStreaming(textNodes, newTranslations, request) {
  const { placeholderRegistry, blockContainer } = request;

  this.logger.debug('Applying placeholder-aware streaming updates', {
    registrySize: placeholderRegistry.size,
    textNodesCount: textNodes.length
  });

  // Notify registry of streaming start
  if (!placeholderRegistry.isStreaming) {
    placeholderRegistry.startStreaming();
  }

  // CRITICAL: Find the text node within block container that matches original text
  // DO NOT modify block container innerHTML during streaming
  for (const [originalText, translationData] of newTranslations.entries()) {
    // Find text node in block container
    const textNode = this._findTextNodeInBlock(blockContainer, originalText);

    if (!textNode) {
      this.logger.debug('Text node not found in block container', { originalText });
      continue;
    }

    // Check if translation contains placeholders
    const translatedText = typeof translationData === 'object'
      ? translationData.text
      : translationData;

    if (!containsPlaceholders(translatedText)) {
      this.logger.debug('Translation has no placeholders, skipping streaming update');
      continue;
    }

    // Extract text portions between placeholders
    const textPortions = this._extractTextBetweenPlaceholders(translatedText);

    // Update text node content while preserving placeholders in display
    // Note: We don't actually update DOM during streaming for placeholder translations
    // We just track the streaming progress for UI feedback
    placeholderRegistry.addStreamingUpdate({
      originalText,
      translatedText,
      textPortions
    });

    this.logger.debug('Recorded streaming update for placeholder translation', {
      originalPreview: originalText.substring(0, 30),
      translatedPreview: translatedText.substring(0, 30)
    });
  }

  // Trigger UI update to show streaming progress
  this._showStreamingProgress(placeholderRegistry);
}
```

**New Method**: `_extractTextBetweenPlaceholders`

```javascript
/**
 * Extract text portions between placeholder markers
 * @private
 * @param {string} text - Text with placeholders: "Hello [0] world [1]"
 * @returns {Array<string>} Text portions between placeholders
 */
_extractTextBetweenPlaceholders(text) {
  const portions = [];
  const regex = /\[\s*\d+\s*\]/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      portions.push(text.substring(lastIndex, match.index));
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    portions.push(text.substring(lastIndex));
  }

  return portions;
}
```

### 3. StreamEndService (Enhanced)

**File**: `src/features/element-selection/managers/services/StreamEndService.js`

**Modified Method**: `_handleStreamEndSuccess`

The existing placeholder handling at lines 112-124 is enhanced to work with streaming results:

```javascript
async _handleStreamEndSuccess(messageId, request) {
  // CRITICAL: Check if this is a placeholder-based translation
  if (request.placeholderRegistry && request.blockContainer) {
    this.logger.debug('Detected placeholder-based translation with streaming');

    // Notify registry of streaming end
    const streamingHistory = request.placeholderRegistry.endStreaming();

    // Build data object from streaming segments
    const data = {
      translatedText: this._extractTranslationFromSegments(request),
      streamingHistory // Include streaming history for debugging
    };

    await this._handlePlaceholderTranslation(request, data, targetLanguage);
    return;
  }

  // Regular streaming translation processing (non-placeholder)
  // ... existing code ...
}
```

**Enhanced Method**: `_handlePlaceholderTranslation`

```javascript
async _handlePlaceholderTranslation(request, data, targetLanguage) {
  const { translatedText } = data;
  const { placeholderRegistry, blockContainer, id } = request;

  this.logger.debug('Processing placeholder translation', {
    translatedTextLength: translatedText?.length,
    registrySize: placeholderRegistry?.size,
    streamingHistory: data.streamingHistory?.length || 0
  });

  try {
    // CRITICAL FIX: Save original innerHTML BEFORE applying translation
    const originalInnerHTML = blockContainer.innerHTML;

    // Store original structure in data attribute for revert functionality
    if (!blockContainer.hasAttribute('data-original-html')) {
      blockContainer.setAttribute('data-original-html', originalInnerHTML);
    }

    // Parse the translated text
    let parsedData;
    try {
      parsedData = JSON.parse(translatedText);
    } catch (error) {
      this.logger.error('Failed to parse translation JSON:', error);
      throw new Error(`Invalid JSON response from translation API: ${error.message}`);
    }

    // Extract the translated text
    const translatedTextContent = Array.isArray(parsedData)
      ? (parsedData[0]?.text || parsedData[0] || '')
      : (parsedData.text || '');

    // Validate placeholders
    const placeholders = extractPlaceholdersFromTranslation(translatedTextContent);
    const expectedIds = placeholderRegistry.getAllIds();
    const foundIds = new Set(placeholders.map(p => p.id));
    const missingIds = expectedIds.filter(id => !foundIds.has(id));

    if (missingIds.length > 0) {
      this.logger.warn('Missing placeholders in translation', {
        missingIds,
        foundIds: Array.from(foundIds)
      });

      // Fallback to atomic extraction
      return await this._fallbackToAtomicExtraction(request, translatedTextContent);
    }

    // Reassemble the translation with placeholders replaced by original elements
    const reassemblyResult = reassembleTranslationWithPlaceholders(
      translatedTextContent,
      placeholderRegistry,
      blockContainer
    );

    if (!reassemblyResult.success) {
      this.logger.error('Reassembly failed:', {
        missingIds: reassemblyResult.missingIds
      });

      // Fallback to atomic extraction
      return await this._fallbackToAtomicExtraction(request, translatedTextContent);
    }

    const reassembledHTML = reassemblyResult.html;

    // Apply the reassembled HTML to the block container
    await applyReassembledHTML(blockContainer, reassembledHTML);

    // Apply RTL direction if needed
    await this.uiManager.directionManager.applyImmersiveTranslatePattern(
      blockContainer,
      new Map([[blockContainer.textContent, reassembledHTML]]),
      id,
      targetLanguage
    );

    // Add translated element with ORIGINAL content (before translation)
    const orchestrator = this.uiManager.orchestrator;
    orchestrator.stateManager.addTranslatedElement(
      blockContainer,
      new Map([[blockContainer.textContent, reassembledHTML]]),
      originalInnerHTML
    );

    // Mark request as completed
    orchestrator.requestManager.updateRequestStatus(id, 'completed', {
      result: { success: true, applied: true }
    });

    // Set global flag
    window.lastCompletedTranslationId = id;
    window.isTranslationInProgress = false;

    // Notify coordinator
    unifiedTranslationCoordinator.completeStreamingOperation(id, {
      success: true,
      applied: true
    });

    this.logger.debug('Placeholder translation applied successfully');
  } catch (error) {
    this.logger.error('Placeholder translation failed:', error);
    throw error;
  }
}
```

**New Method**: `_fallbackToAtomicExtraction`

```javascript
/**
 * Fallback to atomic extraction when placeholder system fails
 * @private
 * @param {Object} request - Translation request
 * @param {string} translatedText - Translated text (with or without placeholders)
 */
async _fallbackToAtomicExtraction(request, translatedText) {
  this.logger.warn('Falling back to atomic extraction', {
    messageId: request.id,
    translatedTextLength: translatedText?.length
  });

  // Strip placeholder markers from translated text
  const cleanText = translatedText.replace(/\[\s*\d+\s*\]/g, ' ');

  // TODO: Implement atomic extraction fallback
  // This would require re-extracting text at node level and re-translating
  // For now, log the failure
  this.logger.error('Atomic extraction fallback not yet implemented');

  throw new Error('Placeholder translation failed and fallback not available');
}
```

### 4. TranslationOrchestrator (Modified)

**File**: `src/features/element-selection/managers/services/TranslationOrchestrator.js`

**Enhanced Decision Logic**:

```javascript
/**
 * Determine if streaming should be used for this translation
 * @param {Object} request - Translation request
 * @returns {boolean} True if streaming should be used
 */
shouldUseStreaming(request) {
  const { textsToTranslate, placeholderRegistry } = request;

  // Calculate total character count
  const totalChars = textsToTranslate.join('').length;

  // If placeholders are present, always use streaming (for consistency)
  if (placeholderRegistry && placeholderRegistry.size > 0) {
    this.logger.debug('Placeholders detected, using streaming for consistency');
    return true;
  }

  // Otherwise, use existing streaming thresholds
  return totalChars > 1000 || textsToTranslate.length > 3;
}
```

## State Management

### Placeholder Registry Lifecycle

```
1. EXTRACTION PHASE:
   placeholderRegistry = new PlaceholderRegistry()
   placeholderRegistry.startStreaming()

2. STREAMING PHASE:
   For each update:
     placeholderRegistry.addStreamingUpdate(update)

3. REASSEMBLY PHASE:
   streamingHistory = placeholderRegistry.endStreaming()
   // Use streamingHistory for debugging if needed

4. CLEANUP PHASE:
   placeholderRegistry.clear()
```

### Request Object Structure

```javascript
{
  id: "message-123",
  element: <HTMLElement>,
  blockContainer: <HTMLElement>, // For placeholder translations
  placeholderRegistry: PlaceholderRegistry, // For placeholder translations
  textsToTranslate: ["Agent [0] AI [1]!"],
  expandedTexts: [...],
  translatedSegments: Map,
  originMapping: [...],
  status: "pending" | "streaming" | "completed" | "error",
  hasErrors: false
}
```

## Fallback Strategy

### Placeholder Validation

```javascript
/**
 * Validate if translation preserved all placeholders
 * @param {string} translatedText - Translated text with placeholders
 * @param {PlaceholderRegistry} registry - Expected placeholders
 * @returns {Object} Validation result
 */
function validatePlaceholders(translatedText, registry) {
  const placeholders = extractPlaceholdersFromTranslation(translatedText);
  const expectedIds = registry.getAllIds();
  const foundIds = new Set(placeholders.map(p => p.id));
  const missingIds = expectedIds.filter(id => !foundIds.has(id));

  return {
    valid: missingIds.length === 0,
    missingIds,
    foundCount: foundIds.size,
    expectedCount: expectedIds.length
  };
}
```

### Fallback Triggers

1. **Missing Placeholders**: `missingIds.length > 0`
2. **Modified Placeholders**: `[0]` → `[ 0 ]` (with spaces)
3. **Invalid Registry**: Registry references point to missing elements
4. **Provider Stripped Placeholders**: No placeholders found in translation

### Fallback Implementation

```javascript
// In StreamEndService
if (!validatePlaceholders(translatedText, placeholderRegistry).valid) {
  this.logger.warn('Placeholder validation failed, falling back to atomic extraction');
  return await this._fallbackToAtomicExtraction(request, translatedText);
}
```

## Testing Scenarios

### Scenario 1: Successful Streaming with Placeholders

**Input**:
```html
<p>Agent <em>Zero</em> AI <strong>rocks</strong>!</p>
```

**Extraction**:
```
Text: "Agent [0] AI [1]!"
Registry: [0] → <em>Zero</em>, [1] → <strong>rocks</strong>
```

**Streaming Updates**:
```
Update 1: "عامل [0] هوش"
Update 2: "عامل [0] هوش مصنوعی [1]"
Update 3: "عامل [0] هوش مصنوعی [1] عالی است!"
```

**Expected Result**:
```html
<p>عامل <em>Zero</em> هوش مصنوعی <strong>rocks</strong> عالی است!</p>
```

**Verification**:
- [ ] No page corruption
- [ ] Inline elements preserved
- [ ] Streaming updates recorded in registry
- [ ] Final reassembly successful

### Scenario 2: Placeholder Loss Fallback

**Input**:
```html
<p>Click <a href="#">here</a> to continue</p>
```

**Extraction**:
```
Text: "Click [0] to continue"
Registry: [0] → <a href="#">here</a>
```

**Streaming Update**:
```
Update 1: "اینجا کلیک کنید برای ادامه"
(Placeholders stripped by provider)
```

**Expected Result**:
- Detect missing placeholders
- Fall back to atomic extraction
- Log warning for debugging

**Verification**:
- [ ] Placeholder validation fails
- [ ] Fallback triggered
- [ ] No page corruption
- [ ] Warning logged

### Scenario 3: RTL with LTR Portions

**Input**:
```html
<p>Get <strong>40% off</strong> today</p>
```

**Extraction**:
```
Text: "Get [0] today"
Registry: [0] → <strong>40% off</strong>
```

**Streaming Update**:
```
Update 1: "دریافت [0] تخفیف امروز"
```

**Expected Result**:
```html
<p dir="rtl">دریافت <strong>40% off</strong> تخفیف امروز</p>
```

**Verification**:
- [ ] LTR portion wrapped correctly
- [ ] No repositioning of "40% off"
- [ ] Direction attribute applied

### Scenario 4: Nested Inline Elements

**Input**:
```html
<p>Text <a href="#">link <em>with</em> emphasis</a> more text</p>
```

**Extraction**:
```
Text: "Text [0] more text"
Registry: [0] → <a href="#">link <em>with</em> emphasis</a>
```

**Streaming Update**:
```
Update 1: "متن [0] متن بیشتر"
```

**Expected Result**:
```html
<p dir="rtl">متن <a href="#">link <em>with</em> emphasis</a> متن بیشتر</p>
```

**Verification**:
- [ ] Nested structure preserved
- [ ] All inline elements intact
- [ ] No DOM corruption

## Performance Considerations

### Memory Management

1. **Registry Lifecycle**: Always clear `PlaceholderRegistry` after translation completion
2. **Streaming History**: Limit streaming history size (max 100 updates)
3. **DOM References**: Remove event listeners and references on cleanup

### Processing Time

1. **Placeholder Detection**: O(n) where n = text length
2. **Reassembly**: O(m) where m = number of placeholders
3. **Validation**: O(m) for placeholder count check

### Streaming Latency

1. **Progress Updates**: Show progress every 2-3 streaming updates
2. **UI Throttling**: Throttle UI updates to prevent layout thrashing
3. **Batch Processing**: Process multiple streaming updates in single render frame

## Error Handling

### Placeholder Extraction Errors

```javascript
try {
  const placeholders = extractPlaceholdersFromTranslation(translatedText);
} catch (error) {
  this.logger.error('Failed to extract placeholders:', error);
  // Fall back to atomic extraction
  return await this._fallbackToAtomicExtraction(request, translatedText);
}
```

### Reassembly Errors

```javascript
const reassemblyResult = reassembleTranslationWithPlaceholders(
  translatedTextContent,
  placeholderRegistry,
  blockContainer
);

if (!reassemblyResult.success) {
  this.logger.error('Reassembly failed:', {
    missingIds: reassemblyResult.missingIds
  });
  // Fall back to atomic extraction
  return await this._fallbackToAtomicExtraction(request, translatedTextContent);
}
```

### Registry Reference Errors

```javascript
const originalElement = placeholderRegistry.getPlaceholder(placeholder.id);
if (!originalElement || !document.contains(originalElement)) {
  this.logger.warn('Placeholder reference invalid or element removed from DOM', {
    placeholderId: placeholder.id
  });
  // Fall back to atomic extraction
  return await this._fallbackToAtomicExtraction(request, translatedText);
}
```

## Future Enhancements

1. **Atomic Extraction Fallback**: Implement full atomic extraction fallback when placeholders fail
2. **Smart Placeholder Detection**: Auto-detect when placeholders should be used based on content structure
3. **Placeholder Preservation Rate**: Track and report placeholder preservation statistics
4. **Progressive Enhancement**: Start with placeholders, fall back mid-stream if issues detected
5. **Provider-Specific Handling**: Tune placeholder strategies per provider (AI vs traditional)
