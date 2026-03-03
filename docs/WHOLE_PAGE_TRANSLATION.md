# Whole Page Translation System

## Overview

The **Whole Page Translation** system is responsible for the recursive translation of all text content within a web page. Utilizing the `domtranslator` library and a specialized layered architecture, it provides a smooth, optimized, and fault-tolerant translation experience.

**✅ Architecture Status:** Refactored & Optimized
**🚀 Performance:** Lazy Loading + Smart Batching
**🛡️ Reliability:** Circuit Breaker for Rate Limits

## Architecture

The system is divided into 5 distinct parts to adhere to the Single Responsibility Principle:


```

PageTranslationManager (Orchestrator)
↓
├─→ PageTranslationBridge (Library Wrapper)
│       └─→ domtranslator (External Lib)
│
├─→ PageTranslationBatcher (Queue & Scheduling)
│       └─→ UnifiedMessaging → Translation Engine
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

### 4. PageTranslationHelper
Contains pure and static methods for DOM calculations.
- **Responsibilities**: Checking element visibility in the Viewport, determining frame suitability (filtering out ads and small iframes), and text normalization.

### 5. PageTranslationConstants
System constants.
- **Content**: RTL language codes, safe text tags for direction application, and default configurations (Chunk Size, Root Margin).

## Technical Flow

1.  **Suitability Check**: The system first verifies if the current frame is worth translating (e.g., iframes smaller than 50px or ads are ignored).
2.  **Activation**: Settings are loaded, and the `domtranslator` library is activated on `document.documentElement`.
3.  **Traversal**: The library extracts all text and hands it over to the `Bridge`.
4.  **Enqueue**: Text segments are queued in the `Batcher`.
5.  **Smart Flush**: 
    - If `lazyLoading` is active, only Viewport text is sent in the first batch.
    - Text is sent to the background in batches of 250 (configurable) to prevent overload.
6.  **Application**: Upon receiving the translation, text direction (RTL/LTR) is intelligently applied, and the text is replaced in the DOM.

## Smart Features

### 🛡️ Circuit Breaker
If the system encounters an **HTTP 429 (Rate Limit)** error or quota exhaustion:
1.  Whole-page translation operations are immediately halted.
2.  All `MutationObservers` are disconnected to prevent further requests.
3.  A notification is displayed to the user.
4.  The system enters a "Fatal Error" state to prevent the user's API key from being banned.

### 💤 Lazy Loading
Using an `IntersectionScheduler` and a `rootMargin` setting (default 300px), only content that the user is currently viewing or about to reach is translated. This significantly reduces API consumption on long pages (e.g., social media feeds).

### 🔄 Dynamic Pages (Infinite Scroll)
If the `autoTranslateOnDOMChanges` (Persistent Mode) option is enabled, any new content added to the page (such as infinite scrolling on Twitter/X) is automatically detected and translated.

## Configuration

Core settings are managed in the `config.js` file:

| Setting | Default | Description |
| :--- | :--- | :--- |
| `chunkSize` | 250 | Number of segments per API request |
| `rootMargin` | 300px | Margin around the Viewport for pre-loading |
| `lazyLoading` | true | Enables translation only for visible content |
| `maxConcurrentFlushes` | 1 | Number of simultaneous requests to the background |

## Integration Points

-   **FeatureManager**: This module is registered as an `ESSENTIAL` feature within the system.
-   **PageEventBus**: Used for broadcasting progress status and displaying notifications.
-   **UnifiedMessaging**: All translation batches are sent to the background via a unified messaging protocol.

## Best Practices for Developers

1.  **No Direct DOM Manipulation**: To change the display, always proceed through the `Bridge` and the direction application logic.
2.  **Maintain Node Tracking**: Since translation is asynchronous, nodes may move; the `NodeTrackingQueue` in the `Batcher` is designed to prevent race conditions.
3.  **Memory Management**: Always call `cleanup()` when destroying a component so the `ResourceTracker` can clear all listeners and observers.

