# Desktop FAB System Architecture (2026)

## Overview

The **Desktop FAB (Floating Action Button)** is a persistent, smart interface element designed for desktop browsers. It serves as a high-access entry point for core features—"Select Element", "Page Translation", and "TTS"—without requiring the popup to be open. It features an advanced state-aware fading mechanism and vertical draggability with persistence.

**Architecture Status**: Production Ready (Optimized)
**Key Metrics**: GPU-accelerated (60fps), Low-overhead event listeners, Persistent positioning.

---

## File Structure

- **View Layer**: `src/apps/content/components/desktop/DesktopFabMenu.vue`
- **Logic Layer**: `src/apps/content/composables/useFabSelection.js` (Decoupled selection handling)
- **Shared Utilities**: `src/features/tts/composables/useTTSSmart.js`
- **Config & Storage**: `src/shared/config/config.js` (Position loading logic)

---

## Architecture

The Desktop FAB is a fully autonomous module following the **Selection Coordinator** pattern. It operates independently of the main `WindowsManager`, ensuring critical translation features remain accessible even if other UI components are disabled.

```
┌─────────────────────────────────────────────────────────────┐
│                 DESKTOP FAB SYSTEM ARCHITECTURE             │
├─────────────────────────────────────────────────────────────┤
│   Infrastructure Layer: Shadow DOM (UI Host Isolation)      │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
┌──────────────▼──────────────┐      ┌────────▼──────────────┐
│      Logic & State Layer    │      │      UI Host Layer    │
│  - useFabSelection.js       │◀────▶│  - DesktopFabMenu.vue │
│  - useTTSSmart.js           │      │  - Radial Badge Sys   │
│  - MobileStore (Pinia)      │      │  - Drag & Snap Engine │
└──────────────┬──────────────┘      └────────┬──────────────┘
               │                              │
┌──────────────▼──────────────────────────────▼───────────────┐
│                    INTEGRATION POINTS                       │
│  - Selection Coordinator: GLOBAL_SELECTION events           │
│  - Messaging System: Background actions (Options/Modes)     │
│  - StorageManager: Persistent Y-position & Side             │
│  - Page Event Bus: Translation & DOM Restoration            │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Draggable Interface (`DesktopFabMenu.vue`)
The UI follows a "Side FAB" pattern, snapping to either the left or right edge of the viewport.
- **Vertical Drag**: Users can reposition the FAB vertically. The side (Left/Right) is determined automatically based on the drag end position.
- **Persistence**: Final coordinates and side are saved to `storageManager` under `DESKTOP_FAB_POSITION`.
- **Smart Fading**: To minimize visual noise, the FAB enters an `idle` state (low opacity) after a delay, waking up on:
    - Mouse Hover
    - New Text Selection (via `useFabSelection`)
    - Dragging activity or Menu open state.

### 2. Logic Handler (`useFabSelection.js`)
This composable decouples FAB logic from the visual component:
- **Event Orchestration**: Listens for `GLOBAL_SELECTION_CHANGE` from the **Selection Coordinator**.
- **State Guard**: Determines if the FAB badge should appear based on translation settings (e.g., `ON_FAB_CLICK` mode).
- **Global Trigger**: Emits `GLOBAL_SELECTION_TRIGGER` to request translation processing.

### 3. Integrated Smart TTS Controller
The FAB includes an advanced TTS badge that leverages the global `useTTSSmart` system.
- **Actual Language Metadata**: Integrates with the `TranslationEngine` to identify the *actual* language used for translation. After a successful translation, it prioritizes the returned `actualSourceLanguage` for accurate TTS accents and labels, especially during Bilingual swaps.
- **Auto Language Detection**: For initial (pre-translation) state, it uses `LanguageDetectionService` to identify the language of the selected text in real-time.
- **Visual State Management**:
    - **Idle**: Standard speaker icon.
    - **Loading**: Animated SVG spinner (currentColor-aware for theme compatibility).
    - **Playing (Stop)**: Swaps to a square "Stop" icon and turns the badge **Red** (`#fa5252`) to signal cancellation availability.
- **Cancellation**: Users can immediately stop playback by clicking the badge during the "Playing" state.

---

## State-Aware Menu System

The menu items are computed reactively based on the page's current state:

| State | Menu Item | Action |
|-------|-----------|--------|
| **Text Selected** | "Translate Selection" | Triggers global selection translation |
| **Default** | "Select Element" | Emits `ACTIVATE_SELECT_ELEMENT_MODE` |
| **Default** | "Translate Page" | Emits `PAGE_TRANSLATE` via EventBus |
| **Translating** | "Progress %" / "Stop" | Shows real-time progress / Stops Auto-translation |
| **Translated** | "Restore Original" | Emits `PAGE_RESTORE` to revert DOM changes |

---

## Action Badges (Floating UI)

The system uses a radial badge pattern around the main button:
- **Top (Translate)**: Appears when text is selected and needs manual confirmation.
- **Above (Revert)**: Appears when element-specific translations exist on the page.
- **Below (TTS/Settings)**: Dynamic badges for voice playback and quick access to extension options.

---

## Technical Details

### Communication Flow
- **Downstream**: Subscribes to `PageEventBus` for DOM-level events (`PAGE_TRANSLATE_PROGRESS`).
- **Upstream**: Uses `sendMessage` for system-level background actions (`OPEN_OPTIONS_PAGE`).
- **Memory Safety**: All event listeners (Resize, Scroll, Click-away) are managed via `useResourceTracker` for guaranteed cleanup on component unmount.

### Shadow DOM Isolation
The entire FAB system is rendered inside the UI Host Shadow DOM:
- **Z-Index**: Fixed at `2147483647` to ensure visibility above all web content.
- **No-Translate**: Wrapped in `.notranslate` to prevent recursive translation of its own UI.
- **CSS Variables**: Uses scoped variables for smooth transitions (e.g., `--move-duration`).

---

## Development Guide

### Adding a New Action
1. Import necessary icons and event constants in `DesktopFabMenu.vue`.
2. Add the action to the `menuItems` computed property array.
3. If the action requires a new badge, add a `Transition` block in the template and define its positioning in `.desktop-fab-container`.

### Styling Guidelines
- **Color Identity**: Primary blue (`#4A90E2`) for standard actions, Red (`#fa5252`) for destructive/revert actions.
- **Animations**: Use `cubic-bezier(0.22, 1, 0.36, 1)` for all scale and opacity transitions to maintain a native feel.

---

**Last Updated**: April 2026