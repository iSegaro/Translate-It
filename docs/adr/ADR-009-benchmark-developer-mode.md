# ADR-009: Benchmark Developer Mode

## Status

Proposed

---

## Context

Region comparison is a Debug Mode-only PDF developer capability. It reuses canonical region selection, immutable execution requests, and `RegionExecutionDispatcher`; it does not add a parallel OCR path.

It has limited in-product feedback: shared operation progress, a persistent debug-only comparison outcome banner, and explicit JSON artifact export after completion. It has no benchmark page, dashboard, history, settings, or normal-user entry point.

---

## Decision

The Debug toolbar emits developer intent. `PdfApp` owns selection start, comparison operation lifecycle, cancellation command, completed-result retention, and presentation event emission. `PdfDeveloperApi` is the public component-facing boundary to `RegionComparisonCoordinator`.

```text
Debug toolbar
    ↓
PdfApp begins REGION_COMPARISON selection
    ↓
PdfDeveloperApi
    ↓
RegionComparisonCoordinator
    ↓
RegionExecutionDispatcher
    ↓
RegionComparisonRunner
    ↓
RegionComparisonAnalyzer
    ↓
PdfApp
    ├── DomainEvents.comparisonCompleted / comparisonFailed
    │   └── Presentation banner adapter → debug-only PdfStatusBanner outcome
    └── completed result → RegionComparisonArtifactWriter → JSON download
```

### Ownership

| Component | Owns | Does Not Own |
|---|---|---|
| Debug toolbar | Debug Mode-gated comparison intent | Request construction, execution, result analysis |
| `PdfApp` | Selection target, comparison operation lifecycle, cancellation bridge, completion state, presentation events | Runner internals, artifact serialization |
| `PdfDeveloperApi` | Public developer command boundary | UI policy or runner implementation |
| `RegionComparisonCoordinator` | Creates comparison execution request and delegates it | UI state, routing, candidate execution |
| `RegionExecutionDispatcher` | Target routing and operation delegation | Comparison policy, progress, presentation |
| `RegionComparisonRunner` | Candidate execution, progress callbacks, cancellation | UI, result presentation, artifact writing |
| `RegionComparisonAnalyzer` | Winner and metrics analysis | Execution or UI state |
| `RegionComparisonArtifactWriter` | JSON artifact construction | Execution or component presentation |
| Presentation pipeline | Shared activity feedback and debug outcome communication | Comparison lifecycle or cancellation |

### Presentation Boundary

`PdfProgressBar` displays comparison activity and delegates cancellation to `PdfApp.activeProgressCancel`. On a ready result, `PdfApp` emits `comparison-completed`; the Presenter and Banner Adapter build a region-comparison result body. The banner is visible only while Debug Mode is enabled. Failures use the same outcome path. Cancelled comparison does not emit a terminal banner outcome.

The completed result remains in `PdfApp` only long enough to enable `RegionComparisonArtifactWriter` JSON export. Export success or failure is an acknowledgement toast through the presentation pipeline.

---

## Non-goals

- A second region selection or execution pipeline.
- Normal-user comparison access.
- Comparison history, dashboard, page, settings, or window.
- Direct component-to-coordinator calls.
- Moving comparison business logic into the toolbar or presentation layers.

---

## Architectural Invariants

1. Region comparison uses canonical `PdfRegion`, `RegionExecutionRequest`, and `RegionExecutionDispatcher`.
2. `PdfDeveloperApi` is the component-facing developer boundary; components do not call `RegionComparisonCoordinator` directly.
3. Debug toolbar emits intent only.
4. `PdfApp` owns comparison operation retention and cancellation bridging.
5. Presentation communicates comparison progress and outcomes but does not own execution.
6. Artifact writing is explicit and only available for a completed comparison result.
