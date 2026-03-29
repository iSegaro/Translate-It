# WindowsManager UI Host Integration Guide

## Overview

This document describes the successful migration of the WindowsManager system to use the centralized Vue.js UI Host architecture. The WindowsManager now communicates with the UI Host through event-based messaging instead of direct DOM manipulation.

## Architecture Changes

### Before Migration
- WindowsManager directly manipulated DOM elements
- Created and managed UI elements internally
- Mixed business logic with UI rendering
- No CSS/JS isolation from host webpage

### After Migration
- WindowsManager emits events for UI operations
- Vue UI Host handles all UI rendering in Shadow DOM
- Complete separation of concerns
- Full CSS/JS isolation from host webpage

## Selection Coordinator Integration (2026)

The WindowsManager has been further decoupled from text selection detection. It no longer acts as a gateway for other UI modules (like FAB). Instead, it operates as a subscriber to global selection events.

### Global Selection Flow
1.  **Selection Detection**: `SelectionManager` or `TextFieldDoubleClickHandler` detects text.
2.  **Broadcasting**: A `GLOBAL_SELECTION_CHANGE` event is emitted via `PageEventBus`.
3.  **Reaction**: `WindowsManager` receives the event and independently decides whether to show its UI based on:
    - User settings (onClick vs Immediate).
    - Keyboard modifiers (Ctrl key requirement).
    - URL exclusions.

### Key Benefits of Decoupling
- **Resilience**: The FAB and TTS systems work even if `WindowsManager` is disabled or fails.
- **Simplification**: `WindowsState` no longer carries FAB-specific flags like `pendingFabTrigger`.
- **Platform Parity**: Mobile and Desktop now follow the exact same event-driven flow.

## Event-Based Communication

### Event Types

#### Window Management Events
- `show-window` - Request to show a translation window
- `dismiss-window` - Request to dismiss a window
- `translation-loading` - Show loading state in window
- `translation-result` - Display translation result
- `translation-error` - Display error message
- `translation-window-change-provider` - User requested to change translation provider

#### Icon Management Events
- `show-icon` - Request to show a translation icon
- `dismiss-icon` - Request to dismiss an icon
- `icon-clicked` - Notify when icon is clicked

### Event Payload Structure

#### Window Events
```javascript
{
  id: 'unique-window-id',
  selectedText: 'text to translate',
  position: { x: 100, y: 200 },
  mode: 'window', // or 'icon'
  provider: 'google_v2', // Optional: Current provider ID
  targetLanguage: 'fa' // Optional: Target language code
}
```

#### Icon Events
```javascript
{
  id: 'unique-icon-id',
  text: 'text to translate',
  position: { top: 100, left: 200 }
}
```

## Integration Points

### 1. WindowsManager Class
- Modified `show()` method to emit events instead of DOM manipulation
- Updated `dismiss()` method to emit dismissal events
- Added event-based cross-frame communication
- Maintained backward compatibility for existing callers

### 2. Vue UI Host Components
- **TranslationWindow.vue** - Handles window rendering and management
- **TranslationIcon.vue** - Handles icon rendering and interactions
- **DesktopFabMenu.vue** - Persistent floating menu for global actions (See [Desktop FAB System](DESKTOP_FAB_SYSTEM.md))
- **MobileSheet.vue** - Centralized bottom sheet for mobile browsers (See [Mobile Support System](MOBILE_SUPPORT.md))
- **ContentApp.vue** - Root component that manages all UI elements

### 3. Event Bus System
- Extended `PageEventBus.js` with WindowsManager-specific events
- Added `WindowsManagerEvents` utility for consistent event emission
- Maintained existing event patterns for consistency

## Key Benefits

### 1. Performance Improvement
- Reduced DOM manipulation overhead
- Centralized UI rendering in Vue's optimized virtual DOM
- Better memory management with Vue's reactivity system

### 2. Maintainability
- Clear separation between business logic and UI rendering
- Consistent UI patterns across the extension
- Easier debugging with centralized UI management

### 3. Isolation & Security
- Complete CSS isolation through Shadow DOM
- JavaScript isolation from host webpage
- Prevention of style conflicts with websites

### 4. Cross-Browser Compatibility
- Consistent behavior across Chrome and Firefox
- Better handling of iframe scenarios
- Improved cross-frame communication

## Migration Status


### 🎯 Future Improvements
- [ ] Enhanced accessibility features (ARIA attributes)
- [ ] User-customizable UI themes
- [ ] Advanced positioning algorithms (e.g., collision detection)
- [ ] Performance optimizations for very high-frequency events

## Error Management Integration

The WindowsManager system is fully integrated with the centralized **Error Management System**:

1.  **Unified Classification**: All errors are matched to types via `ErrorMatcher` to determine if they are fatal, silent, or require settings.
2.  **Consistent UI Messages**: Instead of manual error string building, `ErrorHandler.getErrorForUI()` is used to provide localized, user-friendly messages.
3.  **Context-Aware Actions**: The system automatically determines if a "Retry" or "Settings" button should be displayed in the translation window based on the error type (e.g., Network Error vs. Invalid API Key).
4.  **Silent Context Handling**: Extension reload/context errors are handled silently via `ExtensionContextManager` to prevent UI glitches.

### Example: Error Event
```javascript
// Show error with retry/settings support
const errorInfo = await errorHandler.getErrorForUI(error, 'windows-translation');

WindowsManagerEvents.updateWindow(windowId, {
  isError: true,
  canRetry: errorInfo.canRetry,
  needsSettings: errorInfo.needsSettings,
  initialTranslatedText: errorInfo.message
});
```

### Basic Window Creation
```javascript
// In WindowsManager
WindowsManagerEvents.showWindow({
  id: 'window-123',
  selectedText: 'Hello world',
  position: { x: 100, y: 200 },
  mode: 'window'
});
```

### Icon Management
```javascript
// In WindowsManager
WindowsManagerEvents.showIcon({
  id: 'icon-456',
  text: 'Selected text',
  position: { top: 150, left: 300 }
});
```

### Translation Process
```javascript
// Show loading state
WindowsManagerEvents.translationLoading('window-123');

// Show result
WindowsManagerEvents.translationResult('window-123', {
  translatedText: 'سلام دنیا',
  originalText: 'Hello world',
  provider: 'google_v2',
  targetLanguage: 'fa'
});

// Show error
WindowsManagerEvents.translationError('window-123', {
  message: 'Translation failed',
  error: errorObject,
  provider: 'google_v2'
});
```

## Provider Selection Integration

The WindowsManager now supports per-window provider selection:

1.  **UI Interaction**: The `TranslationWindow.vue` component includes a `ProviderSelector`.
2.  **Event Flow**: When a user changes the provider in the window, it emits a `translation-window-change-provider` event.
3.  **State Management**: `WindowsManager` listens for this event, updates its internal state (`WindowsState.provider`), and triggers a re-translation.
4.  **Smart Resolution**: `TranslationHandler` uses a prioritized resolution logic to determine the best provider (Manual Override > Mode-Specific Setting > Global Default).

### Example: Provider Change Event
```javascript
// Emitted from Vue UI Host
pageEventBus.emit('translation-window-change-provider', {
  id: 'window-123',
  provider: 'bing'
});
```

## Testing

### Manual Testing
Run the test script in browser console:
```javascript
testWindowsManagerIntegration();
```

### Automated Testing
The system supports:
- Unit tests for event emission
- Integration tests with Vue components
- Cross-browser compatibility tests
- Performance benchmarking

## Backward Compatibility

The migration maintains full backward compatibility:
- Existing WindowsManager API remains unchanged
- All external interfaces preserved
- No breaking changes for consumers
- Seamless transition for users

## Performance Metrics

### Before Migration
- DOM manipulation: ~5ms per operation
- Memory usage: Higher due to direct DOM references
- Style recalculation: Frequent due to inline styles

### After Migration (2025 CSS Architecture)
- Event emission: <1ms per operation
- Memory usage: Optimized through Vue's reactivity + CSS containment
- Style recalculation: Minimal due to CSS Grid and modern layout methods
- CSS Variables: Safe interpolation with fallback values
- Performance: Enhanced through CSS containment and modern overflow handling

## Conclusion

The WindowsManager integration with the Vue UI Host represents a significant architectural improvement that enhances performance, maintainability, and user experience while maintaining full backward compatibility with existing systems.
