# Element Selection Feature

## 📋 Overview

The Element Selection feature enables users to select and translate any text element on web pages by hovering and clicking. It provides visual feedback, handles different element types, and integrates with the translation system.

## 🏗️ Architecture

### Managers
- **`SelectElementManager.js`** - Main manager extending `ResourceTracker` for memory management
- **`services/ElementHighlighter.js`** - Visual highlighting extending `ResourceTracker`
- **`services/TranslationOrchestrator.js`** - Translation coordination extending `ResourceTracker`
- **`services/StreamingTranslationEngine.js`** - Streaming translation with multi-segment support
- **`services/TranslationUIManager.js`** - UI updates and multi-segment translation handling
- **`services/TranslationRequestManager.js`** - Request lifecycle management
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
- **Multi-Segment Processing**: Intelligent text segmentation for complex content
- **Streaming Translation**: Real-time translation of large content with progress updates
- **Translation Orchestration**: Coordinated translation requests with timeout handling
- **Result Application**: Smart application of translations to DOM elements
- **Paragraph Preservation**: Maintains original structure with empty lines and formatting
- **Mixed Content Handling**: Seamlessly processes text, hashtags, links, and emojis

## 🔧 Configuration

### Selection Modes
- **Simple Mode**: Basic element selection
- **Advanced Mode**: Enhanced selection with additional features
- **Dynamic Switching**: Ctrl key toggles between modes

### Timeout Configuration
- **Hover Delay**: Configurable delay for highlight removal (default: 50ms)
- **Translation Timeout**: Dynamic timeout based on segment count and content size
- **Streaming Threshold**: Content size threshold for streaming mode (default: 1000 chars or >3 segments)
- **Cleanup Interval**: Periodic cleanup of old requests (5 minutes)
- **Multi-Segment Timeout**: Extended timeout for complex content with multiple paragraphs

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

### Core Functionality
- DOM event listener attachment and cleanup
- Timeout and interval management
- Cross-browser compatibility
- Memory leak prevention
- Error handling scenarios
- Performance with complex DOM structures

### Multi-Segment Translation Testing
- **Complex Content**: Tweets, articles, and multi-paragraph text
- **Mixed Content**: Text with hashtags, links, emojis, and formatting
- **Empty Lines**: Preservation of paragraph structure and spacing
- **Streaming Scenarios**: Large content translation with progress updates
- **Boundary Cases**: Content exactly at streaming thresholds
- **Error Recovery**: Handling of partial translation failures

### Platform-Specific Testing
- **Twitter/X**: Complex nested DOM structures with mixed content types
- **LinkedIn**: Professional content with multi-line descriptions
- **GitHub**: Code snippets and technical documentation
- **Modern SPAs**: React, Vue, and Angular applications
- **Legacy Sites**: Traditional HTML websites

### Performance Testing
- **Memory Usage**: Monitoring during streaming translations
- **DOM Manipulation**: Performance with large text replacements
- **Event Handling**: Responsiveness during active translation sessions
- **Resource Cleanup**: Verification of complete resource deallocation

## 🔗 Related Systems

- **[Memory Garbage Collector](MEMORY_GARBAGE_COLLECTOR.md)** - Resource tracking and cleanup
- **[Translation System](TRANSLATION_SYSTEM.md)** - Text translation processing and streaming
- **[Unified Translation Service](../../docs/TRANSLATION_SYSTEM.md)** - Centralized translation coordination
- **[UI Host System](UI_HOST_SYSTEM.md)** - Overlay rendering and Shadow DOM
- **[Error Management](ERROR_MANAGEMENT_SYSTEM.md)** - Error handling and recovery
- **[Toast Integration System](../../docs/TOAST_INTEGRATION_SYSTEM.md)** - Notification management
- **[Messaging System](../../docs/MessagingSystem.md)** - Unified communication layer

## 🎯 Recent Improvements (2025)

### Multi-Segment Translation Engine
- **Smart Text Segmentation**: Intelligently splits content at sentence boundaries
- **Empty Line Preservation**: Uses zero-width characters (\u200B) to maintain visual structure
- **Streaming Support**: Real-time translation with progress updates
- **Complex Content Handling**: Optimized for Twitter, LinkedIn, and modern web apps

### Enhanced Text Processing
- **Boundary Detection**: Accurate sentence and paragraph boundary identification
- **Mixed Content Support**: Seamless processing of text, hashtags, links, and emojis
- **Structure Preservation**: Maintains original formatting and paragraph breaks
- **Performance Optimization**: Efficient processing of large content blocks

### Improved Error Handling
- **Graceful Degradation**: System remains functional during partial failures
- **Stream Recovery**: Automatic recovery from streaming interruptions
- **Resource Cleanup**: Comprehensive cleanup of translation resources
- **User Feedback**: Clear error communication through toast notifications

---

*For implementation details, see the source code in `src/features/element-selection/`*</content>
<parameter name="filePath">/home/amir/Works/Translate-It/Vue/src/features/element-selection/README.md
