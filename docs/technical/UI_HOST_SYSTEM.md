# UI Host System Architecture

## Overview

The UI Host system is a centralized Vue.js application that manages all in-page user interface elements for the Translate It extension. It runs within a Shadow DOM to ensure complete CSS and JavaScript isolation from the host webpage.

## Architecture

### Components

1. **ContentApp.vue** - The root Vue component that hosts all in-page UI elements
2. **PageEventBus.js** - Lightweight event bus for communication between vanilla JS and Vue components
3. **NotificationManager.js** - Clean API wrapper for showing notifications via the event bus

### Key Features

- **Shadow DOM Isolation**: All UI elements are rendered within a Shadow DOM to prevent CSS conflicts
- **Event-Based Communication**: Uses a custom event bus for seamless communication between vanilla JS and Vue
- **Desktop FAB Integration**: Provides a persistent, draggable menu for quick access to extension features
- **Centralized Management**: All in-page UI (notifications, toolbars, icons) is managed by a single Vue app
- **Performance Optimized**: Minimizes DOM manipulation and leverages Vue's reactivity system

## Communication Pattern

### Vanilla JS → Vue (Event Emission)

```javascript
// In any content script module
import { pageEventBus } from '@/core/PageEventBus.js';

// Show a notification
pageEventBus.emit('show-notification', {
  message: 'Translation completed',
  type: 'success',
  duration: 4000
});

// Activate select mode
pageEventBus.emit('select-mode-activated');

// Add a text field icon
pageEventBus.emit('add-field-icon', {
  id: 'unique-id',
  position: { top: 100, left: 200 }
});
```

### Vue → Vanilla JS (Event Listening)

```javascript
// In ContentApp.vue
pageEventBus.on('text-field-icon-clicked', (detail) => {
  console.log('Icon clicked:', detail.id);
  // Handle the click event
});
```

## Notification System

The notification system uses `vue-sonner` for rich, customizable toast notifications:

### Notification Types
- `success` - Green success notifications
- `error` - Red error notifications  
- `warning` - Orange warning notifications
- `info` - Blue informational notifications
- `status` - Loading/status notifications
- `revert` - Special revert operations

### Usage via NotificationManager

```javascript
import NotificationManager from '@/managers/core/NotificationManager.js';

const notifier = new NotificationManager();

// Show notification
const toastId = notifier.show('Translation completed', 'success');

// Dismiss specific notification
notifier.dismiss(toastId);

// Dismiss all notifications
notifier.dismissAll();
```

## UI Components

### SelectModeToolbar.vue
Renders the toolbar/overlay when Select Element mode is active. Controlled by the `isSelectModeActive` reactive property.

### TextFieldIcon.vue  
Renders translation icons on text fields. Managed through the `activeIcons` reactive array with absolute positioning.

### DesktopFabMenu.vue
A persistent, vertically draggable floating action button that provides quick access to "Select Element" and "Page Translation" features. It features smart-fading and dynamic menu items based on page state. See [Desktop FAB System](DESKTOP_FAB_SYSTEM.md) for full details.

### MobileSheet.vue
The central UI container for mobile browsers. It provides a touch-friendly "Bottom Sheet" experience with gesture support and dynamic view switching. See [Mobile Support System](MOBILE_SUPPORT.md) for full details.

## Benefits

1. **Isolation**: Complete CSS/JS isolation prevents conflicts with webpage styles
2. **Maintainability**: Centralized UI management simplifies debugging and updates
3. **Consistency**: Uniform notification and UI patterns across the extension
4. **Performance**: Reduced DOM manipulation and optimized rendering
5. **Scalability**: Easy to add new UI components and features
6. **CSS Architecture**: Modern principled CSS with CSS Grid, containment, and safe variable functions
7. **Future-Proof**: SCSS mixins and functions prevent variable interpolation issues

## Integration Points

The system integrates with:
- `SelectElementManager.js` - For select mode toolbar
- `Desktop FAB System` - For the persistent floating action menu
- `Mobile Support System` - For the touch-friendly mobile interface
- `smartTranslationIntegration.js` - For translation status notifications
- `RevertHandler.js` - For revert operation notifications
- `ErrorHandler.js` - For error notifications
- Text field detection systems - For field icon management

## File Structure

```
src/
├── views/content/
│   ├── ContentApp.vue          # Root UI Host component
│   ├── main.js                 # Vue app initialization
│   └── components/
│       ├── SelectModeToolbar.vue
│       └── TextFieldIcon.vue
├── utils/core/
│   └── PageEventBus.js         # Event communication system
└── managers/core/
    └── NotificationManager.js   # Notification API wrapper
```

## Best Practices

1. Always use `NotificationManager` for notifications instead of direct event emission
2. Use descriptive event names with consistent naming conventions
3. Include all necessary data in event payloads for proper handling
4. Clean up event listeners when components are unmounted
5. Test UI components in various webpage environments
