# Whole Page Translation System

## Overview

The **Whole Page Translation** system is responsible for the recursive translation of all text content within a web page. Utilizing the `domtranslator` library and a specialized layered architecture, it provides a smooth, optimized, and fault-tolerant translation experience.

**Architecture Status:** Refactored & Optimized
**Performance:** Lazy Loading + Smart Batching
**Reliability:** Circuit Breaker for Rate Limits

## Architecture

The system is divided into 6 distinct parts to adhere to the Single Responsibility Principle:


```

PageTranslationManager (Orchestrator)
↓
├─→ PageTranslationBridge (Library Wrapper)
│       └─→ domtranslator (External Lib)
│
├─→ PageTranslationBatcher (Queue & Scheduling)
│       └─→ UnifiedMessaging → Translation Engine
│
├─→ PageTranslationHoverManager (Interaction Manager)
│       └─→ PageEventBus → PageTranslationTooltip (Vue UI)
│
├─→ PageTranslationHelper (Static Utilities)
└─→ PageTranslationConstants (Shared Values)

```

### 1. PageTranslationManager
The main coordinator of the page translation lifecycle.
- **Responsibilities**: Feature activation/deactivation, settings management, and coordination between the Bridge and Batcher.
- **Key Methods**: `translatePage()`, `restorePage()`, `cleanup()`.

### 2. PageTranslationBatcher
The engine for queue management and batch request dispatching.
- **Responsibilities**: Collecting text segments, batching based on character limits, prioritizing visible elements (Viewport), and managing the Circuit Breaker.
- **Smart Feature**: Elements within the user's view are translated first.

### 3. PageTranslationBridge
The communication bridge between the extension and the `domtranslator` library.
- **Responsibilities**: Initializing the DOM translator, node tracking to map text to actual elements, and managing the `MutationObserver` for dynamic pages.

### 4. PageTranslationHoverManager
Handles user interactions with translated content.
- **Responsibilities**: Detecting `mouseover` events on translated elements, retrieving original text from `PageTranslationLookup`, and coordinating with the UI Host.
- **Key Flow**: Emits `page-translation-show-tooltip` events via `PageEventBus` to be rendered by the Vue-based Shadow DOM.

### 5. PageTranslationHelper
Contains pure and static methods for DOM calculations.
- **Responsibilities**: Checking element visibility in the Viewport, determining frame suitability (filtering out ads and small iframes), and text normalization.

### 6. PageTranslationConstants
System constants and shared configurations.
- **Content**: RTL language codes, safe text tags, and default settings (Chunk Size, Root Margin).
- **Timing**: Centralized timing constants (`PAGE_TRANSLATION_TIMING`) for toasts, scheduler delays, and DOM stabilization.

## Technical Flow

1.  **Suitability Check**: The system first verifies if the current frame is worth translating (e.g., iframes smaller than 50px or ads are ignored).
2.  **Activation**: Settings are loaded, and the `domtranslator` library is activated on `document.documentElement`.
3.  **Traversal**: The library extracts all text and hands it over to the `Bridge`.
4.  **Enqueue**: Text segments are queued in the `Batcher` with priority scoring.
5.  **Smart Flush**: 
    - Flushes are scheduled using centralized delays (e.g., 50ms for high-priority Viewport content).
    - Text is sent to the background in batches of 250 (configurable) to prevent overload.
6.  **Application**: Upon receiving the translation, text direction (RTL/LTR) is intelligently applied using the **shared `DomDirectionManager`**, and the text is replaced in the DOM. This ensures that mixed-language pages maintain correct structural alignment.

## Smart Features

### Circuit Breaker & Error Handling
If the system encounters a **Fatal Error** (e.g., Rate Limit, Auth issue):
1.  **Centralized Detection**: The `Scheduler` uses `ErrorMatcher` to identify fatal errors immediately.
2.  **Stop & Cleanup**: Whole-page translation is halted, and all observers are disconnected.
3.  **UI Feedback**: A localized warning is shown via `NotificationManager` (using `PAGE_TRANSLATION_TIMING.FATAL_ERROR_DURATION`).
4.  **Logging**: Detailed error info (with stack traces) is logged to the console via `ErrorHandler`.

### Lazy Loading
Using an `IntersectionScheduler` and a `rootMargin` setting (default 300px), only content that the user is currently viewing or about to reach is translated. This significantly reduces API consumption on long pages.

### RTL/LTR Directionality Management
The system shares the same DOM-level logic as the **Select Element** feature:
- **Surgical Application**: Uses `applyNodeDirection` to find the smallest safe container for a text node, avoiding layout breakage in complex grids or flexboxes.
- **State Preservation**: Saves original `dir`, `textAlign`, and `direction` styles into `data-` attributes before modification, ensuring perfect restoration.
- **Shared Logic**: Centralized in `@/utils/dom/DomDirectionManager.js`.

### Original Text Preview (Hover)
To improve transparency, users can hover over translated text to see the original content.
- **Event-Driven**: Decoupled from the translation engine using `PageEventBus`.
- **UI Isolation**: Rendered via `PageTranslationTooltip.vue` inside the **Shadow DOM** UI Host to prevent website CSS from interfering with the tooltip's appearance.
- **RTL Support**: Automatically detects and applies the correct text direction for the original content.

### Provider Selection Behavior
Whole Page Translation is **Settings-Isolated**. It strictly follows the setting in `MODE_PROVIDERS.page` and ignores any temporary dropdown selection in the Popup or Sidepanel.

- **Inheritance**: Falls back directly to the Global Default (`TRANSLATION_API`) if the mode setting is `default`.
- **Reasoning**: Ensures stable performance for batch translations.
- **Reference**: See [Translation Provider Logic](./TRANSLATION_PROVIDER_LOGIC.md) for detailed waterfall logic.

## Configuration

Core settings are managed in the `config.js` file, while internal timings are in `PageTranslationConstants.js`:

| Setting | Default | Description |
| :--- | :--- | :--- |
| `chunkSize` | 250 | Number of segments per API request |
| `rootMargin` | 300px | Margin around the Viewport for pre-loading |
| `lazyLoading` | true | Enables translation only for visible content |
| `maxConcurrentFlushes` | 1 | Number of simultaneous requests to the background |

## Integration Points

-   **FeatureManager**: This module is registered as an `ESSENTIAL` feature.
-   **NotificationManager**: Used for all user-facing alerts (warnings, status updates).
-   **ErrorHandler**: Integrated for consistent error classification and logging.
-   **UnifiedMessaging**: All translation batches are sent to the background via a unified messaging protocol.
-   **DomDirectionManager**: Core utility shared with Select Element for text alignment and directionality.
-   **UI Host (Vue)**: Centralized rendering engine for the interaction tooltips.

## Best Practices for Developers

1.  **No Direct DOM Manipulation**: To change the display, always proceed through the `Bridge` and the direction application logic.
2.  **Maintain Node Tracking**: Since translation is asynchronous, nodes may move; the `NodeTrackingQueue` in the `Batcher` is designed to prevent race conditions.
3.  **Memory Management**: Always call `cleanup()` when destroying a component so the `ResourceTracker` can clear all listeners and observers.

---

**Last Updated**: March 2026
