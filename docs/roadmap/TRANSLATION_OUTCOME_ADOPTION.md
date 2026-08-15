# Translation Outcome Adoption (Project B)

This document defines the boundary between the completed **Translation Pipeline Foundation** (Project A) and the future **Translation Outcome Adoption** initiative (Project B). It is a roadmap and project-boundary document, not an implementation plan and not an ADR. The architectural source of truth remains [ADR-015: Translation Outcome Semantics](../adr/ADR-015-translation-outcome-semantics.md).

## 1. Purpose

The translation pipeline refactor is split into two intentionally separate initiatives:

- **Completed Translation Pipeline Foundation (Project A)** — established the structural and observational architecture described in ADR-015 without changing observable runtime behavior (except structured-response recovery).
- **Translation Outcome Adoption (Project B)** — will produce and consume `TranslationOutcome` at runtime and migrate features onto the outcome pipeline.

This separation is intentional: it keeps architectural refactoring independent from feature migration. The foundation can be reviewed, validated, and stabilized on its own, while feature adoption proceeds only when there is a concrete reason to consume the outcome at runtime.

## 2. What Project A Delivered

The completed foundation covers:

- **Terminal execution routing** — completed and cancelled execution states route through the terminal execution router.
- **Cancellation architecture** — cancellation and timeout flow through exact request identity with a single accepted terminal transition per request.
- **Request unit manifest** — a deterministic manifest of a request's translation units, used as the structural reference for observation-only validation.
- **Observational validation foundation** — request structure is validated observationally without altering execution or observable behavior.
- **Diagnostics preservation** — parser and execution facts are retained across execution boundaries, feeding diagnostic report evidence.
- **`TranslationOutcome` domain contracts** — immutable domain contracts established as structural contracts; runtime production remains deferred.
- **Structured-response recovery** — the parser reports whether structured-response recovery is required; the provider owns the recovery strategy.

These changes either establish architecture or improve correctness. Only **structured-response recovery** changes observable runtime behavior.

## 3. Why Project A Stops Here

There is currently no runtime consumer for `TranslationOutcome`.

Producing `TranslationOutcome` at runtime without a consumer would create a **write-only artifact**: it would be produced, carried across execution boundaries, and discarded. Such artifacts increase maintenance cost without providing observable value and violate the project's YAGNI principle.

The foundation stops at the point where everything built is either architecture or correctness — nothing is produced solely to be produced.

## 4. Project B Goal

Runtime adoption should begin only after a concrete `TranslationOutcome` consumer has been defined.

Project B begins at that point. Possible consumers include:

- History enrichment
- Export
- Analytics
- Debug serialization
- Messaging
- UI

These are examples, not commitments. Any concrete consumer is a sufficient trigger; none are pre-selected.

## 5. Scope

Project B owns:

- `TranslationOutcome` runtime production
- `TranslationOutcomeAssembler`
- `ValidationResult` runtime integration
- Runtime consumers of assembled outcomes
- Feature adoption (Whole Page, Select Element, PDF, Popup, Sidepanel)
- Legacy fallback removal

None of these belong to the completed Translation Pipeline Foundation. Everything in this scope is deferred work of the canonical pipeline defined in ADR-015.

## 6. Preconditions

Project B must not begin until:

1. A concrete runtime consumer has been identified.
2. The consumer is defined before runtime wiring.
3. Runtime wiring follows the consumer.

**Consumer first. Infrastructure second.** The consumer definition drives what the outcome and validator runtime must expose; wiring produced before a consumer would recreate the write-only-artifact problem this boundary is designed to prevent.

## 7. Non-goals

Project B is NOT intended to:

- redesign the translation pipeline
- revisit cancellation
- revisit routing
- redesign diagnostics
- change provider architecture

Those belong to Project A and are complete. Project B consumes the foundation; it does not rebuild it.

## 8. Suggested Adoption Order

A possible future order, for guidance only — not a commitment:

1. **Consumer definition** — identify and specify the first concrete `TranslationOutcome` consumer.
2. **Runtime wiring** — produce and route `TranslationOutcome` for that consumer.
3. **Feature adoption** — migrate features onto the outcome pipeline feature by feature.
4. **Legacy cleanup** — remove legacy fallback paths once adoption is complete.

## 9. Relationship with ADR-015

ADR-015 remains the architectural source of truth. It defines the canonical pipeline, domain boundaries, invariants, and the deferred phases.

This document explains the execution strategy for the deferred half of ADR-015: it records why the remaining phases are deferred, what must happen before they resume, and which scope belongs to Project B. It must not redefine ADR-015. Where this document and ADR-015 would differ, ADR-015 prevails.

This document exists solely to describe the execution strategy and project boundary for the deferred work.
