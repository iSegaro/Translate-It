# Text Field Interaction Feature

## 📋 Overview

The Text Field Interaction feature handles user interactions with text input fields, providing two main functionalities:

1. **Text Field Icon**: Shows a translation icon when users focus on editable text fields
2. **Ctrl+/ Shortcut**: Allows quick translation of text field content using keyboard shortcut

## 🏗️ Architecture

### Components
- `TextFieldIcon.vue` - Visual icon component displayed near focused text fields

### Managers  
- `TextFieldIconManager.js` - Manages icon lifecycle, positioning, and events
- `FieldShortcutManager.js` - Handles Ctrl+/ keyboard shortcut functionality

### Composables
- `useTextFieldIcon.js` - Vue composable for icon state management
- `useFieldShortcuts.js` - Vue composable for shortcut handling

### Store
- `textFieldInteraction.js` - Pinia store for feature state management

### Handlers
- `handleFieldFocus.js` - Processes text field focus events
- `handleFieldBlur.js` - Processes text field blur events  
- `handleShortcutTrigger.js` - Processes keyboard shortcut events

### Strategies
- `PlatformStrategy.js` - Base class for platform-specific text field handling
- `DefaultStrategy.js` - Default strategy for standard text fields
- `WhatsAppStrategy.js` - WhatsApp-specific text handling
- `InstagramStrategy.js` - Instagram-specific text handling  
- `TwitterStrategy.js` - Twitter-specific text handling
- `TelegramStrategy.js` - Telegram-specific text handling
- `MediumStrategy.js` - Medium-specific text handling
- `ChatGPTStrategy.js` - ChatGPT-specific text handling
- `YoutubeStrategy.js` - YouTube-specific text handling
- `DiscordStrategy.js` - Discord-specific text handling

### Utils
- `fieldDetection.js` - Utilities for detecting editable fields
- `iconPositioning.js` - Utilities for calculating icon positions
- `shortcutValidation.js` - Utilities for validating shortcut conditions

## 🎯 Features

### Text Field Icon
- **Trigger**: Automatically appears when user focuses on editable text fields
- **Position**: Positioned near the top-right corner of the focused field
- **Behavior**: 
  - Shows on focus with smooth animation
  - Hides on blur with delay (allows interaction)
  - Clickable to trigger translation
  - Responsive to different field sizes

### Ctrl+/ Shortcut
- **Trigger**: Ctrl+/ (or Cmd+/ on Mac) in any editable field
- **Behavior**:
  - Validates field has content
  - Checks if translation is not already in progress
  - Triggers translation of entire field content
  - Handles errors gracefully

## 🧹 Memory Management

This feature integrates with the **Memory Garbage Collector** system to prevent memory leaks:

### ResourceTracker Integration
- **TextFieldIconManager**: Extends `ResourceTracker` for automatic cleanup of timeouts and event listeners
- **useTextFieldIcon**: Uses `ResourceTracker` for managing page event bus listeners
- **useFieldShortcuts**: Uses `ResourceTracker` for managing keyboard event listeners
- **TextFieldIcon.vue**: Uses `ResourceTracker` for managing component timeouts

### Automatic Cleanup
- **Event Listeners**: All DOM and custom event listeners are automatically tracked and cleaned up
- **Timeouts**: All `setTimeout` calls are tracked and cleared on component destruction
- **Lifecycle Management**: Resources are cleaned up when components unmount or features are disabled

### Supported Event Systems
- **DOM EventTargets**: Standard browser event listeners
- **Custom Event Systems**: Page event bus with `on`/`off` methods
- **Browser APIs**: Extension-specific APIs with `addListener`/`removeListener`

## 🔧 Configuration

The feature respects these configuration flags:
- `EXTENSION_ENABLED` - Overall extension enable/disable
- `TEXT_FIELDS` - Text field icon feature toggle
- `SHORTCUT_TEXT_FIELDS` - Ctrl+/ shortcut feature toggle

## 🚀 Integration

This feature integrates with:
- **Translation System** - Sends text for translation processing
- **Windows Manager** - Displays translation results
- **Error Management** - Handles and reports errors
- **Settings Storage** - Respects user preferences
- **UI Host System** - Renders components in shadow DOM

## 📱 Platform Support

- **Chrome MV3** - Full support including icon positioning
- **Firefox MV3** - Full support with compatibility layer
- **Cross-platform** - Handles different operating systems (Ctrl vs Cmd keys)

## 🎨 Styling

- Uses extension's theme system
- Respects user's accessibility preferences
- High contrast mode support
- Reduced motion support for animations
- Responsive design for different screen sizes

## 🧪 Testing

Testing considerations:
- Focus/blur event handling
- Keyboard shortcut detection
- Icon positioning calculations
- Cross-browser compatibility
- Error handling scenarios
- Performance with many text fields