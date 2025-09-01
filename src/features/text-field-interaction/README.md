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