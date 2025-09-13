# Toast Integration System Documentation

## 🎯 Overview

The Toast Integration System provides a unified, event-driven architecture for managing Vue Sonner toast notifications throughout the extension. It enables actionable toast notifications with interactive buttons, cross-context support, and smart element detection for seamless user feedback across all extension features.

## 🏗️ Architecture

The system follows a modular, event-driven architecture with clear separation of concerns:

```
+-----------------------------------------------------------------------+
|                          Toast Integration System                     |
|                                                                       |
|  +---------------------+     +---------------------+                 |
|  |   ToastIntegration  |◀----|   ToastEventHandler  |                 |
|  |   (Main Controller)  |     |   (Event Handling)  |                 |
|  +---------------------+     +---------------------+                 |
|           |                              |                           |
|           ▼ (Manages)                   ▼ (Handles)                 |
|  +---------------------+     +---------------------+                 |
|  | ToastElementDetector|     |  Vue Sonner Toasts   |                 |
|  | (Element Detection)  |     |  (UI Components)     |                 |
|  +---------------------+     +---------------------+                 |
|                                                                       |
+-----------------------------------------------------------------------+
                                |
                                ▼ (Events)
+-----------------------------------------------------------------------+
|                         Extension Features                           |
|       (Select Element, Text Selection, Translation, etc.)            |
+-----------------------------------------------------------------------+
```

### Core Components

#### 1. **ToastIntegration.js** (Main Controller)
The central coordinator for all toast-related operations:
- **Lifecycle Management**: Initialize, configure, and shutdown toast system
- **Event Coordination**: Bridges external features with toast events
- **Configuration**: Manages toast behavior and callbacks
- **Error Handling**: Centralized error management for toast operations

#### 2. **ToastEventHandler.js** (Event Interception)
Handles all toast-related event interactions:
- **Event Capture**: Intercepts clicks before other handlers (capture phase)
- **Action Detection**: Identifies cancel button clicks and other actions
- **Path Traversal**: Analyzes event paths for accurate element detection
- **Callback Execution**: Triggers appropriate feature callbacks

#### 3. **ToastElementDetector.js** (Element Detection)
Smart detection system for toast and extension elements:
- **Toast Identification**: Recognizes Vue Sonner toast elements
- **Extension Exclusion**: Identifies and excludes extension-owned elements
- **DOM Traversal**: Efficient element relationship detection
- **Selector Management**: Centralized selector constants

#### 4. **constants.js** (Configuration)
Centralized configuration for the entire system:
- **Toast Selectors**: Vue Sonner data attributes and CSS classes
- **Element Queries**: DOM query selectors for element detection
- **Extension Selectors**: Extension-specific element identifiers

## ✨ Key Features

### 🎯 Actionable Toast Notifications
- **Interactive Buttons**: Toast notifications can include action buttons
- **Cancel Functionality**: Built-in cancel button support for mode deactivation
- **Custom Actions**: Extensible action system for feature-specific interactions
- **Event-Driven**: Actions trigger appropriate feature callbacks

### 🔄 Cross-Context Support
- **Main Page**: Works seamlessly in the main browsing context
- **IFrame Support**: Consistent behavior across iframe boundaries
- **Shadow DOM**: Compatible with Shadow DOM isolation
- **Event Propagation**: Proper event handling across context boundaries

### 🎨 Smart Element Detection
- **Vue Sonner Integration**: Native integration with Vue Sonner toast library
- **Extension Awareness**: Automatically excludes extension-owned elements
- **DOM Traversal**: Intelligent element relationship detection
- **Performance Optimized**: Efficient selector matching and caching

### 🛡️ Robust Error Handling
- **Graceful Degradation**: System remains functional when toast system fails
- **Context Validation**: Extension context safety checks
- **Event Safety**: Prevents infinite loops and race conditions
- **Debug Information**: Comprehensive logging for troubleshooting

## 🔄 Event Flow

### Toast Display Flow
1. Feature requests toast notification
2. `ToastIntegration.showNotification()` called with parameters
3. Toast displayed via Vue Sonner with optional action buttons
4. User interacts with toast (clicks button or dismisses)
5. `ToastEventHandler` captures interaction in capture phase
6. Event analyzed and appropriate callback triggered
7. Feature responds to user action

### Cancel Button Detection Flow
1. User clicks on toast notification
2. `ToastEventHandler.handleClick()` captures event
3. Event path analyzed using `isCancelButtonClickDirect()`
4. Method checks for:
   - `data-button` and `data-action` attributes
   - Button position in toast (first action button = cancel)
   - Text content matching ("Cancel", "کنسل", etc.)
   - Parent toast container detection
5. If cancel detected, `onCancelClick` callback triggered
6. Feature deactivates or cancels operation

### Element Exclusion Flow
1. Event captured on potential toast element
2. `ToastElementDetector.shouldExcludeFromSelection()` called
3. Method checks multiple exclusion criteria:
   - Extension-specific selectors and classes
   - Toast system selectors and attributes
   - Shadow DOM boundaries
   - Custom exclusion patterns
4. Returns `true` if element should be excluded from selection
5. Feature systems respect exclusion decision

## 🔧 Technical Implementation

### Toast Integration Setup
```javascript
// Initialize toast system for a feature
const toastIntegration = new ToastIntegration(eventBus);

toastIntegration.initialize({
  onCancelClick: () => {
    // Handle cancel button clicks
    this.deactivate();
  },
  onToastClick: (event, toastData) => {
    // Handle general toast interactions
    this.handleToastInteraction(event, toastData);
  }
});

// Show notification with actions
toastIntegration.showNotification('success', 'Mode activated', {
  duration: 5000,
  actions: [
    {
      label: 'Cancel',
      callback: () => this.deactivate(),
      type: 'cancel'
    }
  ]
});
```

### Event Handler Implementation
```javascript
// Event interception with capture phase
class ToastEventHandler {
  enable(options = {}) {
    this.onCancelClick = options.onCancelClick;
    this.onToastClick = options.onToastClick;
    
    // Use capture phase to intercept before other handlers
    this.clickHandler = (event) => this.handleClick(event);
    document.addEventListener('click', this.clickHandler, { capture: true });
  }
  
  handleClick(event) {
    if (this.isProcessingClick) return;
    
    const isCancelButton = this.isCancelButtonClickDirect(event);
    const isToastClick = ToastElementDetector.isWithinToast(event.target);
    
    if (isCancelButton) {
      this.isProcessingClick = true;
      this.onCancelClick(event);
      setTimeout(() => { this.isProcessingClick = false; }, 100);
    } else if (isToastClick) {
      this.onToastClick(event, { type: 'toast-click' });
    }
  }
}
```

### Element Detection System
```javascript
// Smart element detection and exclusion
class ToastElementDetector {
  static shouldExcludeFromSelection(element) {
    if (!element) return false;
    
    // Check extension elements
    if (this.isExtensionElement(element)) return true;
    
    // Check toast elements
    if (this.isToastElement(element)) return true;
    
    // Check parent elements
    return this.isWithinExtensionOrToast(element);
  }
  
  static isExtensionElement(element) {
    // Check for extension-specific selectors
    return element.closest?.('[data-translate-it], .translate-it-element-highlighted');
  }
  
  static isToastElement(element) {
    // Check Vue Sonner toast attributes and classes
    return element.hasAttribute('data-sonner-toast') ||
           element.classList?.contains('sonner-toast');
  }
}
```

## 🎯 Usage Patterns

### Basic Toast Notifications
```javascript
// Simple success message
toastIntegration.showSuccess('Operation completed successfully');

// Error message with auto-dismiss
toastIntegration.showError('Failed to process request', {
  duration: 8000
});

// Information message with custom duration
toastIntegration.showInfo('Mode activated', {
  duration: 3000
});
```

### Actionable Toast Notifications
```javascript
// Toast with cancel button for mode deactivation
toastIntegration.showNotification('success', 'Select Element mode activated', {
  duration: 0, // Persistent until user interaction
  actions: [
    {
      label: 'Cancel',
      callback: () => {
        this.selectElementManager.deactivate();
      },
      type: 'cancel'
    }
  ]
});

// Toast with multiple actions
toastIntegration.showNotification('info', 'Translation completed', {
  actions: [
    {
      label: 'Copy',
      callback: () => this.copyToClipboard(),
      type: 'primary'
    },
    {
      label: 'Undo',
      callback: () => this.revertTranslation(),
      type: 'secondary'
    }
  ]
});
```

### Feature Integration
```javascript
// Integrate with Select Element mode
class SelectElementManager {
  async activate() {
    // Initialize toast integration
    this.toastIntegration = new ToastIntegration(this.eventBus);
    
    await this.toastIntegration.initialize({
      onCancelClick: () => this.deactivate(),
      onToastClick: (event, data) => this.handleToastInteraction(event, data)
    });
    
    // Show activation notification
    this.toastIntegration.showNotification('success', 'Select Element mode activated', {
      actions: [
        {
          label: 'Cancel',
          callback: () => this.deactivate(),
          type: 'cancel'
        }
      ]
    });
  }
  
  async deactivate() {
    // Show deactivation notification
    this.toastIntegration.showSuccess('Select Element mode deactivated');
    
    // Shutdown toast integration
    await this.toastIntegration.shutdown();
  }
}
```

## 🔧 Configuration Options

### Toast Display Options
```javascript
const options = {
  // Duration in milliseconds (0 = persistent)
  duration: 5000,
  
  // Toast type (success, error, info, warning)
  type: 'success',
  
  // Action buttons array
  actions: [
    {
      label: 'Button Text',
      callback: () => { /* handle action */ },
      type: 'primary|secondary|cancel'
    }
  ],
  
  // Position on screen
  position: 'top-right',
  
  // Custom styling
  className: 'custom-toast-class'
};
```

### Event Handler Options
```javascript
const handlerOptions = {
  // Cancel button click handler
  onCancelClick: (event) => { /* handle cancel */ },
  
  // General toast click handler
  onToastClick: (event, toastData) => { /* handle click */ },
  
  // Event bus for custom events
  eventBus: customEventBus,
  
  // Debug mode for development
  debug: false
};
```

## 🛡️ Error Handling

### Comprehensive Error Management
- **Initialization Errors**: Graceful fallback when toast system fails
- **Event Handler Errors**: Prevent infinite loops and race conditions
- **DOM Errors**: Handle missing elements and invalid selectors
- **Extension Context**: Validate extension context before operations

### Error Recovery Strategies
```javascript
// Graceful degradation example
async function initializeWithFallback() {
  try {
    await this.toastIntegration.initialize(options);
  } catch (error) {
    this.logger.warn('Toast integration failed, falling back to console', error);
    // Fallback to console notifications or alternative UI
  }
}
```

## 📊 Performance Optimizations

### Event Optimization
- **Capture Phase**: Intercept events before other handlers
- **Debouncing**: Prevent rapid repeated event processing
- **Path Caching**: Cache DOM traversal results
- **Lazy Loading**: Initialize components only when needed

### Memory Management
- **Cleanup**: Proper event listener removal and resource cleanup
- **Weak References**: Use WeakMap where appropriate for element references
- **Garbage Collection**: Allow proper garbage collection of unused elements

## 🔄 Integration Points

### With Select Element System
```javascript
// Seamless integration for mode management
selectElementManager.toastIntegration.showNotification(
  'success', 
  'Select Element mode active', 
  {
    actions: [
      {
        label: 'Cancel',
        callback: () => selectElementManager.deactivate(),
        type: 'cancel'
      }
    ]
  }
);
```

### With Translation System
```javascript
// Translation progress notifications
translationOrchestrator.onProgress = (progress) => {
  toastIntegration.showInfo(`Translation progress: ${progress}%`);
};

translationOrchestrator.onComplete = (result) => {
  toastIntegration.showSuccess('Translation completed', {
    actions: [
      {
        label: 'Copy Result',
        callback: () => copyToClipboard(result.translatedText),
        type: 'primary'
      }
    ]
  });
};
```

### With Text Selection System
```javascript
// Text selection feedback
textSelectionHandler.onSelectionComplete = (selection) => {
  toastIntegration.showSuccess('Text selected for translation', {
    duration: 2000
  });
};
```

## 🧪 Testing and Debugging

### Debug Information
```javascript
// Get system status
toastIntegration.getStatus() => {
  isInitialized: boolean,
  isEnabled: boolean,
  eventHandlerStats: object,
  elementDetectorStats: object
};

// Test toast detection
ToastElementDetector.isToastElement(element) => boolean;
ToastElementDetector.shouldExcludeFromSelection(element) => boolean;
```

### Development Tools
- **Console Logging**: Comprehensive debug information
- **Event Monitoring**: Track event flow and processing
- **Performance Metrics**: Monitor timing and resource usage
- **Error Tracking**: Detailed error reporting and stack traces

## 🚀 Future Enhancements

### Planned Features
- **Animation Support**: Custom toast animations and transitions
- **Theming**: Customizable toast themes and styling
- **Internationalization**: Multi-language toast content support
- **Persistent Queues**: Toast queue management for high-frequency notifications

### Technical Improvements
- **Web Components**: Custom web component toast implementation
- **Service Worker**: Background toast processing support
- **IndexedDB**: Offline toast history and persistence
- **Performance Monitoring**: Advanced performance metrics and optimization

## 📈 Best Practices

### Usage Guidelines
1. **Keep Messages Concise**: Toast notifications should be brief and actionable
2. **Use Appropriate Types**: Choose correct toast type (success, error, info, warning)
3. **Provide Clear Actions**: Action buttons should have obvious purposes
4. **Handle Errors Gracefully**: Always include error handling for toast operations
5. **Respect User Attention**: Don't overwhelm users with too many notifications

### Performance Guidelines
1. **Clean Up Resources**: Always call shutdown() when done with toast integration
2. **Avoid Memory Leaks**: Remove event listeners and clear references
3. **Use Appropriate Durations**: Set reasonable timeout values for auto-dismiss
4. **Batch Notifications**: Group related notifications when possible
5. **Monitor Performance**: Track toast system impact on overall performance