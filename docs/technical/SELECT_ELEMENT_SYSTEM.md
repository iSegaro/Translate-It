# Select Element System Documentation

## Overview

The Select Element system provides an intuitive way for users to translate content directly on a webpage. Users activate this mode, hover over any element to see a visual highlight, and click to translate its text content. After translation, it allows viewing the original text via a surgical hover tooltip (if enabled). It uses a token-optimized, context-aware batching strategy to ensure high-quality translations while minimizing costs.

## Architecture

```
User Click → SelectElementManager
     ↓
     ├─→ ElementSelector (highlighting & target detection)
     ├─→ DomTranslatorAdapter (orchestration & UID-based mapping)
     │       ↓ (Unified Messaging)
     │   Optimized JSON Handler (Background: Intelligent Batching & Streaming)
     │       ↓
     │   Translation Provider System (AI or Traditional)
     │       ↓ (Real-time Stream)
     │   DomTranslatorAdapter ←─ (UID Mapping & BIDI Injection)
     │
     └─→ HoverPreviewManager (Shared component for Original Text preview)
     └─→ SelectElementNotificationManager (toast UI & lifecycle control)
```

## Core Components

### 1. SelectElementManager.js
**Central controller** managing the entire Select Element lifecycle.

**Responsibilities:**
- Mode Management: activate/deactivate Select Element mode.
- Event Coordination: coordinates mouse events (hover/click) and keyboard shortcuts (ESC/Cmd+Z).
- Cross-Frame Support: ensures seamless activation across main page and iframes.
- State Sync: updates the UI and background about the current selection state.

**Key Methods:**
| Method | Description |
|--------|-------------|
| `activateSelectElementMode()` | Starts interactive selection mode |
| `deactivate(options)` | Stops mode, handles cleanup and translation preservation |
| `startTranslation(element)` | Initiates translation for the selected DOM element |

### 2. ElementSelector.js
Handles element selection logic and visual feedback.

**Responsibilities:**
- Hover Highlighting: calculates and applies visual outlines to potential targets.
- Target Validation: uses `elementHelpers` to filter out valid text-heavy elements.
- Interaction Prevention: blocks default click behaviors (e.g., links, buttons) during mode.

### 3. DomTranslatorAdapter.js
The **Content-Side Orchestrator**. It prepares the DOM for translation and maps results back using a resilient UID system.

**Key Features:**
- **UID Mapping**: Assigns temporary `uid` (e.g., `n1`, `n2`) to each text node to ensure 1:1 mapping even if batches return out of order.
- **Abbreviated Protocol**: Uses short JSON keys (`t`, `i`, `b`, `r`) to reduce token overhead by ~75%.
- **Context Injection**: Extracts `contextMetadata` (page title, preceding headings) to improve AI translation quality.
- **BIDI Marks**: Automatically injects Unicode BIDI marks (RLM/LRM) during re-insertion to prevent mixed-direction layout corruption.

### 4. OptimizedJsonHandler.js (Background)
The **Translation Engine** for Select Element. It manages the complexity of API calls and data flow.

**Responsibilities:**
- **Intelligent Batching**: Groups text nodes by their block-level parent (`P`, `DIV`, `ARTICLE`) to preserve semantic context.
- **Adaptive Execution**: Switches between sequential and parallel requests based on provider rate limits.
- **Streaming Pipeline**: Streams translated results back to the content script in real-time as batches complete.
- **Provider Agnostic**: Handles both JSON-capable AI providers and traditional delimited-string providers (via `TranslationSegmentMapper`).

### 5. DomTranslatorUtils.js
Low-level DOM utility for text extraction and analysis.

**Key Functions:**
- `findClosestBlockParent(node)`: Identifies the semantic boundary for a text node.
- `collectTextNodes(element)`: Walks the DOM and generates the structured data payload `{ node, text, uid, blockId, role }`.
- `extractContextMetadata(element)`: Builds a semantic summary (Page + Heading + Role) for the provider.

### 6. DomDirectionManager.js (Shared Utility)
Manages RTL/LTR direction and text alignment.

**Key Features:**
- **High-Accuracy Detection**: Uses strong-character analysis (not just language codes) to detect direction.
- **Surgical Application**: `applyNodeDirection` finds the smallest safe container for a text node to apply direction without breaking parent layout.

### 7. HoverPreviewManager.js (Shared Feature)
A shared component located in `src/features/shared/hover-preview/` that handles showing the original text when hovering over translated elements.

**Responsibilities:**
- **Surgical Interaction**: Detects hover on elements marked with `data-has-original="true"`.
- **Memory Efficient**: Uses a `WeakMap` based lookup (`HoverPreviewLookup`) to store original text nodes without preventing garbage collection.
- **Shadow DOM UI**: Emits events to the `PageEventBus` to show/hide the tooltip in the Vue-based Shadow DOM host.

## Optimization Strategy: Smart Logical Block Batching

To provide high-quality translation while remaining cost-effective, the system uses "Smart Logical Block Batching":

1.  **Block Integrity**: Instead of a flat array of nodes, the system groups text by their closest block-level parent. This ensures a sentence split across multiple `<span>` tags is sent to the AI as a single logical unit.
2.  **Abbreviated Keys**:
    - `t`: Text content
    - `i`: Node UID (e.g., `n1`)
    - `b`: Block ID (e.g., `b12`)
    - `r`: Tag role (e.g., `p`, `h1`)
3.  **Context-Enriched Requests**: Sends `contextSummary` (e.g., "Page: AI News | Section: Today's Top Stories | Role: p") to AI providers to improve disambiguation.
4.  **Real-Time Streaming**: The UI updates incrementally as each logical block is translated, reducing perceived latency.

## Advanced Logic

### 1. Armor-plated Pipeline
The translation pipeline is designed to be resilient:
- **UID Resilience**: If the API response returns more or fewer items than expected, the system uses UIDs to map only valid matches back to the DOM.
- **Format Fallback**: Handles raw strings, JSON objects, and "unified response" objects from the provider system seamlessly.
- **Error Extraction**: Safely extracts error messages from complex provider objects to show user-friendly toasts.

### 2. Provider Selection
Select Element mode is **UI-Aware**. It follows the provider selected in the global UI (Popup/Sidepanel) by default, but can be overridden via `options.provider`.

## UI/UX Features

### Visual Feedback
- **Hover Highlighting**: Blue outline on hoverable elements.
- **Crosshair Cursor**: Indicates selection mode is active.
- **Navigation Prevention**: Clicks on links/buttons don't navigate during mode.
- **Original Text Preview**: When enabled, hovering over translated text shows a tooltip with the original content. This uses "surgical marking" to ensure you only see the original text for the specific element you are hovering over.

### Toast Notifications
- **Activation Notice**: Shows when mode is activated.
- **Translation Progress**: Updates in real-time during streaming.
- **Action Buttons**: Cancel and Revert buttons available in the toast.

## Message Handling

### Background Script Messages
| Action | Description |
|--------|-------------|
| `ACTIVATE_SELECT_ELEMENT_MODE` | Activate Select Element mode |
| `DEACTIVATE_SELECT_ELEMENT_MODE` | Deactivate Select Element mode |
| `TRANSLATE` | Core translation request with JSON payload |
| `TRANSLATION_STREAM_UPDATE` | Real-time streaming update to content script |

### pageEventBus Events
| Event | Description |
|-------|-------------|
| `show-select-element-notification` | Show activation notification |
| `cancel-select-element-mode` | Cancel from toast button |
| `revert-translations` | Revert from toast button |

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
Registered as an **ESSENTIAL** feature. Access via:
`const manager = window.featureManager.getFeatureHandler('selectElement');`

### Provider System Integration
Uses the extension's unified provider system. Supports all providers (Google, DeepL, OpenAI, etc.) with automatic protocol switching (JSON vs Delimited).

## Configuration

### Settings Management
Behavioral settings for Select Element are managed via the [Options Page](./OPTIONS_PAGE.md):
- **Activation Tab**: Toggle the Select Element feature globally.
- **Languages Tab**: Select the default provider and target language.
- **Advance Tab**: Manage the **Exclusion List**. If a domain is excluded, the system will not activate on that site.

### Mode Settings
- **Validation**: Minimum text length, word count, and element size checks (configured in `ElementSelector`).
- **Timeouts**: Dynamic timeouts based on text length, managed by `timeoutCalculator`.

### Direction Handling
- **RTL Detection**: Managed by `DomDirectionManager` using strong-character analysis.
- **Application**: Surgical `dir` application to prevent layout flipping on parent containers.

## Cross-Frame Communication

1.  **Main Frame**: Shows notifications and coordinates global deactivation.
2.  **Iframe**: Can trigger translations independently but listens for global deactivation.
3.  **Communication**: Uses `window.postMessage` with `DEACTIVATE_ALL_SELECT_MANAGERS` for synchronization.

## Performance

- **Memory Usage**: Uses `ResourceTracker` for automatic cleanup and `WeakMap` for translation state.
- **Speed**: Optimized by real-time streaming and token reduction (abbreviated keys).

## File Structure

```
src/features/element-selection/
├── SelectElementManager.js              # Central lifecycle manager
├── SelectElementNotificationManager.js  # Toast UI and control buttons
│
├── core/                                
│   ├── DomTranslatorAdapter.js          # DOM mapping & protocol management
│   ├── DomTranslatorUtils.js            # Structural analysis & extraction
│   ├── ElementSelector.js               # Visual selection & filtering
│   ├── DomTranslatorState.js            # Translation history & revert logic
│   └── selectElementStateManager.js     # Mode state (active/inactive)
│
├── utils/                               
│   ├── elementHelpers.js                # Validation & DOM walking
│   └── timeoutCalculator.js             # Dynamic provider timeouts
│
├── handlers/                            # Message & event handlers
    └── handleActivateSelectElementMode.js

src/features/shared/hover-preview/       # SHARED FEATURE
├── HoverPreviewManager.js               # Tooltip logic (shared with Whole Page)
└── HoverPreviewLookup.js                # Memory-efficient original text storage
```


## Debugging

### Inspecting Selection State
```javascript
const manager = window.featureManager.getFeatureHandler('selectElement');
console.table(manager.getStatus());
```

### Checking Active Metadata
Set `loglevel` to `debug` to see the `contextSummary` and `textsToTranslate` payload.

## References
- [Options Page Documentation](./OPTIONS_PAGE.md)
- [Toast Integration System](./TOAST_INTEGRATION_SYSTEM.md)
- [Feature Manager System](./SMART_HANDLER_REGISTRATION_SYSTEM.md)
- [Translation Provider System](./PROVIDERS.md)
- [Messaging System](./MessagingSystem.md)
- [Translation Provider Logic](./TRANSLATION_PROVIDER_LOGIC.md)

---

**Last Updated**: April 2026
