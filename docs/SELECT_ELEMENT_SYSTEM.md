# Select Element System Documentation

## 🎯 Overview

The Select Element system provides an intuitive way for users to translate content directly on a webpage. By activating this mode, users can hover over any element, see a visual highlight, and click to translate its text content.

**Major Update (2026)**: The system has been significantly simplified by integrating the [domtranslator](https://github.com/translate-tools/domtranslator) library - a battle-tested solution used in the Linguist Translate extension (200k+ users). This migration reduced the codebase by **~70%** while maintaining all core functionality.

## 🎉 Migration to domtranslator (2026)

### What Changed

| Aspect | Before | After | Reduction |
|--------|--------|-------|-----------|
| SelectElementManager | ~1,265 lines | ~300 lines | **76%** |
| Total services | 13+ specialized services | 2 core services | **85%** |
| Architecture layers | 5+ layers | 2 layers | **60%** |
| External deps | 0 | 1 (domtranslator) | +1 small dep |
| Streaming support | Yes (complex) | No (simplified) | Removed |

### What Was Removed

- **Streaming translation system** - Simplified to one-shot translation
- **Multi-segment processing** - Replaced by simple text extraction
- **Placeholder system** - Not needed for simple case
- **Complex node matching** - domtranslator handles this
- **Mode management** - Simple mode only
- **Direction manager** - Simplified to language-based detection

### What Was Preserved

✅ Element selection and highlighting
✅ Click-to-translate functionality
✅ Navigation prevention on interactive elements
✅ Toast notifications with actionable buttons
✅ Revert functionality
✅ Cross-frame communication
✅ ESC key deactivation
✅ RTL/LTR direction handling

## 🏗️ Simplified Architecture

The new architecture uses domtranslator for DOM manipulation and translation:

```
User Click → SelectElementManager (~300 lines)
     ↓
     ├─→ ElementSelector (highlight, extract, prevent nav)
     ├─→ DomTranslatorAdapter
     │       ↓
     │   domtranslator (NodesTranslator + DOMTranslator)
     │       ↓
     │   Translation via Provider System
     └─→ SelectElementNotificationManager (toast)
```

### Core Components

#### 1. **SelectElementManager.js** (~300 lines)
The central controller that manages the entire Select Element lifecycle:
- **Mode Management**: Activate/deactivate Select Element mode
- **Event Coordination**: Mouse events, keyboard events, click handling
- **Cross-Frame Support**: Works in both main page and iframes
- **FeatureManager Integration**: Integrated with smart feature management
- **Resource Management**: Extends ResourceTracker for automatic cleanup

#### 2. **DomTranslatorAdapter.js** (~200 lines)
Wrapper around domtranslator library:
- **Translation Function**: Bridges domtranslator with extension's provider system
- **Direction Handling**: Applies RTL/LTR attributes based on target language
- **State Tracking**: Manages translation state for revert functionality
- **Progress Callbacks**: Optional callbacks for translation progress

#### 3. **ElementSelector.js** (~200 lines)
Handles element selection and highlighting:
- **Mouse Events**: Hover highlighting with visual feedback
- **Click Prevention**: Stops navigation on interactive elements
- **Element Validation**: Smart detection of valid text elements
- **Cursor Management**: Crosshair cursor during activation

#### 4. **elementHelpers.js** (~150 lines)
Utility functions for text extraction and validation:
- `extractTextFromElement()` - Simple text extraction
- `isValidTextElement()` - Element validation
- `hasValidTextContent()` - Text content validation
- `getDirectionFromLanguage()` - RTL/LTR detection

#### 5. **SelectElementNotificationManager.js** (Unchanged)
Manages toast notifications:
- **Singleton Pattern**: Single notification manager instance
- **Event Integration**: pageEventBus for communication
- **Actionable Buttons**: Cancel and Revert buttons
- **Cross-Context Support**: Works across frames

## 🔧 Usage

### Activating Select Element Mode

```javascript
// From content script (via FeatureManager)
const manager = window.featureManager.getFeatureHandler('selectElement');
await manager.activateSelectElementMode();

// From background script
await sendMessage({
  action: MessageActions.ACTIVATE_SELECT_ELEMENT_MODE
});
```

### Deactivating Select Element Mode

```javascript
// Via ESC key (automatic)
// Or programmatically:
await manager.deactivate();
```

### Reverting Translations

```javascript
const manager = window.featureManager.getFeatureHandler('selectElement');
await manager.revertTranslations();
```

## 🔗 Message Handling

### Background Script Messages

- **ACTIVATE_SELECT_ELEMENT_MODE**: Activate Select Element mode
- **DEACTIVATE_SELECT_ELEMENT_MODE**: Deactivate Select Element mode
- **GET_SELECT_ELEMENT_STATE**: Get current mode state
- **SET_SELECT_ELEMENT_STATE**: Set mode state (internal)

### pageEventBus Events

- **show-select-element-notification**: Show activation notification
- **update-select-element-notification**: Update notification status
- **dismiss-select-element-notification**: Dismiss notification
- **cancel-select-element-mode**: Cancel from toast button
- **revert-translations**: Revert from toast button
- **hide-translation**: Hide translation overlay

## 📁 File Structure

```
src/features/element-selection/
├── SelectElementManager.js              # Main manager (~300 lines)
├── SelectElementNotificationManager.js  # Notification manager (unchanged)
├── ElementSelectionFactory.js           # Lazy loading factory
├── index.js                             # Feature entry point
│
├── core/                                # New core services
│   ├── DomTranslatorAdapter.js          # domtranslator wrapper
│   └── ElementSelector.js               # Selection & highlighting
│
├── utils/                               # Simplified utilities
│   ├── elementHelpers.js                # Main helpers
│   ├── textDirection.js                 # RTL/LTR utilities
│   ├── timeoutCalculator.js             # Dynamic timeouts
│   └── cleanupSelectionWindows.js       # Window cleanup
│
├── constants/                           # Configuration
│   └── SelectElementModes.js            # Mode definitions
│
├── handlers/                            # Message handlers (unchanged)
│   ├── handleActivateSelectElementMode.js
│   ├── handleDeactivateSelectElementMode.js
│   ├── handleGetSelectElementState.js
│   ├── handleSetSelectElementState.js
│   └── selectElementStateManager.js
│
└── composables/                         # Vue composables
    └── useElementSelectionLazy.js       # Lazy loading
```

## 🎨 UI/UX Features

### Visual Feedback
- **Hover Highlighting**: Blue outline on hoverable elements
- **Crosshair Cursor**: Indicates selection mode is active
- **Navigation Prevention**: Clicks on links/buttons don't navigate

### Toast Notifications
- **Activation Notice**: Shows when mode is activated
- **Translation Progress**: Updates during translation
- **Action Buttons**: Cancel and Revert buttons
- **Cross-Context**: Works in all contexts and iframes

## 🧩 Integration Points

### FeatureManager Integration
```javascript
// FeatureManager loads SelectElementManager as ESSENTIAL feature
// Access via:
const manager = window.featureManager.getFeatureHandler('selectElement');
```

### Provider System Integration
```javascript
// DomTranslatorAdapter uses extension's provider system
// Supports all translation providers (Google, DeepL, OpenAI, etc.)
```

### Toast System Integration
```javascript
// Uses centralized toast notification system
// Actionable buttons trigger pageEventBus events
```

## ⚙️ Configuration

### Mode Settings
- **Simple Mode**: Direct element selection (default)
- **Validation**: Minimum text length, element size checks

### Timeouts
- **Dynamic Timeout**: Based on text length
- **Base Timeout**: 30 seconds
- **Max Timeout**: 5 minutes

### Direction Handling
- **RTL Languages**: Auto-detected from target language
- **Language List**: ar, he, fa, ur, yi, ps, sd, ckb, dv, ug

## 🔍 Debugging

### Get Manager Status
```javascript
const manager = window.featureManager.getFeatureHandler('selectElement');
console.log(manager.getStatus());
// { serviceActive, isProcessingClick, isInitialized, instanceId, isInIframe }
```

### Check Translation State
```javascript
const adapter = manager.domTranslatorAdapter;
console.log(adapter.getCurrentTranslation());
// { elementId, element, originalHTML, translatedHTML, targetLanguage, timestamp }
```

## 📊 Performance

### Memory Usage
- **Improved**: ~70% reduction in code size
- **Simplified**: Fewer objects to track
- **Efficient**: domtranslator uses WeakMap for storage

### Translation Speed
- **One-Shot**: No streaming overhead for simple translations
- **Direct**: Single provider call per translation
- **Optimized**: domtranslator is highly optimized

## 🚀 Future Enhancements

### Potential Additions
- **Smart Mode**: Re-add Ctrl+click for intelligent container selection
- **Batch Translation**: Translate multiple elements at once
- **Cache System**: Cache translation results (previously removed)

### Known Limitations
- **No Streaming**: Large content may take longer to translate
- **Simple Mode Only**: No intelligent container detection
- **Single Element**: One element per translation (no batch)

## 📝 References

- [domtranslator Library](https://github.com/translate-tools/domtranslator)
- [Toast Integration System](./TOAST_INTEGRATION_SYSTEM.md)
- [Feature Manager System](./SMART_HANDLER_REGISTRATION_SYSTEM.md)
- [Translation Provider System](./PROVIDERS.md)

## 🔄 Migration History

- **2026-02**: Migrated to domtranslator library (~70% code reduction)
- **2025**: Previous architecture with 13+ specialized services
- **2024**: Initial implementation with streaming and placeholder support
