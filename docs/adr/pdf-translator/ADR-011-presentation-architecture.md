# ADR-011: Presentation Architecture

**Status:** Accepted

**Scope:** PDF workflow feedback, presentation state, adapters, and surface boundaries.

---

## Context

PDF workflows must expose progress and outcomes without making presentation a source of business state or workflow ownership. Presentation therefore requires a boundary that converts workflow outcomes into replaceable UI surfaces.

## Decision

PDF workflows emit `DomainEvents` through the Presentation Pipeline. The pipeline derives disposable presentation state and routes it to adapters and surfaces without owning workflow state, execution, or cancellation.

## Ownership Domains

Ownership domains define architectural responsibility only. They do not describe runtime execution order. Execution flow is documented separately.

### Workflow Domain

- `PdfApp` composes feature workflows, owns active cancellation commands, and emits Domain Events.
- Translation, OCR, and export own their business state and completion outcomes.

### Presentation Domain

- Presentation Pipeline owns domain-event presentation, intent creation, surface selection, and disposable banner/progress state.
- Presenter owns wording, severity, and presentation intent.
- Presentation adapters own surface-specific delivery and retained presentation state.

### Surface Domain

- `ProgressIndicator` visualizes activity only.
- Banner displays persistent contextual notifications only.
- Toast displays acknowledgement notifications only.

## Presentation Lifecycle

```text
Workflow → Domain Event → Presentation Pipeline → Presentation Intent → Presentation Adapter → Presentation Surface
```

Domain Events contain workflow data without surface or rendered wording. Presentation converts those events into surface-specific state; surfaces do not call workflows directly.

## Presentation Model

- Presentation derives from Domain Events and owns no business state.
- Presentation MUST remain read-only with respect to workflow state.
- Presentation MUST NOT mutate workflow state, execution state, or cancellation state.
- Presentation state is disposable and may be reset when its workflow context ends.
- Presentation adapters MUST remain replaceable without changing workflow contracts.

## Surface Responsibilities

- `ProgressIndicator` renders workflow activity supplied through the Presentation Pipeline and does not own operation lifecycle.
- Banner renders retained contextual outcome notifications and does not own domain outcomes.
- Toast renders acknowledgement notifications and does not own workflow completion state.

## Translation Outcome Boundary

`translationSummary` remains workflow-owned and is defined in `docs/technical/pdf-translator/pdf-translation-architecture.md`. When a completed translation outcome requires acknowledgement, `PdfApp` emits a Domain Event; Presentation Pipeline maps the event to an acknowledgement toast. Presentation does not read or define the `translationSummary` contract.

## Export Boundary

Presentation acknowledges completed or failed export operations. It MUST NOT derive export readiness, export completeness, or export policy; those remain workflow-owned.

## Invariants

- Presentation MUST remain read-only.
- Presentation MUST NOT own workflow state.
- Presentation MUST derive surface state from Domain Events.
- Presentation adapters MUST remain replaceable.
- Surfaces MUST NOT communicate directly with workflows.
- Presentation dismissal MUST NOT mutate business state.
- Workflow completion MUST precede presentation acknowledgement.
- `PdfApp` MUST retain workflow cancellation ownership; presentation layers MUST NOT cancel work directly.
- Inline component and element states MUST remain owned by their rendering components, not the global Presentation Pipeline.

## Rejected Alternatives

### Ownership

- Presentation components own workflow lifecycle, business state, or cancellation commands.
- Separate presentation-specific workflow state that duplicates feature state.

### Presentation

- Workflows select concrete toast, banner, or progress surfaces directly.
- Surfaces derive presentation from unrelated infrastructure or query workflow internals.

### State

- Banner dismissal mutates domain state.
- Retained presentation state survives beyond its workflow context as product state.

## Consequences

### Positive

- Presentation remains independent from workflow implementation.
- UI surfaces can change through adapters without changing feature contracts.
- Workflow business state and cancellation remain isolated from UI feedback.

### Negative

- Presentation state is transient and cannot replace workflow state.
- Workflows remain responsible for producing complete outcomes before feedback is emitted.
