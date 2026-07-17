# ADR-008: Execution Request Contracts

## Status

Proposed

---

## Motivation

ADR-007 introduced `RegionExecutionRequest` and request-based dispatch for execution selected from a PDF page. That contract correctly models one canonical `PdfRegion` after the ADR-006 geometry boundary.

The PDF runtime needs one immutable request contract for Region OCR while preserving existing ownership:

- ADR-006 retains canonical `PdfRegion` geometry.
- ASR-002 retains Region OCR interaction, execution, workflow, and presentation boundaries.
- ADR-007 retains request-based dispatch and stateless routing.

---

## Decision

Use `RegionExecutionRequest` as the dispatcher contract for Region OCR.

The contract is not a required runtime inheritance hierarchy. The architecture does not require a base class, inheritance, or a runtime-polymorphic object.

Every Region OCR request contains:

- `target`: requested execution target.
- `scope`: input-domain discriminator.
- Exactly one payload compatible with that scope.

`RegionExecutionRequest` is immutable. The caller constructs a fully decided request. The dispatcher consumes it without mutation or enrichment.

### RegionExecutionRequest

`RegionExecutionRequest` represents live PDF region execution only.

- `scope` is `live-region`.
- Requires one canonical immutable `PdfRegion`.
- Is constructed from user selection after ADR-006 mapping.
- Is used by OCR.

---

## Request Compatibility

| Target | Scope | Required Payload | Invalid Payload | Valid |
|---|---|---|---|---|
| OCR | `live-region` | Canonical `PdfRegion` | Unsupported target or metadata | Yes |

Request construction validates target, scope, and payload compatibility. The OCR runner defensively validates its required inputs. The dispatcher does not own this policy.

---

## Dispatcher Contract

The dispatcher depends only on the `RegionExecutionRequest` contract and routes Region OCR requests without mutating them.

The dispatcher owns only:

- Target routing.
- Runner lookup.
- Operation delegation.

The dispatcher does not own:

- Scope policy.
- Request mutation or enrichment.
- Runner lifecycle.
- Cancellation.
- Progress.
- Selection.
- Geometry.
- Translation-window lifecycle.

The dispatcher returns the selected runner operation unchanged.

---

## Operation Contract

The OCR runner returns one immutable operation handle containing:

| Field | Meaning |
|---|---|
| `promise` | Resolves to final OCR result. |
| `cancel()` | Cancels this operation and work delegated by it. |
| `context` | Immutable OCR execution context. |

`promise`, `cancel()`, and `context` are fixed members of one immutable operation handle. The operation handle must never be mutated after return.

The dispatcher does not await, wrap, retain, cancel, or inspect the operation.

Workflow adapters own active-operation retention, user cancellation commands, stale-result suppression, and application teardown cancellation. Runners own downward cancellation of their delegated work.

---

## Ownership

| Component | Owns | Does Not Own |
|---|---|---|
| Selection | Pointer interaction and page-local CSS rectangle | Execution routing |
| PdfRegionMapper | CSS-to-canonical `PdfRegion` conversion | Execution lifecycle |
| PdfApp | Current execution mode, request construction, command/workflow start decision | OCR runner internals |
| Dispatcher | Target routing, runner lookup, operation delegation | Scope policy, cancellation, progress |
| OCR runner | Live-region OCR execution and delegated OCR cancellation | Selection, translation-window lifecycle |
| Workflow adapter | Active operation identity, reactive progress bridge, stale-result suppression, app teardown cancellation | OCR execution semantics |
| Toolbar | Presentation and user intent emission | Request construction, runner invocation, dispatch, progress ownership |

---

## Execution Flows

Live OCR begins with selection, crosses the ADR-006 mapping boundary, then creates a `RegionExecutionRequest`. The dispatcher routes the immutable live-region request to an OCR operation. The existing OCR workflow and PDF translation-window pipeline retain their lifecycle and presentation responsibilities.

---

## Migration

1. Existing callers using `RegionExecutionRequest` remain unaffected. It remains valid as the live-region request contract.
2. Dispatcher routing remains limited to `RegionExecutionRequest`.
3. OCR uses the immutable operation handle without moving lifecycle ownership from the OCR workflow.

---

## Consequences

### Positive

- Live PDF geometry remains isolated from Region OCR execution lifecycle.
- Dispatcher stays a stateless routing boundary.
- OCR uses one cancellation-capable operation transport.

### Negative

- Dispatcher callers must construct a canonical `RegionExecutionRequest`.

### Risks

- Moving compatibility validation into dispatcher would turn routing into execution policy.

---

## Relationship to Existing Decisions

- **ADR-006:** `PdfRegion` remains canonical geometry for live PDF regions only.
- **ASR-002:** Region OCR workflow, cancellation, and presentation ownership remain unchanged.
- **ADR-007:** Request-based dispatch remains correct. This ADR defines `RegionExecutionRequest` as the live-region dispatcher contract.
- **PDF Translation Architecture:** `PdfApp` remains feature orchestration; document session and viewer do not gain execution-mode ownership.
