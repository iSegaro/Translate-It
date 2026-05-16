# Element Detection Service

## Overview

The **Element Detection Service** is a centralized system for DOM element detection that eliminates hardcoded selectors and optimizes repetitive DOM queries across the extension. It provides a single source of truth for all element selectors and implements intelligent caching for performance optimization.

## Architecture

```
ElementDetectionConfig.js
    ↓ (Configuration)
ElementDetectionService.js (Singleton)
    ↓ (Usage)
TextFieldHandler.js
TextFieldIconManager.js
ClickManager.js
SimpleTextSelectionHandler.js
```

## Core Components

### 1. ElementDetectionConfig.js

Centralized configuration for all element selectors:

```javascript
// Organized selector categories
export const TRANSLATION_SELECTORS = [
  '[data-translation-window]',
  '[data-translation-icon]',
  '.translation-window',
  '.translation-icon',
  '.AIWritingCompanion-translation-icon-extension'
];

// Pre-combined for performance
export const COMBINED_SELECTORS = {
  TRANSLATION: TRANSLATION_SELECTORS.join(', '),
  ICON: ICON_SELECTORS.join(', '),
  UI_ELEMENTS: [...HOST_SELECTORS, ...TRANSLATION_SELECTORS, ...ICON_SELECTORS].join(', ')
};
```

### 2. ElementDetectionService.js

Singleton service providing optimized detection methods:

```javascript
export class ElementDetectionService {
  // Core detection methods
  isTranslationElement(element)
  isIconElement(element)
  isUIElement(element)

  // Helper methods
  findNearestTranslationElement(element)
  getClickedUIElement(event)

  // Performance features
  clearCache()
  getCacheStats()
}
```

## Key Features

### 1. **Single Source of Truth**
- All selectors defined in one configuration file
- Easy to add/remove selectors without touching multiple files
- Consistent selector patterns across all components

### 2. **Performance Optimization**
- **Caching System**: Results cached to avoid repeated DOM queries
- **Pre-combined Selectors**: Single query instead of multiple `closest()` calls
- **Lazy Evaluation**: DOM operations only performed when needed

### 3. **Smart Detection Methods**
```javascript
// Before: Multiple repetitive calls
const isTranslation = activeElement.closest('[data-translation-window]') ||
                      activeElement.closest('[data-translation-icon]') ||
                      activeElement.closest('.translation-window') ||
                      activeElement.closest('.translation-icon');

// After: Single optimized call
const isTranslation = elementDetection.isUIElement(activeElement);
```

### 4. **Shadow DOM Support**
- Automatic detection within Shadow DOM trees
- Recursive search for nested shadow roots
- Configurable shadow DOM inclusion

### 5. **Type Safety**
- Element type constants for better debugging
- Structured return objects with type information
- Clear method signatures

## Usage Examples

### Basic Element Detection
```javascript
import ElementDetectionService from '@/shared/services/ElementDetectionService.js';

// Check if element is translation-related
if (ElementDetectionService.isTranslationElement(element)) {
  // Handle translation element
}

// Check if element is any UI element
if (ElementDetectionService.isUIElement(element)) {
  // Prevent dismissal/cleanup
}
```

### Click Event Handling
```javascript
// Get detailed information about clicked UI element
const uiElement = ElementDetectionService.getClickedUIElement(event);
if (uiElement) {
  console.log('Clicked UI element:', {
    type: uiElement.type,
    element: uiElement.element
  });
}
```

### Finding Nearest Elements
```javascript
// Find nearest translation ancestor
const translationElement = ElementDetectionService.findNearestTranslationElement(target);
if (translationElement) {
  // Found translation container
}
```

## Integration Patterns

### 1. **Blur Handler Optimization**
```javascript
// TextFieldIconManager.js - Simplified blur logic
const isTranslationElement = activeElement &&
  this.elementDetection.isUIElement(activeElement);

if (!isTranslationElement) {
  this.cleanup();
}
```

### 2. **Outside Click Detection**
```javascript
// ClickManager.js - Optimized outside click check
if (this.elementDetection.isUIElement(e.target)) {
  this.logger.debug('Click is on UI element');
  return false; // Don't dismiss
}
```

### 3. **Selection Handler Integration**
```javascript
// SimpleTextSelectionHandler.js - Window detection
const uiElement = this.elementDetection.getClickedUIElement(this.lastMouseUpEvent);
if (uiElement) {
  logger.debug('Click detected inside UI element');
  return true;
}
```

## Performance Benefits

### Before Element Detection Service
```javascript
// Multiple DOM queries per check
const isTranslation = element.closest('[data-translation-window]') ||
                     element.closest('[data-translation-icon]') ||
                     element.closest('.translation-window]') ||
                     element.closest('.translation-icon]') ||
                     element.closest('.AIWritingCompanion-translation-icon-extension');
// 5 separate DOM traversals
```

### After Element Detection Service
```javascript
// Single cached query
const isTranslation = elementDetection.isUIElement(element);
// 1 DOM query with cached result
```

**Performance Improvements:**
- **80% reduction** in DOM queries for common operations
- **Cached results** for repeated checks
- **Single source** for selector updates
- **Optimized traversal** with combined selectors

## Configuration Extensibility

### Adding New Selectors
```javascript
// ElementDetectionConfig.js
export const NEW_CATEGORY_SELECTORS = [
  '.new-selector',
  '[data-new-attribute]'
];

// Update combined selectors
export const COMBINED_SELECTORS = {
  // ... existing
  NEW_CATEGORY: NEW_CATEGORY_SELECTORS.join(', ')
};
```

### Dynamic ID Patterns
```javascript
// Pattern matching for generated IDs
export const DYNAMIC_PATTERNS = {
  TRANSLATION_ICON: /^translation-icon-/,
  TEXT_FIELD_ICON: /^text-field-icon-/,
  TRANSLATION_WINDOW: /^translation-window-/
};
```

## Best Practices

### 1. **Use Service Methods Directly**
```javascript
// ✓ Good: Use service methods
if (ElementDetectionService.isUIElement(element)) { ... }

// ✗ Avoid: Manual selector queries
if (element.closest('.translation-window')) { ... }
```

### 2. **Cache Management**
```javascript
// Clear cache when elements are dynamically added/removed
ElementDetectionService.clearCache();

// Monitor cache usage (debug mode)
const stats = ElementDetectionService.getCacheStats();
console.log('Cache size:', stats.size);
```

### 3. **Shadow DOM Considerations**
```javascript
// Enable shadow DOM search for complex applications
const elements = ElementDetectionService.findElements(
  container,
  '.my-selector',
  { includeShadowDOM: true }
);
```

## Testing

The Element Detection Service provides comprehensive testing utilities.

### Unit Testing
```javascript
// Mock service for testing
jest.mock('@/shared/services/ElementDetectionService.js');
ElementDetectionService.isUIElement.mockReturnValue(true);
```

### Integration Testing
```javascript
// Test with real DOM
const element = document.createElement('div');
element.className = 'translation-window';
expect(ElementDetectionService.isTranslationElement(element)).toBe(true);
```

## Core Files

- `src/shared/services/ElementDetectionConfig.js` - Centralized selector configuration
- `src/shared/services/ElementDetectionService.js` - Element detection service

## Benefits Summary

1. **Maintainability**: Single place to manage all selectors.
2. **Performance**: Cached results and optimized queries.
3. **Consistency**: All components use the same detection logic.
4. **Testability**: Centralized logic is easier to unit test.
5. **Extensibility**: Easy to add new selector categories.

---
