# Select Element System Documentation

## 🎯 Overview

The Select Element system provides an intuitive way for users to translate content directly on a webpage. By activating this mode, users can hover over any element, see a visual highlight, and click to translate its text content. The system has been completely refactored to integrate with the modern toast notification system and follows a unified, service-oriented architecture.

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

- **ElementHighlighter**: Visual feedback and highlighting
- **TextExtractionService**: Text content extraction and validation
- **TranslationOrchestrator**: Translation process coordination
- **ModeManager**: Selection mode management (Simple/Smart)
- **StateManager**: Translation state tracking and reverts
- **ErrorHandlingService**: Centralized error management

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

### 🛡️ Navigation Prevention
- **Smart Blocking**: Prevents navigation on interactive elements during selection
- **Content-Aware**: Allows translation of elements with text content
- **Cross-Site**: Works consistently across all websites (Twitter, GitHub, etc.)

### 🎨 Enhanced Visual Feedback
- **Direct CSS Highlighting**: Maximum performance with direct DOM manipulation
- **Global Styles**: Main DOM injection for crosshair cursor and link disabling
- **Toast Styling**: Integrated toast styles with the main application

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
1. User clicks cancel button in toast notification OR
2. User translates an element OR
3. User presses Escape key
4. `ToastEventHandler` detects cancel interaction
5. `SelectElementManager.deactivate()` cleans up:
   - Removes event listeners
   - Clears highlights
   - Disables toast notifications
   - Resets UI behaviors
6. System returns to normal state

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
// Translation coordination
class TranslationOrchestrator {
  translateElement(element, text)  // Execute translation
  applyTranslation(element, result) // Apply to DOM
  handleTranslationError(error)    // Error management
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

### Navigation Prevention
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
- **Method 1**: Click cancel button in toast notification
- **Method 2**: Press Escape key
- **Method 3**: Translate any element (auto-deactivation)
- **Method 4**: Click outside any element (timeout-based)

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

### With Toast System
```javascript
// Seamless toast integration
this.toastIntegration.showNotification('success', 'Select Element mode activated', {
  actions: [
    {
      label: 'Cancel',
      callback: () => this.deactivate(),
      type: 'cancel'
    }
  ]
});
```

### With Translation System
```javascript
// Integration with translation providers
this.translationOrchestrator.translateElement(element, text)
  .then(result => this.applyTranslation(element, result))
  .catch(error => this.errorHandlingService.handleError(error));
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

### Planned Features
- **Multi-Element Selection**: Batch translation capabilities
- **Visual Translation**: Image and SVG content support
- **Advanced AI Context**: Smart content understanding
- **Collaborative Translation**: Multi-user features

### Technical Improvements
- **WebAssembly Integration**: Performance-critical operations
- **Service Worker Support**: Background processing
- **Advanced Caching**: Intelligent content caching
- **Progressive Enhancement**: Graceful feature degradation