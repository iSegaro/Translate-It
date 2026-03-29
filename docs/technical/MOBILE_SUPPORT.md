# Mobile Support Architecture (2025)

## Overview

The **Mobile Support** system provides a native-like, touch-friendly translation experience for mobile browsers (Firefox Android, Kiwi, Lemur). It replaces the desktop-centric floating windows and sidepanels with a centralized **In-Page Bottom Sheet** architecture, ensuring high performance and non-intrusive interactions on small screens.

**Architecture Status:** Complete & Integrated
**Performance:** Hardware-accelerated (GPU) animations, 60fps gestures
**UX Strategy:** Thumb-friendly "Bottom Sheet" with Multi-view support

---

## Architecture

The mobile system is built as a modular extension of the existing **UI Host (Shadow DOM)**. It follows a decoupled, event-driven pattern where presenters (MobileFab, MobileSheet) subscribe to global selection events via the **Selection Coordinator**.

```
┌─────────────────────────────────────────────────────────────┐
│                  MOBILE SYSTEM ARCHITECTURE                 │
├─────────────────────────────────────────────────────────────┤
│  Infrastructure Layer: compatibility.js (isMobile detection)│
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
┌──────────────▼──────────────┐      ┌────────▼──────────────┐
│      Logic & State Layer    │      │      UI Host Layer    │
│  - GLOBAL_SELECTION events  │◀────▶│  - MobileSheet.vue    │
│  - mobile.js (Pinia Store)  │      │  - MobileFab.vue      │
│  - useMobileGestures.js     │      │  - DashboardView.vue  │
└──────────────┬──────────────┘      └───────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────┐
│                    INTEGRATION POINTS                       │
│  - Selection Coordinator: Unified event-driven selection    │
│  - WindowsManager: Subscription-based UI display            │
│  - Independence: Works even if WindowsManager is disabled   │
└─────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Device Detection (`compatibility.js`)
A robust utility that identifies mobile environments using a combination of UserAgent analysis, touch point detection (`maxTouchPoints`), and viewport width.
- **`isMobile()`**: General detection for Android/iOS.
- **`shouldEnableMobileUI()`**: Decision logic to switch from Windows to Sheet.

### 2. Mobile Store (`mobile.js`)
A centralized Pinia store that manages the global state of the mobile UI.
- **Visibility**: `isOpen`
- **View Management**: `activeView` (dashboard, selection, input, page_translation)
- **Visual State**: `sheetState` (peek: 35vh, full: 90vh)
- **Data Persistence**: Stores selection results and page translation progress.

### 3. Gesture Engine (`useMobileGestures.js`)
A high-performance composable that handles complex touch interactions.
- **Swipe-to-Dismiss**: Closing the sheet by dragging it down.
- **Swipe-to-Expand**: Moving from "Peek" to "Full" mode for better visibility.
- **Momentum & Snapping**: Smoothly snapping to predefined vertical positions using CSS transforms.

### 4. UI Host Integration (`MobileSheet.vue` & `MobileFab.vue`)
The mobile UI is divided into two primary entry points:
- **`MobileSheet.vue`**: The master container for the Bottom Sheet (Dashboard, Selection, etc.).
- **`MobileFab.vue`**: A dedicated, draggable floating button that provides quick access to translation.
    - **Independence**: Subscribes directly to `GLOBAL_SELECTION_CHANGE` to store pending text locally, removing dependency on `WindowsManager` state.
    - **Vertical Drag**: Supports NS-resize dragging to avoid overlapping with site content.
    - **Persistence**: Remembers its last vertical position across page reloads using `storageManager`.
    - **Idle State**: Becomes semi-transparent after 1.5s of inactivity.

---

## Feature Adaptations

### Text Selection Translation
- **Desktop**: Shows a floating icon or FAB badge near selection.
- **Mobile**:
    - **Immediate**: Automatically triggers the **Mobile Sheet** in `SelectionView` (Peek mode).
    - **On FAB Click**: Remains silent and waits for manual FAB interaction (Native menu friendly).
    - **On Click**: Shows a floating translation icon (Desktop-parity mode).

### Select Element Mode
- **Hover to Tap**: Since mobile lacks hover, the `SelectElementManager` is adapted to use `touchstart` and `touchend`.
- **Navigation Prevention**: Aggressively applies `preventDefault()` and `stopPropagation()` during the active mode to prevent accidental link clicks.
- **Unified Controls**: Instead of a dedicated exit button, the system leverages the **Circuit Breaker Toast** which provides "Cancel" and "Revert" actions, keeping the UI clean and consistent.

### Whole Page Translation
- **Dashboard Hub**: Translation is triggered from within the sheet, keeping the user in context.
- **Progress View**: Switches to `PageTranslationView`, showing a live progress bar and element counts.
- **Unified Controls**: Provides "Restore" and "Back to Dashboard" options directly in the mobile UI.

---

## Technical Implementation Details

### CSS Strategy (Shadow DOM Compatibility)
To overcome Shadow DOM style isolation, the mobile system uses:
1.  **Explicit Styles**: Using `!important` for positioning and z-index.
2.  **Inline Logic**: Computing heights and transforms dynamically in JavaScript to ensure priority.
3.  **Logical Properties**: Using `env(safe-area-inset-bottom)` to handle modern device notches and navigation bars.

### Keyboard Awareness
Using the **Visual Viewport API**, the system detects when the virtual keyboard is active. During manual input (`InputView`), the sheet automatically snaps to **Full-screen** mode to remain visible above the keyboard.

### Event Bus Communication
The mobile system communicates with core managers and other modules via the `PageEventBus`:
- `GLOBAL_SELECTION_CHANGE`: Listened to by `MobileFab` and `DashboardView` to sync selection state.
- `GLOBAL_SELECTION_CLEAR`: Unified signal to reset selection-aware UI.
- `SHOW_MOBILE_SHEET`: Directly requested when a translation result is ready.
- `PAGE_TRANSLATE_PROGRESS`: Listened to by `PageTranslationView`.
- `ACTIVATE_SELECT_ELEMENT_MODE`: Emitted by `DashboardView`.

---

## Development Guide

### Adding a New View
1. Create the component in `src/apps/content/components/mobile/views/`.
2. Register the view name in `MobileStore`.
3. Add the view to the conditional rendering block in `MobileSheet.vue`.

### Best Practices
- **Touch Targets**: Ensure all buttons are at least **44x44px**.
- **Animation**: Only animate `transform` and `opacity` for 60fps performance.
- **Isolation**: Always use the `.notranslate` class on mobile UI containers.

---

**Last Updated**: March 2026
