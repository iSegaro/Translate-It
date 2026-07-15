# ADR-005: OCR Recommendation Architecture

## Status

Proposed

---

## Context

### Current OCR Architecture

The PDF Viewer has a stable OCR pipeline. The current ownership is:

- **Detector** — a feature-layer class that classifies visible pages as "scanned candidates" based on text-extraction heuristics (no logical blocks, minimal text items, minimal character count).
- **OCR Processor** — owns OCR execution: renders pages to canvas, runs Tesseract.js, creates logical blocks, stores them on PageSession via the repository.
- **OCR workflow composable** — owns the OCR workflow: candidate discovery, consent prompt, execution delegation, cache persistence, progress/error state, and reactive invalidation.
- **PageSession** — owns OCR blocks and OCR metadata as a feature-owned domain inside the session (per ADR-004 mutation contract).
- **Repository** — owns PageSession lifecycle, hydration, block indexing, and OCR block mutation routing.
- **Cache Manager** — owns OCR cache I/O.
- **Translation Coordinator** — consumes logical blocks transparently, falling back to OCR blocks when no text-layer blocks exist. The coordinator is OCR-agnostic.

This pipeline is functionally correct and stable.

### Current Product Semantics

The current product language is built on **"Scanned Page Detection."**

The detector answers: *"Is this page scanned?"*

The composable exposes this classification directly as public state. The toolbar renders an OCR button when scanned pages are detected. The consent prompt tells the user that "scanned pages are currently visible."

The product question the user actually encounters is: *"Should I run OCR on this page?"*

Today, these two questions are answered by the same mechanism. The detector classifies page structure, and the composable forwards that classification as product-facing state. The policy that converts "scanned candidate" to "OCR should be recommended" (excluding already-OCR'd pages) is embedded inline in the composable.

### Why Recommendation Differs From Detection

**Detection is a structural fact.** A page either has extractable text or it does not. This is deterministic, based on page content, and does not change based on user context, feature state, or product intent.

**Recommendation is a product policy.** It answers whether the system should surface an OCR action to the user. This can depend on detection results, OCR cache state, language availability, user preferences, and additional recommendation signals that may emerge as the product evolves.

**These are different concerns with different change drivers.**

Detection changes when heuristics evolve. Recommendation changes when product policy evolves. These are independent forces. Merging them means every product-policy change touches the detector, and every heuristic change risks altering product behavior. This independent-change-driver principle is the central architectural motivation for the separation established by this ADR.

### Current Limitations

1. **Semantic leak.** The composable exposes detection terminology as public state. UI components bind to detection-derived concepts rather than recommendation semantics. If recommendation logic evolves to consider factors beyond scanned-page classification, the public contract becomes misleading.

2. **Recommendation policy embedded in composable.** The filtering that converts detection results to recommendation results lives inline in the composable. This is recommendation policy disguised as workflow logic. It cannot be tested independently, and it couples the composable to detection internals.

3. **No separation between "classify page" and "decide to recommend."** The detector returns structured classification results. The composable interprets these to produce a recommendation. There is no architectural boundary between structural classification and product decision.

4. **Dead detector methods.** The detector exposes methods that are never called in production. The composable calls the detector directly and performs its own interpretation. The detector's public surface is larger than its actual usage.

5. **Dead UI status path.** UI components bind detection-derived fields that the viewer controller never populates. The status indicator is effectively non-functional. This is a symptom of the semantic leak: detection concepts were threaded through the viewer layer without a clear ownership boundary.

### Future Region OCR

The long-term roadmap includes **Region OCR**: the user draws a rectangle in the PDF viewport, OCR runs inside that region, and the extracted text is translated.

Region OCR is a fundamentally different interaction model from OCR recommendation:

- **OCR recommendation** is system-initiated. The system observes page content and suggests an action.
- **Region OCR** is user-initiated. The user explicitly selects a region and requests OCR.

These must not be merged. Region OCR does not need a Recommendation Engine to decide whether to show a button — the user's explicit action is the trigger. Conversely, recommendation does not need to understand regions — it answers a product question about page content.

This ADR must ensure that the recommendation architecture does not block Region OCR, and that the two can coexist without ownership conflicts.

---

## Decision

### Decision 1 — Recommendation and Detection are separate architectural concerns

**Detection** owns structural page classification. It answers: *"What is the text-extraction quality of this page?"*

**Recommendation** owns product policy. It answers: *"Should the system surface an OCR action for this page?"*

These are distinct concerns with distinct change drivers, distinct consumers, and distinct lifecycles. They must not be merged into a single module.

**The central architectural motivation:** Detection changes when heuristics evolve. Recommendation changes when product policy evolves. These are independent forces. Separating them ensures that heuristic improvements never risk altering product behavior, and product-policy changes never touch the detector. This independent-change-driver principle is the foundation of every subsequent decision in this ADR.

### Decision 2 — A Recommendation Engine exists between the composable and the detector

The OCR workflow composable must not query the detector directly. It must query a Recommendation Engine, which internally may delegate to the detector.

The Recommendation Engine owns the product decision. The detector owns the structural heuristic. The composable owns the workflow.

This creates three distinct boundaries:

```
Composable           → asks "what should I recommend?"
Recommendation Engine → answers with recommendation results
Detector             → answers "is this page scanned?"
```

The composable never reaches through the Recommendation Engine to the detector. The Recommendation Engine is the primary consumer of the detector. The detector is not part of the public recommendation contract.

### Decision 3 — The composable exposes recommendation semantics, not detection semantics

The composable's public state must use recommendation terminology, not detection terminology. UI components bind to recommendation results, not classification results.

Internal heuristic naming (inside the detector) may retain "scanned" terminology, because it accurately describes what the heuristic classifies. The leak to stop is at the composable's public contract boundary.

The concrete naming of composable state and UI props is intentionally left to implementation. The architectural decision is that the composable's public contract carries recommendation semantics, not detection semantics.

### Decision 4 — The Recommendation Engine is a pure query

The Recommendation Engine:
- Does not execute OCR.
- Does not mutate PageSession.
- Does not own cache.
- Does not own UI state.
- Does not trigger hydration.
- Does not own translation.

It is a stateless query over already-hydrated page content. It reads page state and exposes recommendation results. It has no side effects.

This aligns with ADR-004's consumer model: the Recommendation Engine is a consumer of page content, not an owner of page lifecycle.

### Decision 5 — The detector remains as an internal heuristic

The detector is not removed, not renamed to claim it is a Recommendation Engine, and not made public to consumers. It remains a feature-layer heuristic that classifies page structure.

The detector may be queried by:
- The Recommendation Engine (primary consumer)
- Future diagnostics or analytics (secondary consumers)

The detector must not be queried by:
- The composable directly
- UI components
- The OCR processor

### Decision 6 — Scope belongs to the caller; Region OCR is independent

The Recommendation Engine evaluates whatever scope its caller provides. It does not determine scope. The viewer or application layer owns evaluation scope.

Possible future scopes may include visible pages, selected pages, bookmarked pages, or search result pages. These examples are illustrative only. The Recommendation Engine does not design for specific scopes — it accepts the scope its caller provides and evaluates recommendation semantics within that scope.

Region OCR is a viewer-layer action: the user explicitly selects a region and requests OCR. It is not a scope variant — it is a fundamentally different interaction model. Region OCR does not pass through the Recommendation Engine. The two are independent and may use the same OCR execution engine, but through different entry points.

The Recommendation Engine does not concern itself with how OCR is executed — only whether it should be recommended. The concrete contract of the Recommendation Engine is intentionally left to implementation.

### Decision 7 — Recommendation results are not persisted

Recommendation is computed on demand from current page state. It is not cached in PageSession, not persisted to cache, and not stored beyond the composable's reactive state.

Recommendation changes when page state changes (e.g., after OCR completes, the page is no longer recommended). The composable recomputes recommendations on the same events it does today: PageSession commit, visible pages change, OCR completion.

This avoids stale recommendation state and eliminates the need for invalidation logic.

---

## Architecture

### Ownership Diagram

```
Viewer
owns evaluation scope
    ↓

usePdfOcr
owns OCR workflow
    ↓

Recommendation Engine
owns recommendation semantics
    ↓

Detector
owns structural heuristic
    ↓

PageSession
owns page source content and OCR content
```

### Key property

The recommendation path and the execution path are separate. Recommendation never reaches the OCR Processor. Execution is always triggered by explicit user action (consent), never by recommendation.

---

## Responsibilities

| Component | Responsibility |
|-----------|---------------|
| **Viewer** | Owns viewport state and visibility detection. Owns evaluation scope. Reports visible page changes. Does not decide recommendation policy. Does not trigger hydration. |
| **usePdfOcr** | Owns the OCR workflow: asks Recommendation Engine for candidates, manages consent prompt state, delegates execution to Processor, manages progress/error state, persists OCR to cache, triggers UI refresh on completion. Does not query the detector directly. Does not compute recommendation policy. |
| **Recommendation Engine** | Owns the product decision: which pages should have OCR recommended. Reads page state, applies product policy, exposes recommendation results. Stateless. No side effects. Does not execute OCR. Does not mutate PageSession. Does not own UI state. The concrete result contract is intentionally left to implementation. |
| **Detector** | Owns structural page classification heuristic. Pure query over hydrated page content. Returns structural classification. Does not apply product policy. Does not filter by OCR state. Not part of the public recommendation contract. The Recommendation Engine is its primary consumer. |
| **OCR Processor** | Owns OCR execution: rendering, recognition, block creation, storage via repository. Does not decide when to run. Does not own recommendation. |
| **PageSession** | Owns page source content and OCR content as a feature-owned domain (per ADR-004). Provides transparent fallback from text-layer blocks to OCR blocks. Does not own recommendation state. |
| **Repository** | Owns PageSession lifecycle, hydration, block indexing, and OCR block mutation routing. Does not own recommendation. |

---

## Consequences

### Positive

- **Clean separation of concerns.** Detection (structural fact) and recommendation (product policy) evolve independently. Heuristic improvements do not risk altering product behavior. Product-policy changes do not touch the detector.

- **Stable composable contract.** The composable exposes recommendation semantics. If recommendation rules evolve, the composable's public contract does not change — only the Recommendation Engine's internal logic changes.

- **Testable recommendation policy.** The Recommendation Engine can be unit tested independently of the composable, the detector, and the OCR processor. Tests for recommendation semantics are separate from tests for structural classification.

- **No UI coupling to detection.** UI components bind to recommendation results, not classification results. Changing the detection heuristic does not require UI changes. Changing recommendation rules does not require detector changes.

- **Region OCR compatibility.** OCR recommendation and region-level OCR are independent. Adding Region OCR does not require changes to the Recommendation Engine. Region OCR can use its own execution path without conflicting with the recommendation contract.

- **Aligned with ADR-004.** The Recommendation Engine is a pure consumer of page content. It does not own PageSession lifecycle, does not trigger hydration, and does not mutate PageSession. It follows the consumer contract established by ADR-004.

### Negative

- **Additional component.** The Recommendation Engine is a new module between the composable and the detector. It adds one level of indirection. In the current system, where recommendation logic is trivially "detect scanned → exclude already-OCR'd," this component may feel like over-engineering.

- **Migration cost.** The composable's public state must shift from detection semantics to recommendation semantics. All consumers — UI components, tests, and documentation — must update their bindings. This is a mechanical but wide-reaching change.

### Trade-offs

The core trade-off is **indirection vs. semantic clarity**. The current system has fewer modules but leaks detection terminology into the product contract. The proposed system has one more module but establishes a clean boundary between structural classification and product policy.

This trade-off favors the separation because:
- The recommendation policy will evolve with additional signals and heuristics. The detection heuristic may also evolve independently. These are independent change drivers that should not be coupled.
- The cost of the additional component is low (a thin, stateless query module). The cost of the semantic leak compounds over time as more UI components and tests bind to detection terminology.

---

## Alternatives Considered

### Alternative A — Keep Detector Public (Status Quo)

The composable continues to query the detector directly. Detection results are exposed as public state. No Recommendation Engine is introduced.

**Accepted as:** The current stable state. This ADR does not deny that the current system works.

**Rejected as:** The target architecture. Detection terminology leaks into the product contract. Recommendation policy is embedded in the composable. Future recommendation rule changes require composable modifications. UI is coupled to "scanned" semantics.

### Alternative B — Pure Rename

Rename the detector to a recommendation-themed name. Rename the composable's public state from detection terminology to recommendation terminology. No new component.

**Rejected because:** Renaming the detector to claim it is a Recommendation Engine is a lie about responsibility. The detector classifies page structure. It does not apply product policy. A rename would make the name claim a responsibility the module does not have.

The policy that converts detection to recommendation would remain embedded in the composable. The separation of concerns would not be achieved — only the naming would change.

### Alternative C — Remove Detector Completely

Delete the detector. Inline the structural heuristic into the Recommendation Engine. One module instead of two.

**Rejected because:** Merging structural classification with product policy eliminates the ability to answer "is this page scanned?" independently of "should we recommend OCR?" These are different questions with different consumers.

Future diagnostics, analytics, or debugging tools may need to know whether a page is structurally scanned without caring about recommendation. Killing the detector removes that capability.

The detector is a legitimate heuristic with a clear responsibility. Removing it to reduce indirection trades clarity for brevity. The cost of keeping it is minimal; the cost of losing the separation is permanent.

### Alternative D — Richer Recommendation Result Model

Return a structured result from the Recommendation Engine with confidence scores, reason arrays, and diagnostics, instead of a minimal recommendation contract.

**Rejected because:** No near-term need exists for confidence, reasons, or diagnostics. The current recommendation logic is boolean: a page either recommends OCR or it does not. Adding structured results is speculative design that increases the contract surface without behavioral benefit.

If future recommendation rules need to communicate additional metadata, the result model can be extended at that time. The Recommendation Engine's public contract should be the smallest thing that satisfies current needs.

### Alternative E — Recommendation Façade Over Detector (Accepted)

Introduce a Recommendation Engine that wraps the detector. The detector remains as an internal heuristic. The Recommendation Engine applies product policy and exposes recommendation results. The composable queries the Recommendation Engine, not the detector.

**Accepted because:**
- Minimal indirection (one thin module).
- Detector preserved as a legitimate heuristic.
- Composable contract uses recommendation semantics.
- Product policy is testable independently.
- Future recommendation rules can be added to the Recommendation Engine without touching the detector, composable, or UI.
- Aligned with ADR-004 consumer model.
- Region OCR compatible.

---

## Future Compatibility

### Smarter Recommendation Rules

The Recommendation Engine can incorporate additional recommendation signals without changing its public contract. Additional heuristics — such as text coverage analysis, image coverage, damaged text-layer detection, OCR confidence from prior runs, or user preferences — are internal to the Recommendation Engine.

All of these are internal to the Recommendation Engine. The composable continues to ask for recommendation results and receives them. No UI changes, no composable changes, no detector changes.

### Mixed-Content PDFs

A page may contain mixed native text and raster content. The current detector classifies such pages based on overall text extraction. The Recommendation Engine can apply additional rules that consider partial-page content quality, independently of the detector's structural classification.

This requires the Recommendation Engine to understand evolving product policy, but it does not require the detector to change. The detector continues to answer structural questions. The Recommendation Engine adds product-level rules as separate policy.

The separation between detection and recommendation is what makes this possible. If they were merged, evolving product policy would require changing the public contract.

### Region OCR

Region OCR is a viewer-layer action. The user explicitly selects a region and requests OCR. This path does not involve the Recommendation Engine. The Recommendation Engine answers product questions about page content; region-level OCR is a separate concern with its own explicit trigger.

The two paths share the OCR execution engine but nothing else. Region OCR can define its own execution contract without conflicting with the recommendation contract.

No names, boundaries, or ownership decisions in this ADR block Region OCR. The Recommendation Engine does not assume OCR is always full-page. It simply does not concern itself with how OCR is executed — only whether it should be recommended.

---

## Relationship to Existing ADRs

| ADR | Relationship |
|-----|--------------|
| **ADR-003** | Accepts document-lifetime PageSession model. This ADR adds a Recommendation Engine that is a consumer of PageSession content, consistent with the consumer model. No PageSession lifecycle changes. |
| **ADR-004** | Establishes that consumers do not own PageSession lifecycle. The Recommendation Engine is a pure consumer: it reads page state, applies policy, returns results. It does not hydrate, create, or destroy sessions. It does not trigger hydration. It follows the consumer contract. |

---

## Architectural Invariants

These invariants protect the recommendation architecture against future coupling.

### Invariant 1 — The composable never queries the detector directly

The OCR workflow composable queries the Recommendation Engine. It does not import, instantiate, or call the detector. This prevents detection semantics from leaking into the composable's public contract.

### Invariant 2 — The Recommendation Engine never executes OCR

The Recommendation Engine is a pure query. It does not call the OCR Processor. It does not render canvases. It does not run Tesseract. Execution is always triggered by explicit user consent, never by recommendation.

### Invariant 3 — The Recommendation Engine never mutates PageSession

The Recommendation Engine evaluates already-available page content. It does not write to PageSession, does not modify OCR blocks, and does not alter page metadata. It is a read-only consumer per ADR-004.

### Invariant 4 — Recommendation results are not persisted

Recommendation is computed on demand from current page state. It is not stored in PageSession, not written to cache, and not persisted across sessions. This eliminates stale recommendation state and invalidation complexity.

### Invariant 5 — The detector is not part of the public recommendation contract

The detector is not part of the public recommendation contract. The Recommendation Engine is its primary consumer. Public consumers interact with the Recommendation Engine, not the detector. Additional internal feature-layer consumers — such as diagnostics, developer tooling, analysis, or debugging — are allowed when they legitimately require structural classification. The detector should not become part of the public recommendation contract.

### Invariant 6 — Region OCR does not pass through the Recommendation Engine

Region OCR is a viewer-initiated action. It does not ask the Recommendation Engine whether to proceed. It does not use the recommendation contract. The Recommendation Engine answers product questions about page content; region-level OCR is a separate concern with its own explicit trigger.
