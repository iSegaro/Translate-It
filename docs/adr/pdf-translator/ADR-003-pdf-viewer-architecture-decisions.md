# ADR-003: PDF Document Session and Viewer Lifecycle

**Status:** Accepted

**Scope:** PDF document, viewer, rendering, cache, and page-session lifecycle ownership.

---

## Context

PDF document content is shared by rendering, translation, OCR, selection, export, and other feature consumers. These concerns require clear ownership boundaries so viewer presentation does not control document state and feature consumers do not manage shared page content.

## Decision

The PDF viewer uses document-owned page sessions and caches with viewer-local render scheduling. Page sessions hydrate on render or through document APIs, remain available for the active document lifetime, and are released only when that document is replaced or closed.

## Ownership Domains

Ownership domains define long-term responsibility boundaries between architectural layers. They do not describe runtime execution order or a call hierarchy. A component may collaborate across domains without acquiring another domain's ownership.

### Document Domain

- `PdfDocumentSession` owns active-document lifecycle, document generation, `PdfRenderer`, document cache restoration, and cleanup.
- `PdfPageContentRepository` is the sole production creator of `PdfPageSession` instances. It owns hydration and in-flight hydration deduplication.
- `PdfPageSession` holds hydrated page content, including text, layout, logical blocks, and feature-owned page data.
- `PdfBitmapCache` owns document-scoped rendered bitmap storage and its bounded-memory eviction policy.

### Viewer Domain

- `PdfViewer` owns viewer presentation, viewport observation, canvas and text-layer DOM, and visible-page reporting.
- Each viewer owns one `PdfRenderScheduler`, render window, priority policy, eligibility, and render cancellation decisions.
- The scheduler is pure: it has no DOM, Vue, document-lifetime, page-content, or bitmap-cache ownership.
- Rendering presentation is viewer-owned. `PdfDocumentSession` performs PDF.js rendering through `PdfRenderer` and caches successful bitmap output; the viewer supplies canvas targets and commits visual output.

### Feature Domain

- Translation, OCR, selection, and search consume document content through document APIs.
- Features may own and update only their feature-specific data within a page session.
- Features do not create, destroy, replace, or define the lifecycle of page sessions.

## Page Session Lifecycle

- A page session represents hydrated content for one page of the active document.
- The repository creates at most one committed page session for an active document page.
- Once hydrated, a page session remains available until document replacement, document close, or session destruction.
- There is no intermediate release, eviction, cleanup timer, consumer lease, reference count, or rehydration lifecycle.
- `PdfDocumentSession.cleanupDocument()` resets page sessions, document-scoped caches, document metadata, PDF.js resources, and the object URL.

## Hydration

- Viewer visibility is a viewer signal only; it does not grant the viewer ownership of page-session lifecycle.
- Rendered-page hydration follows this path: viewer visibility → viewer-local scheduler → rendering → `PdfDocumentSession` background hydration.
- `PdfDocumentSession.getPageSession()` and visible-page document APIs provide lazy hydration for non-render-driven access.
- All hydration paths converge in `PdfPageContentRepository`.
- The repository deduplicates concurrent hydration requests for the same page through its pending-hydration registry.
- Consumers may request page content through document APIs, but do not construct page sessions or implement hydration policy.

## Rendering

- Scheduling is viewer-local; shared schedulers and global render queues are not used.
- `PdfRenderer` owns PDF.js render-task tracking and cancellation for supplied page/canvas targets.
- Render scheduling does not own document lifetime, page content, bitmap cache, or cross-viewer coordination.
- In-flight raster deduplication is not introduced. Avoiding narrow cold-cache races would require shared promise, cancellation, error, and synchronization ownership that exceeds its benefit.

## Cache

### Bitmap Cache

- `PdfBitmapCache` stores rendered `ImageBitmap` output by document identity, page number, and scale.
- The cache is document-scoped, bounded by memory, independent of viewer DOM, and cleared during document cleanup or page-metric rebuild.
- Viewer-local bitmap caches and bitmap-cache redesign are not used.

### Persistent OCR Cache

- Persistent OCR data is separate from bitmap storage.
- `PdfDocumentSession` loads a document cache snapshot for the active document and restores compatible OCR data while a page session hydrates.
- Persistent OCR cache data does not own rendering, viewer state, or page-session lifecycle.

## Invariants

- Document domain is sole owner of page-session creation and lifecycle.
- Viewer visibility reports presentation state; it does not define hydration ownership.
- A feature request for page content cannot create a competing page-session model or lifecycle.
- Concurrent hydration requests for one active document page converge on one repository-managed hydration operation.
- Page-session lifetime is independent of viewer mount state and feature ordering.
- Features own only their feature-specific page data; lifecycle ownership remains with the document domain.
- Bitmap storage, persistent OCR data, scheduler state, and viewer DOM MUST remain separate ownership domains.

## Rejected Alternatives

- Shared render scheduler or global render queue.
- Viewer-owned or consumer-owned page-session lifetime.
- Translation-driven or OCR-driven page-session ownership.
- Reference-counted page sessions, consumer leases, cleanup timers, and intermediate release paths.
- Full document hydration on open.
- Per-consumer hydration registries or duplicated hydration strategies.
- Viewer-local bitmap caches or bitmap-cache redesign.
- In-flight raster deduplication.

## Consequences

### Positive

- Shared document content has one lifecycle owner.
- Viewer scheduling remains isolated from document and feature state.
- Rendered and non-rendered page access use the same repository hydration boundary.
- Page-session lifetime has few states and no cleanup/recovery coordination.
- Bitmap and persistent OCR caches remain independently understandable and releasable.

### Negative

- Hydrated page-session data remains in memory for the active document lifetime.
- A page requested outside rendering may incur first-access hydration cost.
- New feature consumers must use document APIs and preserve feature-data ownership boundaries.
