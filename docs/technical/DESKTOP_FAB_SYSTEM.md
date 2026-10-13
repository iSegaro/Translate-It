# Desktop FAB System Architecture (2026)

## Overview

The **Desktop FAB (Floating Action Button)** is a persistent, smart interface element designed for desktop browsers. It serves as a high-access entry point for core features—"Select Element", "Page Translation", and "TTS"—without requiring the popup to be open. It features an advanced state-aware fading mechanism and vertical draggability with persistence.

**Architecture Status**: Production Ready (Optimized)
**Key Metrics**: GPU-accelerated (60fps), Low-overhead event listeners, Persistent positioning.

---

## Visibility exclusions (Issue #303)

The visibility gate belongs to `ContentApp.vue`, through `useDesktopFabVisibility`; it is separate from the global extension setting and from the other content-app UI. The FAB is rendered only after exclusion state is ready and no applicable dismissal is active. This gate does not change other UI surfaces or modes.

The last menu entry, **Hide FAB**, opens three hide scopes:

- **Close for Now** hides the FAB in the current content-app memory only, until reload or a changed-URL SPA navigation. A same-URL history event does not reset it.
- **Always Hide on This Page** persists a page exclusion. Page identity ignores query and hash, treats HTTP and HTTPS as equivalent, removes one trailing slash (except at the root), and preserves the host including its port. `file:` pages are supported.
- **Always Hide on This Site** persists an exact HTTP(S) hostname exclusion; it does not cover subdomains. Site exclusions are unsupported for `file:` URLs.

When selection translation is set to **ON_FAB_CLICK**, the menu warns (in English, Persian, and Japanese) that hiding the FAB prevents starting selection translation from it. Hide actions do not modify selection mode or the global FAB setting. A failed persistent write reports an error and keeps the menu open; successful writes dismiss the FAB.

Persisted entries use feature-owned, per-entry `desktop-fab-exclusion:v1:` keys in `StorageCore`, allowing cross-tab changes without a shared-list write race. They are not settings-schema entries and are not included in settings export/import. Settings reset clears them through the storage clear. Manage exclusions in **Options → Activation → Desktop FAB**: the list supports removal and stays available when the global FAB toggle is off. It refreshes on owned storage changes; overlapping reads are guarded so an older result cannot replace a newer one. The content-side gate also discards stale exclusion reads. Exclusions are independent of automatic-translation rules: no auto-translation rules are reused, and this feature does not monkeypatch browser history.

## Popup visibility override

The desktop Popup **More** menu offers one state-dependent action: **Hide FAB for Now** or **Show FAB for Now**. Status is queried whenever More opens; the content script is authoritative. The override is tab-local, in memory, and has three states: `none`, `hide`, and `show`. `hide` suppresses the FAB; `show` takes precedence over page/site exclusions only. Neither changes exclusions, selection mode, or global settings.

Show does not bypass extension/FAB disablement, mobile UI, fullscreen, restricted or non-top frames, settings/exclusion readiness, pending navigation, or FAB mount readiness. ContentApp registers the status/override controller in the top frame and receives the FAB's mounted-presence event; without that UI/controller, status is unavailable.

An accepted navigation with a different full URL resets the override to `none` and refreshes exclusions. A same-URL history event does not reset it. The Popup pins reads and writes to the active tab ID and URL, sends them to frame 0 with the expected URL, re-queries before writing, and reads status again after a successful change rather than flipping optimistically. Unavailable or loading states disable the action; the Popup stays open and settings remain untouched. The same content-script behavior could be used by a Sidepanel, but no Sidepanel visibility control exists now.

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
- **Owner-Aware Cleanup**: The FAB's audio is protected by the "Owner-Aware Cleanup" logic. Closing the extension popup or sidepanel will NOT interrupt FAB playback unless they were the initiators.
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

**Last Updated**: October 2026
