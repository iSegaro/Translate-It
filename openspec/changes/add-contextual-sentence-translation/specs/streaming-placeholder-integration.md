# Segment-Based Translation + Placeholder Integration Specification

## Overview

This specification defines how **segment-based translation** (referred to as "streaming" in this project) integrates with the placeholder-based extraction system.

**Important Clarification**: In this project, "streaming" refers to **segment/chunk-based translation**, NOT AI token streaming. When long text needs translation, it is divided into smaller segments (3-5 segments per batch), and each segment is translated and applied progressively to provide real-time feedback to the user.

**Example**:
- Long text: "This is paragraph one. This is paragraph two. This is paragraph three..."
- Split into segments: `["This is paragraph one.", "This is paragraph two.", "This is paragraph three..."]`
- Segment 1 translates → Updates DOM immediately
- Segment 2 translates → Updates DOM immediately
- Segment 3 translates → Updates DOM immediately

**Goal**: Enable real-time segment-based feedback while preserving inline elements during translation.

## Problem Statement

### Original Conflict

The placeholder system and segment-based translation system were fundamentally incompatible:

| Aspect | Placeholder System | Segment-Based Translation |
|--------|-------------------|---------------------------|
| **DOM Modification** | Single complete update at end | Progressive updates as each segment translates |
| **Element Preservation** | Expects original structure intact | Replaces nodes immediately as segments complete |
| **Timing** | After all segments complete | During segment-by-segment translation |
| **Reassembly** | Uses registry references at end | Uses node matching per segment |

### Current State (Problematic)

```
1. Extraction: "Hello [0] world [1]" with registry [0]→<em>, [1]→<strong>
2. API Request: Long text divided into 3 segments:
   - Segment 1: "Hello [0] world [1]" (part 1)
   - Segment 2: "Hello [0] world [1]" (part 2)
   - Segment 3: "Hello [0] world [1]" (part 3)

3. SEGMENT-BASED TRANSLATION STARTS:
   Segment 1 arrives: "سلام [0] جهان [1]" (partial translation)
   → StreamingUpdateService applies to TEXT_NODES immediately
   → Creates wrappers, modifies DOM, LOSES registry references

   Segment 2 arrives: "عامل [0] هوش مصنوعی [1]" (more complete)
   → Tries to update DOM but references are already corrupted

   Segment 3 arrives: "عامل [0] هوش مصنوعی [1] عالی است!" (complete)
   → Final update but structure is GONE

4. ALL SEGMENTS COMPLETE:
   → _handlePlaceholderTranslation tries to reassemble
   → But original structure was modified by segment 1 & 2
   → Registry references point to missing/modified elements

5. RESULT: Broken page, misplaced content
```

**Key Issue**: Each segment triggers immediate DOM updates, destroying the placeholder registry before all segments complete.

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

1. **DOM Structure Preservation**: Never replace block container innerHTML during segment translation (wait until ALL segments complete)
2. **Text-Only Segment Updates**: For placeholder translations, track segment progress but DON'T modify DOM until final reassembly
3. **Placeholder Marker Protection**: Never modify `[0]`, `[1]` markers during individual segment processing
4. **Final Reassembly Authority**: Only perform DOM modification after ALL segments are complete
5. **Segment Accumulation**: Collect all translated segments, then perform single reassembly operation
6. **Graceful Fallback**: Detect placeholder loss and fall back to atomic extraction

### Critical Technical Considerations

**Consideration 1: Nested Elements (Subtree Extraction)**

When inline elements contain nested inline elements, the placeholder system must capture the **complete HTML subtree**, not just the outer element:

```
Input: <a href="#">Link with <em>emphasis</em></a>
├── WRONG: [0] → <a> element only (loses <em>)
└── CORRECT: [0] → <a href="#">Link with <em>emphasis</em></a> (complete subtree)

Implementation:
- PlaceholderRegistry.registerSubtree(element, outerHTML)
- Stores: root element reference + complete HTML string
- Reassembly: Uses outerHTML to restore complete structure
```

**Why this matters**: If we only store the `<a>` element without its children, the nested `<em>` element is lost during reassembly, breaking the internal structure of links and other inline containers.

**Consideration 2: Atomic Batching Protection**

The provider batching system must **never split text with placeholders** across multiple batches:

```
Scenario: Text with placeholders exceeds character_limit
Input: "Hello [0] wonderful [1] world!" (2000 chars)

Normal Batching (WRONG):
├── Batch 1: "Hello [0] wonderful"  ← Placeholder [0] opened but not closed!
├── Batch 2: "[1] world!"           ← Placeholder [1] orphaned!
└── Result: REASSEMBLY FAILS!

Placeholder-Aware Batching (CORRECT):
├── Override: character_limit = Infinity
├── Single Batch: "Hello [0] wonderful [1] world!"
└── Result: All placeholders intact, reassembly succeeds
```

**Implementation**:
```javascript
// In TranslationOrchestrator or before Provider call
if (request.placeholderRegistry) {
  options.atomicBatching = true;  // Disable character_limit
  options.reason = 'PLACEHOLDER_BOUNDARY_PROTECTION';
}
```

**Consideration 3: Unified Placeholder Format with Collision Avoidance**

To avoid "double logic" for AI vs traditional providers AND prevent regex collisions with code snippets:

```
┌─────────────────────┬──────────────────────────┬─────────────────────────┐
│ Provider Type       │ Placeholder Format       │ Reassembly Regex        │
├─────────────────────┼──────────────────────────┼─────────────────────────┤
│ AI (Gemini, GPT)    │ [[AIWC-0]], [[AIWC-1]]   │ /\[\[AIWC-(\d+)\]\]/g  │
│ Traditional (Google)│ <span translate="no"     │ /<span[^>]*translate=   │
│                     │ data-aiwc-ph-id="0">0</span>│ "no"[^>]*data-aiwc-ph-│
│                     │                           │ id="(\d+)"[^>]*>/g     │
└─────────────────────┴──────────────────────────┴─────────────────────────┘
```

**CRITICAL: Why NOT simple [0] format:**
- Collides with code: `array[0]`, `data[index]`, `items[i]`
- False positives on GitHub, Stack Overflow, technical docs
- Causes extraction of actual code as placeholders

**Benefits of [[AIWC-0]] format:**
- **Single code path** for extraction and reassembly
- **Collision-free**: Won't occur naturally in code or documentation
- **Provider-specific markers** optimized for each provider's behavior
- **No double logic** - unified processing with format-specific rendering

**Implementation**:
```javascript
// PlaceholderRegistry generates format based on provider
generatePlaceholder(id, providerType) {
  if (providerType === 'AI') {
    return `[[AIWC-${id}]]`;  // Distinctive, collision-free format
  } else {
    return `<span translate="no" class="aiwc-placeholder" data-aiwc-ph-id="${id}">${id}</span>`;
  }
}

// Reassembly detects and handles both formats
extractPlaceholders(translatedText) {
  // Try AI format first
  const aiMatches = translatedText.match(/\[\[AIWC-(\d+)\]\]/g);
  if (aiMatches) return { format: 'AI', ids: aiMatches };

  // Try traditional format
  const tradMatches = translatedText.match(/<span[^>]*translate="no"[^>]*data-aiwc-ph-id="(\d+)"[^>]*>/g);
  if (tradMatches) return { format: 'TRADITIONAL', ids: tradMatches };

  return { format: 'NONE', ids: [] };
}
```

**Consideration 4: Orphan Segment Timeout Handling**

When segment-based translation is used, network errors may leave blocks in incomplete states:

```
Scenario: Block with 3 segments expected
├── Segment 1: "Hello [[AIWC-0]] world" ✓ Arrives
├── Segment 2: "Hello [[AIWC-0]] world" ✗ Network error, never arrives
└── Segment 3: "Hello [[AIWC-0]] world!" ✓ Arrives

Problem: Block is stuck with partial segments
Solution: Per-block timeout with automatic reversion
```

**Timeout Strategy**:
```javascript
// In TranslationOrchestrator or StreamingTranslationEngine
class BlockTranslationState {
  constructor(blockContainer) {
    this.blockContainer = blockContainer;
    this.expectedSegments = 0;
    this.receivedSegments = 0;
    this.segments = [];
    this.startTime = null;
    this.timeoutMs = 60000; // 60 seconds
    this.timer = null;
  }

  startSegmentTranslation(expectedCount) {
    this.expectedSegments = expectedCount;
    this.startTime = Date.now();
    this.segments = [];
    this.receivedSegments = 0;

    // Start timeout timer
    this.timer = setTimeout(() => {
      this._handleTimeout();
    }, this.timeoutMs);

    // Store original HTML for potential reversion
    this.originalHTML = this.blockContainer.innerHTML;
  }

  addSegment(segment) {
    this.segments.push(segment);
    this.receivedSegments++;

    // Check if all segments received
    if (this.receivedSegments >= this.expectedSegments) {
      this._completeSuccessfully();
    }
  }

  _handleTimeout() {
    // Check if we received any segments but didn't complete
    if (this.receivedSegments > 0 && this.receivedSegments < this.expectedSegments) {
      this.logger.warn(`Block timeout: received ${this.receivedSegments}/${this.expectedSegments} segments`, {
        blockId: this.blockId,
        duration: Date.now() - this.startTime
      });

      // Revert block to original state
      this._revertToOriginal();
    }
  }

  _revertToOriginal() {
    // Restore original HTML
    this.blockContainer.innerHTML = this.originalHTML;

    // Clear placeholder registry
    if (this.placeholderRegistry) {
      this.placeholderRegistry.clear();
    }

    // Mark as failed
    this.status = 'timeout-reverted';

    this.logger.info(`Block reverted to original due to timeout`, {
      blockId: this.blockId
    });
  }

  _completeSuccessfully() {
    clearTimeout(this.timer);
    this.status = 'completed';
    // Proceed with reassembly...
  }
}
```

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
│ PHASE 2: SEGMENT-BASED TRANSLATION (Placeholder-Aware)         │
├─────────────────────────────────────────────────────────────────┤
│ Long text divided into segments (e.g., 3-5 segments):           │
│                                                                  │
│ For EACH segment that completes:                                 │
│   1. Check if request.placeholderRegistry exists                │
│   2. If YES → Use placeholder-aware handling:                   │
│      - Parse translated segment for placeholders: "سلام [0]"    │
│      - Track segment progress in registry (NO DOM updates!)     │
│      - Store segment result for later accumulation              │
│      - NEVER modify block container innerHTML yet               │
│   3. If NO → Use regular segment handling:                      │
│      - Apply translation to individual text nodes immediately   │
│      - Create wrappers as needed for real-time feedback         │
│                                                                  │
│ User sees: Progress indicator or partial updates                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 3: ALL SEGMENTS COMPLETE → FINAL REASSEMBLY              │
├─────────────────────────────────────────────────────────────────┤
│ If request.placeholderRegistry exists:                          │
│   1. Collect ALL translated segments                          │
│   2. Combine segments into final translation                   │
│   3. Parse final translation for placeholder markers            │
│   4. Validate all placeholders present                          │
│   5. Replace placeholders with original DOM subtrees           │
│   6. Apply complete HTML to block container (ONCE)             │
│   7. Clear placeholder registry                                │
│ Else:                                                           │
│   - All segments were already applied individually              │
└─────────────────────────────────────────────────────────────────┘
```

## Component Specifications

### 1. PlaceholderRegistry (Enhanced)

**File**: `src/features/element-selection/utils/PlaceholderRegistry.js`

**Enhanced Properties**:
```javascript
export class PlaceholderRegistry {
  constructor(providerType = 'AI') {
    this.placeholders = new Map(); // Map<number, {root: HTMLElement, html: string, depth: number}>
    this.counter = 0;
    this.isSegmentBased = false; // Track segment-based translation state
    this.segmentUpdates = []; // Track segment update history
    this.providerType = providerType; // 'AI' or 'TRADITIONAL'
  }

  // NEW: Register inline element with subtree support
  registerSubtree(inlineElement) {
    const id = this.counter++;
    const html = inlineElement.outerHTML;  // Complete subtree HTML
    const depth = this._calculateDepth(inlineElement);

    this.placeholders.set(id, {
      root: inlineElement,
      html: html,              // Complete subtree for nested elements
      depth: depth             // For validation
    });

    // Generate placeholder based on provider type
    return this._generatePlaceholder(id);
  }

  // NEW: Generate placeholder based on provider type (unified format)
  _generatePlaceholder(id) {
    if (this.providerType === 'AI') {
      // AI providers: simple numeric marker
      return `[${id}]`;
    } else {
      // Traditional providers: HTML marker with translate="no"
      return `<span translate="no" class="aiwc-placeholder" data-id="${id}">${id}</span>`;
    }
  }

  // NEW: Calculate nesting depth for validation
  _calculateDepth(element) {
    let maxDepth = 0;
    for (const child of element.children) {
      if (this._isInlineElement(child)) {
        maxDepth = Math.max(maxDepth, 1 + this._calculateDepth(child));
      }
    }
    return maxDepth;
  }

  // NEW: Check if element is inline
  _isInlineElement(element) {
    const inlineTags = ['A', 'STRONG', 'EM', 'B', 'I', 'CODE', 'SPAN', 'MARK', 'S', 'U', 'SMALL'];
    return inlineTags.includes(element.tagName);
  }

  // NEW: Get complete subtree HTML for reassembly
  getSubtreeHTML(id) {
    const entry = this.placeholders.get(id);
    return entry ? entry.html : null;
  }

  // NEW: Mark registry as active for segment-based translation
  startSegmentTranslation() {
    this.isSegmentBased = true;
    this.segmentUpdates = [];
  }

  // NEW: Store segment update (alias for backward compatibility)
  addSegmentUpdate(update) {
    if (!this.isSegmentBased) return;
    this.segmentUpdates.push({
      timestamp: Date.now(),
      ...update
    });
  }

  // Alias for backward compatibility with existing code
  addStreamingUpdate(update) {
    return this.addSegmentUpdate(update);
  }

  // NEW: Complete segment translation and return history
  endSegmentTranslation() {
    this.isSegmentBased = false;
    const history = [...this.segmentUpdates];
    this.segmentUpdates = [];
    return history;
  }

  // Alias for backward compatibility with existing code
  endStreaming() {
    return this.endSegmentTranslation();
  }

  // Alias for backward compatibility
  startStreaming() {
    return this.startSegmentTranslation();
  }

  // EXISTING: Get placeholder by ID (updated for subtree)
  getPlaceholder(id) {
    const entry = this.placeholders.get(id);
    return entry ? entry.root : null;
  }

  // EXISTING methods...
}
```

**Key Changes**:
1. **Subtree Support**: `registerSubtree()` stores complete `outerHTML` for nested elements
2. **Unified Format**: `_generatePlaceholder()` creates provider-specific markers
3. **Depth Tracking**: `_calculateDepth()` validates nesting depth
4. **HTML Retrieval**: `getSubtreeHTML()` returns complete subtree for reassembly
5. **Segment Tracking**: Renamed from "streaming" to "segment-based" with aliases for backward compatibility

### 2. StreamingUpdateService (Modified)

**File**: `src/features/element-selection/managers/services/StreamingUpdateService.js`

**Note**: The name "StreamingUpdateService" refers to **segment-based translation updates**, not AI token streaming. Long text is divided into segments, and this service handles each segment as it completes.

**New Method**: `_applyPlaceholderAwareSegmentUpdate`

```javascript
/**
 * Apply segment-based translation updates while preserving placeholder structure
 * @private
 * @param {Array} textNodes - Text nodes to update
 * @param {Map} newTranslations - New translations to apply
 * @param {Object} request - Translation request with placeholderRegistry
 */
async _applyPlaceholderAwareSegmentUpdate(textNodes, newTranslations, request) {
  const { placeholderRegistry, blockContainer } = request;

  this.logger.debug('Applying placeholder-aware segment updates', {
    registrySize: placeholderRegistry.size,
    textNodesCount: textNodes.length,
    segmentIndex: request.currentSegment || 0,
    totalSegments: request.totalSegments || 1
  });

  // Notify registry of segment-based translation start
  if (!placeholderRegistry.isStreaming) {
    placeholderRegistry.startStreaming();
  }

  // CRITICAL: For placeholder translations, DON'T modify DOM yet
  // Just track the segment progress for final reassembly
  for (const [originalText, translationData] of newTranslations.entries()) {
    // Check if translation contains placeholders
    const translatedText = typeof translationData === 'object'
      ? translationData.text
      : translationData;

    if (!containsPlaceholders(translatedText)) {
      this.logger.debug('Translation has no placeholders, skipping placeholder tracking');
      // For non-placeholder translations, apply immediately as usual
      continue;
    }

    // CRITICAL: For placeholder translations, track segment but DON'T apply to DOM
    // The DOM will be updated once ALL segments complete
    placeholderRegistry.addSegmentUpdate({
      segmentIndex: request.currentSegment,
      originalText,
      translatedText,
      timestamp: Date.now()
    });

    this.logger.debug('Recorded segment update for placeholder translation', {
      segmentIndex: request.currentSegment,
      originalPreview: originalText.substring(0, 30),
      translatedPreview: translatedText.substring(0, 30)
    });
  }

  // Trigger UI progress indicator (not DOM update)
  this._showSegmentProgress(placeholderRegistry, request.currentSegment, request.totalSegments);
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

**Note**: "StreamEndService" handles completion of **all translation segments**, not token streams. This service is called when ALL segments of a long text have completed translation.

**Modified Method**: `_handleAllSegmentsComplete`

The existing placeholder handling is enhanced to work with segment-based results:

```javascript
async _handleAllSegmentsComplete(messageId, request) {
  // CRITICAL: Check if this is a placeholder-based translation
  if (request.placeholderRegistry && request.blockContainer) {
    this.logger.debug('All segments complete - placeholder-based translation');

    // Notify registry that all segments are complete
    const segmentHistory = request.placeholderRegistry.endStreaming();

    // Build final translation from all segments
    const data = {
      translatedText: this._combineSegmentsIntoFinalTranslation(request),
      segmentHistory // Include segment history for debugging
    };

    await this._handlePlaceholderTranslation(request, data, targetLanguage);
    return;
  }

  // Regular segment-based translation processing (non-placeholder)
  // For non-placeholder, each segment was already applied individually
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
   placeholderRegistry.startSegmentTranslation()

2. SEGMENT-BASED TRANSLATION PHASE:
   For each segment that completes:
     placeholderRegistry.addSegmentUpdate({
       segmentIndex: 0, 1, 2, ...
       translatedText: "...",
       timestamp: ...
     })

3. ALL SEGMENTS COMPLETE PHASE:
   segmentHistory = placeholderRegistry.endSegmentTranslation()
   // Use segmentHistory for debugging if needed

4. FINAL REASSEMBLY PHASE:
   // Combine all segments into final translation
   // Replace placeholders with original DOM elements

5. CLEANUP PHASE:
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
  translatedSegments: Map, // Accumulates translated segments
  currentSegment: 0, // Which segment is currently being processed
  totalSegments: 3, // Total number of segments for this text
  originMapping: [...],
  status: "pending" | "translating" | "completed" | "error",
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
2. **Modified Placeholders**: `[0]` → `[ 0 ]` (with spaces) - **Note**: Use whitespace-tolerant regex to handle this
3. **Invalid Registry**: Registry references point to missing elements
4. **Provider Stripped Placeholders**: No placeholders found in translation
5. **Granular Block-Level Failure**: One block fails while others succeed (handle independently)

### Granular Fallback Strategy

**Principle**: Fallback at Translation Unit (block) level, NOT globally.

```
Page with 3 blocks:
├── Block A (has placeholders) → Validation FAILS → Fall back to atomic
├── Block B (has placeholders) → Validation SUCCEEDS → Use placeholders
└── Block C (has placeholders) → Validation SUCCEEDS → Use placeholders

Result: Only Block A uses atomic extraction, B and C use placeholders
```

**Implementation**:
```javascript
// Process each block independently
for (const blockContainer of blockContainers) {
  const result = await this._processBlockWithPlaceholders(blockContainer);

  if (!result.success) {
    // THIS block falls back to atomic
    this.logger.warn(`Block ${blockId} failed placeholder validation, using atomic`, {
      blockId,
      reason: result.failureReason
    });
    await this._processBlockAtomic(blockContainer);
  }
  // Other blocks continue normally
}
```

### Fallback Implementation

```javascript
// In StreamEndService
if (!validatePlaceholders(translatedText, placeholderRegistry).valid) {
  this.logger.warn('Placeholder validation failed, falling back to atomic extraction');
  return await this._fallbackToAtomicExtraction(request, translatedText);
}
```

## Testing Scenarios

### Scenario 1: Successful Segment-Based Translation with Placeholders

**Input**:
```html
<p>Agent <em>Zero</em> AI <strong>rocks</strong>!</p>
```

**Extraction**:
```
Text: "Agent [0] AI [1]!"
Registry: [0] → <em>Zero</em>, [1] → <strong>rocks</strong>
```

**Segment Division**:
```
Long text divided into 3 segments for translation
```

**Segment Updates**:
```
Segment 1: "عامل [0] هوش" → Tracked in registry (NO DOM update)
Segment 2: "عامل [0] هوش مصنوعی [1]" → Tracked in registry (NO DOM update)
Segment 3: "عامل [0] هوش مصنوعی [1] عالی است!" → Tracked in registry
```

**All Segments Complete → Final Reassembly**:
```html
<p>عامل <em>Zero</em> هوش مصنوعی <strong>rocks</strong> عالی است!</p>
```

**Verification**:
- [ ] No page corruption during segment accumulation
- [ ] Inline elements preserved in final reassembly
- [ ] All segment updates recorded in registry
- [ ] DOM updated only once at completion

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

**Segment 1**:
```
"اینجا کلیک کنید برای ادامه"
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

### Scenario 3: RTL with LTR Portions (Segment-Based)

**Input**:
```html
<p>Get <strong>40% off</strong> today</p>
```

**Extraction**:
```
Text: "Get [0] today"
Registry: [0] → <strong>40% off</strong>
```

**Segment 1**:
```
"دریافت [0] تخفیف امروز"
```

**Expected Result**:
```html
<p dir="rtl">دریافت <strong>40% off</strong> تخفیف امروز</p>
```

**Verification**:
- [ ] LTR portion wrapped correctly
- [ ] No repositioning of "40% off"
- [ ] Direction attribute applied

### Scenario 4: Nested Inline Elements (Segment-Based)

**Input**:
```html
<p>Text <a href="#">link <em>with</em> emphasis</a> more text</p>
```

**Extraction**:
```
Text: "Text [0] more text"
Registry: [0] → <a href="#">link <em>with</em> emphasis</a> (complete subtree)
```

**Segments 1-3**:
```
Segment 1: "متن [0]" → Accumulated
Segment 2: "متن [0] متن" → Accumulated
Segment 3: "متن [0] متن بیشتر" → Final
```

**Expected Result**:
```html
<p dir="rtl">متن <a href="#">link <em>with</em> emphasis</a> متن بیشتر</p>
```

**Verification**:
- [ ] Nested subtree preserved (link with emphasis inside)
- [ ] All inline elements intact
- [ ] No DOM corruption
- [ ] Segment progress shown to user

## Performance Considerations

### Memory Management

1. **Registry Lifecycle**: Always clear `PlaceholderRegistry` after all segments complete
2. **Segment History**: Limit segment history size (max 100 updates)
3. **DOM References**: Remove event listeners and references on cleanup
4. **Segment Accumulation**: Store only final combined translation, not all intermediate segments

### Processing Time

1. **Placeholder Detection**: O(n) where n = text length
2. **Reassembly**: O(m) where m = number of placeholders
3. **Validation**: O(m) for placeholder count check
4. **Segment Combination**: O(s) where s = number of segments

### Segment Latency

1. **Progress Updates**: Show progress indicator as each segment completes
2. **UI Throttling**: Throttle progress updates to prevent layout thrashing (every 2-3 segments)
3. **Segment Batching**: Process multiple segments in single render frame when possible
4. **Placeholder Deferred DOM**: For placeholder translations, don't update DOM until all segments complete

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

## Smart Chunking for Placeholder Integrity

**Problem**: Character-limit batching may split text with placeholders, breaking reassembly.

**Solution**: Multi-layer smart chunking with **Intl.Segmenter** for 100+ language support.

```javascript
/**
 * Smart chunking that respects placeholder boundaries using Intl.Segmenter
 * @param {string} text - Text with placeholders that may exceed limit
 * @param {number} limit - Character limit per chunk
 * @param {string} sourceLanguage - Source language code (e.g., 'en', 'zh', 'ja')
 * @returns {Array<string>} Chunks that don't break placeholders
 */
function smartChunkWithPlaceholders(text, limit, sourceLanguage = 'en') {
  if (text.length <= limit) {
    return [text]; // No chunking needed
  }

  // Layer 1: Try paragraph boundaries first (universal across all languages)
  let chunks = splitAtParagraphBoundaries(text, limit);
  if (chunks.length > 1) {
    return validatePlaceholderBoundaries(chunks, text);
  }

  // Layer 2: Use Intl.Segmenter for language-aware sentence boundaries
  // This is the GOLD STANDARD - works for ALL 100+ supported languages
  const sentences = splitIntoSentences(text, sourceLanguage);
  chunks = groupSentencesIntoChunks(sentences, limit);

  // Layer 3: Validate no placeholder was split
  const validationResult = validatePlaceholderBoundaries(chunks, text);
  if (!validationResult.valid) {
    // Fallback to single chunk if placeholder would be split
    console.warn('Cannot chunk without splitting placeholder, using single batch');
    return [text];
  }

  return validationResult.chunks;
}

/**
 * Use Intl.Segmenter for language-aware sentence boundary detection
 * @param {string} text - Text to split
 * @param {string} language - Language code (e.g., 'en', 'zh', 'ja', 'de')
 * @returns {Array<string>} Sentences
 */
function splitIntoSentences(text, language) {
  // Intl.Segmenter is a browser standard API for text segmentation
  // It knows the sentence boundary rules for ALL languages
  const segmenter = new Intl.Segmenter(language, { granularity: 'sentence' });
  const segments = segmenter.segment(text);
  return Array.from(segments).map(s => s.segment);
}

// Examples of Intl.Segmenter behavior:
// English: "Dr. Smith lives in the U.S.A. He is happy."
//   → ["Dr. Smith lives in the U.S.A. ", "He is happy."]
//   (Correctly detects "Dr." and "U.S.A." as abbreviations!)
//
// Chinese: "你好。世界！你好吗？"
//   → ["你好。", "世界！", "你好吗？"]
//   (Works even without sentence-ending dots!)
//
// Japanese: "田中さんです。よろしく。お願いします。"
//   → ["田中さんです。", "よろしく。", "お願いします。"]
//   (Respects Japanese punctuation!)
//
// German: "Z.B. das ist gut. Und das?"
//   → ["Z.B. das ist gut. ", "Und das?"]
//   (Knows "z.B." is an abbreviation in German!)

/**
 * Group sentences into chunks that respect character limit
 * @param {Array<string>} sentences - Sentences to group
 * @param {number} limit - Character limit per chunk
 * @returns {Array<string>} Chunks
 */
function groupSentencesIntoChunks(sentences, limit) {
  const chunks = [];
  let currentChunk = '';
  let currentLength = 0;

  for (const sentence of sentences) {
    const sentenceLength = sentence.length;

    // If adding this sentence would exceed limit
    if (currentLength + sentenceLength > limit && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
      currentLength = sentenceLength;
    } else {
      currentChunk += sentence;
      currentLength += sentenceLength;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Validate that no placeholders were split across chunks
 * @param {Array<string>} chunks - Chunks to validate
 * @param {string} originalText - Original text with placeholders
 * @returns {Object} Validation result
 */
function validatePlaceholderBoundaries(chunks, originalText) {
  const PLACEHOLDER_REGEX = /\[\[AIWC-\d+\]\]/g;

  // Count placeholders in original text
  const originalPlaceholders = (originalText.match(PLACEHOLDER_REGEX) || []).length;

  // Count placeholders in all chunks
  const chunkPlaceholders = chunks.reduce(
    (count, chunk) => count + (chunk.match(PLACEHOLDER_REGEX) || []).length,
    0
  );

  // Check if any placeholder was split
  if (originalPlaceholders !== chunkPlaceholders) {
    return { valid: false, chunks };
  }

  // Check each chunk for incomplete placeholders
  for (const chunk of chunks) {
    // Check for unclosed placeholders: [[AIWC-0 (missing closing brackets)
    if (chunk.match(/\[\[AIWC-\d+$/)) {
      return { valid: false, chunks };
    }
    // Check for orphaned closing brackets: ]] (without opening)
    if (chunk.match(/^\]\]/) || chunk.includes('[[') && !chunk.match(/\[\[AIWC-\d+\]\]/)) {
      return { valid: false, chunks };
    }
  }

  return { valid: true, chunks };
}

/**
 * Split text at paragraph boundaries (universal across all languages)
 * @param {string} text - Text to split
 * @param {number} limit - Character limit per chunk
 * @returns {Array<string>} Chunks
 */
function splitAtParagraphBoundaries(text, limit) {
  const paragraphs = text.split(/\n\n+/);
  const chunks = [];
  let currentChunk = '';
  let currentLength = 0;

  for (const paragraph of paragraphs) {
    const paragraphLength = paragraph.length;

    if (currentLength + paragraphLength > limit && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = paragraph;
      currentLength = paragraphLength;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      currentLength += paragraphLength + 2; // +2 for the '\n\n'
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}
```

**Benefits of Intl.Segmenter Approach**:
- ✅ **Zero maintenance**: No abbreviation lists to update
- ✅ **100+ languages**: Works for all supported languages out of the box
- ✅ **Culture-aware**: Knows language-specific abbreviation rules
- ✅ **Script-aware**: Handles Chinese/Japanese (no dots), Thai, Arabic, Hindi correctly
- ✅ **Browser standard**: Supported in Chrome 87+, Firefox 125+, Safari 14.1+
- ✅ **Placeholder-safe**: Validation ensures no placeholders are ever split

## DOM Reference Recovery

**Problem**: Element references in PlaceholderRegistry may be invalidated if DOM is partially modified.

**Solution**: Unique identifier attribute + recovery by query selector.

### Registration Phase

```javascript
// In PlaceholderRegistry.registerSubtree()
registerSubtree(inlineElement) {
  const id = this.counter++;
  const html = inlineElement.outerHTML;
  const depth = this._calculateDepth(inlineElement);

  // CRITICAL: Add unique identifier BEFORE storing reference
  const uniqueId = `aiwc-orig-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  inlineElement.setAttribute('data-aiwc-original-id', uniqueId);

  this.placeholders.set(id, {
    root: inlineElement,
    html: html,
    depth: depth,
    uniqueId: uniqueId  // NEW: Store for recovery
  });

  return this._generatePlaceholder(id);
}
```

### Recovery Phase

```javascript
// In PlaceholderRegistry.getPlaceholderOrRecover()
getPlaceholderOrRecover(id) {
  const entry = this.placeholders.get(id);
  if (!entry) {
    this.logger.warn(`Placeholder ${id} not found in registry`);
    return null;
  }

  // Check if reference is still valid
  if (entry.root && document.contains(entry.root)) {
    return entry.root; // Reference still valid, use it
  }

  // Reference invalid, try to recover by unique ID
  if (entry.uniqueId) {
    this.logger.debug(`Attempting to recover placeholder ${id} by unique ID`, {
      uniqueId: entry.uniqueId
    });

    const recovered = document.querySelector(`[data-aiwc-original-id="${entry.uniqueId}"]`);

    if (recovered) {
      this.logger.info(`Successfully recovered placeholder ${id} by unique ID`);
      // Update the reference
      entry.root = recovered;
      return recovered;
    }

    this.logger.warn(`Could not recover placeholder ${id} - element removed from DOM`);
  }

  // Permanent failure - element is gone
  return null;
}
```

### Usage in Reassembly

```javascript
// In placeholderReassembly.js
for (const placeholderId of placeholderIds) {
  // Use recovery-aware getter
  const originalElement = placeholderRegistry.getPlaceholderOrRecover(placeholderId);

  if (!originalElement) {
    logger.error(`Failed to recover placeholder ${placeholderId}`);
    // Trigger fallback for this block only
    return { success: false, missingIds: [placeholderId] };
  }

  // Continue with reassembly using recovered element
  // ...
}
```

## Cleanup of Extension Attributes

**Problem**: After translation completes, `data-aiwc-original-id` attributes remain in the DOM, polluting the website's code and potentially conflicting with site scripts.

**Solution**: Always clean up extension attributes after translation completion.

### Cleanup Function

```javascript
/**
 * Remove all data-aiwc-original-id attributes from translated block
 * @param {HTMLElement} blockContainer - The translated block container
 */
function cleanupPlaceholderIds(blockContainer) {
  const markedElements = blockContainer.querySelectorAll('[data-aiwc-original-id]');

  for (const element of markedElements) {
    element.removeAttribute('data-aiwc-original-id');
  }

  this.logger.debug(`Cleaned up ${markedElements.length} data-aiwc-original-id attributes`, {
    blockId: blockContainer.id || 'unknown'
  });
}
```

### Integration with Translation Flow

```javascript
// In StreamEndService._handlePlaceholderTranslation()
async _handlePlaceholderTranslation(request, data, targetLanguage) {
  // ... reassembly logic ...

  // Apply the reassembled HTML to the block container
  await applyReassembledHTML(blockContainer, reassembledHTML);

  // Apply RTL direction if needed
  await this.uiManager.directionManager.applyImmersiveTranslatePattern(
    blockContainer,
    new Map([[blockContainer.textContent, reassembledHTML]]),
    id,
    targetLanguage
  );

  // CRITICAL: Clean up extension attributes BEFORE marking as completed
  cleanupPlaceholderIds(blockContainer);

  // Add translated element
  orchestrator.stateManager.addTranslatedElement(
    blockContainer,
    new Map([[blockContainer.textContent, reassembledHTML]]),
    originalInnerHTML
  );

  // ... rest of completion logic ...
}
```

### Cleanup on Timeout/Failure

```javascript
// In BlockTranslationState._revertToOriginal()
_revertToOriginal() {
  // Restore original HTML
  this.blockContainer.innerHTML = this.originalHTML;

  // Clear placeholder registry
  if (this.placeholderRegistry) {
    this.placeholderRegistry.clear();
  }

  // CRITICAL: Clean up any remaining data attributes even after failure
  const markedElements = this.blockContainer.querySelectorAll('[data-aiwc-original-id]');
  for (const element of markedElements) {
    element.removeAttribute('data-aiwc-original-id');
  }

  // Mark as failed
  this.status = 'timeout-reverted';

  this.logger.info(`Block reverted to original and cleaned up`, {
    blockId: this.blockId,
    cleanedAttributes: markedElements.length
  });
}
```

### Why Cleanup Matters

1. **Prevents Addon Trace Pollution**: No extension markers left in website code
2. **Avoids Conflicts**: Website scripts won't query or conflict with our attributes
3. **Clean DOM**: Website developers see clean translated content, not extension artifacts
4. **Security**: Reduces attack surface for attribute-based detection
5. **Debugging**: Makes debugging easier by not cluttering DOM inspection
6. **User Privacy**: Prevents websites from detecting that translation occurred via attribute sniffing

## Future Enhancements

1. **Atomic Extraction Fallback**: Implement full atomic extraction fallback when placeholders fail (partially implemented in StreamEndService)

2. **Smart Placeholder Detection**: Auto-detect when placeholders should be used based on content structure

3. **Placeholder Preservation Rate**: Track and report placeholder preservation statistics

4. **Progressive Enhancement**: Start with placeholders, fall back mid-stream if issues detected

5. **Provider-Specific Handling**: Tune placeholder strategies per provider (AI vs traditional)

6. **Intl.Segmenter Polyfill**: Add polyfill for older browsers that don't support Intl.Segmenter (Chrome < 87, Firefox < 125, Safari < 14.1+)
