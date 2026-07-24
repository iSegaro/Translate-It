# ASR-002: PDF Region OCR Execution Pipeline

## Status

Accepted

---

## Context

ADR-006 establishes `PdfRegion` as canonical PDF-user-space geometry. Region OCR must keep pointer interaction, geometry conversion, OCR execution, operation lifecycle, global feedback, and translation-window lifecycle separate.

---

## Execution Pipeline

```text
Pointer interaction
    ↓
PdfRegionSelectionController
    ↓ page-local CSS rectangle
PdfRegionMapper
    ↓ canonical PdfRegion
PdfApp
    ↓ immutable RegionExecutionRequest
RegionExecutionDispatcher
    ↓
usePdfRegionOcr
    ↓ cancellable operation
PdfRegionOcrExecutor
    ↓ recognition outcome
PdfApp
    ├── recognized text + captured viewport position → PdfWindowsHost.openTranslation()
    ├── no text / failure → DomainEvents → acknowledgement toast
    └── activity start/completion → DomainEvents → PdfProgressBar
```

---

## Ownership

| Layer | Owns | Does Not Own |
|---|---|---|
| `PdfRegionSelectionController` | Pointer interaction, drag lifecycle, temporary CSS rectangle | PDF conversion, OCR, workflow |
| `PdfRegionMapper` | CSS-to-PDF conversion and normalized immutable `PdfRegion` | Pointer state, OCR, presentation |
| `PdfApp` | Selection target, request construction, activity presentation events, active cancellation command, Region OCR outcome routing | OCR rasterization or recognition |
| `RegionExecutionDispatcher` | Request routing and immediate operation delegation | Request mutation, cancellation policy, progress UI |
| `usePdfRegionOcr` | Active operation, run identity, stale-result suppression, delegated cancellation | Geometry conversion, raster rendering, translation-window lifecycle |
| `PdfRegionOcrExecutor` | Canonical-region validation, viewport mapping, region rasterization, OCR, render-task cancellation, canvas cleanup | UI state, `PageSession` mutation, translation |
| `PdfWindowsHost` | Translation window lifecycle after recognized text handoff | Region selection, OCR execution, Region OCR activity/error presentation |
| Presentation pipeline | Global activity and acknowledgement communication | OCR execution or translation-window lifecycle |

---

## Runtime Contracts

| Boundary | Contract |
|---|---|
| Selection controller → mapper | Page number and page-local CSS rectangle |
| Mapper → `PdfApp` | Immutable canonical `PdfRegion` |
| `PdfApp` → dispatcher | Immutable `RegionExecutionRequest` |
| Dispatcher → `usePdfRegionOcr` | Cancellable execution operation |
| Executor → `usePdfRegionOcr` | Recognition outcome |
| `usePdfRegionOcr` → `PdfApp` | Recognized-text callback and terminal operation result |
| `PdfApp` → Windows Host | Text and captured viewport-relative position |

CSS geometry ends at `PdfRegionMapper`. The executor consumes canonical geometry only. Recognition results remain ephemeral and do not mutate `PageSession` or OCR cache.

---

## Cancellation and Completion

`PdfApp` retains the active Region OCR cancellation command in its shared progress cancellation slot. `PdfProgressBar` requests cancellation through `PdfApp`; `usePdfRegionOcr` invalidates its run identity and propagates cancellation to the executor. Late results are discarded by run identity checks.

On recognition, `PdfApp` opens a translation window only when non-empty text and a captured viewport position are both available. Empty recognition and non-cancelled failure become acknowledgement toasts. Every terminal path clears shared activity presentation.

---

## Architectural Invariants

1. Pointer interaction never invokes OCR execution directly.
2. CSS geometry never crosses `PdfRegionMapper` into execution or workflow.
3. Region execution requests are fully decided and immutable before dispatch.
4. Dispatcher routes and delegates only.
5. Executor consumes canonical `PdfRegion` and never mutates `PageSession` or persists results.
6. `usePdfRegionOcr` owns run identity and stale-result suppression.
7. `PdfApp` owns Region OCR outcome routing and global activity cancellation bridging.
8. Windows Host begins only after recognized text handoff; it does not own Region OCR execution or feedback.
9. Presentation layers never perform recognition or translation-window lifecycle work.
