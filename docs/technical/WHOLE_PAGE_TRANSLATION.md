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
├─→ PageTranslationHoverManager (Interaction Manager)
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
The core engine for queue management and batch request dispatching.
- **Memory Safety**: Inherits from `ResourceTracker`; automatically clears the queue on cleanup.

### 5. PageTranslationFiltering Engines
Specialized engines for batch selection:
- **PageTranslationQueueFilter**: Used for "On-Stop" mode. Focuses on pure visibility.
- **PageTranslationFluidFilter**: Used for "Fluid" mode. Focuses on visibility + element importance (Score).

### 6. PageTranslationScrollTracker
Motion detection utility. Detects scroll start/stop events and signals the Scheduler.

### 7. PageTranslationBridge
The communication bridge between the extension and the `domtranslator` library. Intercepts nodes to provide visibility data.

### 8. PageTranslationHoverManager
Handles user interactions (Original Text Preview) via `PageEventBus`.

### 9. PageTranslationHelper & Constants
Static utilities for DOM calculations and shared system values.

## Technical Flow

1.  **Activation**: The `Manager` uses `SettingsLoader` to fetch configuration and initializes the `EventManager`.
2.  **Capture**: `domtranslator` is activated; the `Bridge` enqueues nodes into the `Scheduler`.
3.  **Scheduling**:
    - **Fluid Mode**: Automatic flushes using `FluidFilter`.
    - **On Stop Mode**: Deferred flushes triggered by `ScrollTracker` via `QueueFilter`.
4.  **Application**: Directionality (RTL/LTR) is applied, and text is replaced in the DOM.

## Smart Features

### Modular Event Management
By isolating event handling into `PageTranslationEventManager`, the system prevents "Listener Leaks" and ensures that global signals (like conflict resolution with Select Element mode) are handled consistently.

### Parallel Settings Resolution
`PageTranslationSettingsLoader` performs parallel asynchronous fetches for configuration, reducing the "Time to First Translation" by avoiding sequential storage hits.

### Dual-Mode Modular Filtering
The system provides optimized behavior for different scrolling patterns (Fluid vs. On-Stop), ensuring the most efficient use of API requests.

### Memory Management
The system is fully integrated with `ResourceTracker`. All queues, observers, and event listeners are automatically reclaimed when the page is restored or the extension is disabled.

## Configuration

| Setting | Default | Description |
| :--- | :--- | :--- |
| `chunkSize` | 250 | Number of segments per API request |
| `SCROLL_STOP_DELAY` | 500ms | User-configurable debounce time after scrolling stops |
| `VIEWPORT_BUFFER_PX` | 100px | Safety margin for batch-filling |
| `rootMargin` | 150px | Recognition margin for node detection |

---

**Last Updated**: April 2026
