# Mouse on Hover Translation System Documentation

## Overview

The **Mouse on Hover** system provides a highly responsive, "zero-click" translation experience. Users can translate words, sentences, or entire containers simply by hovering their mouse over text. The system supports various triggers (including modifier keys like Ctrl/Alt/Shift), intelligent text detection, and a high-performance "Rectangle Cache" to minimize CPU overhead. The UI is rendered within a isolated Shadow DOM tooltip for a seamless look and feel.

## Architecture

The system follows the **Autonomous Feature Pattern**, isolating logic from the core while integrating deeply with the extension's translation and messaging layers.

```
Mouse Move / Key Down → HoverTranslationManager (Orchestrator)
     ↓
     ├─→ Rectangle Cache (Hit-test optimization)
     ├─→ HoverTextDetector (Text extraction: Word/Sentence/Container)
     │       ↓
     ├─→ ContentScriptIntegration (Action: TRANSLATE)
     │       ↓ (Background)
     │   Translation Engine → Provider System
     │       ↓
     ├─→ PageEventBus (Event: MOUSE_HOVER_TRANSLATION_READY)
     │       ↓
     └─→ MouseHoverTooltip.vue (Shadow DOM UI)
             └─→ TranslationDisplay.vue (Markdown, RTL, Fonts)
```

## Core Components

### 1. HoverTranslationManager.js
The **Central Coordinator** managing the feature lifecycle and interaction logic.

**Responsibilities:**
- Event Orchestration: Listens to global `mousemove`, `mouseleave`, and `keydown` events.
- Trigger Validation: Checks if the configured trigger (e.g., Ctrl + Hover) is met.
- State Management: Tracks the currently hovered text, active borders, and tooltip status.
- Optimization: Implements a "Rectangle Cache" to skip expensive DOM lookups when the mouse stays within the same text block.

**Key Methods:**
| Method | Description |
|--------|-------------|
| `activate()` / `deactivate()` | Lifecycle control via `FeatureManager` |
| `handleMouseMove(event)` | Main entry point for detection with debouncing |
| `handleKeyDown(event)` | Support for modifier-key triggers (e.g., press Ctrl while hovering) |
| `_processHover(event)` | Orchestrates detection, border application, and translation request |
| `_removeBorder()` | Safely restores the original style of highlighted containers |

### 2. HoverTextDetector.js
The **Intelligence Engine** for text extraction. It uses precise browser APIs to identify exactly what is under the cursor.

**Detection Scopes:**
- **Word**: Extracts the single word under the cursor using whitespace/punctuation boundaries.
- **Sentence**: Extracts the full sentence within the same text node.
- **Container**: Identifies the nearest block-level container (`p`, `div`, `li`, etc.) and extracts its full content.

**Key Technical Features:**
- **Range-at-Point**: Leverages `document.caretRangeFromPoint` for high-precision character detection.
- **Strict Hit-Test**: Validates that mouse coordinates are actually within the bounding box of the detected text (with 5px tolerance) to prevent "accidental" nearby translations.

### 3. MouseHoverTooltip.vue
The **UI Component** rendered inside the extension's Shadow DOM host.

**Features:**
- **Component Reuse**: Wraps `TranslationDisplay.vue` to leverage standardized Markdown rendering, RTL/LTR detection, and user-configured font styles.
- **Intelligent Positioning**: Automatically calculates space; shows the tooltip above the cursor by default and "flips" to the bottom if there isn't enough space at the top of the viewport.
- **Interactive Scrolling**: Uses `pointer-events: auto` and `max-height` constraints to allow users to scroll through long translations (especially in 'Container' mode) without covering the whole screen.

### 4. Rectangle Cache (Optimization Layer)
To maintain 60fps performance on complex pages:
1. When text is detected, its bounding box (`rect`) is cached in `HoverTranslationManager`.
2. On subsequent `mousemove` events, the manager first checks if the cursor is still within this `rect`.
3. If it is, all expensive detection logic and timers are skipped (CPU cost: near zero).
4. The cache is invalidated immediately when moving to empty space or when the tooltip closes.

## Configuration & Settings

Behavior is fully customizable via the **Activation Tab** in the Options Page:

| Setting Key | Default | Description |
|-------------|---------|-------------|
| `MOUSE_HOVER_SCOPE` | `sentence` | Detection depth: `word`, `sentence`, or `container`. |
| `MOUSE_HOVER_TRIGGER` | `hover` | Trigger mode: `hover`, `ctrl`, `alt`, or `shift`. |
| `MOUSE_HOVER_DELAY` | `500ms` | Wait time before starting translation. |
| `MOUSE_HOVER_AUTO_CLOSE` | `mouseleave` | Close behavior: `mouseleave` or `timer`. |
| `MOUSE_HOVER_TIMER_DURATION`| `3000ms` | Visibility duration if `timer` mode is selected. |
| `MOUSE_HOVER_SHOW_CONTAINER_BORDER` | `true` | Visual outline for the 'container' scope. |

## Feature Lifecycle

1. **Detection**: User hovers/presses modifier. `HoverTextDetector` finds text.
2. **Request**: `HoverTranslationManager` sends a `TRANSLATE` request to the background.
3. **Response**: Background returns translated text + detected direction.
4. **Display**: `MouseHoverTooltip` receives the event and renders.
5. **Interaction**: User can scroll the tooltip or move the mouse away to close.
6. **Cleanup**: `ResourceTracker` ensures all listeners are removed when the feature is toggled off.

## Integration Points

### FeatureManager
Registered as a **LAZY_UI** feature. It is only loaded and activated if the user has enabled it in settings, reducing the extension's initial footprint.

### SettingsManager
Settings are synchronized in real-time. If a user changes the trigger key in the Options page, the `HoverTranslationManager` immediately updates its logic without requiring a page refresh.

### TranslationDisplay
The tooltip is visually identical to the Popup and Sidepanel because it shares the same rendering core, ensuring consistent typography and layout.

## Debugging

To see real-time detection logs, filter the console by the `ON_HOVER` component:
`[OnHover.HoverTranslationManager] Hover translation triggered for: "..."`

---

**Last Updated**: May 2026
