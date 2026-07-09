# PDF Translation Architecture

## Overview

The PDF Translation feature is a **self-contained, dedicated PDF viewer and translation system**. It runs as a standalone Vue 3 application backed by a rich core library. The system uses **pdfjs-dist** for rendering, a custom text layer renderer for selection, a layout analysis engine for logical block extraction, a batch translation pipeline, OCR support for scanned pages, persistent caching, document history, and export to TXT/Markdown.

**Architecture Status**: Production Ready (MVP Complete)

**Key Metrics**: ~20 core source modules, custom text layer with sub-pixel accuracy, per-block deterministic identity, local Tesseract.js OCR, dual-format export.

---

## Table of Contents

- [Goals and Non-Goals](#goals-and-non-goals)
- [Architecture Responsibilities](#architecture-responsibilities)
- [Architectural Overview](#architectural-overview)
- [Architecture Evolution](#architecture-evolution)
- [PDF Application Architecture](#pdf-application-architecture)
  - [Render Tree](#render-tree)
  - [Key Application Utilities](#key-application-utilities-srcappspdfutils)
  - [Key Application Constants](#key-application-constants-srcappspdfconstants)
  - [Composable Responsibilities](#composable-responsibilities)
  - [Presentation Architecture](#presentation-architecture)
- [PDF Viewer Lifecycle](#pdf-viewer-lifecycle)
  - [File Loading Sequence](#file-loading-sequence)
  - [Page Rendering Sequence](#page-rendering-sequence)
  - [Cleanup Sequence](#cleanup-sequence)
- [Render Pipeline](#render-pipeline)
  - [Ownership Boundaries](#ownership-boundaries)
  - [PdfRenderer](#pdfrenderer)
  - [PdfRenderScheduler](#pdfrenderscheduler)
  - [PdfRenderWindowState](#pdfrenderwindowstate)
  - [PdfRenderJobState](#pdfrenderjobstate)
  - [usePdfRenderPipeline](#usepdfrenderpipeline)
  - [Render Flow](#render-flow)
- [Geometry Layer](#geometry-layer)
- [PDF Navigation](#pdf-navigation)
  - [Destination Coordinate Model](#destination-coordinate-model)
  - [Scroll Coordinate Conversion](#scroll-coordinate-conversion)
  - [Current Page Ownership](#current-page-ownership)
  - [Scroll Container Ownership](#scroll-container-ownership)
- [Zoom and Scroll Transition Architecture](#zoom-and-scroll-transition-architecture)
  - [Anchor Model](#anchor-model)
  - [Controlled Zoom Sequence](#controlled-zoom-sequence)
  - [Deferred Layout](#deferred-layout-deferredzoomlayout)
  - [Fit Page Entry](#fit-page-entry)
  - [Fit Page Exit](#fit-page-exit)
  - [Side-by-Side Translated Anchor Policy](#side-by-side-translated-anchor-policy)
  - [Orchestration](#orchestration-runcontrolledzoomtransition)
- [Fit Page Footprint Model](#fit-page-footprint-model)
- [Scroll Synchronization](#scroll-synchronization)
- [Text Layer Architecture](#text-layer-architecture)
- [Selection Integration](#selection-integration)
- [Logical Block Model](#logical-block-model)
- [Translation Pipeline](#translation-pipeline)
- [Bilingual Rendering Model](#bilingual-rendering-model)
- [OCR Fallback Architecture](#ocr-fallback-architecture)
- [Cache Architecture](#cache-architecture)
  - [Cache Identity](#cache-identity)
  - [Cache Structure](#cache-structure)
  - [Restoration Flow](#restoration-flow)
  - [Bitmap Cache (`PdfBitmapCache`)](#bitmap-cache-pdfbitmapcache)
- [Page Content Repository (`PdfPageContentRepository`)](#page-content-repository-pdfpagecontentrepository)
- [Translation State (`PdfTranslationState`)](#translation-state-pdftranslationstate)
- [History Architecture](#history-architecture)
- [Export Architecture](#export-architecture)
- [Block Targeting](#block-targeting)
- [Storage Model](#storage-model)
- [Event Flow](#event-flow)
- [Cross-Feature Dependencies](#cross-feature-dependencies)
- [Major Design Decisions](#major-design-decisions)
- [Known Technical Debt](#known-technical-debt)
- [Future Extension Points](#future-extension-points)
- [Architectural Principles](#architectural-principles)
- [Architecture Status](#architecture-status)

---

## Goals and Non-Goals

### Goals

1. **Dedicated PDF Viewer**: A first-class, pixel-accurate PDF viewer with side-by-side bilingual rendering.
2. **Logical Block Translation**: Translate meaningful semantic units (paragraphs, headings, lists) rather than pages or lines.
3. **Stable Block Identity**: Block IDs survive layout analyzer changes, file renames, and cache invalidation via normalized bounding boxes and text hashes.
4. **Visible Page Only**: Only translate pages currently in the viewport — safer for large PDFs, lower cost, faster UX.
5. **Persistent Cache**: Translation results are cached per-document and restored on re-open.
6. **OCR Fallback**: Scanned/image-based pages are detected and processed via local Tesseract.js OCR with explicit user consent.
7. **Export**: Translated content can be exported to TXT and Markdown.
8. **Selection Integration**: Native text selection within the PDF emits standard extension selection events via the shared `pageEventBus` contract, handled by a PDF-specific subscriber.

### Non-Goals (MVP)

1. **No browser-native PDF interception** — Users open PDFs inside the dedicated viewer only.
2. **No auto-translate on open** — Translation is manually triggered per visible pages.
3. **No translated PDF regeneration** — Output is text-based export, not a translated PDF file.
4. **No advanced table reconstruction** — Tables are translated as flat text blocks.
5. **No translated search** — Search operates on the original text only.

---

## Architecture Responsibilities

| Layer / Component | Primary Responsibility |
|-------------------|------------------------|
| PdfApp | Feature orchestration — wires composables, manages app lifecycle |
| PdfViewer | UI orchestration — renders page list, manages scroll, delegates to page views |
| usePdfRenderPipeline | Render coordination — bridges scheduler to Vue reactivity, manages render window |
| PdfDocumentSession | Document façade — delegates to subsystems, owns lifecycle and metrics |
| PdfRenderer | PDF rendering only — render/cancel/clear, no scheduling or state ownership |
| PdfBitmapCache | Bitmap storage — LRU eviction, memory budget, GPU-safe resource management |
| PdfPageContentRepository | Page content lifecycle — sessions, hydration, block indexing, OCR mutation |
| PdfTranslationState | Translation state — per-block status, statistics, update/reset |
| PdfRenderScheduler | Render policy — candidates, eligibility, priority, cancellation targets |
| PdfRenderWindowState | Render window — committed vs. pending candidate sets |
| PdfRenderJobState | Render lifecycle — per-page state machine (idle → rendering → committed/failed/cancelled) |

---

## Architectural Overview

The system is divided into two main layers: the **Document Layer** (state, caching, rendering) and the **Viewer Layer** (UI orchestration, scheduling, presentation).

### Document Layer

```
Document
    │
    ▼
PdfDocumentSession
    ├── PdfPageContentRepository
    │       └── PdfPageSession × N
    ├── PdfTranslationState
    ├── PdfBitmapCache
    ├── PdfRenderer
    ├── Navigation Repositories
    └── Metrics
```

**PdfDocumentSession** is the top-level façade for a single PDF document. It delegates domain responsibilities to purpose-built subsystems and owns document lifecycle (open, cleanup, metrics).

### Viewer Layer

```
Viewer
    │
    ▼
usePdfRenderPipeline
    │
    ▼
PdfRenderScheduler
    ├── PdfRenderWindowState
    └── PdfRenderJobState
```

**usePdfRenderPipeline** is the Vue composable that bridges the feature layer to the view layer. It owns the scheduler instance, render window lifecycle, and reactive state for page views. The scheduler is a pure-state policy engine with no DOM or Vue ownership.

### Application Layer Detail

```
PdfApp.vue
├── usePdfViewerController        (document lifecycle, translation)
├── usePdfRenderPipeline          (render scheduling, window state)
├── createPdfTransitionController (zoom, layout, anchor management)
├── usePdfNavigation              (destination resolution, outline)
├── usePdfOcr                     (scanned page detection)
├── usePdfExport                  (TXT/Markdown export)
├── usePdfBlockSelection          (block targeting mode)
├── usePdfSelectionBridge         (text selection bridge)
├── PdfToolbar
├── PdfDropzone
└── PdfViewerLayout
    ├── PdfViewer (original pane)
    │   └── PdfPageView × N
    └── PdfTranslatedPane (translated pane)
```

---

### Two-Layer Architecture

| Layer | Directory | Purpose | Framework |
|-------|-----------|---------|-----------|
| **Application Layer** | `src/apps/pdf/` | Vue components, composables, UI | Vue 3 + Pinia |
| **Application Utils (Geometry)** | `src/apps/pdf/utils/` | DOM geometry, anchor, footprint, page resolvers | Vanilla JS |
| **Application Constants** | `src/apps/pdf/constants/` | Layout contract constants (DOM footprint) | Vanilla JS |
| **Feature Layer** | `src/features/pdf-translation/core/` | Domain logic, state management, orchestration | Vanilla JS + ResourceTracker |

**Key Principle**: The feature layer is **framework-agnostic**. It uses no Vue reactivity — translation states are managed by `PdfTranslationState` and page content by `PdfPageContentRepository`, both composed within `PdfDocumentSession`. Composables in the application layer bridge feature-layer classes to Vue's reactive system via refs and computed properties.

### Singletons

Three services are module-level singletons shared across all composables:

| Singleton | Purpose | Storage Key |
|-----------|---------|-------------|
| `pdfDocumentSession` | Document lifecycle façade — delegates to PdfPageContentRepository, PdfTranslationState, PdfBitmapCache, PdfRenderer, and navigation repositories | N/A (in-memory) |
| `pdfCacheManager` | Persistent translation + OCR cache | `pdfDocumentCache` |
| `pdfHistoryManager` | Document open/translation history | `pdfTranslationHistory` |

---

## Architecture Evolution

The PDF architecture evolved incrementally through a series of focused decompositions. Each milestone solved a specific structural problem without disrupting the overall system.

| Milestone | What It Solved |
|-----------|----------------|
| [**Geometry Layer**](#geometry-layer) | Separated PDF coordinate space from DOM coordinate space, enabling coordinate conversions without mixing concerns. |
| [**Canonical Scroll Anchors**](#anchor-model) | Provided deterministic scroll position capture and restore across zoom/layout transitions. |
| [**Current Page Resolver**](#pdfcurrentpageresolver) | Unified current-page detection under a single source of truth, eliminating duplicate detection paths. |
| **Geometry Sync Engine** | Enabled accurate side-by-side scroll synchronization using geometry-based canonical anchors instead of fragile ratio heuristics. |
| [**Render Window Resolver**](#pdfrenderwindowresolver) | Determined visible pages from geometry rather than IntersectionObserver, making render decisions data-driven. |
| [**Render Scheduler**](#pdfrenderscheduler) | Extracted scheduling policy from the viewer, enabling deterministic, testable render decisions. |
| [**Render Window State**](#pdfrenderwindowstate) | Managed committed vs. pending render candidates, preventing churn during rapid scroll. |
| [**Render Job State**](#pdfrenderjobstate) | Provided per-page lifecycle tracking with typed state transitions. |
| **Render Eligibility** | Added primary-page-first rendering strategy, ensuring the most important page renders before secondaries. |
| **Typed Render Results** | Replaced implicit success/failure with structured result objects (`{status, bitmap, error}`). |
| **Cancellation Pipeline** | Enabled targeted cancellation of non-essential renders via `_reportedCancelRenderPages`. |
| [**Bitmap Cache**](#bitmap-cache-pdfbitmapcache) | Added GPU-accelerated LRU bitmap caching, eliminating redundant pdf.js renders on scroll-back. |
| [**PdfPageContentRepository**](#page-content-repository-pdfpagecontentrepository) | Extracted page sessions, hydration, and block indexing from the session, reducing monolithic responsibility. |
| [**PdfTranslationState**](#translation-state-pdftranslationstate) | Extracted translation state management from the session, enabling clean state operations without lifecycle coupling. |
| [**usePdfRenderPipeline**](#usepdfrenderpipeline) | Centralized render scheduling lifecycle in a single composable, replacing scattered viewer logic. |
| **Session-owned Cleanup Scheduling** | Moved cleanup timer ownership from PdfRenderer to PdfDocumentSession, enforcing single-responsibility. |

---

## PDF Application Architecture

### Entry Point

```
src/html/pdf.html → src/app/main/pdf.js → src/apps/pdf/PdfApp.vue
```

Standard Vue 3 bootstrap: `createApp`, Pinia install, error handlers, mount to `#app`.

### Render Tree

```
PdfApp
├── PdfToolbar (file info, mode selector, action buttons)
├── PdfOcrConsentPrompt (user consent before OCR)
├── PdfOcrProgress (progress bar during OCR)
├── PdfOutlinePanel (outline/bookmarks sidebar)
├── PdfDropzone (drag-and-drop or empty state)
│   └── PdfViewerLayout (CSS Grid: single/dual pane, owns scroll containers)
│       ├── PdfViewer (original pane, scrollable page list, scrollToPage exposed)
│       │   ├── PdfPageView × N (canvas + text layer + link overlay per page)
│       │   ├── PdfLinkOverlay × N (clickable link hitboxes)
│       │   ├── PdfOverlayLayer × N (translated block overlays)
│       │   └── PdfBlockHighlightOverlay × N (targeting highlight)
│       └── PdfTranslatedPane (translated blocks per page, own scroll container)
│           ├── PdfTranslatedBlock × M
│           └── PdfOcrStatus × N
└── PdfSelectionAction (floating translate button + result popup)
```

### Key Application Utilities (src/apps/pdf/utils/)

| Utility | Purpose |
|---------|---------|
| `pdfGeometryModel` | DOM geometry queries (page rects, scroll space, canvas offset) |
| `pdfCurrentPageResolver` | Current page from geometry data (scroll-based) |
| `pdfRenderWindowResolver` | Render window computation (visible pages, buffer) |
| `pdfScrollAnchor` | Scroll anchor capture/restore for zoom/layout transitions |
| `pdfCanonicalAnchor` | Canonical anchor model — runtime-active (used by geometry sync engine) |
| `pdfGeometrySyncEngine` | Geometry-based scroll sync — runtime-active (delegated from usePdfScrollSync) |
| `pdfFitPageFootprint` | Fit Page canvas slot computation |
| `pdfViewportPageResolver` | Thin wrapper: find primary page target from geometry |

### Key Application Constants (src/apps/pdf/constants/)

| Constants File | Purpose |
|---------------|---------|
| `pdfLayoutConstants` | DOM footprint dimensions (page padding, label, viewer gaps) |
| `pdfFeatureFlags` | Feature-level toggles (cell masks, diagnostics) |

### Composable Responsibilities

| Composable | Purpose | Key Dependencies |
|------------|---------|-----------------|
| `usePdfViewerController` | Document lifecycle, translation, cache restore | `pdfDocumentSession`, `PdfTranslationCoordinator` |
| `usePdfRenderPipeline` | Render scheduling, window state, candidate/allowed pages | `PdfRenderScheduler`, `pdfRenderWindowResolver` |
| `usePdfNavigation` | Outline/destination resolution, page navigation | `PdfDestinationResolver`, `PdfOutlineRepository` |
| `createPdfTransitionController` | Zoom/layout transitions, anchor capture/restore | `pdfScrollAnchor`, `pdfFitPageFootprint` |
| `usePdfScrollSync` | Side-by-side scroll synchronization | Delegates to pdfGeometrySyncEngine; falls back to proportional ratio |
| `usePdfBilingualMode` | Viewer mode state (original/bilingual/translated) | Standalone |
| `usePdfExport` | Export to TXT/Markdown | `PdfExportCollector`, `PdfExportFormatter` |
| `usePdfBlockSelection` | Block targeting mode | `PdfBlockTargetingManager` |
| `usePdfOcr` | OCR detection + processing workflow | `PdfOcrDetector`, `PdfOcrProcessor` |
| `usePdfSelectionAction` | Text selection translation popup | `pageEventBus`, `UnifiedMessaging` |
| `usePdfSelectionBridge` | Lifecycle wrapper for `PdfSelectionBridge` | `PdfSelectionBridge` |
| `usePdfKeyboard` | Keyboard shortcut navigation | Standalone |

### Presentation Architecture

The PDF viewer uses a Chrome-like workspace design with clear ownership of visual surfaces.

**Document surface** (`PdfApp.scss`):

The `.pdf-app__content` element owns the document background (`#2c2c2c`), providing a neutral dark canvas behind light-colored PDF pages. The drop zone and layout components do not set their own background — the document surface is inherited.

**Page appearance** (`PdfPageView.scss`):

Pages render as white paper (`#ffffff`) with a subtle box shadow. A page label with page number is displayed above each canvas, styled in neutral gray. Page padding ensures canvas content does not meet the page edge.

**Scrollbar behavior**:

PDF context uses the native browser scrollbar (no custom scrollbar styling). The scroll container uses `scrollbar-gutter: stable` to prevent layout shift when the scrollbar appears/disappears. Non-PDF extension contexts (popup, options, sidepanel) retain themed scrollbar styling.

**Spacing ownership** (`PdfDropzone.vue`):

- **Empty state**: The drop zone applies `margin: 0 28px` for reasonable inset within the dark surface.
- **Loaded state**: `.pdf-dropzone--document` sets `margin: 0` so the scroll pane is flush with the document surface, allowing the scrollbar to sit at the right edge.

**Viewer padding** (`PdfViewer.scss`):

The page list within the scroll pane uses `padding: 16px 0 24px` to provide vertical breathing room. These values correspond to the `PDF_VIEWER_PADDING_TOP` and `PDF_VIEWER_PADDING_BOTTOM` layout constants.

---

## PDF Viewer Lifecycle

### File Loading Sequence

```
1. User drops/selects PDF file
2. usePdfViewerController.loadPdfFile(file, viewerWidth)
   ├── Cancel active translation (if any)
   ├── Reset all state (pageMetrics, translationSummary, etc.)
   ├── pdfDocumentSession.openFile(file, viewerWidth)
    │   ├── Create object URL
    │   ├── Load PDF via pdfjs-dist (useSystemFonts: true)
    │   ├── Compute document identity (fingerprint → SHA-256 fallback)
    │   ├── Build page metrics (dimensions, scale per page)
    │   │   └── First call caches natural (scale=1) viewports in
    │   │       _naturalPageViewports; rebuilds reuse cached copy
    │   └── Return state snapshot
   ├── restoreFromCache(documentIdentity)
   │   ├── pdfCacheManager.loadDocument(documentIdentity)
   │   ├── Validate sourceTextHash for each cached entry
   │   └── Apply matching translations to session
   └── pdfHistoryManager.updateAfterOpen(session)
```

### Page Rendering Sequence

```
1. PdfPageView watches [visible, pageNumber, scale, width, height]
2. When visible: PdfTextLayerRenderer.render(page, viewport)
   ├── page.getTextContent() → text items
   ├── Create positioned <span> elements (left/top %, font-size, rotation)
   ├── Append to DOM
   └── Post-render: measure widths → apply scaleX for accuracy
3. PdfDocumentSession.renderPage() checks bitmap cache
   ├── Cache hit: drawImage() from cached ImageBitmap + text layer
   └── Cache miss: PdfRenderer renders via pdfjs page.render()
4. When hidden: clearPage() cancels render, clears canvas + text layer
```

### Cleanup Sequence

```
1. PdfApp unmounts
2. Each composable calls its cleanup
3. pdfDocumentSession.cleanupDocument()
   ├── Cancel scheduled cleanup timer
   ├── Cancel all active render tasks
   ├── Destroy pdfjs document object
   ├── Revoke object URL
   ├── Clear all Maps (pageSessions, translationStates, renderTasks)
   └── _naturalPageViewports.clear()
```

Cleanup scheduling is owned by `PdfDocumentSession`, not by `PdfRenderer`. The session tracks visible and render-candidate page numbers, then schedules a delayed cleanup (`RENDER_CLEANUP_DELAY_MS`) that cancels renders outside the active set and releases out-of-scope page sessions. The renderer provides only the immediate `cancelRendersOutside(keepSet)` primitive.

---

## Render Pipeline

The render pipeline is a layered system where each component owns a single, well-defined responsibility. No component owns more than one concern.

### Ownership Boundaries

| Component | Owns | Does NOT Own |
|-----------|------|--------------|
| **PdfRenderer** | Render / cancel / clear | Scheduling, queues, DOM ownership, cleanup timers |
| **PdfRenderScheduler** | Policy only — candidates, plan, eligibility, cancellation targets | DOM, Vue reactivity, rendering |
| **PdfRenderWindowState** | Committed vs. pending candidate page sets | Rendering, scheduling policy |
| **PdfRenderJobState** | Per-page lifecycle state (IDLE → RENDERING → COMMITTED/FAILED/CANCELLED) | Rendering, scheduling |
| **usePdfRenderPipeline** | Scheduler instance, render window lifecycle, reactive state, lifecycle event handlers | Rendering, PDF.js |
| **PdfDocumentSession** | Cleanup scheduling, bitmap cache coordination, page session lifecycle | Rendering decisions, UI |

### PdfRenderer

**File**: `src/features/pdf-translation/core/PdfRenderer.js`

A pure render service. Provides `renderPage()`, `clearPage()`, `cancelRender()`, `cancelAll()`, `cancelRendersOutside()`, and `destroy()`. Tracks render tasks per `pageNumber:canvasId`. Returns structured result objects (`{status, bitmap, error}`). Owns no scheduling, no queues, no timers, no DOM ownership.

### PdfRenderScheduler

**File**: `src/apps/pdf/rendering/PdfRenderScheduler.js`

A pure-state policy engine. Receives render window updates and produces a sorted render plan, effective candidates, allowed-render pages, and cancellation targets. Composes `PdfRenderWindowState` and `PdfRenderJobState` internally. Has no DOM, no Vue reactivity, no rendering logic.

**Key methods**: `updateWindow()`, `markRendered()`, `markRenderStarted()`, `markRenderFailed()`, `markRenderCancelled()`, `getRenderPlan()`, `getRenderAllowedPages()`, `getEffectiveCandidates()`.

### PdfRenderWindowState

**File**: `src/apps/pdf/rendering/PdfRenderWindowState.js`

Manages committed vs. pending candidate page sets for the render window. When the render set changes, it defers commit until the primary page has rendered, preventing churn during rapid scroll. Exposes `getEffectiveCandidates()` for the scheduler to consume.

### PdfRenderJobState

**File**: `src/apps/pdf/rendering/PdfRenderJobState.js`

Tracks per-page render lifecycle state. Transitions: IDLE → RENDERING → COMMITTED (success), or FAILED/CANCELLED. Provides `snapshot()` for diagnostic reads and `resetPage()`/`reset()` for cleanup.

### usePdfRenderPipeline

**File**: `src/apps/pdf/composables/usePdfRenderPipeline.js`

The Vue composable that bridges the feature layer to the view layer. Owns the scheduler instance, render window state, render candidate/allowed reactive refs, and lifecycle event handlers. Uses `requestAnimationFrame` for coalesced render window updates. Handles freeze/unfreeze of render window eviction during pinch-zoom.

### Render Flow

```
Scroll / Layout
      │
      ▼
resolveRenderWindow()
      │
      ▼
PdfRenderScheduler
      │
      ├── PdfRenderWindowState (committed vs. pending candidates)
      ├── PdfRenderJobState (per-page lifecycle)
      ├── Render plan (sorted by priority + distance)
      ├── Effective candidates (committed ∪ pending visible+primary)
      └── Cancellation targets (rendering pages not in allowed set)
      │
      ▼
PdfPageView
      │
      ▼
PdfDocumentSession
      │
      ▼
Bitmap Cache
      │
      ├── Hit → drawImage() + text layer
      │
      └── Miss
             │
             ▼
        PdfRenderer
             │
             ▼
        pdf.js render
```

---

## Geometry Layer

The Geometry layer is a set of pure utility modules in `src/apps/pdf/utils/` that separate **PDF coordinate space** from **DOM coordinate space**. These modules are framework-agnostic and have no Vue reactivity dependency.

### Separation of Concerns

| Domain | Owner | Coordinates | Source |
|--------|-------|-------------|--------|
| **PDF space** | `PdfDocumentSession` page metrics | PDF points (1/72 inch), bottom-left origin | `pdfjs-dist` viewport transform |
| **DOM space** | Geometry utilities (`pdfGeometryModel`) | CSS pixels, top-left origin | `getBoundingClientRect()` |

`page.height` and `page.width` represent scaled PDF viewport dimensions — the canvas/stage area. The DOM page wrapper may be taller (label, padding, gap), but those dimensions belong to the CSS/DOM layer, not to the PDF metric contract.

### pdfGeometryModel

**File**: `src/apps/pdf/utils/pdfGeometryModel.js`

Provides geometry queries on the DOM:

- `getPageGeometry(element, container)` — returns `{ top, bottom, height, width, centerY, visibilityHint }` for a page element relative to its scroll container.
- `getPageGeometries(container, selector)` — returns geometry for all matching page elements.
- `resolvePageFromScroll(scrollTop, pageGeometries)` — finds the page containing a scroll position (assumes pre-sorted geometries).
- `getPageRatio(scrollTop, pageGeometry)` — returns `[0,1]` ratio of scroll position within a page.
- `getScrollMetrics(container)` — returns `scrollTop`, `scrollHeight`, `clientHeight`.
- `getScrollSpaceTop(element, container)` — returns the element's absolute scroll position.
- `getCanvasScrollTop(canvas, container, cssY)` — returns the scroll position to place a canvas-relative Y coordinate at the container top.
- `findPrimaryPageGeometry(container, selector)` — legacy visible-page selection for backward compatibility.

### pdfCurrentPageResolver

**File**: `src/apps/pdf/utils/pdfCurrentPageResolver.js`

Determines current page from geometry data. Two resolution strategies:

- `resolveCurrentPage(scrollTop, pageGeometries)` — returns the page containing `scrollTop`, or nearest page by distance if in a gap.
- `resolvePrimaryVisiblePage(scrollTop, pageGeometries)` — among pages visible in the viewport, returns the page whose top edge is closest to the viewport top edge. Falls back to `resolveCurrentPage()` when nothing is visible.

Used by `PdfViewer.emitCurrentPageFromResolver()` and `PdfViewerLayout.syncFromPane()`. The primary strategy preserves legacy observable behavior (first visible page nearest top).

### pdfRenderWindowResolver

**File**: `src/apps/pdf/utils/pdfRenderWindowResolver.js`

Computes render windows from geometry:

- `computeVisiblePages({ scrollTop, viewportHeight, pageGeometries })` — pages overlapping the viewport.
- `expandRenderWindow({ visiblePages, pageGeometries, bufferPages })` — expands visible set with adjacent pages.
- `resolveRenderWindow({ scrollTop, container, pageSelector, bufferPages })` — returns `{ visiblePages, renderPages, primaryPage }`.

Render decisions are geometry-driven. IntersectionObserver only schedules re-evaluation; it is not the source of truth for which pages are visible.

### Relationship to Navigation

The navigation system (`scrollToPage()`) uses GeometryModel primitives (`getCanvasScrollTop`, `getScrollSpaceTop`) to convert PDF viewport coordinates into DOM scroll positions. The `currentPage` value used by the toolbar and outline highlighting is computed from geometry data via `resolveRenderWindow().primaryPage`, not from IntersectionObserver entries.

---

## PDF Navigation

### Destination Coordinate Model

PDF destinations provide coordinates in **PDF user space** — a coordinate system where the origin is at the bottom-left corner of the page, the X-axis points right, and the Y-axis points up. Units are PDF points (1/72 inch).

The pdf.js `PageViewport` class converts these coordinates into CSS pixel coordinates via `viewport.convertToViewportPoint(left, top)`. This method applies a single affine transform that handles:

- **Scaling** — multiplying by the display scale factor.
- **Y-axis inversion** — flipping from bottom-up PDF space to top-down CSS space.
- **Page rotation** — rotating coordinates when the page has a non-zero rotation angle.

After calling `convertToViewportPoint()`, the result is a `[cssX, cssY]` pair measured in CSS pixels relative to the **rendered canvas origin** (top-left corner of the canvas element). No manual scale multiplication, Y-flip, or rotation correction should ever be performed after this call — the viewport transform already encodes all necessary adjustments.

**Architectural Invariant**: Navigation coordinates remain in PDF user space until the final viewport conversion performed by `PageViewport.convertToViewportPoint()`. No intermediate code should manually interpret, scale, rotate, or flip PDF coordinates. All coordinate-system transformations are delegated to the pdf.js viewport transform to ensure correctness and avoid duplicated geometry logic. Future changes must preserve this invariant.

### Scroll Coordinate Conversion

The viewer's scroll implementation navigates to a specific destination using the following algorithm:

```
1. Resolve destination → { pageNumber, left, top, zoom } (PdfDestinationResolver)
2. Obtain the page viewport for the target page
3. Convert PDF coordinates: [cssX, cssY] = viewport.convertToViewportPoint(left, top)
4. Measure the canvas position relative to the scroll container
       canvasOffsetY = getScrollSpaceTop(canvas, container)
5. Convert viewport coordinates into scroll-space:
       canvasOffsetY = canvas.top - container.top + container.scrollTop
6. Scroll to:
       container.scrollTo({ top: canvasOffsetY + cssY })
```

Step 4 uses `getScrollSpaceTop()` from `pdfGeometryModel` (equivalent to `canvasRect.top - containerRect.top + container.scrollTop`). Step 5 converts the canvas's visual position (which changes as the container scrolls) into an absolute scroll offset. Step 6 then adds the viewport Y coordinate to place the target point at the container's top edge.

For destinations without explicit top/left coordinates (pure page navigation), the viewer uses `getScrollSpaceTop(pageElement, container)` directly from the page wrapper element, scrolling the page top to the container top.

### Why Canvas Is Used as the Reference Element

The viewport coordinates returned by `convertToViewportPoint()` are defined relative to the **canvas origin** — the top-left corner of the rendered canvas element.

The page wrapper contains layout elements (padding and page metadata such as the page label) above the canvas. The wrapper's top edge does **not** coincide with the canvas origin. Using the wrapper as the reference instead of the canvas would introduce an offset equal to the cumulative height of these layout elements, producing inaccurate scroll positions.

The canvas is the **canonical geometric reference** for destination coordinates because it is the element that the viewport transform is anchored to. All viewport coordinate calculations must use the canvas as the origin.

### Design Notes

- This implementation follows the same geometry model as the official pdf.js viewer: `elementPosition + viewportCoordinate`. The pdf.js `scrollIntoView()` function accumulates `offsetTop` values from the page element up to the scroll container and adds the viewport coordinate. The viewer's `getBoundingClientRect()`-based approach achieves the same result without depending on the `offsetParent` chain, which is more robust for DOM hierarchies where the scroll container is not a positioned element.
- Zoom values are forwarded through the navigation pipeline (`NavigationTarget.zoom`) but are intentionally ignored by the scroll implementation until destination-controlled zoom is implemented. When a destination specifies a zoom value, the official pdf.js viewer may adjust the viewer scale before scrolling; this behavior is not yet supported.

### Verification Note

The scroll geometry was validated against the official pdf.js geometry model. Both implementations compute `scrollPosition = elementOffsetFromScrollContainer + viewportCoordinate`, confirming mathematical equivalence.

### Current Page Ownership

A single `currentPage` value serves as the **source of truth** for the current page. All navigation sources converge on this value, and all consumers read from it:

- **Outline clicks**: `navigateToDestination()` → `navigateToPage()` → sets `currentPage`.
- **Link annotations**: Same pipeline as outline clicks.
- **Manual scrolling**: The viewer's page visibility detection (rooted at the scroll container) determines which pages are visible and emits `current-page-change`. The application bridges this event to `currentPage`.
- **Browser history, keyboard navigation, search results**: Future features will call `navigateToPage()` or update `currentPage` directly.

The toolbar page indicator reads `currentPage` directly. There is no intermediate display state — the toolbar always reflects the same value as the navigation composable.

A page-change observer in `usePdfNavigation` triggers `updateActiveOutline()` on every page change. This recomputes `activeOutlineDest` (the active outline node) and `expandedDests` (the ancestor path for auto-expansion). The outline and toolbar always reflect the same page state because they share the same source.

This ownership may move to a future Viewer State layer, but the consumer contract — all navigation sources update one value, all consumers observe it — will remain unchanged.

### Scroll Container Ownership

The layout owns the scroll container. The viewer and translated pane receive it as an explicit dependency — they never discover it via DOM traversal.

```
PdfViewerLayout (owns the scroll container, makes it available to the parent)
    │
    ├── PdfViewer (receives scroll container dependency)
    │     └── Page visibility detection rooted at the scroll container
    │
    └── PdfTranslatedPane (receives scroll container dependency)
          └── Page visibility detection rooted at the scroll container
```

**Why the layout owns the scroll container**: The scroll container is defined by the layout's CSS rules (overflow and height constraints). Only the layout knows which element scrolls. Consumer components should not traverse the DOM to find it.

**Why consumers receive it as an explicit dependency**: This keeps the viewer and translated pane decoupled from the surrounding DOM structure. They can be embedded in different contexts (split view, modal, iframe) without modification — the parent simply provides the appropriate scroll container.

**Fallback behavior**: `PdfTranslatedPane` retains a DOM fallback for backward compatibility if used outside the normal component hierarchy. `PdfViewer` falls back to viewport-based observation. In normal operation within PdfApp, the dependency is always provided.

---

## Zoom and Scroll Transition Architecture

### Anchor Model

Scroll position is captured and restored using one of two anchor types:

| Type | Shape | Representation |
|------|-------|----------------|
| **DOM anchor** | `{ pageNumber, offsetRatio }` | Ratio of scroll offset within the page element's DOM rect |
| **PDF-backed anchor** | `{ pageNumber, offsetRatio, pdfPoint: { x, y } }` | Same as DOM, plus a PDF-space coordinate captured from the canvas viewport |

Both types share `pageNumber` and `offsetRatio` so they can be restored via the generic `restoreScrollAnchor()` if PDF precision is unavailable. The `pdfPoint` field, when present, enables pixel-precise restoration via `restorePdfBackedScrollAnchor()`.

Captured anchors are tagged with an `owner` field (`'original'` or `'translated'`) that routes restoration to the correct scroll container.

### Controlled Zoom Sequence

Zoom changes (fit-page, fit-width, percent, step) follow a guarded sequence to prevent layout corruption:

```
beginControlledZoomSuppression()
beginScrollSyncSuppression()
  captureControlledTransitionAnchors()
  // caller normalizes anchors (fit-page policy)
  runWithCurrentPageSuppression()
    recomputeLayout()
    nextTick()
    applyDeferredZoomLayout()
    restoreControlledTransitionAnchors()
endControlledZoomSuppression()
scheduleScrollSyncSuppressionClear()
refreshCurrentPage()
```

The **suppression guard** (`controlledZoomSeq`) prevents `handleLayoutChange()` from triggering its own recompute/restore cycle while a zoom transition is in progress. Without this guard, a layout resize during zoom would race with the zoom's own `recomputeLayout`, causing a doubled restore or a stale anchor restore. The guard is a sequence number (not a boolean) so that overlapping zoom gestures can be safely managed.

### Deferred Layout (`deferredZoomLayout`)

When a window resize occurs during an active controlled zoom (signaled by `controlledZoomSeq > 0`), the layout change is deferred rather than discarded. The deferred layout is stored in `deferredZoomLayout` and applied after the zoom's `recomputeLayout` completes, during `applyDeferredZoomLayout()`. This ensures the final layout reflects the latest window size without racing against the zoom transition.

### Fit Page Entry

When entering Fit Page mode, the captured PDF-backed anchor is normalized via `normalizeFitPagePdfAnchor()`:
- `pdfPoint.y` is snapped to the page's top edge in PDF space (`convertToPdfPoint(0, 0)`)
- `offsetRatio` is set to `0`

This is necessary because after Fit Page recompute, the page's rendered height changes. The original `pdfPoint.y` would reference a position that no longer corresponds to the same visual location. Snapping to the page top ensures the anchor resolves unambiguously at any zoom level.

### Fit Page Exit

When leaving Fit Page mode from a position near the page top (within 1% of the page height), the anchor is normalized via `normalizeFitPageDomRootAnchor()`:
- `pdfPoint` is dropped entirely
- Only `pageNumber` and `offsetRatio: 0` are preserved

The captured `pdfPoint` was computed at the Fit Page viewport geometry. Once zoom mode changes, that `pdfPoint` is stale — the viewport transform from the old zoom level no longer applies. Dropping it forces a DOM-based `restoreScrollAnchor()` that resolves to the page top using the current DOM layout, which is always correct regardless of zoom mode.

When exiting Fit Page from a scrolled position (below 1%), the anchor is used as-captured (no normalization). The existing `pdfPoint` remains valid because the viewport geometry change is small enough that the PDF-backed restore produces an acceptable result.

### Side-by-Side Translated Anchor Policy

During zoom transitions in side-by-side mode, the translated pane's anchor is **derived from the original pane's anchor** rather than using the captured translated anchor directly:

```js
deriveTranslatedAnchorFromOriginal(originalAnchor)
  → { owner: 'translated', pageNumber, offsetRatio }
```

This ensures both panes scroll to the same page and relative offset after zoom recompute. Using the separately captured translated anchor risks mismatch when the layout shifts asymmetrically between the two panes (e.g., different content heights causing different scroll positions).

### Orchestration (`runControlledZoomTransition`)

The `runControlledZoomTransition()` helper owns the invariant orchestration sequence (suppression, recompute, deferred layout drain, anchor restore, cleanup). It accepts pre-resolved anchors and does not make policy decisions:

| Helper Owns | Caller Owns |
|---|---|
| `beginControlledZoomSuppression` | Anchor capture timing |
| `beginScrollSyncSuppression` | Anchor normalization (fit-page policy) |
| `runWithCurrentPageSuppression` | Zoom mode/percent updates |
| `recomputeLayout` / `nextTick` | Early-return guards |
| `applyDeferredZoomLayout` | Translated anchor resolution |
| `restoreControlledTransitionAnchors` | |
| Cleanup (suppression + scroll sync) | |
| `refreshCurrentPage` | |

---

## Fit Page Footprint Model

### Problem

Fit Page mode calculates PDF scale so each page visually fits within the available viewer area. The scale uses the PDF canvas height, but the rendered DOM page wrapper is taller than the canvas — it includes page padding, a page label with margin, and external viewer spacing (gaps between pages). This mismatch caused navigation drift: later pages accumulated offset error because the actual page pitch exceeded the calculated pitch.

### Architecture Decision (Option C)

Fit Page uses an **explicit layout footprint model** to derive the canvas slot from viewer dimensions. PDF metrics remain pure — `page.height` stays as the PDF canvas height. The DOM footprint is computed separately.

### Ownership

| Dimension | Owner | Semantic |
|-----------|-------|----------|
| `page.width` | PDF metric | Scaled PDF viewport width |
| `page.height` | PDF metric | Scaled PDF viewport height |
| `viewport` | PDF metric | pdf.js PageViewport (coordinate conversion) |
| `viewerWidth` / `viewerHeight` | Application layout | Scroll container client dimensions |
| `availableCanvasWidth` | Footprint model | `viewerWidth - PAGE_MARGIN * 2` |
| `availableCanvasHeight` | Footprint model | `viewerHeight - viewerChrome - pageChrome` |
| `pageChromeHeight` | Footprint model | Padding top/bottom + label height + label margin |
| `viewerChromeHeight` | Footprint model | Viewer padding top + bottom |

### Fit Page Flow

```
viewerWidth, viewerHeight
    │
    ▼
pdfFitPageFootprint.resolvePdfCanvasSlot({ width, height })
    │
    ├── availableCanvasWidth  = viewerWidth  - PAGE_MARGIN * 2
    ├── availableCanvasHeight = viewerHeight - viewerChrome - pageChrome
    └── pageChrome = paddingTop + paddingBottom + labelHeight + labelMargin
    │
    ▼
buildLayoutRequest includes { availableCanvasWidth, availableCanvasHeight }
    │
    ▼
PdfDocumentSession._buildPageMetrics()
    │
    ├── usableWidth  = availableCanvasWidth  (or fallback to PAGE_MARGIN math)
    ├── usableHeight = availableCanvasHeight (or fallback to PAGE_MARGIN math)
    ├── fit-page: scale = min(widthScale, heightScale)
    └── fit-width: scale = widthScale (height slot ignored)
```

The resulting `page.height` is the scaled canvas height, not the DOM wrapper height. The footprint constants are defined in `pdfLayoutConstants.js` and must be kept in sync with the corresponding CSS values in `PdfViewer.scss` and `PdfPageView.scss`.

### Why page.height Remains Canvas Height

Three invariants depend on `page.height` being the PDF viewport height:

1. **Coordinate conversion**: `viewport.convertToViewportPoint()` returns CSS coordinates relative to the canvas origin. The stage must match the PDF viewport dimensions.
2. **Canvas sizing**: `PdfRenderer` sets `canvas.width/height` and `canvas.style.width/height` from the viewport. The stage reserves this exact height.
3. **Overlay positioning**: `PdfOverlayLayer` and `PdfLinkOverlay` position elements using viewport-relative percentages. Changing `page.height` would break these coordinate mappings.

The stage element (`pdf-page__stage`) now explicitly reserves the canvas height via `stageStyle: height: page.height`. The page wrapper uses `width` only; its actual height is determined by DOM layout (stage + label + padding). This prevents the wrapper height from changing when a canvas renders vs. being cleared.

---

## Scroll Synchronization

### Architecture

Scroll synchronization between the original and translated panes in side-by-side mode is implemented by `usePdfScrollSync`.

**File**: `src/apps/pdf/composables/usePdfScrollSync.js`

**Principle**: A single scroll pane is designated as the source. When the source scrolls, the target pane's scroll position is recalculated to match the same logical page region. Synchronization is disabled when the user manually scrolls the target pane (loop suppression via `suppressSource`).

### Delegation to Geometry Engine

`usePdfScrollSync` delegates scroll synchronization to `pdfGeometrySyncEngine`:

```
handleOriginalScroll / handleTranslatedScroll
  └─ scheduleSync(sourcePane, targetPane)
       └─ runSync(sourcePane, targetPane)
            ├─ [Primary] syncScrollViaGeometry()  (pdfGeometrySyncEngine)
            │     ├─ buildSyncState() → resolveEffectiveGeometries()
            │     │                    → resolveCurrentPage()
            │     │                    → createCanonicalAnchor()
            │     │                          (pdfCanonicalAnchor, ANCHOR_SOURCE.GEOMETRY)
            │     └─ mapAnchorToTargetScroll() → resolveDOMScrollFromAnchor()
            │
            └─ [Fallback] syncByRatio()  (proportional ratio, no geometry)
```

The primary path uses geometry from `pdfGeometryModel.getPageGeometries()`, resolves the current page via `pdfCurrentPageResolver.resolveCurrentPage()`, creates a canonical anchor via `pdfCanonicalAnchor.createCanonicalAnchor()`, and maps it to the target pane's DOM layout.

### Suppression Loop Guard

When the geometry engine writes to the target pane's `scrollTop`, the target's scroll handler fires and would retrigger the source. The guard mechanism:

1. Before writing to the target, set `suppressSource = targetPane`.
2. In `handleTargetScroll()`, if `suppressSource === targetPane`, skip the sync.
3. After the next animation frame, clear suppression.

### Limitations

- Uses `getBoundingClientRect()` via `pdfGeometryModel.getPageGeometries()` — O(n) forced layout per scroll event.
- The scroll-range ratio fallback (when geometry sync returns an invalid height) accumulates drift with different pane content heights.

---

## Text Layer Architecture

### Why Custom Renderer Instead of `TextLayerBuilder`

The pdfjs-dist `TextLayerBuilder` was evaluated and **intentionally replaced** with a custom `PdfTextLayerRenderer`. The rationale:

| Factor | `TextLayerBuilder` | Custom Renderer |
|--------|-------------------|-----------------|
| **Bundle leakage** | Imports from `pdfjs-dist/web/pdf_viewer.mjs` (~300KB) which pulls in annotation layer, find controller, and UI utilities | Zero external dependencies — ~130 lines of pure DOM manipulation |
| **CSS coupling** | Requires `pdf_viewer.css` (160KB) with hundreds of rules for annotations, find highlights, editor layers | Only 36 lines of focused SCSS in `PdfPageView.scss` |
| **Positioning** | Uses pdfjs internal transform composition with CSS custom properties | Direct matrix math + percentage-based `left`/`top` positioning |
| **Post-render accuracy** | No horizontal scaling adjustment | Post-render width measurement with scaleX adjustment for sub-pixel accuracy |
| **Annotation overhead** | Renders link annotations, form widgets, annotation editor layers | Renders only pure text — no annotation coupling |
| **Selection integration** | Internal event system tied to pdfjs viewer | Emits standard `SELECTION_EVENTS` via `pageEventBus` for contract-level compatibility across extension contexts. |

### Text Layer Renderer (`PdfTextLayerRenderer`)

**File**: `src/features/pdf-translation/core/PdfTextLayerRenderer.js`

**Architecture**:

The renderer positions invisible, selectable text spans over the PDF canvas using percentage-based coordinates derived from the pdfjs viewport transform. For each text item:

1. **Coordinate transform**: Computes a page-to-screen transform matrix from `viewport.rawDims`, then multiplies it with each item's transform to derive screen-space position.
2. **Font sizing**: Derives font height from the transform matrix diagonal. Font size is set via a CSS custom property (`--font-height`) and scaled by the viewport's total scale factor.
3. **Positioning**: Spans are positioned using percentage-based `left` and `top` values relative to page dimensions, accounting for viewport offsets.
4. **Rotation**: Detected via the transform matrix angle and applied via a `--rotate` CSS variable.
5. **Post-render accuracy**: After all spans are in the DOM, a measurement pass compares each span's rendered width against the PDF item's natural width and applies `scaleX()` to correct any discrepancy.

**CSS Strategy** (`PdfPageView.scss`):

- Text spans are **invisible** (`color: transparent`) so the canvas shows through, but remain selectable via `user-select: text`.
- `::selection` uses `background: Highlight; color: transparent` — the native selection highlight is visible without rendering duplicate text.
- `line-height: 1` and normalized spacing ensure predictable layout. `transform-origin: 0% 0%` ensures scaleX expands from the left edge.

---

## Selection Integration

### Context: Why Not WindowsManager?

The PDF viewer runs as an **extension-internal page** (`extension://.../pdf.html`). Content-script features — including WindowsManager, Desktop FAB, and Mobile FAB — are loaded by the content script system and are **never injected into extension pages**. Therefore, the PDF viewer implements its own selection-to-translation flow.

The selection event contract (`SELECTION_EVENTS.GLOBAL_SELECTION_CHANGE`) is **shared** across the extension. On web pages, WindowsManager subscribes to this event. In the PDF viewer, `usePdfSelectionAction` subscribes instead. The payload format is identical, enabling potential future cross-context integration.

### PdfSelectionBridge

**File**: `src/features/pdf-translation/core/PdfSelectionBridge.js`

Bridges native browser text selection within the PDF text layer to the extension's selection event system.

**Flow**:

```
Browser selectionchange
    │
    ▼
PdfSelectionBridge.handleSelectionChange()
    │
    ├── isSelectionInsidePdfTextLayer(selection, viewerRoot)
    │   └── Validates: selection exists, not collapsed, start/end
    │       nodes are inside .textLayer within viewer root
    │
    ├── buildPdfSelectionPayload(selection, viewerRoot)
    │   ├── buildPdfSelectionText() — normalizes \u00A0, trims
    │   └── buildPdfSelectionPosition() — bounding rect + 10px offset
    │
    ├── Signature deduplication (text|x|y|width|height)
    │
    └── pageEventBus.emit(GLOBAL_SELECTION_CHANGE, {
            text, position, mode, options,
            context: { source: 'pdf-viewer', isPdf: true }
        })
            │
            ▼
    usePdfSelectionAction (PDF-specific subscriber)
```

### PdfSelectionAction (PDF-Specific Translation UI)

**Composable**: `src/apps/pdf/composables/usePdfSelectionAction.js`
**Component**: `src/apps/pdf/components/PdfSelectionAction.vue`

Since WindowsManager cannot run in the PDF viewer, `usePdfSelectionAction` provides the selection-to-translation flow:

1. **Listens** to `GLOBAL_SELECTION_CHANGE` and `GLOBAL_SELECTION_CLEAR` on `pageEventBus`.
2. **Stores** selected text and position in local Vue refs.
3. **Renders** a floating translate button (`PdfSelectionAction.vue`) at the selection position.
4. On user click, **sends** a translation request directly via `UnifiedMessaging.sendRegularMessage()` with `TranslationMode.Selection`.
5. **Displays** the translated result (or error) in a positioned popup below the selection.

This is a self-contained, PDF-specific implementation. It does not share components or state with WindowsManager.

### Shared Event Contract

The `PdfSelectionBridge` emits the standard selection event payload:

```javascript
{
    text: string,           // Selected text (normalized)
    position: { x, y, width, height }, // Bounding rect for UI positioning
    mode: SelectionTranslationMode,    // From settings
    options: {},                         // Additional options
    context: {
        source: 'pdf-viewer',           // Identifies PDF origin
        isPdf: true                     // Flag for subscriber filtering
    }
}
```

This matches the contract used by web-page selection detectors (SelectionManager, TextFieldDoubleClickHandler), ensuring architectural consistency across contexts.

---

## Logical Block Model

### What Is a Logical Block?

A **logical block** is the atomic translation unit — a semantically meaningful group of text lines (paragraph, heading, list item, caption, table cell). Blocks are NOT pages, NOT lines, NOT individual words.

### Block Creation Pipeline

```
pdfjs textContent.items
    │
    ▼
PdfLayoutAnalyzer.buildPdfTextLinesFromItems()
    ├── Groups items into lines by vertical proximity (0.75× median font height)
    ├── Computes line bounding boxes, direction, font size
    └── Returns sorted line objects
    │
    ▼
PdfLayoutAnalyzer.resolvePdfReadingOrder()
    ├── Detects column clusters (gap ≥ 18% of page width or 48px)
    ├── Handles RTL (reverses column order)
    └── Assigns readingOrderIndex to each line
    │
    ▼
PdfLayoutAnalyzer.buildPdfLogicalBlocksFromLines()
    ├── Merges consecutive lines by role, column, gap, alignment
    ├── paragraph lines merge at gap ≤ 1.1× font size
    ├── table cells merge at 1.25× tolerance
    └── Returns raw block objects
    │
    ▼
PdfLogicalBlockBuilder.build()
    └── Wraps each block via createPdfLogicalBlock()
        ├── Normalizes text and bounding box
        ├── Computes sourceTextHash (SHA-256)
        ├── Generates deterministic id via createPdfLogicalBlockIdentity()
        └── Returns frozen block structure
```

### Block Identity

Block IDs are **deterministic** and survive across sessions:

```
{documentIdentity}|p{pageNumber}|r:{role}|x:{normalizedX}|y:{normalizedY}|w:{normalizedW}|h:{normalizedH}|t:{textHash}
```

Where normalized values are `[0,1]` relative to page dimensions, and `textHash` is SHA-256 of normalized text.

### Block Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Deterministic identity |
| `documentIdentity` | string | PDF fingerprint or SHA-256 hash |
| `pageNumber` | number | 1-based page number |
| `role` | string | `paragraph`, `heading`, `list-item`, `caption`, `table-cell` |
| `text` | string | Full block text content |
| `sourceTextHash` | string | SHA-256 of normalized text |
| `boundingBox` | `{x, y, width, height}` | Absolute coordinates in PDF units |
| `normalizedBoundingBox` | `{x, y, width, height}` | [0,1] relative to page |
| `lines` | array | Ordered line objects with bounding boxes |
| `columnIndex` | number | Column cluster index |
| `readingOrderIndex` | number | Reading order position |
| `roleMetadata` | object | Role-specific data (font size ratio, pattern matches) |

---

## Translation Pipeline

### Orchestration (`PdfTranslationCoordinator`)

**File**: `src/features/pdf-translation/core/PdfTranslationCoordinator.js`

```
translateVisibleBlocks()
    │
    ├── 1. Increment activeRunId (stale-run detection)
    │
    ├── 2. Get visible logical blocks from session
    │       └── Filter: skip blocks with status === 'translated'
    │
    ├── 3. Resolve provider (mode-specific → global fallback)
    │
    ├── 4. Read settings (source/target language, optimization level)
    │
    ├── 5. Batch planning via PdfTranslationBatchPlanner
    │       ├── Get provider configuration + limits
    │       ├── Convert blocks to provider items
    │       └── Chunk via TranslationBatcher.createIntelligentBatches()
    │
    ├── 6. For each batch:
    │       ├── Mark blocks as 'loading' in session state
    │       ├── Build request via PdfTranslationAdapter
    │       ├── Send via UnifiedMessaging (to background)
    │       ├── Map response back to per-block results
    │       ├── Apply results to session state
    │       └── Notify state change (triggers Vue reactivity)
    │
    └── 7. Return summary: { status, translatedCount, failedCount, totalCount }
```

### Cancellation

Uses **run ID pattern** — a monotonic counter (`activeRunId`) ensures only the latest translation run processes results. Stale runs break out of the processing loop. Active request IDs are tracked for targeted background cancellation.

### Translation Request Format

```javascript
{
    action: MessageActions.TRANSLATE,
    context: MessageContexts.PDF_TRANSLATION,
    data: {
        mode: TranslationMode.PDF,
        text: "block text content",
        // ... provider/language settings
    }
}
```

---

## Bilingual Rendering Model

### Viewer Modes

| Mode | Layout | Description |
|------|--------|-------------|
| `original` | Single pane | PDF canvas with text layer only |
| `bilingual` | Side-by-side | Original pane (left) + Translated pane (right) |
| `translated` | Single pane | Translated blocks only |

### Adaptive Translated Pane

The translated pane (`PdfTranslatedPane` + `PdfTranslatedBlock`) uses **adaptive geometry** — translated text blocks are rendered with flexible sizing because:

- Translated text may expand or contract compared to the source.
- RTL languages require different layout flow.
- Fixed bounding boxes would hurt readability.

The original pane always renders the **pixel-accurate** PDF canvas. Geometry adaptation is only on the translated side.

### PdfTranslatedBlock States

| State | Visual | Description |
|-------|--------|-------------|
| `idle` | Dimmed | Block exists but not yet translated |
| `loading` | Spinner | Translation in progress |
| `translated` | Full text | Translation complete, auto-detects RTL |
| `error` | Error message | Translation failed, shows error info |

---

## OCR Fallback Architecture

### Detection (`PdfOcrDetector`)

A page is classified as a **scanned candidate** when:
- `logicalBlocks.length === 0` (no extractable text blocks)
- AND `textContent.items.length ≤ 5` (minimal text items)
- AND `charCount ≤ 20` (almost no characters)

### Processing (`PdfOcrProcessor`)

```
1. User approves OCR (PdfOcrConsentPrompt)
2. PdfOcrProcessor.processPages(pageNumbers, { language })
   ├── For each page:
   │   ├── Render page to canvas
   │   ├── Call Tesseract.js recognizeStructured()
   │   ├── Primary: _createBlocksFromLines() — uses structured line bboxes
   │   └── Fallback: _createBlocksFromPlainText() — splits by newlines
   └── Report progress via callbacks
3. Results stored as OCR blocks on PdfPageSession
4. Cached via pdfCacheManager.saveOcr()
```

### OCR Block Integration

OCR blocks are stored separately from text-content blocks on `PdfPageSession`. The `getLogicalBlocks()` method returns text-content blocks if available, falling back to OCR blocks. The `allBlocks` getter returns both.

---

## Cache Architecture

### Cache Identity

Cached translations are keyed by:

```
documentIdentity + blockId + sourceTextHash + targetLanguage + provider + translationSettingsHash
```

The `sourceTextHash` validation ensures that if the source text changes (e.g., different PDF version), stale translations are **not** restored.

### Cache Structure

```javascript
{
    documentIdentity: {
        translations: {
            [blockId]: {
                blockId, documentIdentity, pageNumber,
                sourceTextHash, translatedText, status,
                provider, sourceLanguage, targetLanguage,
                translationSettingsHash, updatedAt
            }
        },
        ocr: {
            [pageNumber]: {
                ocrLanguage, ocrBlocks: [...]
            }
        }
    }
}
```

### Restoration Flow

```
loadPdfFile()
    └── restoreFromCache(documentIdentity)
        ├── pdfCacheManager.loadDocument(documentIdentity)
        ├── For each cached translation:
        │   ├── Find block in session by blockId
        │   ├── Validate sourceTextHash matches
        │   └── Apply translation to session state
        └── For each cached OCR entry:
            ├── Find page session by pageNumber
            └── Set OCR blocks
```

### Bitmap Cache (`PdfBitmapCache`)

**File**: `src/features/pdf-translation/core/PdfBitmapCache.js`

An in-memory LRU cache for rendered `ImageBitmap` objects. Coordinated by `PdfDocumentSession`, not by `PdfRenderer`.

#### Ownership

`PdfDocumentSession` owns the bitmap cache instance. The renderer has no knowledge of caching — it returns bitmaps and the session decides whether to store or retrieve them.

#### Cache Key

```
${documentIdentity}:${pageNumber}:${scale}
```

Each page at a specific scale produces a unique cache entry.

#### LRU Policy

- **Max size**: 64 MB (configurable via `maxSizeBytes`).
- **Eviction**: LRU — least-recently-used entries are evicted first when the cache exceeds the size limit.
- **Size estimation**: 4 bytes per pixel (RGBA). Each entry's size is computed from canvas dimensions at render time.
- **Resource safety**: Evicted and cleared entries have `ImageBitmap.close()` called to release GPU memory.

#### Cache Hit Path

```
PdfPageView.render()
    → PdfDocumentSession.renderPage()
        → bitmapCache.get(documentIdentity, pageNumber, scale)
            → HIT: drawImage() from cached bitmap + text layer
```

No pdf.js call on cache hit. The cached `ImageBitmap` is drawn directly onto the canvas via `ctx.drawImage()`, which is GPU-accelerated.

#### Cache Miss Path

```
PdfPageView.render()
    → PdfDocumentSession.renderPage()
        → bitmapCache.get() → MISS
            → PdfRenderer.renderPage()
                → pdf.js page.render()
                    → Returns {status, bitmap}
                        → bitmapCache.set(documentIdentity, pageNumber, scale, bitmap)
```

The renderer returns a structured result including the bitmap. The session stores it in the cache for subsequent renders of the same page at the same scale.

#### Invalidation

- **`clearPage()`**: Does NOT invalidate the cache. A cleared canvas can be re-rendered from cache.
- **`cleanupDocument()`**: Clears the entire cache (document is being closed).
- **`rebuildPageMetrics()`**: Clears the entire cache (scale factors changed).
- **`destroy()`**: Clears the entire cache and releases all resources.
- **`invalidatePage(pageNumber)`**: Evicts all cache entries for a specific page across all scales and documents.

---

## Page Content Repository (`PdfPageContentRepository`)

**File**: `src/features/pdf-translation/core/PdfPageContentRepository.js`

Owns all page-level content: sessions, hydration, block indexing, OCR mutation, and release lifecycle. `PdfDocumentSession` delegates to this repository via forwarded accessors (`pageSessions`, `_pendingHydrations`, `_blockIndex`).

### Responsibilities

| Concern | Owner Method |
|---------|-------------|
| **Page sessions** | `getPageSession(pageNumber)` — lazy-creates `PdfPageSession` per page |
| **Hydration** | `hydratePageSession(pageNumber)` — fetches PDF page data via `pdfDocument.getPage()`, builds layout blocks |
| **In-flight dedup** | `_pendingHydrations` map — concurrent requests for the same page share one promise |
| **Block index** | `_blockIndex` map (blockId → block) — O(1) lookup across all pages |
| **Bulk retrieval** | `getVisiblePageSessions(pages)`, `getVisibleLogicalBlocks(pages)` — viewport-based queries |
| **OCR mutation** | `setPageOcrBlocks(pageNumber, blocks)` — updates session with OCR-derived blocks, re-indexes |
| **Release** | `releasePageSession(pageNumber)` — removes session from active map, unindexes blocks |
| **Reset** | `reset()` — clears all sessions, pending hydrations, and block index |

### Block Index

The `_blockIndex` is a global `Map<blockId, block>` maintained across all pages. When a page session is hydrated, its blocks are indexed. When a page is released, its blocks are unindexed. This enables O(1) block lookup by ID without scanning page sessions.

---

## Translation State (`PdfTranslationState`)

**File**: `src/features/pdf-translation/core/PdfTranslationState.js`

A pure state container for per-block translation tracking. No external dependencies, no DOM, no Vue reactivity.

### Responsibilities

| Concern | Method |
|---------|--------|
| **State map** | `Map<blockId, TranslationState>` — per-block translation data |
| **Get** | `getBlockTranslationState(blockId)` — returns state or default idle state |
| **Set** | `setBlockTranslationState(blockId, update)` — creates or updates state |
| **Bulk update** | `updateBlockTranslationStates(entries)` — batch update |
| **Reset** | `resetBlockTranslationState(blockId)` — reverts to idle |
| **Analytics** | `hasAnyTranslated()`, `getStats()` — translated/failed/total counts |
| **Iteration** | `entries()`, `values()` — for cache restore and batch processing |
| **Map accessor** | `translationStates` getter/setter — raw map access for session façade |

### Compatibility Façade

`PdfDocumentSession` remains the public façade for translation state. External callers (coordinator, cache restore, export) interact through session methods that delegate to `PdfTranslationState` internally. The `translationStates` getter on the session returns the underlying map, preserving backward compatibility.

### Translation State Shape

```javascript
{
    translatedText: string,
    translatedCells: Map | null,
    status: 'idle' | 'translated' | 'error',
    provider: string,
    sourceLanguage: string,
    targetLanguage: string,
    sourceTextHash: string,
    translatedTextHash: string,
    translationSettingsHash: string,
    error: Error | null
}
```

---

## History Architecture

### History Entry

```javascript
{
    id: string,           // documentIdentity
    fileName: string,
    totalPages: number,
    translatedBlockCount: number,
    translatedPageCount: number,
    provider: string,
    sourceLanguage: string,
    targetLanguage: string,
    lastOpenedAt: number, // timestamp
    lastTranslatedAt: number // timestamp
}
```

### Behavior

- **On file open**: `updateAfterOpen(session)` — creates or updates entry with filename and page count.
- **After translation**: `updateAfterTranslation(session)` — updates with translation stats, provider, languages.
- **Max 100 entries** — oldest entries are evicted when limit is exceeded.
- **Deduplication** by `documentIdentity` — same document updates in place.

---

## Export Architecture

### Pipeline

```
usePdfExport.exportTxt() / exportMarkdown()
    │
    ├── PdfExportCollector.collectTranslatedBlocks()
    │   └── Returns translated blocks sorted by page + readingOrderIndex
    │
    ├── PdfExportFormatter.buildTxtOutput() / buildMarkdownOutput()
    │   ├── Page separators: "--- Page N ---"
    │   ├── Role-based formatting (headings, lists, captions)
    │   └── Document title header
    │
    └── PdfFileDownloader.downloadFile()
        ├── Create Blob with appropriate MIME type
        ├── Generate filename: "{title}_translated.{ext}"
        └── Trigger browser download via anchor click
```

### Export Stats

Reactive via `translationTick`:
- `totalBlocks`, `translatedCount`, `failedCount`
- `totalPages`, `translatedPageCount`
- `isPartial` (not all blocks translated)
- `hasTranslatedBlocks` (at least one block translated)

---

## Block Targeting

### Interactive Selection Mode

When block targeting is active:
1. User moves pointer over the PDF — the nearest block is highlighted.
2. User clicks — the targeted block is set on `pdfDocumentSession`.
3. Targeting mode deactivates.

### Architecture

```
PdfBlockTargetingManager
    ├── activate() / deactivate()
    ├── handlePointerMove({ pageNumber, x, y })
    │   └── PdfBlockTargetAdapter.findBlockAtPoint()
    │       └── Smallest-area block containing point (6px tolerance)
    ├── handleClick({ pageNumber, x, y })
    │   ├── Find block at point
    │   ├── pdfDocumentSession.setTargetedBlock(blockId)
    │   └── Deactivate targeting
    └── getBlockBounds(blockId)
        └── Returns bounding rect for overlay rendering
```

---

## Storage Model

| Storage Key | Manager | Contents | Lifecycle |
|-------------|---------|----------|-----------|
| `pdfDocumentCache` | `PdfCacheManager` | Per-document translations + OCR results | Persists until user clears |
| `pdfTranslationHistory` | `PdfHistoryManager` | Recently opened/translated documents (max 100) | Persists until user clears |

Both use `storageCore` (extension's unified storage API) for persistence across sessions.

---

## Event Flow

### Selection Event Flow

```
Browser selectionchange
    → PdfSelectionBridge.handleSelectionChange()
        → isSelectionInsidePdfTextLayer()
        → buildPdfSelectionPayload()
        → pageEventBus.emit(GLOBAL_SELECTION_CHANGE)
            → usePdfSelectionAction (PDF subscriber)
                → PdfSelectionAction.vue (floating translate button)
                → User clicks → sendRegularMessage() → Background
```

### Translation Event Flow

```
User clicks "Translate Visible"
    → usePdfViewerController.translateVisiblePages()
        → PdfTranslationCoordinator.translateVisibleBlocks()
            → PdfTranslationBatchPlanner.plan()
            → PdfTranslationAdapter.buildTranslationRequest()
            → UnifiedMessaging.sendRegularMessage()
                → Background script → Provider API
            → PdfTranslationAdapter.mapBatchResponse()
            → session.setBlockTranslationState()
            → onStateChange callback
                → translationTick.value++ (Vue reactivity)
                    → PdfTranslatedPane re-renders
```

### OCR Event Flow

```
User clicks "OCR Scanned Pages"
    → usePdfOcr.requestOcr()
        → PdfOcrDetector.detectScannedPages()
        → Show consent prompt
    → User confirms
    → usePdfOcr.confirmOcr()
        → PdfOcrProcessor.processPages()
            → Per page: render → Tesseract.js → create blocks
        → session.setOcrBlocks()
        → pdfCacheManager.saveOcr()
        → onOcrComplete callback
            → translationTick.value++
```

---

## Cross-Feature Dependencies

| External Module | Used By | Purpose |
|----------------|---------|---------|
| `ResourceTracker` | PdfDocumentSession, PdfSelectionBridge, PdfBlockTargetingManager | Memory-safe event listener / timeout tracking |
| `pageEventBus` + `SELECTION_EVENTS` | PdfSelectionBridge, usePdfSelectionAction | Decoupled selection event system |
| `UnifiedMessaging` | PdfTranslationCoordinator, PdfTranslationAdapter, usePdfSelectionAction | Extension message passing to background |
| `storageCore` | PdfCacheManager, PdfHistoryManager | Persistent storage |
| `settingsManager` | PdfSelectionBridge | Reads selection translation mode |
| `recognizeStructured` | PdfOcrProcessor | Tesseract.js OCR engine |
| `toTesseractLanguageCode` | PdfOcrProcessor | Language code mapping |
| `TranslationBatcher` | PdfTranslationBatchPlanner | Intelligent batch chunking |
| `getProviderConfiguration` | PdfTranslationBatchPlanner | Provider limits and optimization |
| Config functions | PdfTranslationCoordinator, usePdfOcr | Provider, language, optimization settings |
| `pdfjs-dist` | pdfjs.js | PDF parsing and rendering |

---

## Major Design Decisions

### 1. Dedicated Viewer vs. Browser-Native Interception

**Decision**: Build a dedicated PDF viewer inside the extension.

**Rationale**: Browser-native PDF viewing varies across browsers, provides limited control over rendering, cannot integrate bilingual side-by-side layout, cannot cache per-block translations, and cannot provide OCR fallback. A dedicated viewer ensures consistent behavior and full feature control.

### 2. Logical Block as Translation Unit

**Decision**: Translate semantic blocks (paragraphs, headings) rather than pages, lines, or words.

**Rationale**: Blocks preserve context for better translation quality, enable per-block caching with stable identity, reduce provider API cost (fewer requests), and support export with structure (headings, lists, captions).

### 3. Custom Text Layer vs. TextLayerBuilder

**Decision**: Replace pdfjs `TextLayerBuilder` with `PdfTextLayerRenderer`.

**Rationale**: `TextLayerBuilder` imports from `pdfjs-dist/web/pdf_viewer.mjs` (~300KB) and requires `pdf_viewer.css` (~160KB). This would leak into the extension bundle and affect non-PDF pages. The custom renderer is ~130 lines with zero external dependencies, provides post-render `scaleX` measurement for sub-pixel accuracy, and integrates directly with the extension's selection event system.

### 4. Visible Pages Only

**Decision**: Only translate pages currently in the viewport.

**Rationale**: Safer for large PDFs (hundreds of pages), lower API cost, faster initial UX, and better memory profile. Full-document translation can be added as an opt-in feature later.

### 5. Source Text Hash Validation for Cache

**Decision**: Validate `sourceTextHash` before restoring cached translations.

**Rationale**: Prevents displaying stale translations if the source PDF is a different version with the same fingerprint. The hash is computed from normalized text content, making it sensitive to actual text changes while tolerant of formatting differences.

### 6. OCR with Explicit User Consent

**Decision**: OCR requires explicit user approval before processing.

**Rationale**: Tesseract.js OCR is slow and resource-intensive. Users should understand the cost (time, CPU) before initiating. The consent prompt explains what will happen and allows cancellation.

### 7. Stable Block Identity via Normalized Coordinates

**Decision**: Block IDs use normalized bounding boxes (0-1 range) rather than absolute PDF coordinates.

**Rationale**: Normalized coordinates are invariant to PDF version differences, viewer zoom levels, and layout analyzer refinements. Combined with text hashes, this ensures cache stability across sessions.

---

## Known Technical Debt

### 1. Text Layer Rotated/Skewed Text Dimensions

The text layer renderer uses viewport diagonal scale factors for font height computation rather than transformed corner bounding boxes. For most PDFs this is accurate, but rotated or heavily skewed text may have minor positioning offsets. **Impact**: Low — affects a small percentage of PDFs with non-standard rotations.

### 2. Scroll Synchronization O(n) Geometry Queries

Scroll synchronization (`usePdfScrollSync`) calls `getBoundingClientRect()` for every page element on each sync trigger via `pdfGeometryModel.getPageGeometries()`. **Impact**: Low — functional for normal use, minor forced layout overhead.

### 3. No Cross-Pane Block Highlighting

No visual correspondence between original and translated blocks. **Impact**: Low — users can match blocks by position, but explicit highlighting would improve clarity.

### 4. Flat Feature Module Structure

The `src/features/pdf-translation/core/` directory is flat (all source and test files in one directory) rather than organized into subdirectories (layout/, translation/, cache/, etc.). **Impact**: Low — manageable at current scale but may need restructuring as the feature grows.

### 5. Fixed ASCENT_RATIO

The text layer uses a constant `ASCENT_RATIO = 0.8` for font ascent computation rather than measuring actual font metrics via canvas. **Impact**: Minor positioning offset for fonts with unusual ascent ratios. Could be improved with optional canvas measurement.

---

## Future Extension Points

### 1. Cross-Pane Block Highlighting

Block IDs are stable and shared between panes. A highlight overlay system (similar to `PdfBlockHighlightOverlay`) could be extended to the translated pane to show correspondence.

### 2. Auto-Translation on Open

The translation pipeline is triggered manually but could be extended to auto-translate visible pages after a configurable delay.

### 3. Full-Document Translation

The batch planner and coordinator already support arbitrary page lists. A "translate all pages" mode could iterate through all pages sequentially.

### 4. Translated PDF Regeneration

The export system currently produces TXT/Markdown. A PDF regeneration pipeline (e.g., using pdf-lib) could overlay translated text onto the original PDF.

### 5. Provider-Specific PDF Optimization

The batch planner already supports per-provider overrides via `modeOverrides[TranslationMode.PDF]`. This can be extended with PDF-specific prompt engineering for AI providers.

### 6. Advanced Table Detection

The layout analyzer currently uses gap-based column detection and role classification. More sophisticated table detection (grid analysis, cell merging) could improve table translation quality.

---

## Architectural Principles

The following principles govern the PDF architecture. They are implementation-oriented, not aspirational — every principle reflects a concrete decision in the codebase.

1. **Rendering policy is separated from rendering execution.** PdfRenderScheduler decides *what* to render. PdfRenderer decides *how* to render. Neither owns both concerns.

2. **Document state is separated from viewer state.** PdfDocumentSession owns document-level state (pages, translations, cache). usePdfRenderPipeline owns viewer-level state (render window, candidates, scheduling). Neither reaches into the other's domain.

3. **Feature layer is framework-agnostic.** The feature layer uses vanilla JS with no Vue reactivity. Composables bridge feature-layer classes to Vue's reactive system via refs and computed properties.

4. **Ownership is explicit.** Every piece of state has a single owner. If a component needs data it doesn't own, it receives it as a dependency or reads it through a public accessor — never reaches into internal structures.

5. **Each subsystem has a single primary responsibility.** PdfBitmapCache stores bitmaps. PdfPageContentRepository manages page content. PdfTranslationState tracks translation status. No subsystem does more than one thing.

6. **PdfRenderer owns rendering only.** It has no scheduling logic, no cleanup timers, no DOM ownership beyond the canvas it renders into. It returns results and lets the caller decide what to do with them.

7. **Scheduling is deterministic and side-effect free.** PdfRenderScheduler receives inputs and produces outputs. It makes no DOM queries, performs no async work, and triggers no side effects.

8. **Bitmap caching is coordinated by the document session, not the renderer.** The renderer returns bitmaps. The session decides whether to cache, retrieve, or invalidate them. The renderer has no knowledge of caching.

9. **Viewer composables orchestrate UI behavior without owning feature state.** usePdfRenderPipeline coordinates between the scheduler and Vue reactivity but does not own page sessions, translation states, or document lifecycle.

10. **Prefer delegation over large monolithic classes.** PdfDocumentSession delegates to PdfPageContentRepository, PdfTranslationState, and PdfBitmapCache. Each delegation is a focused subsystem with its own lifecycle.

---

## Architecture Status

The core PDF architecture is considered stable. The planned architectural decomposition roadmap has been completed — PdfDocumentSession has been decomposed into focused subsystems, the render pipeline has been fully extracted, and ownership boundaries are explicit and enforced.

Future work should prioritize **user-facing features**, **UX improvements**, **bug fixes**, and **measured performance optimizations** rather than additional architectural decomposition. The current structure supports these goals without requiring further restructuring.

Architectural refactoring should only be performed when justified by **new requirements** or **measurable problems** — not as a default mode of improvement. The architecture is not frozen; it is simply no longer a priority for decomposition.

---

**Last Updated**: July 2026
