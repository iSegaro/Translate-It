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
- **State Management**: `src/store/modules/mobile.js` (Tracks page translation and element-specific state)
- **Lifecycle & Memory**: `src/composables/core/useResourceTracker.js` (Manages event listeners and timers)
- **Messaging & Actions**:
  - `src/shared/messaging/core/MessageActions.js` (Action constants)
  - `src/shared/messaging/core/UnifiedMessaging.js` (Background communication)
- **Event Bus**: `src/core/PageEventBus.js` (In-page event orchestration)
- **Assets**: `src/icons/ui/` (Icons for select, translate, revert, and settings)

---

## Architecture

The Desktop FAB is implemented as a specialized Vue component within the **UI Host (Shadow DOM)**. It operates by bridging the gap between the user's viewport and the underlying core managers through an event-driven approach.

```
┌─────────────────────────────────────────────────────────────┐
│                 DESKTOP FAB SYSTEM ARCHITECTURE             │
├─────────────────────────────────────────────────────────────┤
│   Infrastructure Layer: Shadow DOM (Isolation from Page)    │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
┌──────────────▼──────────────┐      ┌────────▼──────────────┐
│      Logic & State Layer    │      │      UI Host Layer    │
│  - mobile.js (Pinia Store)  │      │  - DesktopFabMenu.vue │
│  - useResourceTracker.js    │◀────▶│  - Menu Transitions   │
│  - useUnifiedI18n.js        │      │  - Draggable Engine   │
└──────────────┬──────────────┘      └───────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────┐
│                    INTEGRATION POINTS                       │
│  - PageEventBus: Controls Page Translation lifecycle        │
│  - UnifiedMessaging: Activates Select Element/Settings      │
│  - MobileStore: Tracks global translation state & progress  │
└─────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Draggable Container (`DesktopFabMenu.vue`)
The main container uses `fixed` positioning and high `z-index` to remain visible across all sites.
- **Vertical Dragging**: Allows users to reposition the FAB vertically to avoid overlapping site-specific UI elements.
- **Smart Fading**: Automatically reduces opacity to `0.2` after 2 seconds of inactivity to minimize visual distraction.

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
