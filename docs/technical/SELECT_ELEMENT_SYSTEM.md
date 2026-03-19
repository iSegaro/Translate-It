# Select Element System Documentation

## Overview

The Select Element system provides an intuitive way for users to translate content directly on a webpage. Users activate this mode, hover over any element to see a visual highlight, and click to translate its text content.

## Architecture

```
User Click → SelectElementManager (~890 lines)
     ↓
     ├─→ ElementSelector (highlighting & target detection)
     ├─→ DomTranslatorAdapter (translation orchestration)
     │       ↓
     │   Streaming/Non-Streaming Translation
     │       ↓
     │   Translation via UnifiedMessaging → Provider System
     └─→ SelectElementNotificationManager (toast notification & actions)
```

## Core Components

### 1. SelectElementManager.js
**Central controller** managing the entire Select Element lifecycle.

**Responsibilities:**
- Mode Management: activate/deactivate Select Element mode
- Event Coordination: mouse events, keyboard events, click handling
- Cross-Frame Support: works in both main page and iframes
- FeatureManager Integration: registered as ESSENTIAL feature
- Resource Management: extends ResourceTracker for automatic cleanup

**Key Methods:**
| Method | Description |
|--------|-------------|
| `activateSelectElementMode()` | Starts interactive selection mode |
| `deactivate(options)` | Stops mode, optionally preserves translations |
| `startTranslation(element)` | Initiates translation for clicked element |
| `revertTranslations()` | Restores original text |

### 2. ElementSelector.js
Handles element selection and highlighting.

**Responsibilities:**
- Mouse Events: hover highlighting with visual feedback
- Click Prevention: stops navigation on interactive elements
- Element Validation: smart detection of valid text elements
- Cursor Management: crosshair cursor during activation

**Configuration:**
```javascript
{
  minArea: 4000,           // Minimum element size
  maxArea: 120000,         // Maximum element size
  minTextLength: 20,       // Minimum text characters
  minWordCount: 3,         // Minimum word count
  maxAncestors: 10,        // Max parent levels to check
  highlightTimeout: 100    // Highlight clear delay (ms)
}
```

**Key Methods:**
| Method | Description |
|--------|-------------|
| `handleMouseOver(element)` | Highlights element on hover |
| `findBestTextElement(element)` | Finds optimal translation target |
| `preventNavigation(event)` | Blocks clicks on interactive elements |
| `isOurElement(element)` | Detects extension UI elements |

### 3. DomTranslatorAdapter.js
Orchestrates translation between background services and DOM manipulation.

**Responsibilities:**
- Translation Function: bridges with extension's provider system
- Direction Handling: applies RTL/LTR attributes based on target language
- State Tracking: manages translation state for revert functionality
- Progress Callbacks: optional callbacks for translation progress
- Streaming Support: handles both streaming and non-streaming responses

**Key Methods:**
| Method | Description |
|--------|-------------|
| `translateElement(element, options)` | Main translation entry point |
| `revertTranslation()` | Restores original text |
| `hasTranslation()` | Check if translation exists |
| `cancelTranslation()` | Cancel ongoing translation |

### 4. DomDirectionManager.js (Shared Utility)
Manages RTL/LTR direction and text alignment. This is a **shared core utility** located in `@/utils/dom/`, used by both Select Element and Whole Page Translation systems to ensure consistent DOM behavior.

**Functions:**
| Function | Description |
|----------|-------------|
| `isRTL(langCode)` | Checks if language is RTL |
| `applyElementDirection(element, targetLang)` | Applies direction/alignment to a specific container |
| `applyNodeDirection(node, targetLang, root)` | Surgical application: finds the smallest safe container for a text node |
| `detectDirectionFromContent(text)` | High-accuracy direction detection based on strong characters |

**RTL Languages:**
Managed centrally in `DomTranslatorConstants.js`. Includes: `ar`, `he`, `fa`, `ur`, `yi`, `ps`, `sd`, `ckb`, `dv`, `ug`, `ae`, `arc`, `xh`, `zu`.

### 5. DomTranslatorState.js
Global translation state and revert logic.

**Exports:**
- `globalSelectElementState`: Shared state object
- `revertSelectElementTranslation()`: Global revert function
- `getSelectElementTranslationState()`: State accessor

### 6. elementHelpers.js
Utility functions for text extraction and validation.

**Key Functions:**
| Function | Description |
|----------|-------------|
| `extractTextFromElement(element)` | Extracts text from element |
| `hasValidTextContent(element, options)` | Validates text content |
| `isValidTextElement(element)` | Element validation |
| `findBestContainer(element, options)` | Finds optimal container |

### 7. SelectElementNotificationManager.js
Manages toast notifications for Select Element mode.

**Features:**
- Singleton pattern for single instance
- pageEventBus integration for communication
- Actionable buttons: Cancel and Revert
- Cross-context support: works in all contexts and iframes

## Usage

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
await manager.deactivate({ preserveTranslations: true });
```

### Reverting Translations

```javascript
const manager = window.featureManager.getFeatureHandler('selectElement');
await manager.revertTranslations();
```

## File Structure

```
src/features/element-selection/
├── SelectElementManager.js              # Main manager (~830 lines)
├── SelectElementNotificationManager.js  # Notification manager (~380 lines)
├── ElementSelectionFactory.js           # Lazy loading factory
├── index.js                             # Feature entry point
│
├── core/                                # Core translation services
│   ├── DomTranslatorAdapter.js          # Translation orchestrator (~210 lines)
│   ├── DomTranslatorState.js            # Global state & revert
│   ├── DomTranslatorUtils.js            # Text node collection utilities
│   └── ElementSelector.js               # Selection & highlighting (~400 lines)
│
├── utils/                               # Feature-specific utilities
│   ├── elementHelpers.js                # Text extraction & validation (~300 lines)
│   ├── textDirection.js                 # Legacy/Fallback RTL utilities
│   ├── timeoutCalculator.js             # Dynamic timeouts
│   └── cleanupSelectionWindows.js       # Window cleanup
│
└── ... (handlers, composables, constants)

src/utils/dom/                           # SHARED DOM UTILITIES
├── DomDirectionManager.js               # Shared RTL/LTR management
└── DomTranslatorConstants.js            # Shared translation constants
```

## Message Handling

### Background Script Messages

| Action | Description |
|--------|-------------|
| `ACTIVATE_SELECT_ELEMENT_MODE` | Activate Select Element mode |
| `DEACTIVATE_SELECT_ELEMENT_MODE` | Deactivate Select Element mode |
| `GET_SELECT_ELEMENT_STATE` | Get current mode state |
| `SET_SELECT_ELEMENT_STATE` | Set mode state (internal) |

### pageEventBus Events

| Event | Description |
|-------|-------------|
| `show-select-element-notification` | Show activation notification |
| `update-select-element-notification` | Update notification status |
| `dismiss-select-element-notification` | Dismiss notification |
| `cancel-select-element-mode` | Cancel from toast button |
| `revert-translations` | Revert from toast button |
| `hide-translation` | Hide translation overlay |

## UI/UX Features

### Visual Feedback
- **Hover Highlighting**: Blue outline on hoverable elements
- **Crosshair Cursor**: Indicates selection mode is active
- **Navigation Prevention**: Clicks on links/buttons don't navigate

### Toast Notifications
- **Activation Notice**: Shows when mode is activated
- **Translation Progress**: Updates during translation
- **Action Buttons**: Cancel and Revert buttons
- **Cross-Context**: Works in all contexts and iframes

### Provider Selection Behavior
Select Element mode is **UI-Aware**. It dynamically follows the provider selected in the Popup or Sidepanel dropdown if its specific setting is set to `default`.

- **Inheritance**: Follows the active session provider from the UI.
- **Reference**: See [Translation Provider Logic](./TRANSLATION_PROVIDER_LOGIC.md) for detailed waterfall logic.

## Integration Points

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

## Configuration

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

## Debugging

### Get Manager Status
```javascript
const manager = window.featureManager.getFeatureHandler('selectElement');
console.log(manager.getStatus());
// { serviceActive, isProcessingClick, isInitialized, instanceId, isInIframe }
```

### Check Translation State
```javascript
import { getSelectElementTranslationState } from '@/features/element-selection/core/DomTranslatorState.js';
const state = getSelectElementTranslationState();
console.log(state.currentTranslation);
// { element, originalHTML, originalTextNodes, targetLanguage, timestamp }
```

## Cross-Frame Communication

The system handles iframe scenarios:

1. **Main Frame**: Shows notifications, coordinates deactivation
2. **Iframe**: Can trigger translations, sends deactivation requests
3. **Communication**: Uses `window.postMessage` with `DEACTIVATE_ALL_SELECT_MANAGERS` type

## Performance

### Memory Usage
- **ResourceTracker**: Automatic cleanup of services
- **WeakMap**: Used for storing translation state
- **Event Listeners**: Properly removed on deactivation

### Translation Speed
- **Streaming**: Real-time updates for large content
- **Non-Streaming**: Single response for simple translations
- **Direct**: Single provider call per translation

## References

- [Toast Integration System](./TOAST_INTEGRATION_SYSTEM.md)
- [Feature Manager System](./SMART_HANDLER_REGISTRATION_SYSTEM.md)
- [Translation Provider System](./PROVIDERS.md)
- [Messaging System](./MessagingSystem.md)

---

**Last Updated**: March 2026