# Touch & Mobile Support Architecture

## Overview

The **Touch & Mobile Support** system provides a "Touch-First", ergonomic translation experience designed for small screens and touch-enabled interfaces. It automatically replaces desktop-centric floating windows with a centralized **In-Page Bottom Sheet** architecture on mobile browsers (Firefox Android, Kiwi, Lemur) and touch-capable desktop devices, ensuring high performance and intuitive interaction.

**Architecture Status**: Production Ready (Optimized)
**Key Metrics**: Hardware-accelerated gestures, 60fps animations, Touch-responsive layout.

---

## Device Compatibility & Detection

The system employs a **Feature Detection** strategy rather than relying solely on UserAgent strings:
- **Touch Detection**: Validates `navigator.maxTouchPoints > 0` and the presence of `ontouchstart`.
- **Hybrid Support**: On touch-enabled laptops or tablets running desktop browsers, the system can switch to the Bottom Sheet UI for better thumb-driven ergonomics.
- **Independence**: The detection logic is encapsulated in `compatibility.js`, allowing other modules to query `shouldEnableMobileUI()`.

---

## Architecture

The system operates as an autonomous module within the **UI Host (Shadow DOM)**. It follows a decoupled, event-driven pattern coordinated by the **Mobile Store** and **PageEventBus**.

```
┌─────────────────────────────────────────────────────────────┐
│              TOUCH & MOBILE SYSTEM ARCHITECTURE             │
├─────────────────────────────────────────────────────────────┤
│   Infrastructure Layer: Shadow DOM & Touch Feature Check    │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
┌──────────────▼──────────────┐      ┌────────▼──────────────┐
│      Logic & State Layer    │      │      UI Host Layer    │
│  - Mobile Store (Pinia)     │◀────▶│  - MobileSheet.vue    │
│  - useMobileGestures.js     │      │  - MobileFab.vue      │
│  - Selection Coordinator    │      │  - Multi-View System  │
└──────────────┬──────────────┘      └────────┬──────────────┘
               │                              │
┌──────────────▼──────────────────────────────▼───────────────┐
│                    INTEGRATION POINTS                       │
│  - Selection Coordinator: GLOBAL_SELECTION_CHANGE events    │
│  - Page Translation: Real-time progress & control           │
│  - StorageManager: Persistent positioning                   │
│  - Visual Viewport: Keyboard awareness (Touch devices)      │
└─────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Mobile Store (`src/store/modules/mobile.js`)
The central state manager for the touch-optimized UI. It manages:
- **Visibility**: `isOpen`, `isFullscreen`.
- **Navigation**: `activeView` (Dashboard, Selection, Input, etc.).
- **Visual State**: `sheetState` (Closed, Peek, Full).
- **Selection Data**: Synchronized with global selection events. It specifically tracks `actualSourceLanguage` and `actualTargetLanguage` from translation results to ensure the UI labels (e.g., in the header) reflect the real language pair used by the engine, regardless of the initial "Auto" setting.

### 2. Gesture Engine (`useMobileGestures.js`)
A high-performance gesture handler optimized for low-latency touch response:
- **Smart Snapping**: Automatically snaps to **Peek** (35vh) or **Full** (90vh) positions.
- **Swipe-to-Dismiss**: Natural downward drag to close the interface.
- **Resistance**: Applies physical-like friction when dragging beyond boundaries.

### 3. Draggable FAB (`MobileFab.vue`)
A persistent, touch-friendly entry point:
- **NS-Dragging**: Supports vertical repositioning to avoid blocking page content.
- **Persistence**: Remembers position and side (Left/Right) via `storageManager`.
- **Idle Fading**: Dims when not in use to maintain a clean reading environment.

---

## Multi-View System

The interface dynamically adapts its view based on the current touch context:

| View | Purpose | Trigger |
|------|---------|---------|
| **Dashboard** | Feature Hub | Manual interaction or navigation |
| **Selection** | Instant Result | Native touch selection on page |
| **Input** | Manual Entry | Dashboard click or keyboard focus |
| **History** | Audit Log | Dashboard click or interaction |
| **Page Translation** | Full Page Hub | "Translate Page" action |

---

## Technical Implementation Details

### Viewport & Keyboard Awareness
Using the **Visual Viewport API**, the system identifies when a virtual keyboard is active. In **InputView**, the sheet automatically snaps to **Full** mode to ensure the text area remains visible and accessible above the keyboard.

### CSS & Shadow DOM Isolation
1. **Reset Styles**: Strict use of `!important` to prevent host page CSS leakage.
2. **Safe Areas**: Utilizes `env(safe-area-inset-bottom)` to respect hardware notches and navigation bars on modern devices.
3. **Hardware Acceleration**: Only `transform` and `opacity` are animated to ensure 60fps performance on mobile CPUs.

### Event Communication
- **Global Selection**: Listens for unified events from the Selection Coordinator.
- **Cross-World Communication**: Uses `sendMessage` for background operations and `PageEventBus` for local DOM changes.

---

## Development Guide

### Adding a New View
1. Create the component in `src/apps/content/components/mobile/views/`.
2. Add the view name to `MOBILE_CONSTANTS.VIEWS`.
3. Register the component in `MobileSheet.vue`.

### Best Practices
- **Touch Targets**: All interactive elements (buttons, inputs) MUST be at least **44x44px**.
- **Gesture Conflict**: Use `touch-action: none` on drag handles to prevent browser-native scrolling.
- **Locking**: Body scroll is locked on touch devices when the sheet is open to prevent background shifting.

---

**Last Updated**: April 2026
