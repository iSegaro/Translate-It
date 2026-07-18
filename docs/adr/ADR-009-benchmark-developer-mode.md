# ADR-009: Benchmark Developer Mode

## Status

Proposed

---

## Context

The PDF Viewer already supports Region OCR through a canonical execution path:

```text
User selection
    ↓
PdfViewer
    ↓
PdfApp
    ↓
RegionExecutionRequest
    ↓
RegionExecutionDispatcher
    ↓
OCR runner
```

ADR-006 establishes `PdfRegion` as canonical PDF-domain geometry. ADR-007 establishes `RegionExecutionDispatcher` as the routing boundary between a fully decided request and an execution runner. ASR-002 establishes Region OCR execution, workflow, and presentation ownership.

Region Benchmark evaluates execution against internal benchmark inputs and produces canonical benchmark comparison artifacts. It is an engineering and diagnostic capability, not an end-user PDF feature. Exposing benchmark controls, configuration, history, or result presentation in the normal product UI would add product surface without serving a normal translation or OCR workflow.

The architecture needs a developer-only entry point that reuses the established Region Execution path without coupling Developer UI to benchmark business logic.

---

## Decision

Introduce Benchmark Developer Mode as a developer-only capability available only when Debug Mode is enabled.

Its UI entry point is:

```text
☰
└── Developer
    └── Region Benchmark
```

The Developer menu is a general-purpose trigger container. It emits developer intent only and contains no Benchmark business logic.

All Benchmark operations cross one public developer boundary:

```text
Developer menu
    ↓
PdfDeveloperApi
    ↓
BenchmarkCoordinator
    ↓
RegionExecutionDispatcher
    ↓
Benchmark runner
    ↓
Canonical Benchmark result
    ↓
ComparisonArtifactWriter
```

Benchmark reuses `RegionExecutionDispatcher`; it does not introduce a parallel selection, request, routing, or execution architecture. Benchmark results use the canonical benchmark schema and are written through `ComparisonArtifactWriter`.

Components must never communicate directly with `BenchmarkCoordinator`. `PdfDeveloperApi` is the only stable public developer entry point for Benchmark operations. Coordinators are internal implementation details and must not become component-facing APIs.

---

## Developer Capability Model

Benchmark is the first implementation of a reusable Developer Capability architecture. Developer UI reaches existing architecture through one stable public boundary:

```text
Developer UI
    ↓
PdfDeveloperApi
    ↓
Capability Coordinator
    ↓
Existing Architecture
```

Benchmark specializes that model without changing Region Execution ownership:

```text
Developer menu
    ↓
PdfDeveloperApi
    ↓
BenchmarkCoordinator
    ↓
RegionExecutionDispatcher
    ↓
Benchmark runner
```

Future developer capabilities, including Diagnostics, OCR Trace, Session Inspector, Region Inspector, and Performance Metrics, should use this same UI-to-public-API boundary. The Developer menu remains a generic trigger container rather than becoming Benchmark-specific.

---

## Ownership

```text
Developer menu
owns Debug Mode-gated developer intent
    ↓

PdfDeveloperApi
owns public developer command boundary
    ↓

BenchmarkCoordinator
owns benchmark workflow coordination
    ↓

RegionExecutionDispatcher
owns target routing and operation delegation
    ↓

Benchmark runner
owns benchmark execution
    ↓

Canonical Benchmark result
returned to caller
    ↓

ComparisonArtifactWriter
owns canonical comparison artifact output
```

This flow does not alter Region OCR ownership:

```text
PdfViewer → PdfApp → RegionExecutionRequest → RegionExecutionDispatcher → OCR runner
```

### Developer Menu

Owns Debug Mode-gated discovery and user intent emission only. It does not own Benchmark configuration, execution, result interpretation, artifact creation, or runner invocation.

### PdfDeveloperApi

Owns the public API boundary for developer capabilities exposed to components. It accepts a developer command and delegates to the appropriate capability coordinator. It does not contain Benchmark workflow logic or UI policy.

### BenchmarkCoordinator

Owns Benchmark workflow coordination: transforming a public developer command into a fully decided Benchmark execution request and returning canonical Benchmark results. It does not own component UI, selection interaction, dispatcher routing, benchmark-runner internals, or artifact writing.

### RegionExecutionDispatcher

Owns request routing, runner lookup, and immediate operation delegation as defined by ADR-007. It does not own Benchmark policy, result schema, artifact writing, progress, or UI state.

### Benchmark Runner

Owns Benchmark execution only. It does not own developer UI, menu visibility, request routing, or artifact persistence.

### ComparisonArtifactWriter

Owns writing canonical benchmark results. It does not own Benchmark execution or component presentation.

---

## Responsibilities

| Component | Owns | Does Not Own |
|---|---|---|
| Developer menu | Debug Mode-gated entry and intent emission | Benchmark logic or execution |
| `PdfDeveloperApi` | Public developer API | Component UI or benchmark workflow |
| `BenchmarkCoordinator` | Benchmark workflow coordination and canonical result return | Selection, dispatcher routing, runner internals, or artifact writing |
| `RegionExecutionDispatcher` | Target routing and operation delegation | Benchmark logic, artifacts, or presentation |
| Benchmark runner | Benchmark execution | UI, routing, or artifact writing |
| `ComparisonArtifactWriter` | Canonical benchmark artifact output | Execution or UI |

---

## Public API Boundary

`PdfDeveloperApi` is the only stable public developer entry point for component-initiated Benchmark operations.

```text
Component → PdfDeveloperApi → BenchmarkCoordinator
```

Components, including the Developer menu, must not import, instantiate, retain, or invoke `BenchmarkCoordinator` directly. Coordinators are internal implementation details, not component-facing APIs. This keeps the menu reusable for future developer capabilities and prevents component-level coupling to Benchmark workflow details.

The API boundary is developer-only. It is available only while Debug Mode is enabled and must not become a normal-user feature API.

---

## UI Boundary

The Developer menu is visible only when Debug Mode is enabled. `Region Benchmark` is its Benchmark trigger.

Benchmark intentionally has no:

- Progress Dialog
- Benchmark Window
- Benchmark Page
- Dashboard
- Settings UI
- History UI

Benchmark output is an internal canonical comparison artifact, not an end-user presentation model. Benchmark execution must not add UI ownership to `PdfViewer`, `PdfApp`, the Developer menu, or the PDF windows host.

The Developer menu remains a general-purpose container for future developer tools, including Diagnostics, OCR Trace, Session Inspector, Region Inspector, and Performance Metrics.

---

## Non-goals

This ADR does not define:

- a new Region selection mechanism
- a second Region execution pipeline
- changes to canonical `PdfRegion` geometry
- changes to Region OCR execution, cancellation, workflow, or presentation
- Benchmark progress presentation
- Benchmark configuration or settings
- Benchmark history, dashboard, or end-user result UI
- direct component-to-coordinator communication
- normal-user access to Benchmark capabilities

---

## Alternatives Considered

### Add Benchmark Directly to PdfViewer or PdfApp

**Rejected.** Benchmark workflow would become coupled to PDF presentation components and bypass the required public developer API boundary.

### Put Benchmark Business Logic in Developer Menu

**Rejected.** The menu is a reusable developer-tool entry point. Embedding Benchmark coordination would make it Benchmark-specific and prevent future tools from sharing a narrow trigger boundary.

### Create a Separate Benchmark Execution Pipeline

**Rejected.** ADR-007 already provides target-based execution routing. A second pipeline would duplicate request and dispatch responsibilities, allowing benchmark behavior to drift from Region execution architecture.

### Expose Benchmark as a Normal Product Feature

**Rejected.** Benchmark produces internal engineering artifacts rather than value required by normal PDF translation or OCR workflows. Product UI would add unsupported configuration, progress, result, and history expectations.

### Add Benchmark Window, Page, or Dashboard

**Rejected.** Canonical artifacts provide the required output boundary. Dedicated presentation surfaces are not currently required and would introduce UI lifecycle, navigation, and retention ownership without a validated need.

---

## Consequences

### Positive

- Benchmark reuses canonical geometry, request, and dispatch boundaries.
- Developer UI stays decoupled from Benchmark business logic.
- `PdfDeveloperApi` gives all component callers one stable public boundary.
- Canonical benchmark results have one artifact-writing path.
- Normal users do not receive unsupported developer workflow UI.
- Future developer tools can reuse the Developer menu without inheriting Benchmark dependencies.

### Negative

- Benchmark invocation adds explicit API and coordination boundaries before execution.
- Debug Mode is required to discover and trigger Benchmark.
- Benchmark output has no in-product dashboard or history surface.

### Trade-offs

The architecture favors explicit developer boundaries over a shorter direct UI-to-runner path. The extra delegation preserves existing Region execution ownership and prevents internal evaluation tooling from becoming a product feature by accident.

---

## Relationship to Existing Architecture

- **ADR-006:** Benchmark consumes canonical `PdfRegion` where applicable and never introduces presentation-dependent geometry.
- **ADR-007:** Benchmark execution uses `RegionExecutionRequest` and `RegionExecutionDispatcher`; dispatcher ownership remains routing and delegation only.
- **ASR-002:** Region OCR interaction, execution, workflow, cancellation, and presentation ownership remain unchanged. Benchmark does not bypass or replace the established Region execution boundaries.
- **ADR-008:** Request contracts remain immutable and caller-decided. Benchmark coordination constructs its request before dispatch; the dispatcher does not mutate or enrich it.

---

## Future Compatibility

Future developer capabilities must use the same menu-to-public-API boundary where they need component access. They may introduce their own coordinators and runners without placing business logic in the Developer menu.

Any future request for Benchmark progress, result presentation, settings, history, or normal-user access requires a separate architecture decision. Those concerns must not be introduced implicitly through this developer capability.
