## 1. Phase 0A — Static Pipeline Audit (Read-Only)

- [x] 1.1 Read all files listed in Plan.md: `src/features/translation/`, `src/features/element-selection/`, `src/features/page-translation/`, `src/shared/config/config.js`, `src/features/translation/utils/promptBuilder.js`, `log.txt`, and all referenced docs — transitively follow imports
- [x] 1.2 Trace Select Element flow end-to-end: selection event → coordinator → extraction → batching → prompt → LLM → response parsing → DOM reconstruction — document every function call and data transformation
- [x] 1.3 Trace Whole Page Translation flow end-to-end: trigger → recursive batch processor → grouping strategy → prompt dispatch → LLM → reconstruction — document every step
- [x] 1.4 Inventory all marker-based logic: list every file + line where markers are inserted, transmitted, expected, parsed, or depended upon for reconstruction
- [x] 1.5 Document all marker survival assumptions explicitly: does the pipeline assume markers survive verbatim? In order? Uniquely? Flag each assumption as confirmed-by-code or unverified
- [x] 1.6 Document all text segmentation assumptions: how text nodes are grouped, how inline elements are handled, how nested tags are processed, what is assumed about DOM ordering
- [x] 1.7 Document all batching behavior: how segments are chunked for dispatch, what the max batch size is, how grouping decisions are made, what happens when a batch partially fails

## 2. Phase 0B — Streaming & Concurrency Audit (Read-Only)

- [x] 2.1 Trace the streaming path: how streaming chunks arrive, how they are buffered or applied, at what point(s) DOM writes occur during an in-flight stream
- [x] 2.2 Document mid-stream cancellation behavior: when cancel is called during streaming, what DOM state results — partial writes? rollback? undefined?
- [x] 2.3 Identify all concurrent session paths: under what conditions can two translation sessions be active simultaneously, and what DOM subtrees can they overlap on
- [x] 2.4 Document write ordering guarantees: does the coordinator enforce any ordering on concurrent DOM writes? Are there locks, queues, or subtree exclusion mechanisms? Document their presence or confirmed absence
- [x] 2.5 Document DOM mutation strategy: are writes synchronous, batched per rAF, staged via document fragment, or per-segment incremental? Confirm by reading the reconstruction code directly
- [x] 2.6 Identify flicker risks: under what conditions does the current pipeline produce a visible intermediate state (partially translated paragraph, missing text nodes, empty spans)?
- [x] 2.7 Document cancellation propagation: how does a cancel signal propagate from the user action through the coordinator, provider, and reconstruction stack — at what point is it guaranteed to stop DOM writes?

## 3. Phase 0C — Semantic Ownership Audit (Read-Only)

- [x] 3.1 Resolve whitespace ownership: inspect the current extractor to determine how leading/trailing whitespace on text nodes is handled — is it included in extracted text, stripped, or collapsed based on CSS? Document with concrete DOM examples
- [x] 3.2 Resolve CSS `white-space` variant handling: confirm whether `white-space: pre`, `pre-wrap`, `nowrap` nodes are handled differently from `normal` — document each case
- [x] 3.3 Resolve punctuation ownership: determine which "side" of an inline element boundary owns adjacent punctuation characters — with concrete Persian/Arabic and English examples
- [x] 3.4 Resolve RTL punctuation mirroring: confirm whether the current pipeline handles punctuation mirroring in RTL contexts or leaves it to the browser's bidi algorithm — document the behavior
- [x] 3.5 Resolve bidi isolation boundary representation: identify how `dir` attributes, `unicode-bidi: isolate` CSS, and explicit Unicode bidi control characters are currently handled — are they passed to the LLM, stripped, or preserved as metadata?
- [x] 3.6 Resolve nested inline ownership: examine how `<b><i>text</i></b>` and similar nested inline structures are currently extracted — flat or hierarchical? Document the current behavior and any known failure cases
- [x] 3.7 Resolve overlapping formatting semantics: find real examples in the codebase or test pages where a logical sentence spans multiple sibling text nodes with different inline tags — document how the current pipeline handles them
- [x] 3.8 Produce a formal ownership resolution document: for each of the five ownership dimensions (whitespace, punctuation, bidi isolation, nested inline, overlapping formatting), write an explicit rule supported by code evidence

## 4. Phase 0D — RTL Semantic Behavior Audit (Read-Only)

- [x] 4.1 Trace RTL content through the full pipeline: select a Persian or Arabic test case from `log.txt` or a known test page and trace it end-to-end through extraction → prompt → LLM → reconstruction
- [x] 4.2 Classify RTL failures in `log.txt`: for each RTL-related failure, determine whether it is structural (wrong DOM position), semantic (wrong translation), or rendering (correct content, incorrect direction/punctuation)
- [x] 4.3 Inspect the current prompt for RTL-specific instructions: does `promptBuilder.js` include any language-specific, ordering, or morphology guidance that helps RTL translation quality? List every RTL-related instruction found
- [x] 4.4 Document segment count enforcement: does the current prompt contract enforce that the LLM returns exactly N translated segments for N input segments? If so, how is this enforced and what happens when the LLM returns fewer or more?
- [x] 4.5 Assess H4 risk: based on 4.3 and 4.4, produce an explicit assessment of whether removing structural/marker instructions from prompts would preserve or degrade RTL semantic quality

## 5. Phase 0E — Hypothesis Validation

- [x] 5.1 Render verdict on H1 (marker root failure): with file/line evidence, state definitively whether markers are the root failure cause, a symptom of a deeper coupling, or structurally sound but incorrectly applied
- [x] 5.2 Render verdict on H2 (IR feasibility): based on the ownership resolution, state whether a serializable IR can represent all current pipeline input types without ambiguity — or identify which input types require fallback
- [x] 5.3 Render verdict on H3 (deterministic reconstruction): based on the streaming/concurrency audit, state whether the five reconstruction safety invariants (Streaming, Partial Batch, Concurrency, Flicker, Cancellation) are achievable — or identify which require a separate streaming mode
- [x] 5.4 Render verdict on H4 (prompt simplification RTL safety): based on the RTL prompt inspection, state whether simplified prompts preserve RTL quality — or identify what RTL-specific guidance must be retained
- [x] 5.5 Render verdict on H5 (feature flag migration safety): based on shared mutable state analysis, state whether V2 and new pipeline can coexist under a feature flag without state collision
- [x] 5.6 Document any alternative root causes identified: if any hypothesis is fully refuted, document the correct root cause and propose a revised architectural direction

## 6. Phase 0F — Analysis Report

- [x] 6.1 Write Section A (Current Architecture Review): full pipeline flow diagram, strengths, weaknesses, hidden assumptions, coupling issues — cross-referenced to file/line evidence
- [x] 6.2 Write Section B (Failure & Risk Analysis): fragile areas, RTL failure classification, reconstruction risks, streaming/concurrency risks, flicker risks, cancellation safety
- [x] 6.3 Write Section C (Root Cause Analysis): clear statement of whether failures are architectural, implementation-level, or behavioral — with codebase evidence for each claim
- [x] 6.4 Write Section D (Proposed Architecture): architecture that emerges from the hypothesis verdicts — not from pre-analysis assumptions. Include revised IR design, reconstruction strategy choices, prompt contract, and migration plan if applicable
- [x] 6.5 Write Section E (Risk Assessment): per-hypothesis, per-change regression risks, rollout risks, RTL linguistic quality risks
- [x] 6.6 Verify report covers all five Plan.md sections, all five hypothesis verdicts, streaming/concurrency/flicker/cancellation findings, and the formal ownership rule resolutions
- [x] 6.7 Present analysis report and request explicit architectural approval — do not proceed to Phase 1 until approval is received

## 7. Phase 1 — Approval Gate & Spec Revision

- [x] 7.1 Share analysis report with stakeholders for review
- [x] 7.2 Address all questions or concerns raised during review
- [ ] 7.3 Obtain explicit written approval to begin implementation
- [x] 7.4 Revise `specs/semantic-ir-layer/spec.md` based on confirmed ownership rules from Phase 0C — finalize the five ownership dimensions as requirements
- [x] 7.5 Revise `specs/deterministic-reconstruction/spec.md` based on H3 verdict — lock in which streaming strategy (A vs B) and which concurrency strategy (L/Q/X) will be implemented
- [x] 7.6 Revise `specs/prompt-simplification/spec.md` based on H4 verdict — if RTL guidance must be retained, update the requirement to reflect the narrower scope of simplification
- [x] 7.7 Revise `specs/migration-strategy/spec.md` based on H5 verdict — if shared state collisions are identified, add explicit isolation requirements
- [x] 7.8 Revise `tasks.md` Phases 4–10 based on confirmed architecture — remove or update any tasks that were based on invalidated hypotheses

## 8. Phase 2 — Semantic IR Layer *(contingent on Phase 1 approval)*

- [ ] 8.1 Define `TranslationUnit` data structure with all confirmed ownership fields: `id`, `text`, `nodeType`, `direction`, `bidiIsolate`, `preserveWhitespace`, `punctuationOwnership`, `inlineTag`, `parentId`, `formattingAnnotations`
- [ ] 8.2 Write unit tests for `TranslationUnit` construction covering all five confirmed ownership dimensions
- [ ] 8.3 Implement `TranslationUnit` class/factory in `src/features/translation/ir/`
- [ ] 8.4 Verify IR is JSON-serializable without live DOM references
- [ ] 8.5 Verify all unit tests pass

## 9. Phase 3 — Extraction Adapter *(contingent on Phase 1 approval)*

- [ ] 9.1 Implement IR-producing extractor that applies confirmed whitespace ownership rules
- [ ] 9.2 Implement punctuation ownership assignment per confirmed rules
- [ ] 9.3 Implement bidi isolation boundary capture: strip bidi control characters from text, store as IR metadata
- [ ] 9.4 Implement nested inline modeling per confirmed ownership model (nested tree vs. flat annotation)
- [ ] 9.5 Add feature flag (`FEATURE_IR_EXTRACTION`) defaulting to `false`
- [ ] 9.6 Write integration tests against V2 extractor for all five ownership dimensions
- [ ] 9.7 Verify no regression when feature flag is `false`

## 10. Phase 4 — Deterministic Reconstruction Engine *(contingent on Phase 1 approval)*

- [ ] 10.1 Implement `ReconstructionEngine` with confirmed streaming strategy (A: deferred or B: incremental-safe)
- [ ] 10.2 Implement confirmed concurrency strategy (L: lock, Q: queue, or X: exclusion)
- [ ] 10.3 Implement flicker prevention per confirmed approach (rAF batching, document fragment, or CSS visibility gate)
- [ ] 10.4 Implement cancellation safety: cancel at any point leaves DOM in valid state per Cancellation Safety Invariant
- [ ] 10.5 Implement `rollback(sessionId)`: restores original text for all nodes in session
- [ ] 10.6 Implement identity-key-based segment mapping: `translationMap` keyed by `TranslationUnit.id`
- [ ] 10.7 Implement direction injection: apply `dir` attribute and `bidiIsolate` wrapping from IR metadata
- [ ] 10.8 Write unit tests: determinism, rollback, concurrent session isolation, streaming safety invariant, partial batch invariant, cancellation safety, out-of-order response, missing segment
- [ ] 10.9 Verify all tests pass

## 11. Phase 5 — Prompt Simplification *(contingent on H4 verdict — may be partial)*

- [ ] 11.1 Refactor `promptBuilder.js` to remove marker logic; retain any RTL guidance confirmed necessary by H4 verdict
- [ ] 11.2 Define new response contract: plain text segments, segment count enforcement moved to pipeline
- [ ] 11.3 Implement segment count validation in response parser: log error if count diverges from IR segment count
- [ ] 11.4 Update AI providers under `FEATURE_IR_EXTRACTION` flag
- [ ] 11.5 Verify V2 prompt tests still pass when flag is `false`
- [ ] 11.6 Write new prompt tests: no markers, correct RTL guidance (per H4 verdict), segment count enforcement

## 12. Phase 6 — Bidi Text Handling *(contingent on Phase 1 approval)*

- [ ] 12.1 Verify extractor captures `direction: 'rtl'` for all RTL elements
- [ ] 12.2 Verify reconstruction applies `dir="rtl"` and bidi isolation wrapping per IR metadata
- [ ] 12.3 Verify inline code inside RTL paragraphs retains `dir="ltr"` after reconstruction
- [ ] 12.4 Verify bidi control characters stripped from LLM input and re-applied by reconstruction
- [ ] 12.5 Manual test: mixed Persian/English paragraph — correct word order, punctuation, bidi rendering
- [ ] 12.6 Manual test: confirm on both Chrome and Firefox (bidi behavior diverges)

## 13. Phase 7 — Migration Validation *(shadow comparison with quality gates)*

- [ ] 13.1 Implement shadow comparison: run both pipelines, log structural diffs with `TranslationUnit` ID attribution
- [ ] 13.2 Implement segment count equivalence check: log critical error on divergence
- [ ] 13.3 Run structural shadow comparison on Select Element flow — 10+ representative pages
- [ ] 13.4 Run structural shadow comparison on Whole Page Translation — 3+ representative pages
- [ ] 13.5 Resolve all structural divergences before proceeding to semantic quality gate
- [ ] 13.6 Conduct human-evaluated RTL linguistic quality review: Persian, Arabic, Hebrew sample translations — confirm word order, punctuation, and semantic equivalence
- [ ] 13.7 Conduct mixed-direction content quality validation: confirm bidi rendering is correct in new pipeline
- [ ] 13.8 Document and pass all quality gates before cutover approval
- [ ] 13.9 Verify rollback: confirm feature flag `false` immediately restores V2 with no state residue

## 14. Phase 8 — Cutover & Cleanup *(only after all quality gates pass)*

- [ ] 14.1 Flip feature flag default to `true` in production build
- [ ] 14.2 Remove shadow comparison code
- [ ] 14.3 Remove V2 marker-based extraction and reconstruction code paths
- [ ] 14.4 Remove migration compatibility shims and feature flags
- [ ] 14.5 Update `docs/technical/TRANSLATION_SYSTEM.md`
- [ ] 14.6 Update `docs/technical/SELECT_ELEMENT_SYSTEM.md` and `WHOLE_PAGE_TRANSLATION.md`
- [ ] 14.7 Update `docs/technical/PROVIDERS.md` to reflect new prompt contract
- [ ] 14.8 Final regression test: all translation methods (select-element, page translation, context menu, FAB, popup, sidepanel) — including RTL languages
