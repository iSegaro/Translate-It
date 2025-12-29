# Segment ID-Based Translation System Design

## Architecture Overview

### Current System Issues
```
Text Extraction → [Text1, Text2, Text3] → Provider → [Trans1, Trans2, Trans3] → ???
                                                      ↳ Lost mapping
```

### Proposed System
```
Text Extraction → [{id: "seg-1", text: "Text1"}, {id: "seg-2", text: "Text2"}]
                → Provider (Smart JSON/Array)
                → [{id: "seg-1", translation: "Trans1"}, {id: "seg-2", translation: "Trans2"}]
                → Apply by ID → Correct DOM placement
```

## Component Design

### 1. Segment Structure
```javascript
interface TextSegment {
  id: string;           // Unique identifier
  text: string;         // Original text content
  element: HTMLElement; // Reference to DOM element
  metadata?: {          // Optional metadata
    isTechnicalTerm: boolean;
    index: number;
    parentId?: string;
  };
}
```

### 2. Provider Detection Logic
```javascript
class ProviderModeDetector {
  shouldUseJsonMode(provider, segments) {
    // AI providers: Use JSON when available
    if (provider.static.type === 'ai') {
      return provider.supportsJsonMode && segments.length > 0;
    }

    // Traditional providers: Smart detection
    if (provider.static.type === 'translate') {
      return segments.length <= 3 &&
             !segments.some(s => s.text.includes('\n')) &&
             provider.jsonSupportLevel >= 1;
    }

    return false;
  }
}
```

### 3. Response Format Standardization
```javascript
// Universal response format that works for all providers
interface TranslationResponse {
  translations: Array<{
    id: string;
    text: string;
    unchanged?: boolean;
  }>;
  metadata?: {
    provider: string;
    mode: 'json' | 'array';
    processingTime: number;
  };
}
```

### 4. RTL/LTR Handling Strategy
```javascript
class DirectionProcessor {
  processForDirection(text, targetLanguage) {
    if (!this.isRTLLanguage(targetLanguage)) {
      return text;
    }

    // Insert Unicode control characters for LTR terms
    return text.replace(/\b[A-Z]{2,}\b|\b\w+\.\w+\b/g,
      match => `\u202A${match}\u202C`); // LRE + text + PDF
  }
}
```

## Implementation Phases

### Phase 1: Text Extraction (Week 1)
**Files to modify:**
- `src/features/element-selection/utils/domManipulation.js`
- `src/features/element-selection/utils/textExtraction.js`

**Changes:**
1. Enhance `collectTextNodes` to generate unique IDs
2. Create segment objects with metadata
3. Maintain element reference mapping

### Phase 2: Provider Layer (Week 2)
**Files to modify:**
- `src/features/translation/providers/BaseProvider.js`
- `src/features/translation/core/TranslationEngine.js`

**Changes:**
1. Implement smart JSON mode detection
2. Create hybrid request/response handlers
3. Add response format standardization

### Phase 3: UI Application (Week 3)
**Files to modify:**
- `src/features/element-selection/managers/services/TranslationUIManager.js`
- `src/features/element-selection/utils/textDirection.js`

**Changes:**
1. Implement ID-based translation application
2. Add Unicode control character processing
3. Prevent nested translation containers

## Error Handling Strategy

### Provider Communication Errors
```javascript
try {
  // Try JSON format first
  const response = await provider.translateWithJson(segments);
  return standardizeResponse(response);
} catch (error) {
  if (error.type === 'UNSUPPORTED_FORMAT') {
    // Fallback to array format
    const texts = segments.map(s => s.text);
    const translations = await provider.translate(texts);
    return mapArrayToSegmentFormat(segments, translations);
  }
  throw error;
}
```

### ID Resolution Failures
```javascript
function applyTranslationSafely(segmentId, translation) {
  const element = elementMap.get(segmentId);
  if (!element || !document.contains(element)) {
    logger.warn(`Element not found for segment ${segmentId}`);
    return false;
  }

  // Apply translation with fallback
  try {
    applyTranslation(element, translation);
    return true;
  } catch (error) {
    logger.error(`Failed to apply translation for segment ${segmentId}`, error);
    return false;
  }
}
```

## Performance Considerations

### Memory Optimization
- Use WeakMap for element references to prevent memory leaks
- Clean up segment mappings after translation completion
- Limit segment ID length to reduce memory footprint

### Processing Optimization
- Batch ID generation to avoid DOM queries
- Cache provider JSON support detection
- Lazy metadata creation only when needed

## Testing Strategy

### Unit Tests
1. Segment ID generation uniqueness
2. Provider mode detection logic
3. Response format standardization
4. RTL/LTR Unicode processing

### Integration Tests
1. End-to-end translation with each provider type
2. Mixed content scenarios
3. Error handling and fallback mechanisms
4. Performance benchmarks

### Edge Cases
1. Very large text segments (>10,000 chars)
2. Deeply nested HTML structures
3. Malformed provider responses
4. DOM element removal during translation