# Mobile Support Implementation Plan (Bottom Sheet Architecture)

## 1. Background & Motivation
The extension currently provides a robust, desktop-optimized experience using floating windows, tooltips, and sidepanels. To support mobile browsers (Firefox Android, Kiwi, Lemur, etc.) without degrading the desktop experience, we need a touch-friendly, responsive interface. 

The central hub for all mobile interactions will be an **In-Page Bottom Sheet (Shadow DOM)**. This ensures the user never has to leave the current page context or rely on browser-level popups for core features like Page Translation or Select Element mode.

---

## 2. Scope & Technical Impact
- **Affected Systems**: 
    - `WindowsManager`: Routing logic to differentiate between Desktop Window and Mobile Sheet.
    - `TextSelectionManager`: Trigger logic for mobile touch-selection.
    - `SelectElementManager`: Adaptation from Hover-based to Tap-based interaction.
    - `ContentApp`: Acting as the UI Host for the Bottom Sheet within Shadow DOM.
- **New Systems**: 
    - `MobileSheet.vue`: The master container and gesture handler.
    - `useMobileGestures.js`: Composable for high-performance touch/swipe logic.
    - `Mobile Pinia Store`: State management for mobile-specific UI states.
- **Legacy Preservation**: The desktop experience (Windows, Sidepanel) remains completely untouched and isolated from mobile logic.

---

## 3. Proposed Solution: The "In-Page" Mobile Hub
We will implement a **Multi-view Bottom Sheet** that acts as the primary command center on mobile devices.

### Key Views:
1.  **DashboardView**: A central menu for global actions:
    *   **Translate Page Button**: Triggers the whole-page translation process.
    *   **Select Element Button**: Activates the smart element selection mode.
    *   **Manual Input Button**: Switches to a full-screen text area for typing.
2.  **SelectionView**: Automatically triggered when text is highlighted in the page. Displays translation, TTS, and copy actions.
3.  **InputView**: A mobile-optimized environment for manual text translation with keyboard awareness.

---

## 4. Phased Implementation Plan

### Phase 1: Infrastructure & Mobile Detection
1.  **Detection Utility**: Implement `isMobile()` in `src/utils/browser/deviceDetector.js` (detecting via `userAgent` and `maxTouchPoints`).
2.  **State Management**: Create `src/store/modules/mobile.js` to track `isOpen`, `activeView` (`dashboard`, `selection`, `input`), and `sheetState` (`peek`, `full`).

### Phase 2: Core UI & Gesture Engine
1.  **Gesture Composable**: `src/composables/ui/useMobileGestures.js` to handle:
    *   **Swipe-to-close**: Drag down to dismiss.
    *   **Swipe-to-expand**: Drag up to move from "Peek" to "Full" mode.
    *   **Snap Points**: Smoothly snapping to 35vh (Peek) or 90vh (Full).
2.  **MobileSheet Container**: `src/apps/content/components/mobile/MobileSheet.vue` inside the Shadow DOM UI Host.

### Phase 3: Feature Integration (Mobile Logic)

#### A. The "In-Page" Dashboard
*   Users can open the Bottom Sheet via a small Floating Action Button (FAB) or a specific gesture.
*   The Dashboard provides one-tap access to **Translate Page** and **Select Element**.

#### B. Select Element Mode (Touch Adaptation)
*   **Trigger**: Activated from the Bottom Sheet Dashboard.
*   **Interaction**: Replaces "Hover" with "Tap". User taps a text element to translate it inline.
*   **Protection**: During this mode, `preventDefault()` is applied to all taps to prevent accidental navigation on links (`<a>` tags).
*   **Exit**: A sticky "Exit Select Mode" button is displayed until the user finishes.

#### C. Whole Page Translation
*   **Trigger**: Activated from the Bottom Sheet Dashboard.
*   **UI Feedback**: The sheet collapses to a minimal status bar or shows a sticky notification (Toast) indicating progress and providing a "Cancel" option.

### Phase 4: Keyboard & Viewport Optimization
1.  **Visual Viewport API**: Detect when the virtual keyboard opens.
2.  **Auto-Snap**: Automatically move the Bottom Sheet to `Full` state when the keyboard is active during manual input to ensure visibility.

---

## 5. Verification & Testing Strategy
*   **Desktop Regression**: Run full suite on Chrome/Firefox Desktop to ensure zero impact.
*   **Mobile Fluidity**: Verify 60fps animations on Firefox Android and Kiwi Browser.
*   **Interaction Safety**: Confirm that tapping links in "Select Element" mode translates the text instead of navigating the browser.
*   **Safe Area Handling**: Test on devices with notches and home-indicator bars (iOS/Android) using CSS `env(safe-area-inset-bottom)`.

---

## 6. Rollback & Safety Strategy
*   **Feature Flagging**: The entire mobile system is gated by `isMobile()`.
*   **Graceful Degradation**: If mobile-specific components fail to load, the system falls back to a simplified version of the desktop UI or stays disabled without crashing the main content script.

---
**Last Updated**: March 2025
**Status**: Ready for Implementation
