# ADR-0001: Status Banner Architecture

**Status:** Accepted

---

## Context

The PDF viewer's status banner originally drove its partial-translation warning from export completeness metrics:

```
getExportStats().isPartial
```

This metric represents cumulative document export readiness — whether any blocks across the entire document remain untranslated. It is NOT a per-run translation outcome.

### Bugs observed

1. **Stale warnings.** After a partial translation run, re-running translation successfully still showed the partial warning — `isPartial` reflected the cumulative state of all blocks ever processed, not just the latest run.
2. **Incorrect dismissal identity.** Banner dismissal was keyed on a value that did not change between translation runs. Dismissing once suppressed the warning forever, even when a new, genuinely partial run occurred.
3. **Banner visible during non-translation states.** The warning could persist across document navigation actions that had nothing to do with translation.

### Architectural smell

The banner — a presentation-layer concern — was deriving domain-relevant state (was the latest translation incomplete?) from an export infrastructure component (`PdfExportCollector`). This created:

- **Coupling between export and presentation.** Changes to export logic could inadvertently affect banner behavior.
- **Ownership inversion.** The banner was asking the wrong subsystem a question the subsystem was not designed to answer.
- **Unclear data flow.** A reader could not determine from a single file whether the banner reflected translation outcome, export readiness, or something else.

---

## Decision

Six architectural decisions were made.

### 1. Presentation ownership

The status banner is a presentation-only concern. It:

- Owns no domain state.
- Mutates no domain state.
- Derives its display state entirely from existing reactive sources.

Its sole responsibility is selecting which banner message to show, given the current state of multiple subsystems (translation, export, loading, error).

### 2. Translation outcome model

`translationSummary` is introduced as the single source of truth for the outcome of exactly one translation run. Produced by `PdfTranslationCoordinator` at the end of each `translateVisibleBlocks()` call, it replaces export-derived state as the banner's source for partial-translation display.

Each status represents a per-run outcome:

| Status | Meaning |
|--------|---------|
| `idle` | No translation run has completed since document load or reset. |
| `translated` | All visible blocks in the run succeeded. No warning needed. |
| `partial` | Some blocks failed or were skipped. The run was incomplete. |
| `cancelled` | The run was aborted by the user mid-execution. |
| `error` | The run encountered a fatal error. The specific error is surfaced through the dedicated error state, not through this status. |

These are explicitly NOT cumulative. A new run produces a new outcome. The previous outcome is discarded.

### 3. Export separation

Export metrics (`getExportStats()`) remain cumulative document state — they count all blocks ever processed across all runs. They answer the question "is the document ready to export?"

`translationSummary` answers a different question: "did the latest translation run complete fully?"

These concerns must remain independent. The status banner must never derive translation outcome from export metrics. Conversely, export logic must never depend on `translationSummary` status.

### 4. Identity model

Two different identity mechanisms exist because they solve different problems.

**Error banner identity** uses `ErrorBannerIdFactory` — a string derived from the error details. The same active error always produces the same ID. If the error is cleared and a new identical error occurs, a new ID is generated (via an internal sequence counter on the factory). This ensures dismissal is stable for a continuous error but does not permanently suppress warnings for the same error across sessions.

**Partial banner identity** uses `translationOccurrenceId` — a monotonic counter on `PdfTranslationCoordinator`. Each translation run gets a unique, stable ID. The same occurrence always carries the same ID. A new run always gets a new ID. This ensures dismissal only applies to one specific run — if a new run produces a `partial` outcome, the banner reappears automatically.

Both identity mechanisms serve the same goal (stable identity for banner dismissal) but draw from different sources because the things they identify (active error vs. translation occurrence) have different lifecycles.

### 5. Dismiss model

Dismissal is a purely presentation-layer operation:

- It records a dismissed-banner key in local reactive state.
- It never mutates domain state (translation summary, export stats, error state).
- Visibility is driven by identity comparison: if `dismissedBannerKey === banner.id`, the banner is hidden.

Identity change (new error, new translation occurrence) produces a new banner ID, which no longer matches the stored dismiss key, so the banner reappears automatically. No explicit "undismiss" logic is needed.

### 6. Priority chain

Banner selection follows a deterministic priority chain:

```
Error → Loading → Translating → Partial → Export Success → Cache Restored → None
```

Exactly one banner may exist at any time. The first matching condition wins. Lower-priority states never render while a higher-priority state is active. This is an enforced architectural invariant, not merely current behavior.

---

## Alternatives Considered

| Alternative | Rejected because |
|---|---|
| **Keep export-driven banner (`isPartialExport`)** | Maintains the original coupling. Does not fix stale-warning or dismissal-identity bugs. Requires readers to understand export internals to reason about banner behavior. |
| **`isPartialExport` (application-layer wrapper)** | Wraps the same metric in a differently named computed. Does not change the underlying data source or fix any bugs. Adds indirection without architectural benefit. |
| **`translationTick` as identity** | `translationTick` is a reactive invalidation counter that increments on any state change — including non-translation events. It is not a stable per-occurrence identifier. Using it would produce false identity changes, overriding legitimate dismissals. |
| **`PartialBannerIdFactory` (parallel to `ErrorBannerIdFactory`)** | Unnecessary. `translationOccurrenceId` already provides exactly the identity contract needed (stable per-occurrence, changing only on new run). A separate factory would duplicate this logic and add an indirection layer. |
| **Reset dismissed key on new translation** | Mutates presentation state based on domain events, violating presentation-only ownership. Requires the dismiss system to be aware of translation lifecycle. The identity-based approach achieves the same result without coupling dismissal to domain events. |
| **Banner watches translation lifecycle events** | Would require the banner to subscribe to or observe `PdfTranslationCoordinator` events, violating the principle that banner is a passive consumer. The current approach reads reactive state, which is simpler and more predictable. |

---

## Consequences

### Positive

- **Clean ownership.** Each concern (translation outcome, export completeness, presentation) lives in its own subsystem with clear boundaries.
- **Presentation/domain separation.** The banner depends only on reactive state, not on infrastructure internals.
- **Stable identity.** Each translation occurrence has a unique, stable ID. Dismissal is predictable and correct.
- **Deterministic rendering.** Given the same inputs, the same banner always wins. No race conditions between multiple candidate banners.
- **Reusable contract.** `translationSummary` can be consumed by any UI component (toolbar, status bar, export dialog) without additional plumbing.

### Trade-offs

- **`translationOccurrenceId` added to the translation summary contract.** `PdfTranslationCoordinator` is the birthplace of every translation occurrence — it is therefore the correct owner of occurrence identity. Presentation consumes this identity but does not generate it. This is an intentional ownership decision: the identity lives where the occurrence is born, not where it is displayed.
- **Banner now depends on `translationSummary` instead of export metrics.** This shifts the dependency from export infrastructure to translation infrastructure, which is architecturally correct but means changes to the summary shape must consider banner consumers.

---

## Architectural Invariants

Future changes to the status banner or related subsystems must preserve:

1. **Only `translationSummary` drives translation-outcome banner state.** Export metrics (`getExportStats()`) must not be used to determine whether to show a partial-translation warning.
2. **Export metrics must not drive any banner state.** Cumulative document state answers a different question from per-run outcome.
3. **The banner owns no business state.** All display decisions derive from existing reactive sources. The banner does not track, cache, or mutate domain state.
4. **Dismiss must never mutate domain state.** It operates on presentation-layer state only (a dismissed-key set).
5. **Exactly one banner exists at any time.** The priority chain is deterministic; lower-priority states never render when a higher-priority state is active.
6. **`translationOccurrenceId` is a stable occurrence identity, not an invalidation counter.** It changes exactly once for each completed translation occurrence. It never changes during reactive recomputations. It is unaffected by loading, scrolling, layout changes, viewport updates, cache restoration, or any other UI recomputation. It represents occurrence identity only.
