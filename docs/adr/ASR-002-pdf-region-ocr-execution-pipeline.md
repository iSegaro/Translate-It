# ASR-002: PDF Region OCR Execution Pipeline

## Status

Proposed

---

## Context

ADR-006 establishes PDF user space as the canonical coordinate space for regions. Page-local CSS geometry belongs to interaction, one dedicated mapping component owns conversion, and feature consumers receive canonical `PdfRegion` value objects.

Region OCR crosses interaction, PDF geometry, execution, workflow, and presentation boundaries. This ASR defines ownership across that runtime path. It accepts ADR-006 geometry without redefining its contract or conversion rules.

Names in this document identify architectural roles. Concrete type and module names remain implementation details unless already fixed by existing architecture.

---

## Problem

Without explicit runtime ownership, responsibilities can leak across layers:

- Pointer handling can become coupled to execution.
- Geometry conversion can become embedded in feature workflow.
- Raster rendering can move into presentation code.
- Recognition can become coupled to result presentation.
- Translation lifecycle can leak into rendering.
- Cancellation and stale-result handling can lack a single authority.

The pipeline needs narrow contracts so each layer owns one runtime responsibility and delegates the next step without reaching across boundaries.

---

## Execution Pipeline

```text
Pointer interaction
    ↓

Region selection controller
owns pointer interaction
    ↓ page-local CSS rectangle

Dedicated region mapping component
owns CSS-to-PDF mapping per ADR-006
    ↓ PdfRegion

Dedicated Region OCR execution component
owns execution
    ↓ recognition outcome

Region OCR workflow
owns operation lifecycle and result handoff
    ↓ translation request

PDF windows host
owns translation lifecycle and presentation
```

The pipeline is sequential. Each layer consumes the contract from the layer above and emits only the contract required by the layer below.

---

## Runtime Contracts

| Boundary | Contract |
|----------|----------|
| Selection controller → mapping component | Page number and page-local CSS rectangle |
| Mapping component → dedicated execution component | Canonical `PdfRegion` |
| Dedicated execution component → workflow | Recognition outcome |
| Workflow → PDF windows host | Translation request |
| PDF windows host → presentation | Window lifecycle state |

CSS geometry ends at the mapping boundary. Canonical geometry ends at the dedicated execution-component boundary unless another feature-specific consumer legitimately requires the region. Execution details do not cross into workflow or presentation contracts.

---

## Ownership

### Region Selection Controller

Owns the interaction responsibility:

- Pointer interaction
- Drag lifecycle
- Escape handling
- Pointer cancellation
- Overlay state
- Page-local CSS rectangle

Does not own:

- PDF geometry
- Recognition
- Rendering
- Feature workflow
- Translation

### Dedicated Region Mapping Component

Owns the geometry-mapping responsibility established by ADR-006:

- Page-local CSS rectangle input
- Current viewport input
- CSS-to-PDF conversion
- Region normalization
- Canonical `PdfRegion` creation

Does not own:

- Pointer state
- Recognition
- Rendering
- Feature workflow
- Translation

### Dedicated Region OCR Execution Component

Owns the execution responsibility:

- `PdfRegion` consumption
- Execution viewport creation
- Region-sized raster rendering
- pdf.js render transform
- Render-task lifecycle
- Execution cancellation
- Recognition invocation
- Canvas cleanup

Does not own:

- Pointer interaction
- UI state
- Feature workflow
- Translation
- `PageSession` mutation

### Region OCR Workflow

Owns the feature-operation responsibility:

- Feature workflow
- Operation lifecycle
- Run identity
- Stale-result suppression
- User-facing cancellation
- Execution-component coordination
- Result handoff

Does not own:

- Pointer interaction
- Geometry conversion
- Raster rendering
- Translation-window lifecycle

### PDF Windows Host

Owns the presentation responsibility:

- Loading window
- Translation request
- Translation lifecycle
- Result presentation

Does not own:

- Recognition
- Geometry conversion
- Raster rendering
- Region OCR workflow

---

## Architectural Invariants

1. Pointer interaction never reaches Region OCR execution directly.
2. CSS geometry never reaches feature workflow.
3. Feature workflow never performs geometry conversion.
4. The dedicated execution component consumes canonical `PdfRegion` only.
5. The dedicated execution component never mutates `PageSession`.
6. The dedicated execution component never persists recognition results.
7. The workflow never performs raster rendering.
8. Presentation never performs recognition.
9. Each layer owns exactly one runtime responsibility.
10. Cancellation commands propagate downward only, from the current owner to work it delegated.
11. The workflow owns run identity and discards late results from cancelled or superseded operations.
12. No layer bypasses an intermediate contract to invoke a lower layer directly.
13. Concrete implementation names do not change these ownership boundaries.

---

## Consequences

### Positive

- Interaction, geometry, execution, workflow, and presentation can evolve independently.
- Canonical geometry remains outside feature workflow and execution policy.
- Execution remains testable without pointer or presentation state.
- Workflow has one authority for cancellation, supersession, and stale results.
- Presentation reuses its existing translation lifecycle without owning upstream work.
- `PageSession` remains unaffected by ephemeral region execution.

### Negative

- The runtime path contains several explicit handoff boundaries.
- Cancellation requires cooperation between workflow and delegated execution.
- A result may complete after cancellation and must still be rejected by workflow identity checks.

### Trade-offs

The architecture favors explicit ownership over a shorter call path. A single controller could perform mapping, rendering, recognition, and presentation with fewer modules, but it would couple responsibilities with independent change drivers and make cancellation ownership ambiguous.

The pipeline does not require a general orchestration framework. Direct delegation between adjacent owners is sufficient as long as contracts and invariants remain intact.

---

## Non-goals

This ASR does not define:

- OCR Recommendation
- Region caching
- Annotations
- Multi-page region execution
- Recognition quality policy
- Scale policy
- Memory policy
- Toolbar UX
- Provider policy
- Canonical region geometry or conversion rules

---

## Relationship to Existing Architecture

- **ADR-003:** Preserves viewer ownership of interaction and presentation resources while keeping document concerns outside viewer-local execution state.
- **ADR-004:** Preserves document ownership of `PageSession` lifecycle. Region execution neither owns nor mutates `PageSession`.
- **ADR-005:** Keeps explicit Region OCR independent from OCR Recommendation. The execution pipeline does not pass through recommendation policy.
- **ADR-006:** Supplies the canonical `PdfRegion` contract and dedicated mapping ownership. This ASR begins execution ownership only after that mapping boundary.
- **Existing PDF windows host:** Retains ownership of translation lifecycle and result presentation. Upstream Region OCR layers hand off text without absorbing presentation responsibility.

---

## Future Compatibility

Execution internals may change without moving ownership across boundaries. The dedicated execution component may evolve its internal rendering or recognition mechanisms while continuing to consume `PdfRegion` and return a recognition outcome. The workflow may evolve operation coordination while remaining independent of geometry and rasterization. Presentation may evolve its window lifecycle while remaining independent of recognition.

Future consumers of `PdfRegion` do not need to depend on the Region OCR pipeline. ADR-006 remains the shared geometry authority; this ASR governs only the Region OCR runtime path.
