# Whole Page Translation System

## Overview

The **Whole Page Translation** system is responsible for the recursive translation of all text content within a web page. Utilizing the `domtranslator` library and a specialized layered architecture, it provides a smooth, optimized, and fault-tolerant translation experience.

**Performance:** Lazy Loading + Dual-Mode Filtering + Modular Management
**Reliability:** Circuit Breaker for Rate Limits

## Architecture

The system is divided into 10 distinct parts to adhere to the Single Responsibility Principle and ensure maintainability:


```

PageTranslationManager (Orchestrator)
↓
├─→ PageTranslationSettingsLoader (Settings Logic)
├─→ PageTranslationEventManager (Event & Bus Handling)
│
├─→ PageTranslationBridge (Library Wrapper)
│       └─→ domtranslator (External Lib)
│
├─→ PageTranslationScheduler (Batching Engine)
│       ├─→ PageTranslationQueueFilter (On-Stop Filtering)
│       ├─→ PageTranslationFluidFilter (Fluid/Score Filtering)
│       └─→ UnifiedMessaging → Translation Engine
│
├─→ PageTranslationScrollTracker (Motion Detection)
│
├─→ HoverPreviewManager (Shared Interaction Manager)
│       └─→ PageEventBus → PageTranslationTooltip (Vue UI)
│
├─→ PageTranslationHelper (Static Utilities)
└─→ PageTranslationConstants (Shared Values)

```

### 1. PageTranslationManager
The main coordinator of the page translation lifecycle. It orchestrates activation, deactivation, and high-level commands (Translate/Restore). It delegates specialized tasks to dedicated utilities to maintain a clean core.

### 2. PageTranslationSettingsLoader
A specialized utility for loading, formatting, and resolving translation settings.
- **Responsibilities**: Parallel fetching of settings from storage, formatting DOM margins (e.g., `rootMargin`), and resolving the effective provider based on global vs. mode-specific settings.

### 3. PageTranslationEventManager
Centralizes all external event listeners for the system.
- **Responsibilities**: Manages `PageEventBus` listeners (Translate, Stop, Cancel) and `storageManager` observers. It bridges external signals to internal manager actions.

### 4. PageTranslationScheduler
The core engine for queue management and batch request dispatching. It is deeply integrated with the **Optimization Levels** system.
- **Dynamic Chunk Scaling**: Automatically adjusts the number of text segments per request based on the provider's optimization level (e.g., larger batches for "Economy" mode to save AI tokens, smaller batches for "Turbo" mode for faster progressive updates).
- **Concurrency Control**: Synchronizes its parallel processing limits with the global `RateLimitManager` settings for the active provider.
- **Memory Safety**: Inherits from `ResourceTracker`; automatically clears the queue on cleanup.
- **Prioritization**: Forces immediate flush for high-priority items if capacity is reached.

### 5. PageTranslationFiltering Engines
Specialized engines for batch selection:
- **PageTranslationQueueFilter**: Used for "On-Stop" mode. Focuses on visibility and **memory-safe purging** (ejecting distant nodes during long scrolls).
- **PageTranslationFluidFilter**: Used for "Fluid" mode. Focuses on visibility + element importance (Score).

### 6. PageTranslationScrollTracker
Activity and motion detection utility. Detects scroll events and **dynamic DOM changes** to signal the Scheduler when the page has "stabilized" for translation.

### 7. PageTranslationBridge
The communication bridge between the extension and the `domtranslator` library. Intercepts nodes to provide visibility data.

### 8. HoverPreviewManager
Handles user interactions (Original Text Preview) via `PageEventBus`. Shared with Select Element mode.

### 9. PageTranslationHelper & Constants
Static utilities for DOM calculations and shared system values.

## Technical Flow

1.  **Activation**: The `Manager` uses `SettingsLoader` to fetch configuration and initializes the `EventManager`.
2.  **Capture**: `domtranslator` is activated; the `Bridge` enqueues nodes into the `Scheduler`.
3.  **Scheduling**:
    - **Optimization Level Alignment**: The `Scheduler` queries the active provider's optimization level (1-5) and adjusts its internal `chunkSize` and `maxConcurrent` limits accordingly.
    - **Fluid Mode**: Automatic flushes using `FluidFilter`.
    - **On Stop Mode**: Deferred flushes triggered by `ScrollTracker` via `QueueFilter`.
4.  **Application**: Directionality (RTL/LTR) is applied, and text is replaced in the DOM.

## Smart Features

### Optimization Level Integration
The system is "Optimization-Aware." It respects the user's preference for **Speed vs. Cost** by dynamically reconfiguring its scheduling strategy:
- **Level 1 (Economy/Stable)**: Uses larger chunks (up to 80 segments for AI) and lower concurrency. This is highly efficient for LLMs as it reduces the frequency of System Prompt repetition and stays within IP-based rate limits for traditional providers.
- **Level 5 (Turbo/Fast)**: Uses smaller chunks (as small as 15 segments) and higher concurrency. This provides a "progressive rendering" experience where the page translates in rapid, small bursts.

### Modular Event Management
By isolating event handling into `PageTranslationEventManager`, the system prevents "Listener Leaks" and ensures that global signals (like conflict resolution with Select Element mode) are handled consistently.

### Memory-Safe Scrolling (Smart Purge)
To prevent memory exhaustion during infinite scrolling, the `QueueFilter` implements a **Smart Purge** policy. Nodes that move significantly far from the viewport (e.g., > 3000px) are automatically ejected from the queue. These nodes remain eligible for translation if the user scrolls back to them, ensuring a balance between RAM usage and persistence.

### Activity-Aware Scheduling
The system treats both scrolling and significant DOM mutations as "activity." Translation is deferred until all activity ceases for the duration of the `SCROLL_STOP_DELAY`, preventing fragmented translation batches during heavy content loading.

### Dual-Mode Modular Filtering
The system provides optimized behavior for different scrolling patterns (Fluid vs. On-Stop), ensuring the most efficient use of API requests.

### Memory Management
The system is fully integrated with `ResourceTracker`. All queues, observers, and event listeners are automatically reclaimed when the page is restored or the extension is disabled.

## Configuration

| Setting | Default | Description |
| :--- | :--- | :--- |
| `chunkSize` | 250 | Number of segments per API request (Base value, scaled by Optimization Level) |
| `WHOLE_PAGE_SCROLL_STOP_DELAY` | 500ms | User-configurable debounce time after scrolling stops |
| `VIEWPORT_BUFFER_PX` | 100px | Safety margin for batch-filling |
| `rootMargin` | 150px | Recognition margin for node detection |

---

## References
- [Optimization Levels System](./OPTIMIZATION_LEVELS.md)
- [Translation Provider System](./PROVIDERS.md)
- [Messaging System](./MessagingSystem.md)
- [UI Host System](./UI_HOST_SYSTEM.md)

---

**Last Updated**: April 2026
