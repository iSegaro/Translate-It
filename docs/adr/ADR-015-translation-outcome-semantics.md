# ADR-015: Translation Outcome Semantics

**Status:** Accepted

**Scope:** Translation execution, response validation, outcome semantics, feature application, and presentation across Whole Page, Select Element, PDF, Popup, and Sidepanel.

---

## Context

Translation pipeline currently lets Parser, Provider, Coordinator, batch handlers, feature adapters, and UI independently decide whether an operation succeeded, falls back to source text, is partial, or failed. This loses outcome provenance and makes identical UI states represent materially different results.

Examples in current architecture:

- `AIResponseParser` repairs malformed data and can return original input after parse failure.
- `BaseAIProvider` and `ProviderCoordinator` can replace nonfatal failures with original input.
- Whole Page reports soft batch failure while resolving source text into the DOM.
- Select Element and PDF independently preserve or apply original text for missing structured results.
- UI receives a success/failure shape without durable provenance for parser repair, source substitution, partial output, or provider failover.

Existing error architecture requires providers and core to preserve structured error identity, managers to propagate it, and UI/composables to present it. Existing PDF presentation architecture also establishes that translation outcomes remain workflow-owned while presentation derives read-only state from domain events.

---

## Problem

Current design mixes these independent concerns:

| Concern | Current mixed owners |
|---|---|
| Transport and provider execution | Provider request engine, providers, queue/coordinator |
| Syntax decoding and repair | Parser |
| Response-contract validation | Parser, coordinator, structured handlers, adapters |
| Semantic success and partial completion | Providers, coordinators, features |
| DOM/PDF/view-state mutation | Feature adapters and managers |
| User feedback | Features, composables, error handler |

This creates hidden recovery, inconsistent feature behavior, and no reliable distinction between translated output, original preservation, partial output, cancellation, and failure.

---

## Decision

Adopt one canonical pipeline:

```text
Transport
→ Provider Adapter
→ ResponseParser
→ TranslationContractValidator
→ ValidationResult

Execution Lifecycle
→ ExecutionResult

ValidationResult
+ ExecutionResult
→ TranslationOutcomeAssembler
→ TranslationOutcome
→ Feature Workflow
→ FeatureApplicationResult
→ PresentationModel
→ UI
```

Each boundary passes immutable facts forward. No lower layer may convert unresolved input into successful translated output.

### Domain Boundaries

#### TranslationOperation

`TranslationOperation` is runtime Aggregate Root for one translation request or batch. It is the sole mutable consistency boundary for request lifecycle, execution attempts, cancellation, timeout, validation lifecycle, and diagnostic collection.

It owns:

- Requested translation units.
- Execution attempts.
- Cancellation and timeout lifecycle.
- Provider/key failover execution.
- `ExecutionResult`.
- `ValidationResult`.
- Diagnostic collection.

It does not own:

- DOM mutation.
- PDF state mutation.
- Feature view state.
- Presentation wording or toast/banner selection.

#### TranslationOutcome

`TranslationOutcome` is immutable Value Object, not aggregate root.

It contains:

- `ExecutionResult` summary.
- `TranslationResult`.
- Sanitized `DiagnosticSummary`.

It does not contain raw provider responses, headers, secrets, full stack traces, or parser internals.

#### TranslationResult

`TranslationResult` describes validated translated output only.

```text
R = requestedCount
T = translatedCount
U = unresolvedCount
C = cancelledCount

R = T + U + C
```

| Quality | Rule |
|---|---|
| `COMPLETE` | `R > 0`, `T = R`, `U = 0`, `C = 0` |
| `PARTIAL` | `T > 0`, `T < R` |
| `NONE` | `R > 0`, `T = 0` |

No `TranslationResult` exists when `R = 0`.

#### ExecutionResult

| Status | Meaning |
|---|---|
| `COMPLETED` | Execution reached normal terminal state. |
| `FAILED` | Execution terminated because of transport, provider, timeout, or contract failure. |
| `CANCELLED` | Execution terminated through user, lifecycle, or abort cancellation. |

No-work is represented as:

```text
status: COMPLETED
completionReason: NO_WORK
translationResult: null
```

`SKIPPED` is not top-level outcome. Empty input, unsupported content, same-language policy, filtered nodes, already-translated nodes, and feature preconditions are command validation or work-selection decisions, not successful translations.

#### TranslationUnit

Each requested unit has one immutable disposition:

| Disposition | Meaning |
|---|---|
| `TRANSLATED` | Valid translated output exists. |
| `UNRESOLVED` | No safe translated output exists. |
| `CANCELLED` | Unit was not completed because execution was cancelled. |

Original preservation is feature application state. It is never translated output.

---

## Validation

`TranslationContractValidator` owns response-contract and domain validation:

- Duplicate IDs.
- Missing IDs.
- Unknown IDs.
- Cardinality.
- Ordering under declared mapping strategy.
- Invalid unit content.
- Empty translation for a nonempty source unit.
- Provider content that violates requested translation response contract.

`ResponseParser` owns syntax decoding and repair only:

- JSON decoding.
- Fence and boundary extraction.
- Escaping and limited malformed-JSON repair.
- Parser repair evidence.

`TranslationContractValidator` must never:

- Insert original text.
- Choose semantic success.
- Mutate feature resources.
- Execute providers.

`ValidationResult` is immutable Value Object snapshot. It contains validated units, invalid units, requested/received/valid counts, identity facts, ordering facts, violations, and parser evidence. It preserves source-unit references as diagnostic facts only and never substitutes them as translation output.

---

## Ownership

| Layer | Owns | Must Never Own |
|---|---|---|
| Transport | HTTP/proxy protocol, status, response bytes, abort signal | Translation text, semantic success, feature mutation |
| Provider Adapter | Provider protocol, request construction, response-envelope normalization, provider-specific serialization/deserialization | Retry or failover policy, source substitution, UI state, feature recovery |
| ResponseParser | Decoding, repair, parsed payload, repair evidence | Semantic outcome, source substitution, UI policy |
| TranslationContractValidator | Contract validity and validation facts | Recovery, provider execution, feature mutation |
| TranslationOutcomeAssembler | Deterministic aggregation of execution and validation facts | Parsing, retries, DOM/PDF mutation, presentation |
| TranslationOperation | Runtime lifecycle, attempts, timeout, cancellation, diagnostics | Feature resources and presentation |
| Feature Workflow | DOM/PDF/view-state mutation, rollback, original preservation, partial application | Reclassification of core semantics, provider retry/failover |
| Presentation | Wording, severity, toast/banner/progress surface, acknowledgement state | Workflow mutation, retry, rollback, cancellation |
| UI | Rendering user-safe presentation state | Semantic inference from text or DOM state |

---

## Information Flow

```text
Transport
→ Provider Adapter
→ ResponseParser
→ TranslationContractValidator
→ ValidationResult
→ TranslationOutcomeAssembler
→ TranslationOutcome
→ Feature Workflow
→ FeatureApplicationResult
→ Domain Event
→ PresentationModel
→ UI
```

### Diagnostics

`TranslationDiagnosticReport` is independent immutable Value Object snapshot of workflow evidence.

```text
TranslationOperation owns diagnostic collection during execution.

TranslationDiagnosticReport is an immutable snapshot created from that collection.

Only TranslationDiagnosticReport crosses architectural boundaries.
```

| Information | Owner | Lifetime |
|---|---|---|
| HTTP status and typed failure | Transport/provider | Workflow lifetime; sanitized summary in outcome |
| Retry count and provider/key failover | TranslationOperation | Workflow lifetime; summary in outcome |
| Parser repair evidence | Parser | Validation report and workflow lifetime |
| Duplicate IDs, cardinality, ordering facts | Validator | Validation report and workflow lifetime |
| Raw response, headers, secrets, stack traces | Debug/logging | Ephemeral or telemetry only |
| Original preservation and rollback | Feature workflow | Feature workflow lifetime |
| Applied/rolled-back unit count | Feature workflow | Feature workflow lifetime |

`TranslationOutcome` keeps only sanitized semantic summary:

- `hasParserRepair`
- `hasValidationFailure`
- `terminalReason`
- `retryCount`
- `providerFailoverUsed`

Feature workflows consume `TranslationOutcome`, not full diagnostics. Presentation receives reduced user-safe projection only. UI must never receive raw provider or parser internals.

---

## Feature Application Policy

Whole Page, Select Element, PDF, Popup, and Sidepanel consume same immutable `TranslationOutcome`.

Feature workflows own application policy because they own resources:

| Feature | Resource ownership |
|---|---|
| Whole Page | Page translation session, queued nodes, translated DOM |
| Select Element | Selected subtree, snapshots, revert state |
| PDF | Block/cell session and rendered document state |
| Popup | Translation view state |
| Sidepanel | Translation view state |

Feature workflows may preserve originals, roll back, or apply partial validated units. They produce immutable Value Object snapshot `FeatureApplicationResult` containing applied, preserved-original, and rolled-back counts. It must not change `TranslationOutcome` quality or unit disposition.

---

## Presentation Boundary

Presentation derives a reduced immutable `PresentationModel` from workflow/domain events.

It receives:

- Terminal execution state.
- Translation quality.
- Translated, unresolved, and cancelled counts.
- Sanitized terminal reason.
- Feature application summary.

It does not receive:

- Retry details.
- Duplicate-ID details.
- Parser repair steps.
- Raw transport data.
- Provider/key internals.
- Full validation report.

UI must never infer semantic outcome from source/translated equality, empty text, array length, or DOM mutation result.

---

## Invariants

- Parser never decides semantic success.
- Parser never substitutes source text.
- Parser output is immutable after parsing.
- Provider never invents translated output after failure.
- Execution orchestration never mutates feature resources.
- Validator never performs recovery.
- Validator never repairs parser output.
- Validator never mutates parsed units.
- `ValidationResult` is immutable.
- Outcome assembly is pure and deterministic.
- OutcomeAssembler never parses payload.
- OutcomeAssembler never re-validates payload.
- `COMPLETE` requires valid translated output for every requested unit.
- Original preservation never counts as translated output.
- Original source references remain diagnostic facts only.
- Original source references never become translated output.
- `PARTIAL` exposes translated, unresolved, and cancelled counts.
- Missing, duplicate, unknown, and extra IDs remain observable.
- Transport failure never classifies original, unresolved, or unvalidated output as `TRANSLATED`.
- Execution status remains `FAILED` or `CANCELLED` whenever transport failure terminates execution.
- `TranslationOutcome` is immutable.
- Diagnostics provenance is not silently discarded.
- Feature owns resource mutation.
- `FeatureApplicationResult` never changes `TranslationOutcome`.
- Presentation remains read-only over workflow outcome.
- UI never owns retry, rollback, or cancellation lifecycle.

---

## Alternatives Considered

| Alternative | Rejected Because |
|---|---|
| Parser source-text fallback | Parser becomes semantic policy owner; malformed output becomes hidden success. |
| Provider soft-success fallback | Provider failure becomes invented translated output. |
| Coordinator success with originals | Transport and validation failure become success before feature policy can act. |
| Boolean-only success contract | Cannot represent partial output, unresolved units, cancellation, or provenance. |
| Feature-specific semantic outcome models | Recreates incompatible mode-specific meanings. |
| UI fallback detection through text equality | Same-language and valid identical translations make inference invalid. |
| One God coordinator | Mixes execution, validation, aggregation, feature mutation, and presentation. |

---

## Consequences

### Positive

- One semantic vocabulary across every translation feature.
- Parser compatibility repair remains available without hidden translation success.
- Provider transport behavior cannot redefine semantic success.
- Feature-specific partial application remains possible without changing core semantics.
- UI can render complete, partial, failed, cancelled, and no-work states explicitly.
- Error identity preservation aligns with centralized error-management rules.
- Presentation remains consistent with PDF presentation architecture.

### Negative

- Existing callers that expect raw translated strings or arrays require contract migration.
- Legacy source substitution behavior requires explicit feature application policy.
- More semantic metadata crosses messaging boundaries.
- Existing provider, parser, and feature tests require outcome-matrix coverage.
- Migration temporarily maintains compatibility adapters while old and new contracts coexist.

---

## Migration Roadmap

| Phase | Scope | Expected Improvement | Compatibility Risk | Status |
|---|---|---|---|---|
| 1. ADR only | Accept this decision; no runtime behavior changes | Shared architectural boundary | None | Completed |
| 2. Domain contracts | Introduce contracts without behavior change | Shared vocabulary | Parallel semantic representations | Partially Completed |
| 3. Diagnostics preservation | Preserve parser/provider facts through boundaries without behavior change | Observable provenance | Messaging payload compatibility | Completed |
| 4. Validator and assembler | Introduce `TranslationContractValidator` and `TranslationOutcomeAssembler` without changing observable behavior | Separate validation from aggregation without changing behavior | Parallel contract interpretation | Partially Completed |
| 5. Whole Page adoption | Consume outcome in Page workflow | Explicit partial-page behavior | Existing soft-failure UX | Deferred |
| 6. Select Element adoption | Consume outcome in Select workflow | Explicit subtree application and revert policy | Partial DOM behavior | Deferred |
| 7. PDF adoption | Consume outcome in PDF workflow | Explicit block/cell partial state | Session and renderer state | Deferred |
| 8. Popup and Sidepanel adoption | Consume outcome in view workflows | Consistent direct-translation state | Existing success/error assumptions | Deferred |
| 9. Legacy fallback removal | Remove hidden source substitution | One recovery boundary | Provider and batch compatibility paths | Completed |
| 10. Transport reassessment | Reassess OpenAI-Compatible and LM Studio behavior using preserved diagnostics | Transport policy separated from semantics | Provider-specific compatibility matrix | Deferred |

---

## Implementation Status

A foundational implementation phase delivered the observational and structural groundwork described below. This section records what is implemented versus what is intentionally deferred. The ADR remains the canonical specification for the target architecture.

### Implemented Foundation

- **Domain contracts**: Immutable domain contracts (`TranslationOutcome`, `ExecutionResult`, `TranslationUnit` disposition) have been established as structural contracts; their runtime production remains deferred.
- **Diagnostics preservation**: Parser and execution facts are retained through the pipeline, feeding `TranslationDiagnosticReport` evidence without crossing presentation boundaries.
- **Observational validation foundation**: An internal observation pipeline and a request unit manifest provide deterministic, observation-only validation of request structure without changing observable behavior.
- **Terminal execution routing**: Completed and cancelled execution states currently route through the terminal execution router.
- **Ownership clarification**: Execution strategy is separated from provider/key failover. A format-level re-request within a single execution attempt is execution strategy; provider/key failover remains owned by the operation lifecycle.
- **Cancellation architecture**: Cancellation and timeout flow through exact request identity with a single accepted terminal transition per request.

### Production Improvements

The structured-response recovery path was the first production behavior change delivered by this phase. When a structured batch response violates its contract (unmapped or gap-filled slots, or an unparseable response), the parser reports that structured-response recovery is required, and the provider owns and executes the recovery strategy — re-requesting sequentially. This replaces silent result corruption with an explicit, provider-owned recovery decision. The parser only signals whether recovery is required; it never decides semantic success. This is an interim production improvement, not a phase of the migration roadmap.

#### Completed after the ADR

The behavioral contract is substantially implemented. Subsequent production work, completed after this ADR was written, delivered:

- **Provider silent source substitution removed**: `BaseProvider`/`BaseAIProvider` and `ProviderCoordinator` no longer return original text as a "successful" translation on nonfatal failure; failures are thrown loudly.
- **Parser unresolved slots no longer source-fill**: `AIResponseParser` fills unresolved structured slots with empty placeholders, never original source, on a contract violation.
- **Malformed structured candidates fail or recover explicitly**: a structured-response contract violation triggers exactly one sequential recovery pass (BaseAIProvider, `STRUCTURED_RECOVERY` purpose) or a typed failure.
- **Duplicate identity enforcement**: duplicate logical identities are detected through manifest-aware validation and enforced by `OptimizedJsonHandler`.
- **V2/V3 fragment aggregation**: split V2/V3 fragments are reassembled atomically and out-of-order; no raw fragments reach DOM/PDF/final results.
- **Canonical timeout/cancellation typing**: timeout uses `ErrorTypes.TRANSLATION_TIMEOUT` and cancellation uses `ErrorTypes.USER_CANCELLED`; they remain distinct.
- **Feature-level source preservation**: PDF missing results and subtitle under-return (via `isSkipped`) preserve original presentation without classifying it as translated output.
- **Conversation commit isolation**: `BaseAIProvider` does not commit a conversation candidate after cancellation or timeout, and discards a rejected/conversation-staged candidate during structured recovery.

These changes enforce the ADR's core invariants (no source substitution, no invented translated output, timeout≠cancellation, atomic fragment aggregation) in production, without adopting the canonical `TranslationOutcome` type as the universal result shape.

### Deferred Scope

The following remain **intentionally deferred** to a future initiative named **Translation Outcome Adoption**:

- Full runtime adoption of canonical `TranslationOutcome` (`ValidationResult` runtime integration and `TranslationOutcomeAssembler`) and runtime consumers of assembled outcomes.
- Replacement of existing runtime result shapes (raw strings/arrays, unified coordinator responses) by the ADR model.
- Any adapter migration not currently present in production.

The canonical `TranslationOutcome` model is not yet the universal runtime representation. The robust pipeline described in this ADR remains the target; the deferred initiative will carry these phases as a separate effort without altering this document's architecture.

Runtime adoption should begin only after a concrete `TranslationOutcome` consumer has been defined.

---

## Risks

- Whole Page, Select Element, PDF, and traditional providers currently depend on distinct fallback behavior.
- Structured batch identity and cardinality behavior requires regression characterization before migration.
- Existing UI may treat raw source text as successful translated output.
- Provider compatibility behavior may expose previously hidden invalid-response failures.
- Outcome and diagnostic messaging must remain bounded; raw provider data must never cross presentation boundaries.

---

## Future Work

- Define canonical translation-unit identity and declared mapping strategies.
- Define unit-level error taxonomy and validation reason codes.
- Define feature-specific application policies for partial and cancelled outcomes.
- Define sanitized presentation projections for direct and streamed workflows.

> **Status**: A request unit manifest now provides the foundation for canonical unit identity. Complete adoption of identity and mapping strategies remains deferred to the Translation Outcome Adoption initiative.
