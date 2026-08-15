# Select Element — Non-Blocking Backlog

The following items were identified during the Select Element hardening and closeout review.

These items are **not current correctness or release blockers**. They are deferred UX improvements, cleanup tasks, contract debt, or future architectural work.

---

## UX Debt

### SE-BL-01 — Repeated Activation Behavior

**Type:** UX  
**Priority:** Low

Select Element activation does not currently define a clear toggle or repeated-activation behavior when the mode is already active.

**Future work:**
- Define the expected product behavior for repeated activation.
- Decide whether repeated activation should toggle the mode off, restart selection, or remain a no-op.
- Keep behavior consistent across popup, sidepanel, FAB, command, and iframe activation paths.

---

### SE-BL-02 — Activation Callers May Ignore `success: false`

**Type:** UX  
**Priority:** Medium

Activation responses are now sanitized and safe, but some callers such as FAB/Dashboard paths may ignore a failed activation response.

This can result in a silent activation failure even though the transport contract correctly reports failure.

**Future work:**
- Audit all Select Element activation callers.
- Identify callers that ignore `success: false`.
- Define one consistent activation-failure feedback policy.
- Avoid introducing duplicate feedback between caller and content-side ownership.

---

### SE-BL-03 — Escape Behavior During Active Translation

**Type:** Product / UX  
**Priority:** Low

Keyboard ownership during an active Select Element translation is not fully unified.

Selection-mode Escape handling and global revert/cancellation shortcuts currently have separate ownership.

**Future work:**
- Define expected Escape behavior while translation is running.
- Clarify whether Escape means cancel translation, exit interaction mode, or both.
- Ensure committed translations remain preserved according to the existing cancellation contract.
- Avoid conflicting shortcut ownership.

---

### SE-BL-04 — Iframe UX Parity

**Type:** UX  
**Priority:** Low

Iframe activation, translation, context handling, and deactivation are coordinated correctly, but iframe UX is intentionally not identical to top-frame UX.

Notifications remain primarily top-frame-owned.

**Future work:**
- Audit iframe feedback behavior from a product perspective.
- Decide which feedback should remain top-frame-only.
- Improve iframe failure visibility where necessary.
- Preserve exactly-once notification ownership.

---

## Contract Debt

### SE-BL-05 — Conflict Uses Shared `USER_CANCELLED` Wire Reason

**Type:** Contract Debt  
**Priority:** Low

Select Element correctly preserves the lifecycle reason:

```text
conflict
````

However, shared cancellation infrastructure may represent the underlying wire-level cancellation as:

```text
USER_CANCELLED
```

This does not currently affect Select Element correctness.

**Future work:**

* Decide whether conflict requires a first-class shared cancellation reason.
* Audit consumers of the current wire-level reason before changing it.
* Avoid introducing feature-specific cancellation semantics into shared infrastructure without a clear contract.

---

### SE-BL-06 — Partial Outcomes Use `ErrorHandler`

**Type:** Contract / Architecture Debt
**Priority:** Medium

Select Element partial outcomes have feature-specific semantics and copy, but currently use `ErrorHandler` as part of their rendering path.

This works correctly but creates conceptual overlap between:

* errors;
* partial success;
* partial failure;
* informational terminal feedback.

**Future work:**

* Define whether partial outcomes should have a dedicated feedback channel.
* Preserve exactly-once terminal feedback.
* Avoid changing partial-commit semantics while refactoring presentation ownership.
* Coordinate with future `TranslationOutcome` adoption.

---

### SE-BL-07 — Direct Rejection ACK Asymmetry

**Type:** Contract Debt
**Priority:** Medium

Conversation acceptance works correctly for current Select Element behavior, but accepted/rejected ACK behavior is not completely symmetrical across all direct and grouped paths.

**Future work:**

* Audit accepted and rejected parent ACK semantics.
* Compare V2 direct-parent and V3 BlockGroup behavior.
* Define whether rejection ACKs are required by the canonical conversation contract.
* Preserve the rule that provider fragments and recovery attempts never become conversation turns.

---

## Future Architecture

### SE-BL-08 — Canonical `TranslationOutcome` Runtime Adoption

**Type:** Architecture
**Priority:** Deferred

Select Element currently represents outcomes through a combination of:

* `success`;
* `partial`;
* typed errors;
* committed/total parent counts;
* operation-local `translationOutcome` metadata.

The shared `TranslationOutcome` model exists as supporting infrastructure, but Select Element does not yet use it as the canonical runtime source of truth.

**Future work:**

* Adopt the shared outcome model only when the surrounding runtime is ready.
* Follow ADR-015.
* Avoid introducing parallel outcome representations.
* Preserve existing partial-commit and cancellation behavior during migration.

---

### SE-BL-09 — Provider Completion Contract Runtime Adoption

**Type:** Architecture
**Priority:** Deferred

Provider completion concepts are documented by ADR-016, but the complete runtime has not yet migrated to one canonical provider-completion representation.

**Future work:**

* Continue provider completion contract adoption across shared translation infrastructure.
* Keep provider completion distinct from:

  * provider contract validity;
  * logical-parent acceptance;
  * DOM commit;
  * conversation acceptance.
* Avoid Select Element-specific provider completion semantics.

---

### SE-BL-10 — Future V2 Support for `PRE` / `CODE`

**Type:** Future Architecture / Product
**Priority:** Low

`PRE` and `CODE` roots currently require V3.

Under V2 they intentionally produce the capability-specific unsupported-mode informational outcome.

This is correct current behavior.

**Future work:**

* Evaluate whether V2 should eventually support preformatted content.
* Preserve whitespace and formatting semantics.
* Avoid weakening the current `SelectElementPolicy` capability boundary.
* Remove the unsupported-mode behavior only if real V2 support is implemented.

---

## Cleanup Debt

### SE-BL-11 — Remove Dead `isInteractiveElement` Helper

**Type:** Cleanup
**Priority:** Low

`isInteractiveElement` appears to be a legacy helper with no current production consumer.

It was intentionally left untouched during the Select Element taxonomy cleanup.

**Future work:**

* Confirm repository-wide that it has no runtime consumers.
* Remove the helper and obsolete tests/imports if proven dead.
* Do not reintroduce an interactive-element taxonomy into `SelectElementPolicy`.

---

### SE-BL-12 — Clean Up Empty `deactivate()` Catch Branch

**Type:** Cleanup
**Priority:** Low

A legacy/empty conditional branch remains in the Select Element deactivation error-handling path.

It is not currently affecting behavior.

**Future work:**

* Audit the branch and its original intent.
* Remove dead logic if no contract depends on it.
* Preserve cleanup guarantees for success, error, cancel, manual, conflict, and no-content reasons.

---

### SE-BL-13 — Remove or Reconcile Unused Revert Notification Action

**Type:** Cleanup / UX
**Priority:** Low

Some legacy Select Element notification/revert wiring remains even though the current activation/progress toast does not render a Revert action.

**Future work:**

* Audit remaining Revert action/event wiring.
* Remove unused Select Element-specific wiring where safe.
* Keep explicit global/feature revert behavior intact.
* Do not couple cancellation and revert.

---

### SE-BL-14 — Notification / Revert Legacy Wiring Cleanup

**Type:** Cleanup / Architecture
**Priority:** Low

Some shared events and legacy notification assumptions around Select Element revert behavior remain from older implementations.

**Future work:**

* Audit Select Element notification events and consumers.
* Identify unused or duplicate revert-related events.
* Clarify ownership between:

  * Select Element notifications;
  * global revert;
  * `DomTranslatorState`;
  * shortcut handling.
* Remove only proven-dead wiring.

---

### SE-BL-15 — Test Mock Isolation Audit

**Type:** Test Infrastructure
**Priority:** Low

During hardening, a pre-existing queued mock behavior was found around one-shot configuration mocks such as:

```js
getFeatureSemanticBlockGroupingAsync.mockResolvedValueOnce(...)
```

Current tests are green, but some suites may still depend on implicit mock ordering.

**Future work:**

* Audit one-shot mocks in Select Element tests.
* Ensure `beforeEach` fully resets queued mock behavior.
* Remove order-dependent tests.
* Prefer explicit per-test configuration for extraction mode and provider capability.

---

## Shared Translation Infrastructure Debt

### SE-BL-16 — Recovery / Accounting Ownership

**Type:** Shared Architecture
**Priority:** Medium
**Scope:** Cross-feature

Structured provider recovery still has broader architectural debt around ownership and accounting.

Previously identified areas include:

* internal recovery versus user-visible retry ownership;
* rate-limit accounting;
* translation statistics;
* request health propagation;
* timeout budget ownership;
* retry behavior after partial recovery;
* conversation/history isolation.

This is not a Select Element-specific correctness blocker.

**Future work:**

* Keep provider-local recovery an implementation detail.
* Distinguish logical request attempts from internal recovery executions.
* Prevent recovery from inflating user-facing request/statistics semantics.
* Ensure health/rate-limit systems observe the correct execution facts.
* Keep recovery out of normal conversation history.
* Coordinate changes with provider contracts and recovery ADRs.

---

## Documentation Debt

### SE-BL-17 — Keep Shared Architecture Documentation Synchronized

**Type:** Documentation
**Priority:** Low

`SELECT_ELEMENT_SYSTEM.md` has been rewritten to match the current architecture, but future changes may require synchronized updates to shared documentation.

Relevant documents include:

* `ERROR_MANAGEMENT_SYSTEM.md`
* `TRANSLATION_PROVIDER_LOGIC.md`
* `CONVERSATION_CONTRACT.md`
* `PROVIDER_CONTRACT.md`
* ADR-015
* ADR-016
* Feature Behavioral Contracts
* Translation Identity and Fragment Contract

**Future work:**

* Update authoritative contracts when runtime ownership changes.
* Avoid duplicating detailed provider/recovery/conversation contracts inside Select Element documentation.
* Keep cross-document terminology consistent.

---

## Current Status

The Select Element hardening closeout identified **no known correctness blocker** among the items above.

The backlog should therefore be treated as:

```text
UX improvement
+ cleanup
+ contract simplification
+ future architecture
+ shared infrastructure hardening
```

rather than required fixes for the current hardened Select Element implementation.
