# Desktop FAB System Architecture (2026)

## Overview

The **Desktop FAB (Floating Action Button)** is a persistent, unobtrusive interface element designed for desktop browsers. It provides users with immediate access to core features—such as "Select Element" and "Whole Page Translation"—without needing to open the extension popup. It features a smart-fading mechanism, vertical draggability, and dynamic state awareness.

**Architecture Status**: Integrated & Operational
**Performance**: GPU-accelerated transitions, resource-tracked event management.
**UX Strategy**: High-access, low-friction entry point that stays out of the way until needed.

---

## File Structure

The Desktop FAB system is primarily contained within the following files:

- **Core Component**: `src/apps/content/components/desktop/DesktopFabMenu.vue`
- **Logic Handler**: `src/apps/content/composables/useFabSelection.js` (NEW: Decoupled logic)
- **State Management**: `src/store/modules/mobile.js` (Tracks page translation)
- **Coordinator**: `src/features/text-selection/events/SelectionEvents.js`
- **Lifecycle & Memory**: `src/composables/core/useResourceTracker.js`
- **Event Bus**: `src/core/PageEventBus.js`

---

## Architecture

The Desktop FAB is now a fully autonomous module. It no longer relies on `WindowsManager` to receive selection events. Instead, it follows the **Selection Coordinator** pattern.

```
┌─────────────────────────────────────────────────────────────┐
│                 DESKTOP FAB SYSTEM ARCHITECTURE             │
├─────────────────────────────────────────────────────────────┤
│   Infrastructure Layer: Shadow DOM (Isolation from Page)    │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
┌──────────────▼──────────────┐      ┌────────▼──────────────┐
│      Logic & State Layer    │      │      UI Host Layer    │
│  - useFabSelection.js       │◀────▶│  - DesktopFabMenu.vue │
│  - GLOBAL_SELECTION events  │      │  - Menu Transitions   │
│  - MobileStore (Pinia)      │      │  - Draggable Engine   │
└──────────────┬──────────────┘      └───────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────┐
│                    INTEGRATION POINTS                       │
│  - Selection Coordinator: Receives all page selections      │
│  - Translation Handler: Direct trigger for results          │
│  - Independence: Works even if WindowsManager is disabled   │
└─────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. useFabSelection Composable
This is the "brain" of the FAB. It:
- Subscribes to `GLOBAL_SELECTION_CHANGE` and `GLOBAL_SELECTION_CLEAR`.
- Manages the `pendingSelection` state independently.
- Determines if the FAB should "wake up" based on translation modes or feature status.
- Emits `GLOBAL_SELECTION_TRIGGER` to request a translation display.

### 2. Draggable Container (`DesktopFabMenu.vue`)
The main container remains responsible for visuals and positioning.
- **Independence**: The badge and TTS features remain active even if the main translation UI (WindowsManager) is toggled off by the user.
- **Smart Fading**: Improved to unfade in any selection mode if the primary WindowsManager is disabled.

### 2. State-Aware Menu System
The menu dynamically computes its items based on the current state of the page:
- **Default**: Shows "Select Element" and "Translate Page".
- **Translating**: Displays real-time progress percentage and a "Stop" action.
- **Translated**: Switches "Translate Page" to "Restore Original".

### 3. Action Badges (Quick Access)
- **Revert Badge**: A red badge that appears above the FAB when element-specific translations are active, allowing for a quick "Undo".
- **Settings Badge**: Appears below the main button when the menu is open, providing a shortcut to the Options page.

### 4. Resource Tracker (`useResourceTracker`)
Ensures memory safety by automatically cleaning up:
- Hover timers.
- Drag event listeners (`mousemove`, `mouseup`).
- Global click-away listeners.

---

## Feature Adaptations

### Drag & Drop Logic
- **Constraint**: Only vertical movement is permitted to maintain the "Side FAB" aesthetic.
- **Persistence**: While currently session-based, the architecture supports saving the `verticalPos` to storage.

### Transition System
- **Fade-Scale**: Used for badges (Revert/Settings) to provide a "pop-in" feel.
- **FAB-Menu**: A specialized transition that originates from the bottom-right, ensuring the menu feels connected to the trigger button.

---

## Technical Implementation Details

### Shadow DOM Isolation
To ensure the FAB looks consistent on every website (from GitHub to Wikipedia):
1. **Reset Styles**: Uses `!important` on all critical layout properties.
2. **Namespace**: Wrapped in `.notranslate` and `translate="no"` to prevent the extension (or other translators) from translating its own UI.
3. **Z-Index**: Uses the maximum possible integer (`2147483647`) to stay above all web content.

### Communication Flow
- **To Background**: Uses `sendMessage` for system-level actions (e.g., `ACTIVATE_SELECT_ELEMENT_MODE`).
- **To Content Core**: Uses `PageEventBus` for page-level actions (e.g., `PAGE_TRANSLATE`).
- **Reactive State**: Watches `mobileStore.pageTranslationData` to update the UI without manual event handling.

---

## Development Guide

### Adding a New Menu Action
1. Open `DesktopFabMenu.vue`.
2. Locate the `menuItems` computed property.
3. Add a new object to the `items` array with:
   - `id`: Unique identifier.
   - `label`: i18n key.
   - `icon`: Imported asset.
   - `action`: Async function or event emission.

### Styling Constraints
- **Color Palette**: Use `#4A90E2` for primary actions and `#fa5252` for destructive/revert actions to match the extension's theme.
- **Touch Targets**: While for desktop, keep targets at least **32px** for ease of clicking.

---

**Last Updated**: March 2026
