# ADR-007: Region OCR Execution Lifecycle

**Status:** Accepted

**Scope:** Region OCR interaction, execution, cancellation, presentation, and translation-window handoff.

---

## Context

Region OCR begins with a user-selected rectangle but must execute against canonical PDF geometry. The architecture separates interaction, immutable execution intent, execution, presentation, and translation-window lifecycle so no layer acquires another layer's responsibility.

## Decision

Region OCR uses an immutable live-region request routed through a stateless dispatcher. `PdfApp` owns workflow decisions and outcome routing; execution components own recognition work and cancellation propagation; presentation and translation-window lifecycle begin only after their respective handoffs.

## Ownership Domains

Ownership boundaries describe architectural responsibility only. They do not describe runtime execution order. Execution flow is documented separately.

### Interaction Domain

- `PdfRegionSelectionController` owns pointer interaction, drag lifecycle, and temporary page-local CSS rectangles.
- `PdfRegionMapper` owns CSS-to-PDF conversion and immutable canonical `PdfRegion` creation.
- `PdfApp` owns selection target choice, immutable request construction, workflow start, active cancellation bridging, and outcome routing.

### Execution Domain

- `RegionExecutionDispatcher` owns immutable request routing and immediate operation delegation.
- `usePdfRegionOcr` owns active Region OCR operation identity, stale-result suppression, and delegated cancellation.
- `PdfRegionOcrExecutor` owns canonical-region validation, viewport mapping, region rasterization, recognition execution, render-task cancellation, and temporary canvas cleanup.

### Presentation Domain

- Presentation Pipeline owns global activity, completion, and acknowledgement communication.
- `PdfWindowsHost` owns translation-window lifecycle after successful text handoff.

## Execution Lifecycle

```text
Selection → Canonical PdfRegion → Immutable RegionExecutionRequest → Dispatcher → Runner → Executor → Recognized Text → PdfApp → Presentation or Translation Window
```

Pointer interaction ends before canonical region mapping. Execution ends with a recognition outcome; `PdfApp` routes that outcome either to presentation feedback or, for non-empty recognized text with a captured viewport position, to `PdfWindowsHost`.

## Immutable Request Contract

- `RegionExecutionRequest` is the immutable dispatcher contract for live PDF region execution.
- Every request contains exactly `target`, `scope`, and `region`.
- `scope` is `live-region`; `region` is one frozen canonical `PdfRegion` produced after the ADR-006 mapping boundary.
- The request factory validates target, scope, and canonical region compatibility, and rejects additional metadata.
- The caller constructs a fully decided request before dispatch.
- The contract does not require a base class, inheritance hierarchy, or runtime polymorphic type.

## Dispatch

- Dispatcher receives an immutable request, routes by target, delegates immediately, and returns the runner operation unchanged.
- Dispatcher MUST NOT mutate or enrich a request.
- Dispatcher MUST NOT own geometry, workflow, cancellation, progress, translation windows, or runner lifecycle.
- Selection MUST NOT start OCR or another concrete execution target directly.
- The dispatcher may delegate to another execution target; Debug Region Comparison architecture belongs exclusively to ADR-010.

## Cancellation

- `PdfApp` owns the active cancellation bridge between user intent and the active Region OCR workflow.
- `usePdfRegionOcr` owns run identity, stale-result suppression, and cancellation delegation to its active executor operation.
- `PdfRegionOcrExecutor` owns cancellation of its active PDF render task and returns a cancelled recognition outcome when cancellation is observed.
- Cancellation does not transfer execution, presentation, or translation-window ownership to another domain.

## Progress and Feedback

- `PdfApp` emits activity start and completion events for Region OCR workflow.
- Presentation Pipeline resolves activity into `ProgressIndicator` state and resolves empty-recognition or non-cancelled failure outcomes into acknowledgement events.
- Presentation components MUST NOT perform region selection, geometry conversion, OCR execution, or translation-window lifecycle work.

## Translation Window Handoff

- `PdfApp` owns recognized-text routing.
- `PdfWindowsHost` begins only after `PdfApp` supplies non-empty recognized text and a captured viewport-relative position.
- Translation-window lifecycle does not own Region OCR execution, cancellation, or presentation feedback.

## Invariants

- Selection MUST NOT start OCR directly.
- CSS geometry MUST NOT cross `PdfRegionMapper` into execution or workflow.
- A Region OCR request MUST be immutable and fully decided before dispatch.
- Dispatcher MUST NOT mutate a request or own execution lifecycle.
- Executor MUST NOT mutate `PdfPageSession` or persist Region OCR results.
- `usePdfRegionOcr` MUST own Region OCR run identity and stale-result suppression.
- Presentation Pipeline MUST NOT perform OCR execution.
- Translation windows MUST begin only after successful text handoff from `PdfApp`.

## Rejected Alternatives

### Interaction

- Selection directly starts OCR.
- Selection owns execution target policy or concrete feature routing.
- CSS rectangles pass directly into OCR execution.

### Execution

- OCR, presentation, or translation-window code creates a competing canonical-region contract.
- Region OCR mutates page-session state or persistent OCR cache.

### Dispatcher

- Dispatcher validates feature policy, mutates requests, manages runner lifecycle, or absorbs OCR behavior.
- No dispatcher boundary between canonical selection output and execution runners.

### Cancellation

- Presentation owns execution cancellation.
- Executor owns application run identity or translation-window lifecycle.

## Consequences

### Positive

- Interaction remains independent from OCR and other execution targets.
- Canonical PDF geometry is preserved through immutable execution intent.
- Cancellation, stale-result handling, feedback, and translation-window lifecycle have explicit owners.
- Region OCR remains isolated from page-session and persistent-cache mutation.

### Negative

- Region OCR crosses explicit request, dispatch, workflow, and presentation boundaries before reaching a translation window.
- Callers must construct a valid canonical request before execution can begin.
