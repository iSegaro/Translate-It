# ADR-008: Execution Request Contracts

## Status

Proposed

---

## Motivation

ADR-007 introduced `RegionExecutionRequest` and request-based dispatch for execution selected from a PDF page. That contract correctly models one canonical `PdfRegion` after the ADR-006 geometry boundary.

Benchmark execution has a separate input domain. It traverses benchmark corpus document and region descriptors under a benchmark run identity. It is not derived from live page selection and must not overload `PdfRegion` with corpus semantics.

The PDF runtime needs one dispatcher-facing execution contract that supports both domains while preserving existing ownership:

- ADR-006 retains canonical `PdfRegion` geometry.
- ASR-002 retains Region OCR interaction, execution, workflow, and presentation boundaries.
- ADR-007 retains request-based dispatch and stateless routing.
- Benchmark runtime retains corpus traversal, result, and artifact responsibilities.

---

## Decision

Introduce `ExecutionRequest` as the conceptual dispatcher contract.

`ExecutionRequest` is an architectural contract, not a required runtime inheritance hierarchy. Concrete request types conform to this contract. The architecture does not require a base class, inheritance, or a runtime-polymorphic object.

Every execution request contains:

- `target`: requested execution target.
- `scope`: input-domain discriminator.
- Exactly one payload compatible with that scope.

`ExecutionRequest` is immutable. The caller constructs a fully decided request. The dispatcher consumes it without mutation or enrichment.

Two concrete request contracts are defined.

### RegionExecutionRequest

`RegionExecutionRequest` represents live PDF region execution only.

- `scope` is `live-region`.
- Requires one canonical immutable `PdfRegion`.
- Is constructed from user selection after ADR-006 mapping.
- Is used by OCR and future live-region execution targets.
- Must never contain benchmark corpus data.

### BenchmarkExecutionRequest

`BenchmarkExecutionRequest` represents corpus benchmark execution only.

- `scope` is `corpus`.
- Contains immutable benchmark execution intent only.
- Benchmark execution intent contains `runId` and `corpus`.
- Must never contain `PdfRegion`.
- Must never contain an `executeRegion` callback.
- Must never contain UI callbacks.
- Must never contain artifact descriptors.
- Must never contain comparison descriptors.

`executeRegion` is a benchmark-runner dependency. Progress callbacks belong to workflow integration. Artifact and comparison descriptors belong to their existing pipelines.

---

## Request Compatibility

| Target | Scope | Required Payload | Invalid Payload | Valid |
|---|---|---|---|---|
| OCR | `live-region` | Canonical `PdfRegion` | Benchmark intent | Yes |
| Benchmark | `corpus` | `runId`, `corpus` | `PdfRegion` | Yes |
| OCR | `corpus` | None | Corpus benchmark intent | No |
| Benchmark | `live-region` | None | Canonical `PdfRegion` | No |
| Future diagnostics | Explicit target-supported scope | Target-defined | Other-scope payload | Future only |
| Future debug | Explicit target-supported scope | Target-defined | Other-scope payload | Future only |

Each execution target defines the scopes it supports. Request construction validates target, scope, and payload compatibility. Target-specific runners defensively validate their required inputs. The dispatcher does not own this policy.

---

## Dispatcher Contract

The dispatcher depends only on the `ExecutionRequest` contract. It is agnostic to concrete request implementations and routes requests without knowledge of request-specific semantics.

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
- Artifact generation.
- Benchmark semantics.
- Selection.
- Geometry.
- Translation-window lifecycle.

The dispatcher returns the selected runner operation unchanged.

---

## Operation Contract

Every runner returns one immutable operation handle containing:

| Field | Meaning |
|---|---|
| `promise` | Resolves to final target-specific result. |
| `cancel()` | Cancels this operation and work delegated by it. |
| `context` | Immutable target-specific execution context. |

`promise`, `cancel()`, and `context` are fixed members of one immutable operation handle. The operation handle must never be mutated after return.

The dispatcher does not await, wrap, retain, cancel, or inspect the operation.

Workflow adapters own active-operation retention, user cancellation commands, stale-result suppression, and application teardown cancellation. Runners own downward cancellation of their delegated work.

---

## Ownership

| Component | Owns | Does Not Own |
|---|---|---|
| Selection | Pointer interaction and page-local CSS rectangle | Benchmark start, corpus data, execution routing |
| PdfRegionMapper | CSS-to-canonical `PdfRegion` conversion | Benchmark intent, execution lifecycle |
| PdfApp | Current execution mode, request construction, command/workflow start decision | Corpus traversal, artifact schemas, runner internals |
| Dispatcher | Target routing, runner lookup, operation delegation | Scope policy, cancellation, progress, artifacts, benchmark semantics |
| OCR runner | Live-region OCR execution and delegated OCR cancellation | Selection, benchmark corpus, translation-window lifecycle |
| Benchmark runner | Corpus run traversal, per-region execution delegation, progress snapshots, downward cancellation | Live selection, UI, geometry mapping, artifact schemas |
| Workflow adapter | Active operation identity, reactive progress bridge, stale-result suppression, app teardown cancellation | Target execution semantics, artifact generation |
| Artifact pipeline | RAW, scored, and comparison artifact construction and validation | UI state, selection, runner lifecycle |
| Toolbar | Presentation and user intent emission | Request construction, runner invocation, dispatch, progress ownership |

---

## Execution Flows

Live OCR begins with selection, crosses the ADR-006 mapping boundary, then creates a `RegionExecutionRequest`. The dispatcher routes the immutable live-region request to an OCR operation. The existing OCR workflow and PDF translation-window pipeline retain their lifecycle and presentation responsibilities.

Corpus Benchmark begins through a dedicated benchmark command or workflow decision in `PdfApp`. It creates a `BenchmarkExecutionRequest` without involving selection. The dispatcher routes the immutable corpus request to a Benchmark operation. Benchmark output flows into existing raw artifact, scoring, and optional comparison pipelines.

One benchmark candidate run is separate from multi-candidate comparison. A Benchmark runner owns one candidate corpus run. Comparison begins only after multiple scored candidate artifacts exist and remains owned by the existing comparison runtime and writer.

---

## Migration

1. Existing callers using `RegionExecutionRequest` remain unaffected. It remains valid as the live-region request contract.
2. `ExecutionRequest` becomes the common conceptual contract accepted by the dispatcher. This is a non-breaking architectural generalization; no existing live-region execution flow changes.
3. Benchmark integration introduces `BenchmarkExecutionRequest` with corpus-only intent.
4. OCR adapts to the common operation handle without moving its lifecycle ownership from the OCR workflow.
5. Benchmark runner returns the common operation handle and delegates artifact work to existing benchmark pipeline components.
6. Benchmark start is introduced as a dedicated `PdfApp` workflow/command path, never as a selection consequence.
7. Comparison remains a separate multi-candidate workflow.

---

## Consequences

### Positive

- Live PDF geometry and corpus benchmark identity remain separate.
- Selection cannot accidentally start corpus benchmarks.
- Dispatcher stays a stateless routing boundary.
- OCR and Benchmark share cancellation-capable operation transport without sharing execution semantics.
- Existing artifact and comparison pipelines retain their validation ownership.
- Future targets can define explicit compatible scopes without changing selection.

### Negative

- Dispatcher callers must choose a scope-specific request contract explicitly.
- Existing Region OCR operation transport needs adaptation before all runners share one handle shape.
- Benchmark launch requires a dedicated command/workflow path rather than reuse of selection flow.

### Risks

- Treating corpus benchmark as live-region execution would corrupt corpus identity and artifact traceability.
- Allowing benchmark callbacks or artifact descriptors into requests would couple caller/UI concerns to benchmark runtime.
- Moving compatibility validation into dispatcher would turn routing into execution policy.

---

## Relationship to Existing Decisions

- **ADR-006:** `PdfRegion` remains canonical geometry for live PDF regions only.
- **ASR-002:** Region OCR workflow, cancellation, and presentation ownership remain unchanged.
- **ADR-007:** Request-based dispatch remains correct. This ADR clarifies that `RegionExecutionRequest` is the live-region specialization, while `ExecutionRequest` is the dispatcher-wide abstraction.
- **PDF Translation Architecture:** `PdfApp` remains feature orchestration; document session and viewer do not gain benchmark command or execution-mode ownership.
