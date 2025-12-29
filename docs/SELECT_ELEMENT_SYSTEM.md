# Select Element System Documentation

## 🎯 Overview

The Select Element system provides an intuitive way for users to translate content directly on a webpage. By activating this mode, users can hover over any element, see a visual highlight, and click to translate its text content. The system has been completely refactored to integrate with the modern toast notification system and follows a unified, service-oriented architecture.

## 🔓 Module Independence (2025 Update)

The Select Element system is now fully independent with no external dependencies to other feature modules:

- ✅ **Self-Contained**: All required utilities are localized within `src/features/element-selection/`
- ✅ **No Cross-Feature Dependencies**: Eliminated all `@/features/` imports
- ✅ **Isolated Functionality**: Can be developed, tested, and deployed independently
- ✅ **Simplified Integration**: Easy to integrate into any project without pulling unrelated features

## 🏗️ Architecture

The system is built on a unified manager pattern with integrated toast notifications and decoupled services.

```
+-------------------------+
|   Browser UI (Popup)    |
+-------------------------+
           |
           ▼ (Message: ACTIVATE_SELECT_ELEMENT_MODE)
+-------------------------+
|   Background Script     |
+-------------------------+
           |
           ▼ (Message to Content Script)
+--------------------------------------------------------------------+
|                          Content Script                           |
|                                                                    |
| +--------------------------+      (Events)     +----------------+ |
| |  SelectElementManager.js | ◀──────────────▶ |  Toast System  | |
| |   (Unified Manager)      |    (Event Bus)    | (Notifications)| |
| +--------------------------+                  +----------------+ |
|           |                                              |       |
|           ▼ (DOM Operations)                             ▼ (Shows) |
| +--------------------------------------------------------------------+ |
| |                            Webpage DOM                           | |
| +--------------------------------------------------------------------+ |
+--------------------------------------------------------------------+
```

### Core Components

#### 1. **SelectElementManager.js** (Unified Manager)
The central controller that manages the entire Select Element lifecycle:
- **Singleton Pattern**: Single instance across the application
- **Service Orchestration**: Manages all specialized services
- **Resource Management**: Extends ResourceTracker for automatic cleanup with Critical Protection
- **Event Handling**: Coordinates mouse events and toast interactions
- **Cross-Frame Support**: Works in both main page and iframes
- **FeatureManager Integration**: Integrated with smart feature management system
- **Separate Activation Methods**: `activate()` for FeatureManager initialization, `activateSelectElementMode()` for actual functionality

#### 2. **Service Layer** (Decoupled Services)
Each service has a single responsibility:

**Core Services:**
- **ElementHighlighter**: Visual feedback and highlighting
- **TextExtractionService**: Text content extraction and validation
- **TranslationOrchestrator**: Translation process coordination
- **StreamingTranslationEngine**: Streaming translation support
- **TranslationRequestManager**: Request lifecycle management
- **ModeManager**: Selection mode management (Simple/Smart)
- **StateManager**: Translation state tracking and reverts
- **ErrorHandlingService**: Centralized error management

**UI Services (split from TranslationUIManager):**
- **TranslationUIManager**: Main coordinator for UI operations (~190 lines)
- **NotificationService**: Status and toast notifications
- **StreamingUpdateService**: Real-time streaming updates
- **StreamEndService**: Stream completion handling
- **DOMNodeMatcher**: Node finding and text matching
- **TranslationApplier**: Core DOM manipulation
- **DirectionManager**: RTL/LTR direction handling

#### 3. **Toast Integration System** (New)
Integrated notification system for user feedback:
- **ToastIntegration**: Central toast management
- **ToastEventHandler**: Event handling for toast interactions
- **ToastElementDetector**: Element detection for toast exclusion
- **SelectElementNotificationManager**: Specialized notification handling

## ✨ Key Features (2025 Update)

### 🎉 Toast Integration
- **Real-time Notifications**: Users receive immediate feedback via toast notifications
- **Actionable Toasts**: Toast notifications include cancel buttons for mode deactivation
- **Cross-Context Support**: Works seamlessly across different browsing contexts
- **Event-Driven**: Toast interactions trigger appropriate system responses

### 🔄 Unified Manager Architecture
- **Single Responsibility**: One manager to rule all Select Element operations
- **Service Composition**: Built from specialized, testable services
- **Resource Tracking**: Automatic cleanup with ResourceTracker integration
- **Singleton Pattern**: Ensures consistency across the application

### 🚀 Advanced Multi-Segment Translation
- **Smart Text Segmentation**: Automatically splits complex content at optimal boundaries
- **Paragraph Preservation**: Maintains original structure with empty lines and formatting
- **Streaming Support**: Real-time translation of large content with progress updates
- **Mixed Content Handling**: Seamlessly processes text, hashtags, links, and emojis
- **Zero-Width Characters**: Uses \u200B for preserving visual spacing in translations

### 🛡️ Navigation Prevention
- **Smart Blocking**: Prevents navigation on interactive elements during selection
- **Content-Aware**: Allows translation of elements with text content
- **Cross-Site**: Works consistently across all websites (Twitter, GitHub, LinkedIn, etc.)
- **Modern Web App Support**: Optimized for complex single-page applications

### 🎨 Enhanced Visual Feedback
- **Direct CSS Highlighting**: Maximum performance with direct DOM manipulation
- **Global Styles**: Main DOM injection for crosshair cursor and link disabling
- **Toast Styling**: Integrated toast styles with the main application
- **Responsive Design**: Adapts to different element sizes and screen resolutions

## 🔄 Event Flow

### Activation Flow
1. User clicks "Select Element" in extension popup
2. Background script sends activation message to content script
3. FeatureManager calls `activate()` on SelectElementManager for initialization
4. When actual functionality is needed, ContentMessageHandler calls `activateSelectElementMode()`
5. Manager activates services and attaches event listeners
6. Toast notification appears with activation confirmation and cancel option
7. UI behaviors activate (crosshair cursor, link disabling)

### Selection Flow
1. User hovers over elements → `ElementHighlighter` provides visual feedback
2. User clicks on highlighted element
3. `handleClick()` processes the selection:
   - Prevents default navigation behavior
   - Extracts text via `TextExtractionService`
   - Initiates translation via `TranslationOrchestrator`
   - Deactivates UI immediately
4. Toast notification shows translation progress/completion
5. Translation applied to DOM with state tracking for reverts

### Deactivation Flow
1. User clicks cancel button in Select Element notification OR
2. User translates an element OR
3. User presses Escape key (with proper event propagation prevention)
4. `SelectElementManager.deactivate()` cleans up:
   - Removes event listeners
   - Clears highlights
   - Dismisses Select Element notification via `dismiss-select-element-notification` event
   - Resets UI behaviors
   - Prevents interference with other shortcut handlers (e.g., RevertShortcut)
5. System returns to normal state

## 🔧 Service Details

### ElementHighlighter Service
```javascript
// Visual feedback management
class ElementHighlighter {
  addGlobalStyles()           // Crosshair cursor and link disabling
  handleMouseOver(element)    // Smart element highlighting
  handleMouseOut(element)     // Highlight removal with timeout
  findBestTextElement(start)  // Intelligent element selection
  clearAllHighlights()        // Complete highlight cleanup
}
```

### TextExtraction Service
```javascript
// Content extraction and validation
class TextExtractionService {
  extractText(element)        // Extract meaningful text content
  validateText(text)          // Validate for translation
  findBestContainer(element)  // Find optimal translation target
}
```

### TranslationOrchestrator
```javascript
// Translation coordination with streaming support
class TranslationOrchestrator {
  translateElement(element, text)           // Execute translation
  applyTranslation(element, result)          // Apply to DOM
  handleTranslationError(error)              // Error management
  calculateDynamicTimeout(segments)          // Local timeout calculation
  handleStreamTranslation(data)              // Stream processing
  processMultiSegmentTranslation(segments)   // Multi-segment coordination
}
```

### StateManager
```javascript
// State tracking and reverts
class StateManager {
  trackTranslation(element, original, translated)  // Track changes
  revertElement(element)                          // Revert to original
  getTranslationHistory()                         // History management
}
```

### TranslationUIManager (Coordinator)
```javascript
// Main coordinator for UI operations - delegates to specialized services
class TranslationUIManager {
  showStatusNotification(messageId, context)     // Show progress notification
  processStreamUpdate(message)                   // Process streaming updates
  processStreamEnd(message)                      // Handle stream completion
  applyTranslationsToNodes(nodes, translations)  // Apply to DOM
  cleanup()                                      // Cleanup all services
}
```

### NotificationService
```javascript
// UI notification management
class NotificationService {
  showStatusNotification(messageId, context)     // Status notifications
  dismissStatusNotification()                    // Dismiss active notification
  showTimeoutNotification(messageId)             // Timeout warnings
}
```

### StreamingUpdateService
```javascript
// Real-time streaming translation processing
class StreamingUpdateService {
  processStreamUpdate(message)                   // Main streaming entry
  _processStreamTranslationData(request, data)   // Process translation data
  _applyStreamingTranslationsImmediately(...)    // Real-time DOM updates
}
```

### StreamEndService
```javascript
// Stream completion and result processing
class StreamEndService {
  processStreamEnd(message)                      // Handle stream end
  handleTranslationResult(message)               // Non-streaming results
  _handleStreamEndSuccess(messageId, request)    // Success handling
  _handleStreamEndError(messageId, request, data)// Error handling
}
```

### DOMNodeMatcher
```javascript
// Node finding and text matching
class DOMNodeMatcher {
  _findNodesToUpdate(textNodes, originalText)    // Find nodes to update
  _findNodesForMultiSegmentText(...)             // Multi-segment matching
  _filterValidNodesForTranslation(...)           // Validation
  debugTextMatching(textNodes, translations)     // Debug utility
}
```

### TranslationApplier
```javascript
// Core DOM manipulation for applying translations
class TranslationApplier {
  applyTranslationsToNodes(textNodes, translations) // Main application
  // Creates wrappers and replaces TEXT_NODE/ELEMENT_NODE
  // Handles multiple matching strategies for translation lookup
}
```

### DirectionManager
```javascript
// RTL/LTR direction management
class DirectionManager {
  applyImmersiveTranslatePattern(element, translations, targetLanguage)
  _findTextContainerParent(segment)              // Find text container
  // Detects direction from translated content, not just target language
}
```

## 🛠️ Technical Implementation

### Resource Management
```javascript
// Automatic cleanup with ResourceTracker and Critical Protection
class SelectElementManager extends ResourceTracker {
  constructor() {
    super('select-element-manager');
    // Track essential services with Critical Protection
    this.trackResource('element-highlighter', () => this.elementHighlighter?.cleanup(), { isCritical: true });
    this.trackResource('text-extraction-service', () => this.textExtractionService?.cleanup(), { isCritical: true });
    this.trackResource('toast-integration', () => this.toastIntegration?.cleanup(), { isCritical: true });
    // Track other services normally
    this.trackResource('translation-orchestrator', () => this.translationOrchestrator?.cleanup());
    this.trackResource('state-manager', () => this.stateManager?.cleanup());
  }
}
```

### Toast Integration
```javascript
// Toast notification management
class ToastIntegration {
  showNotification(type, message, options = {}) {
    // Display actionable toast notifications
    return this.showToast(type, message, {
      duration: options.persistent ? 0 : 5000,
      actions: options.actions || [],
      ...options
    });
  }
}
```

### Navigation Prevention & Event Handling
```javascript
// Smart navigation blocking
preventNavigationHandler(event) {
  if (!this.isActive || this.isProcessingClick) return;

  const target = event.target;
  const isInteractiveElement = this.isInteractiveElement(target);

  if (isInteractiveElement) {
    const hasTextContent = this.hasTextContent(target);

    if (hasTextContent) {
      // Allow elements with text content to be translated
      return;
    }

    // Block navigation on other interactive elements
    event.preventDefault();
    event.stopPropagation();
    return false;
  }
}

// ESC key handling with event propagation prevention
setupKeyboardListeners() {
  document.addEventListener('keydown', (event) => {
    if (event.key === KEY_CODES.ESCAPE && this.isActive) {
      // Prevent other handlers (like RevertShortcut) from processing ESC
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      // Set flag to prevent race conditions
      window.selectElementHandlingESC = true;
      setTimeout(() => { window.selectElementHandlingESC = false; }, 100);

      this.deactivate({ fromCancel: true });
    }
  });
}
```

## 📁 Module Structure

```
src/features/element-selection/
├── SelectElementManager.js                    # Unified manager
├── SelectElementNotificationManager.js         # Notification handling
├── utils/
│   └── timeoutCalculator.js                   # Local timeout utilities
├── managers/
│   ├── services/
│   │   ├── ElementHighlighter.js              # Visual feedback
│   │   ├── TextExtractionService.js          # Text extraction
│   │   ├── TranslationOrchestrator.js         # Translation coordination
│   │   ├── StreamingTranslationEngine.js      # Streaming translation support
│   │   ├── TranslationRequestManager.js       # Request lifecycle management
│   │   ├── TranslationUIManager.js            # UI coordinator (~190 lines)
│   │   ├── NotificationService.js            # Status notifications
│   │   ├── StreamingUpdateService.js         # Real-time streaming updates
│   │   ├── StreamEndService.js               # Stream completion handling
│   │   ├── DOMNodeMatcher.js                 # Node finding & matching
│   │   ├── TranslationApplier.js             # DOM manipulation
│   │   ├── DirectionManager.js               # RTL/LTR direction
│   │   ├── ModeManager.js                    # Mode management
│   │   ├── StateManager.js                   # State tracking
│   │   └── ErrorHandlingService.js           # Error management
│   └── constants/
│       └── selectElementConstants.js          # Configuration constants
├── handlers/
│   ├── handleActivateSelectElementMode.js     # Activation handler
│   ├── handleDeactivateSelectElementMode.js   # Deactivation handler
│   ├── handleSetSelectElementState.js         # State setting handler
│   └── selectElementStateManager.js          # State management
└── constants/
    └── SelectElementModes.js                  # Mode definitions
```

## 🎯 Usage Patterns

### Basic Element Translation
1. Activate Select Element mode
2. Hover over desired element (visual highlight appears)
3. Click element (immediate translation)
4. View result with toast confirmation

### Complex Content Translation
1. Activate Select Element mode
2. Hold Ctrl for Smart Mode (selects optimal container)
3. Click on complex element (intelligent container selection)
4. System handles nested content and styling

### Mode Deactivation
- **Method 1**: Click cancel button in Select Element notification
- **Method 2**: Press Escape key (with event propagation prevention to avoid conflicts)
- **Method 3**: Translate any element (auto-deactivation)
- **Method 4**: Background script deactivation (system-level cleanup)

## 🔧 Configuration

### Mode Types
- **Simple Mode**: Direct element selection
- **Smart Mode**: Intelligent container selection (Ctrl toggle)

### Toast Options
- **Activation Notifications**: Confirm mode activation
- **Progress Notifications**: Translation status updates
- **Error Notifications**: User-friendly error messages
- **Completion Notifications**: Translation result confirmations

## 📊 Performance Optimizations

### Resource Efficiency
- **Lazy Loading**: Services initialized on demand
- **Automatic Cleanup**: ResourceTracker prevents memory leaks
- **Event Debouncing**: Optimized mouse event handling
- **CSS Caching**: Reused style calculations

### User Experience
- **Immediate Feedback**: Instant visual highlighting
- **Non-Blocking**: Translation runs in background
- **Smart Cancellation**: Multiple deactivation methods
- **Cross-Site Consistency**: Works everywhere

## 🔄 Integration Points

### With Select Element Notification System
```javascript
// Specialized notification management for Select Element
pageEventBus.emit('show-select-element-notification', {
  managerId: this.instanceId,
  actions: {
    cancel: () => this.deactivate({ fromNotification: true }),
    revert: () => this.performRevert()
  }
});

// Update notification during translation
pageEventBus.emit('update-select-element-notification', {
  status: 'translating'
});

// Dismiss notification on completion/cancellation
pageEventBus.emit('dismiss-select-element-notification', {
  managerId: this.instanceId
});
```

### With Translation System & Streaming Support
```javascript
// Integration with translation providers and streaming support
this.translationOrchestrator.translateElement(element, text)
  .then(result => {
    this.applyTranslation(element, result);
    // Notification dismissed automatically in streaming completion handler
  })
  .catch(error => {
    this.errorHandlingService.handleError(error);
    // Notification dismissed automatically in error handler
  });

// Enhanced streaming translation coordination for complex content
// - Multi-segment text processing (handles tweets, articles with multiple lines)
// - Preserves empty lines and paragraph structure
// - Automatic notification updates during streaming
// - Smart timeout management based on content size and segment count
// - Progress reporting through UnifiedTranslationCoordinator
// - Advanced handling of complex DOM structures (Twitter, LinkedIn, etc.)

// Multi-Segment Translation Processing
// - Splits long texts into manageable segments at sentence boundaries
// - Preserves empty lines as structural markers using \u200B\n\u200B
// - Reassembles translations maintaining original paragraph structure
// - Handles mixed content (text, hashtags, links) in single elements
```

### With State Management
```javascript
// State tracking for reverts
this.stateManager.trackTranslation(element, originalText, translatedText);
```

## 🛡️ Error Handling

### Comprehensive Error Management
- **Validation Errors**: Invalid element or content detection
- **Translation Errors**: Provider failures and rate limits
- **DOM Errors**: Element manipulation issues
- **Network Errors**: Extension context validation

### User-Friendly Messages
- **Toast Notifications**: Clear error communication
- **Visual Feedback**: Highlight state management
- **Graceful Degradation**: System remains functional on errors

## 📈 Metrics and Monitoring

### Debug Information
```javascript
getStatus() {
  return {
    isActive: this.isActive,
    isProcessingClick: this.isProcessingClick,
    hasHighlight: this.elementHighlighter?.currentHighlighted,
    serviceStates: this.getServiceStates(),
    notificationState: this.currentNotification?.getState(),
    featureManagement: this.featureManager?.isFeatureActive('selectElement') || false,
    resourceTracking: this.getStats()
  };
}
```

### Performance Tracking
- **Activation Time**: Mode initialization speed
- **Selection Accuracy**: Element detection success rate
- **Translation Time**: Provider response metrics
- **Error Rate**: System reliability metrics

## 🚀 Future Enhancements

### Recently Implemented (2025)
- ✅ **Service Refactoring**: TranslationUIManager split into 6 focused services (3,016 → 190 lines coordinator)
- ✅ **Service Composition Pattern**: UI operations delegated to specialized, testable services
- ✅ **Multi-Segment Translation**: Advanced processing of complex content with multiple lines
- ✅ **Streaming Translation Engine**: Real-time translation for large content
- ✅ **Paragraph Structure Preservation**: Maintains original formatting and empty lines
- ✅ **Complex DOM Handling**: Optimized for Twitter, LinkedIn, and modern web apps
- ✅ **Enhanced Text Processing**: Smart segmentation at sentence boundaries
- ✅ **Zero-Width Character Preservation**: Uses \u200B for visual spacing integrity

### Planned Features
- **Multi-Element Selection**: Batch translation capabilities
- **Visual Translation**: Image and SVG content support
- **Advanced AI Context**: Smart content understanding
- **Collaborative Translation**: Multi-user features
- **Adaptive Translation**: Context-aware translation based on content type
- **Real-time Translation**: Live translation as user types or scrolls

### Technical Improvements
- **WebAssembly Integration**: Performance-critical operations
- **Service Worker Support**: Background processing
- **Advanced Caching**: Intelligent content caching with multi-segment awareness
- **Progressive Enhancement**: Graceful feature degradation
- **Memory Optimization**: Enhanced ResourceTracker integration for streaming
- **Cross-Frame Translation**: Improved iframe and shadow DOM support