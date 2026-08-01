# ADR-010: Debug Region Comparison

**Status:** Accepted

**Scope:** Debug-only Region OCR comparison, analysis, artifact export, and feedback boundaries.

---

## Context

Region Comparison evaluates repeated Region OCR executions using defined OCR configurations. It must reuse the production Region OCR path while remaining isolated from normal-user workflows, persistent product state, and execution ownership.

## Decision

Region Comparison is a Debug Mode-only capability that reuses canonical region selection, immutable region execution requests, shared dispatch, and the production `PdfRegionOcrExecutor`. It produces immutable candidate results for analysis and explicit artifact export without creating a parallel OCR pipeline.

## Ownership Domains

Ownership domains define architectural responsibility only. They do not describe runtime execution order. Execution flow is documented separately.

### Application Domain

- `PdfApp` owns Debug Mode-gated workflow start, active comparison retention, cancellation bridging, completed-result retention, artifact-export initiation, and presentation event emission.
- `PdfDeveloperApi` owns the application-facing developer command boundary.

### Execution Domain

- `RegionComparisonCoordinator` owns Region Comparison request construction and delegation to shared dispatch.
- `RegionExecutionDispatcher` owns shared target routing and immediate operation delegation.
- `RegionComparisonRunner` owns candidate sequencing, progress callbacks, and delegated cancellation.
- `PdfRegionOcrExecutor` owns production region rasterization, OCR execution, render-task cancellation, and temporary canvas cleanup.

### Analysis Domain

- `RegionComparisonEvaluator` owns optional ground-truth normalization and metrics after execution.
- `RegionComparisonAnalyzer` owns read-only summary and winner analysis from completed results.
- `RegionComparisonArtifactWriter` owns immutable versioned artifact construction.

### Presentation Domain

- Presentation Pipeline owns activity, outcome, and acknowledgement feedback; `PdfApp` exposes comparison outcomes only while Debug Mode is enabled.
- Presentation Pipeline does not own comparison execution, cancellation, analysis, result retention, or artifact generation.

## Candidate Model

- A Region Comparison candidate is an immutable `candidateId` and immutable OCR configuration.
- Candidate configuration identifies one comparison input, currently render scale; it is not an OCR executor, provider, or mutable runtime state.
- Runtime OCR language MUST NOT participate in candidate identity. It is supplied when the comparison operation starts and recorded with each result.
- `RegionComparisonCandidatePlanner` generates immutable candidates from supplied configurations only.
- Candidate planner MUST NOT select runtime workflow, resolve runtime dependencies, execute OCR, or own comparison lifecycle.

## Execution Lifecycle

```text
Debug Intent → PdfApp → Developer API → Coordinator → Dispatcher → Runner → Production Executor → Evaluation → Analyzer → Completed Result → Artifact Export
```

The evaluator runs after candidate execution and only computes metrics when ground truth is explicitly supplied. The analyzer reads the completed result without changing execution output. Artifact export is available only after a completed comparison result exists.

## Results and Artifacts

- `RegionComparisonRunner` returns an immutable completed-result container containing candidate, result, and summary data.
- `PdfApp` retains a ready result and its canonical region for explicit export.
- `RegionComparisonAnalyzer` reads completed results only and MUST NOT modify execution results.
- `RegionComparisonArtifactWriter` produces an immutable, versioned artifact containing execution metadata, canonical region context, configurations, summary, and results.
- Artifact generation MUST NOT modify comparison execution or completed results.
- `PdfApp` owns explicit JSON download after artifact construction.

## Debug Boundaries

- Region Comparison is available only while Debug Mode is enabled.
- It has no normal-user product surface, comparison history, dashboard, or persistent comparison store.
- It reuses the existing Region OCR selection and execution boundaries.
- It does not create a second OCR pipeline or parallel execution architecture.

## Invariants

- Candidate configuration MUST remain immutable.
- Runtime OCR language MUST NOT participate in candidate identity.
- Region Comparison MUST reuse the production `PdfRegionOcrExecutor`.
- `RegionExecutionDispatcher` MUST remain the shared dispatch boundary.
- Evaluation MUST occur only after candidate execution.
- Ground truth MUST be explicitly supplied for evaluation metrics.
- `RegionComparisonAnalyzer` MUST remain read-only.
- Artifact generation MUST NOT modify execution results.
- Presentation Pipeline MUST NEVER own comparison execution.
- Artifact export MUST require a completed comparison result.

## Rejected Alternatives

### Candidate Model

- Provider metadata or OCR executor instances as candidate identity.
- Mutable candidate configuration or runtime OCR language as candidate identity.
- Candidate planner ownership of execution or workflow selection.

### Execution

- A separate Region OCR executor or second Region OCR pipeline for comparison.
- Direct component-to-coordinator execution that bypasses `PdfApp` and `PdfDeveloperApi`.
- Dispatcher ownership of candidate policy, progress, or runner lifecycle.

### Persistence

- Automatic comparison history or persistent result storage.
- Artifact generation that changes execution or analysis state.

### Product Boundary

- Normal-user Region Comparison access.
- Dashboard, dedicated comparison page, or persistent product settings.

## Consequences

### Positive

- Comparison behavior reuses the production OCR path.
- Immutable candidates and explicit ground truth keep comparison results deterministic.
- Developer tooling remains isolated from normal PDF workflows and persistent product state.

### Negative

- Evaluation metrics require explicitly supplied ground truth.
- Comparison history is not retained by the application.
- Region Comparison is unavailable outside Debug Mode.
