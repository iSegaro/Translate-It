# Whole Page Translation System

## Overview

The **Whole Page Translation** system is responsible for the recursive translation of all text content within a web page. Utilizing the `domtranslator` library and a specialized layered architecture, it provides a smooth, optimized, and fault-tolerant translation experience.

**Performance:** Lazy Loading + Dual-Mode Filtering (Fluid & On-Stop)
**Reliability:** Circuit Breaker for Rate Limits

## Architecture

The system is divided into 8 distinct parts to adhere to the Single Responsibility Principle:


```

PageTranslationManager (Orchestrator)
↓
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
The main coordinator of the page translation lifecycle. Acts as the orchestrator between the Bridge, Scheduler, and ScrollTracker.

### 2. PageTranslationScheduler
The core engine for queue management and batch request dispatching.
- **Responsibilities**: Collecting segments, adaptive batching, and managing the Circuit Breaker.
- **Memory Safety**: Inherits from `ResourceTracker`; automatically clears the queue on cleanup.

### 3. PageTranslationFiltering Engines
The Scheduler delegates the batch selection to specialized engines based on the active mode:
- **PageTranslationQueueFilter**: Used for "On-Stop" mode. Focuses on pure visibility (Viewport) without prioritization by score.
- **PageTranslationFluidFilter**: Used for "Fluid" mode. Focuses on visibility first, then prioritizes by element importance (Score/Heading first).

### 4. PageTranslationScrollTracker
Motion detection utility. Detects scroll start/stop events and signals the Scheduler to pause or resume translation.

### 5. PageTranslationBridge
The communication bridge between the extension and the `domtranslator` library. Intercepts nodes to provide visibility data to the Scheduler.

### 6. PageTranslationHoverManager
Handles user interactions (Original Text Preview) with translated content via `PageEventBus`.

### 7. PageTranslationHelper & Constants
Static utilities for DOM calculations and shared system values (Timings, Thresholds, Buffers).

## Technical Flow

1.  **Activation**: Settings are loaded, and `domtranslator` is activated.
2.  **Capture**: The `Bridge` intercepts nodes and enqueues them in the `Scheduler` with priority scores.
3.  **Scheduling**:
    - **Fluid Mode**: Automatic flushes based on adaptive delays (50ms Viewport / 150ms Standard). Uses `FluidFilter`.
    - **On Stop Mode**: Translation is deferred until a `ScrollStop` signal is received (500ms delay). Uses `QueueFilter`.
4.  **Smart Flush**: 
    - The active filter selects items starting from the Viewport. 
    - Standalone requests for off-screen/buffer items are blocked to save API.
5.  **Application**: Directionality (RTL/LTR) is applied via `DomDirectionManager`, and text is replaced in the DOM.

## Smart Features

### Dual-Mode Modular Filtering
The system separates the filtering logic to ensure optimal performance for different user behaviors:
- **On-Stop Optimization**: Prevents any translation during active scrolling, wait for user pause.
- **Fluid Prioritization**: In real-time translation, it ensures that headings and important navigation elements are translated before large paragraphs, even if they appear simultaneously in the Viewport.

### Smart Buffer Logic (Common to All Modes)
To optimize API requests, the system only adds items from the **100px buffer** if there is remaining capacity in the current 250-segment batch. Buffer items never trigger a standalone API call.

### Motion Awareness & Dynamic Content
If the user is stationary (no scroll events), the system bypasses any "On Stop" delay to ensure immediate translation of dynamic DOM updates (e.g., opening a menu or lazy-loading chat messages).

### Memory Management
The `Scheduler` uses `trackResource` to register the translation queue. This ensures that even in cases of unexpected crashes or feature deactivation, the memory used by large queues is immediately reclaimed.

## Configuration

| Setting | Default | Description |
| :--- | :--- | :--- |
| `chunkSize` | 250 | Number of segments per API request |
| `SCROLL_STOP_DELAY` | 500ms | Debounce time after scrolling stops before flushing |
| `VIEWPORT_BUFFER_PX` | 100px | Safety margin around viewport for batch-filling |
| `rootMargin` | 150px | Margin for the underlying library to detect nodes early |

---

**Last Updated**: April 2026
