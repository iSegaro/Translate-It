# Element Selection Feature

## 📋 Overview

The Element Selection feature enables users to select and translate any text element on web pages by hovering and clicking. It provides visual feedback, handles different element types, and integrates with the translation system.

## 🏗️ Architecture

### Managers
- **`SelectElementManager.js`** - Main manager extending `ResourceTracker` for memory management
- **`services/ElementHighlighter.js`** - Visual highlighting extending `ResourceTracker`
- **`services/TranslationOrchestrator.js`** - Translation coordination extending `ResourceTracker`
- **`services/ModeManager.js`** - Mode switching extending `ResourceTracker`

### Services
- **`TextExtractionService.js`** - Text extraction from DOM elements
- **`ErrorHandlingService.js`** - Error handling and recovery
- **`StateManager.js`** - State management for selection process

### Handlers
- **`handleActivateSelectElementMode.js`** - Activation handler
- **`handleGetSelectElementState.js`** - State retrieval handler
- **`handleSetSelectElementState.js`** - State update handler
- **`selectElementStateManager.js`** - State management utilities

## 🧹 Memory Management

This feature integrates with the **Memory Garbage Collector** system to prevent memory leaks:

### ResourceTracker Integration
- **SelectElementManager**: Extends `ResourceTracker` for automatic cleanup of DOM event listeners
- **ElementHighlighter**: Uses `ResourceTracker` for managing timeouts in mouse interactions
- **TranslationOrchestrator**: Uses `ResourceTracker` for managing periodic cleanup intervals
- **ModeManager**: Uses `ResourceTracker` for managing keyboard event listeners

### Automatic Cleanup
- **Event Listeners**: All DOM event listeners (mouseover, mouseout, click, keydown, keyup, etc.) are automatically tracked and cleaned up
- **Timeouts**: All `setTimeout` calls are tracked and cleared on deactivation
- **Intervals**: All `setInterval` calls are tracked and cleared on destruction
- **Lifecycle Management**: Resources are cleaned up when selection mode is deactivated

### Supported Event Types
- **DOM EventTargets**: Standard browser event listeners with capture options
- **Keyboard Events**: Keydown, keyup, blur, and visibility change events
- **Mouse Events**: Mouseover, mouseout, and click events with AbortController support

## 🎯 Features

### Element Selection
- **Hover Detection**: Visual feedback when hovering over selectable elements
- **Click Handling**: Translation trigger on element click
- **Element Validation**: Smart detection of translatable content
- **Mode Switching**: Dynamic mode changes based on Ctrl key state

### Visual Feedback
- **CSS Highlighting**: Direct CSS class application for performance
- **Overlay Management**: Clean overlay element lifecycle
- **Animation Handling**: Smooth transitions with timeout management

### Translation Integration
- **Text Extraction**: Advanced text extraction from complex DOM structures
- **Translation Orchestration**: Coordinated translation requests with timeout handling
- **Result Application**: Smart application of translations to DOM elements

## 🔧 Configuration

### Selection Modes
- **Simple Mode**: Basic element selection
- **Advanced Mode**: Enhanced selection with additional features
- **Dynamic Switching**: Ctrl key toggles between modes

### Timeout Configuration
- **Hover Delay**: Configurable delay for highlight removal (default: 50ms)
- **Translation Timeout**: Request timeout with fallback handling
- **Cleanup Interval**: Periodic cleanup of old requests (5 minutes)

## 🚀 Integration

This feature integrates with:
- **Translation System** - Sends extracted text for translation processing
- **UI Host System** - Displays selection overlays in Shadow DOM
- **Error Management** - Handles and reports selection errors
- **Memory Garbage Collector** - Automatic resource cleanup and leak prevention

## 📱 Platform Support

- **Chrome MV3** - Full support with AbortController for clean event cancellation
- **Firefox MV3** - Full support with compatibility layer
- **Cross-browser** - Handles different browser event handling patterns

## 🎨 Styling

- Uses extension's CSS system for consistent theming
- High-performance CSS class manipulation
- Minimal DOM manipulation for optimal performance
- Responsive design for different element sizes

## 🧪 Testing

Testing considerations:
- DOM event listener attachment and cleanup
- Timeout and interval management
- Cross-browser compatibility
- Memory leak prevention
- Error handling scenarios
- Performance with complex DOM structures

## 🔗 Related Systems

- **[Memory Garbage Collector](MEMORY_GARBAGE_COLLECTOR.md)** - Resource tracking and cleanup
- **[Translation System](TRANSLATION_SYSTEM.md)** - Text translation processing
- **[UI Host System](UI_HOST_SYSTEM.md)** - Overlay rendering
- **[Error Management](ERROR_MANAGEMENT_SYSTEM.md)** - Error handling

---

*For implementation details, see the source code in `src/features/element-selection/`*</content>
<parameter name="filePath">/home/amir/Works/Translate-It/Vue/src/features/element-selection/README.md
