# ADR-007: Region Execution Dispatcher

## Status

Proposed

---

## Context

ADR-006 establishes `PdfRegion` as canonical geometry. ASR-002 defines Region OCR execution ownership after that mapping boundary. `PDF_TRANSLATION_ARCHITECTURE.md` keeps translation window ownership separate from selection and execution.

Current production already has:

- Region Selection
- `PdfRegionMapper`
- `PdfRegion`
- Region OCR execution pipeline
- Translation window pipeline

Benchmark infrastructure is also complete:

- Runner
- RAW artifacts
- `SCORED_RESULT`
- `COMPARISON_RESULT`

Next step is exposing execution through UX without coupling selection to any concrete execution path.

---

## Problem

Region Selection should not know whether the selected region will be used for:

- OCR
- Benchmark
- future execution modes

If selection starts concrete features directly, selection becomes a control point for business logic and execution policy. That creates several risks:

- selection code starts owning feature routing
- OCR and benchmark logic leak into interaction code
- future execution modes require selection changes
- ownership of execution target choice becomes unclear
- feature coupling expands every time a new mode is added

The architecture needs a narrow orchestration layer between canonical region input and concrete execution flows.

---

## Decision

Introduce a lightweight Region Execution Dispatcher.

The dispatcher owns only:

- receiving a `RegionExecutionRequest`
- routing the request to the requested execution runner
- delegating execution

The dispatcher does not own:

- selection
- geometry
- OCR
- benchmark logic
- translation window lifecycle
- rendering
- artifact generation

This creates a small dependency-inversion boundary between request construction and execution.

---

## RegionExecutionRequest

`RegionExecutionRequest` is the architectural contract that carries one fully-decided execution request from the caller into the dispatcher.

It conceptually contains at least:
The dispatcher consumes the request but never mutates or enriches it.

- `region`: canonical `PdfRegion`
- `target`: execution target
- optional future metadata or options

It does not define implementation details and it does not imply a concrete class.

---

## Execution Targets

Initially support:

- OCR execution
- Benchmark execution

Future targets may include:

- Debug execution
- Visual diagnostics

The dispatcher should accept new targets without requiring Region Selection changes.

---

## Architecture

```text
Pointer
  ↓
Selection Controller
  ↓
PdfRegionMapper
  ↓
PdfRegion
  ↓
RegionExecutionRequest
  ↓
Region Execution Dispatcher
  ↓
Execution Runner
```

The dispatcher is an orchestration layer only. It routes a fully-decided request to the requested execution runner and delegates immediately.

---

## Design Principles

1. Small orchestration layer.
2. No business logic.
3. No geometry logic.
4. No benchmark logic.
5. No OCR logic.
6. Dependency inversion.
7. Easy future extension.

The dispatcher exists to preserve ownership boundaries, not to add a new feature framework.

---

## Ownership

### Selection Controller

Owns pointer interaction and region capture only. It does not own execution behavior.

### PdfRegionMapper

Owns CSS-to-`PdfRegion` conversion only.

### Region Execution Dispatcher

Owns request routing and delegation only.

### OCR Runner

Owns OCR execution only.

### Benchmark Runner

Owns benchmark execution only.

### Translation Window Pipeline

Owns translation lifecycle and presentation only.

---

## Alternatives Considered

### 1. Selection Directly Starts OCR

**Rejected.** This couples selection to one execution path and makes OCR a selection concern.

### 2. Selection Knows Benchmark

**Rejected.** This spreads execution policy into interaction code and forces selection changes for every new mode.

### 3. Dispatcher Layer

**Accepted.** This keeps selection narrow, keeps execution routing explicit, and allows new targets without changing Region Selection.

---

## Decision Rationale

Dispatcher minimizes coupling by separating region capture from execution routing.

Selection stays focused on user interaction. `PdfRegion` stays focused on canonical geometry. `RegionExecutionRequest` carries execution intent from the caller that already made the execution decision. Concrete runners stay focused on their own execution domains. The dispatcher is the smallest layer that can route between them without collapsing ownership boundaries.

This preserves clean architecture because execution policy belongs to the caller that constructs `RegionExecutionRequest`, while the dispatcher owns routing only. Region capture, OCR, and benchmark logic remain independent.

---

## Consequences

### Positive

- Region Selection remains free of concrete feature knowledge.
- OCR and benchmark execution share one narrow routing boundary.
- Future execution modes can be added without changing selection.
- Ownership stays explicit and testable.
- Dependency direction remains clear.

### Negative

- One more orchestration step in the runtime path.
- Execution now passes through a dispatcher before reaching a runner.

### Trade-offs

The architecture favors explicit routing over direct calls. A direct selection-to-feature path would be shorter, but it would couple interaction code to concrete execution behavior and make future extension expensive.

---

## Migration Plan

1. Selection creates canonical `PdfRegion`.
2. UI or caller creates `RegionExecutionRequest`.
3. Dispatcher routes request.
4. Runner executes request.
5. Add future execution targets only behind dispatcher routing.

Migration should be incremental. Existing selection and execution ownership should remain intact during the transition.

---

## Relationship to Existing Architecture

- **ADR-006:** Supplies canonical `PdfRegion`. Dispatcher consumes it and never reintroduces CSS geometry.
- **ASR-002:** Preserves execution ownership. Dispatcher sits before execution components and does not absorb OCR or benchmark behavior.
- **`PDF_TRANSLATION_ARCHITECTURE.md`:** Preserves translation window ownership. Dispatcher routes execution and does not take over presentation lifecycle.

---

## Future Compatibility

The dispatcher can route additional execution targets without altering selection or geometry contracts. New modes should be introduced as new execution targets behind the same boundary, not by expanding Region Selection into a feature router.
