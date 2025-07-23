# Framework Compatibility Module

This module provides advanced text insertion and replacement capabilities for modern web applications, handling various frontend frameworks and complex editors.

## Architecture

The module is divided into specialized components for better maintainability:

### 📁 File Structure

```
framework-compat/
├── index.js              # Main coordinator and public API
├── editorDetection.js    # Complex editor and dangerous structure detection
├── textInsertion.js      # Universal text insertion strategies
├── naturalTyping.js      # Natural typing simulation for React/frameworks
├── selectionUtils.js     # Text selection utilities
├── simpleReplacement.js  # Fallback simple replacement methods
└── README.md            # This documentation
```

## 🔧 Components

### **editorDetection.js**
- `isComplexEditor(element)` - Detects complex editors that need special handling
- Supports: CKEditor, TinyMCE, Quill, Draft.js, Lexical, Slate, ProseMirror, etc.
- Identifies dangerous DOM structures and Office suite editors

### **textInsertion.js**
- `universalTextInsertion(element, text, start, end)` - Multi-strategy text insertion
- Strategies: execCommand → beforeinput → paste events → MutationObserver → fallbacks
- Preserves undo/redo functionality when possible
- Handles both contentEditable and input/textarea elements

### **naturalTyping.js**
- `simulateNaturalTyping(element, text, delay, replaceSelection)` - Character-by-character typing
- Designed for React, Vue, Angular frameworks that detect synthetic events
- Special handling for Reddit and other platforms

### **selectionUtils.js**
- `checkTextSelection(element)` - Detects active text selections
- Handles both contentEditable and form elements

### **simpleReplacement.js**
- `handleSimpleReplacement(element, newValue, start, end)` - Basic fallback methods
- Preserves undo capability when possible
- Direct value assignment as last resort

### **index.js**
- `smartTextReplacement(element, newValue, start, end, useNaturalTyping)` - Main public API
- Orchestrates all strategies with intelligent fallbacks
- Exported functions for backward compatibility

## 🚀 Usage

```javascript
import { smartTextReplacement, isComplexEditor } from "./utils/framework-compat/index.js";

// Basic text replacement
await smartTextReplacement(element, "new text");

// Replace selected text only
await smartTextReplacement(element, "replacement", selectionStart, selectionEnd);

// Check if element needs special handling
if (isComplexEditor(element)) {
  // Use copy-only mode
} else {
  // Safe to replace text
}
```

## 🎯 Strategy Priority

1. **Universal Text Insertion** - Modern multi-strategy approach
2. **Natural Typing** - For specific sites (deepseek.com, chat.openai.com, claude.ai, reddit.com)
3. **Simple Replacement** - Fallback with undo preservation

## 🔄 Migration from Old System

The old monolithic `frameworkCompatibility.js` has been split into this modular system. All existing imports are automatically handled through the index.js re-exports.

## 🧪 Testing

Each component can be tested independently. The modular structure makes it easier to:
- Unit test individual strategies
- Debug specific editor types
- Add new framework support
- Maintain code quality

## 📝 Contributing

When adding new editor support:
1. Add detection logic to `editorDetection.js`
2. Add specific insertion strategy to `textInsertion.js`
3. Update the main coordinator in `index.js`
4. Test across different browsers and frameworks