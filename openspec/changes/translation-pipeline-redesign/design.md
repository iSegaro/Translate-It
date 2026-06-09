## Context

The Translate-It extension's translation pipeline has grown organically into a tightly coupled system where DOM extraction, LLM prompt construction, batching, streaming, and DOM reconstruction are interleaved. A previous redesign attempt revealed the severity of these couplings — it caused complete regression and had to be reverted.

**Phase 0 analysis is now complete.** The root structural causes of those regressions are identified, confirmed with file/line evidence, and the architecture that resolves them is defined below. This document reflects the post-analysis, post-approval state — hypotheses have been replaced by decisions and subsequently refined through rigorous architectural review.

---

## Goals / Non-Goals

**Goals:**
- Eliminate inline boundary fragmentation by promoting block-level grouping to a first-class extraction primitive.
- Replace dead marker instructions in LLM prompts with a structurally-enforced segment count contract and safe printable marker guidelines.
- Implement a provider-safe, printable-only marker reconstruction protocol (`[--SEG:nN--]`) using a **reversible escaping scheme** (`[--ESCAPED_SEG:`) that splits translated block output back to individual text nodes stably across OpenAI, Gemini, Claude, and Google without content corruption or data loss.
- Enforce strict all-or-nothing rollback semantics: any structural mismatch, missing/corrupted marker, or segment count mismatch aborts the entire block group's reconstruction and restores original text node values using **immutable, session-scoped, owner-verified snapshots**.
- Revalidate all text node existence and DOM connection (`node.isConnected === true`) immediately before performing DOM mutations.
- Validate V2 vs V3 parity under a relaxed **semantic equivalence contract** during shadow comparison, tolerating layout-harmless browser whitespace, bidi isolating, and framework attribute normalizations.
- Move all pipeline-managed intermediate state out of the DOM (no `dataset.blockId` writes) into session-scoped WeakMap structures.
- Exclude `pre`, `code`, and `white-space: pre`/`pre-wrap` nodes from block grouping scope in Phase 1 — reintroduce incrementally with dedicated handling in a future phase.
- Maintain full V2 compatibility via feature flag throughout all migration phases.

**Non-Goals:**
- Redesigning provider APIs, rate limiting, circuit breaker logic, TTS, subtitle translation, or screen capture.
- Handling `pre`/`code`/preformatted node grouping in Phase 1.
- Implementing `<bdi>` element wrapping for bidi isolation (Phase 6 scope, not Phase 1).
- Changing the domtranslator library used by Whole Page Translation.

---

## Confirmed Architecture

### Decision D1 — Block Group Extraction

Text nodes sharing the same nearest block-level ancestor (`blockId`) are grouped into a **single logical translation unit** for dispatch to the LLM. The block group's text is a concatenation of member text nodes joined by internal whitespace markers. This resolves inline boundary fragmentation at the source.

**Scope boundary** (Decision D4): Nodes whose parent has `white-space: pre`, `white-space: pre-wrap`, `white-space: pre-line`, or whose tag is `PRE`, `CODE`, `TEXTAREA`, `SAMP`, `KBD` are **excluded from block grouping**. They are treated as individual segments under the V2 per-node model. This exclusion is enforced at extraction time.

**DOM side-effect prohibition** (Decision D3): `blockId` tracking MUST NOT write to `dataset.blockId` or any other live DOM attribute. The block group membership mapping is maintained in a **session-scoped WeakMap** held by the extraction context object, which is GC'd when the session ends.

### Decision D2 — Whitespace-Marker Reconstruction

Translated block group output is split back to individual text nodes using **printable-only whitespace markers**. These markers are:

- Injected by the pipeline at segment boundaries within the block group string before the LLM receives it.
- **Stable across all major tokenizers**: Formed purely of standard ASCII characters, preventing streaming-boundary corruption or provider-level sanitization/normalization.
- Removed by the reconstruction engine before writing to the DOM, with unescaping applied to restore any collision-escaped original source content.
- Entirely distinct from the dead `[[AIWC-0]]` architecture.

**Marker specification**:
- Format: `[--SEG:nN--]` where `nN` is the text node UID (e.g., `[--SEG:n3--]`).
- Collision-safe **Reversible Escaping**: The extraction layer converts any occurrences of `[--SEG:` in source content to `[--ESCAPED_SEG:`. Post-translation, the reconstruction engine restores them back to `[--SEG:`, preventing content corruption.
- Deterministic: generated from the node UID which is position-derived, not random.
- Corruption detection: Regex matching checks for absolute marker integrity. Malformed or truncated markers fail validation.
- All-or-Nothing Rollback: If a marker is absent, corrupted, or structurally mismatched, the entire block group's reconstruction is aborted, every node is rolled back to its original value using its immutable session-owned snapshot, and a critical error is logged.

### Decision D3 — Subtree Exclusion for Concurrency

Two concurrent translation sessions targeting overlapping DOM subtrees are prevented by **Strategy X (Exclusion)**:

- `DomTranslatorAdapter` maintains a `Set<Element>` of actively translating root elements (session-scoped).
- Before starting a new session, the root element is checked against the active set.
- If the root (or an ancestor/descendant of an active root) is already translating, the new session is rejected with a user notification and a logged warning.
- On session completion or cancellation, the root element is removed from the active set.

---

## Architectural Decisions (Locked)

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | Block-level grouping via session-scoped WeakMap | Resolves inline fragmentation; DOM-clean |
| D2 | Whitespace-marker reconstruction (`[--SEG:nN--]`) | Printable-only ASCII is tokenizer-safe; robust collision safety via reversible escaping |
| D3 | Subtree exclusion for concurrency | Simplest correct solution; no global lock overhead |
| D4 | `pre`/`code`/preformatted nodes excluded from grouping (Phase 1) | High reconstruction risk; spacing too sensitive |
| D5 | Segment count enforcement at pipeline layer (structural), not prompt layer (advisory) | Eliminates silent degradation; surfaces count mismatches as critical errors triggering rollback |
| D6 | Feature flag `FEATURE_SEMANTIC_BLOCK_GROUPING` (default `false`) | Safe rollback at any phase |
| D7 | `globalSelectElementState` namespaced by pipeline version | Prevents V2 and new-pipeline coexistence state collision |

---

## Risks / Trade-offs

| Risk | Impact | Mitigation |
|------|--------|-----------|
| LLM drops or corrupts whitespace markers | Low — reconstruction falls back cleanly and safely | Atomically aborts block group and restores original values using immutable session-owned snapshots. `logger.error` emitted. |
| Block group concatenation produces context ambiguity for LLM (two unrelated sentences joined) | Low — block boundaries are semantic containers (P, DIV, LI, etc.) | Block tag allowlist ensures groups are semantically cohesive; max group char limit enforced. |
| `pre`/`code` node exclusion causes visible translation gap in Phase 1 | Low — code blocks are typically untranslatable content anyway | V2 per-node path handles them as before; documented as Phase 1 scope boundary. |
| WeakMap extraction context GC'd before stream-end | Low — content script keeps reference alive for session duration | `DomTranslatorAdapter` holds explicit reference to extraction context for session lifetime. |
| RTL linguistic quality gate reveals regressions from block grouping (over-grouping unrelated sentences) | Medium | Shadow comparison + human RTL review before cutover; block group char limit (≤ 500 chars) constrains grouping. |
| `globalSelectElementState` namespacing breaks revert for sessions started before migration | Low — revert reads version tag; unversioned entries use V2 revert path | Backward-compatible revert: untagged entries fall through to V2 revert logic. |

---

## Migration Plan

All phases are independently deployable and independently rollback-able via `FEATURE_SEMANTIC_BLOCK_GROUPING` flag.

### Phase 1 — Spec Finalization (Current)
Revise all specs to reflect confirmed decisions D1–D7, printable marker contracts, reversible escaping, pre-apply connection validation, immutable session-owned snapshots, and semantic equivalence shadow diffing.

### Phase 2 — Enriched IR + Extraction Adapter
- Extend `TranslationUnit` schema: `{id, blockId, text, leadingWS, trailingWS, preWhitespace, directionHint, inlineParentTags}`.
- Implement reversible escaping to convert `[--SEG:` to `[--ESCAPED_SEG:` in source text contents.
- Implement block group extractor in `DomTranslatorUtils.js` with session-scoped WeakMap and `pre`/`code` exclusion.
- Feature flag gates extraction path; V2 path unchanged.
- Unit tests: 5 ownership dimensions × 3 test cases minimum.

### Phase 3 — Whitespace-Marker Reconstruction Engine
- Implement `BlockGroupReconstructor` in `src/features/element-selection/core/`.
- Collision-safe printable marker injection before LLM dispatch; marker removal + text splitting using regex matching post-LLM, with unescaping applied to restore `[--ESCAPED_SEG:` back to `[--SEG:`.
- **Pre-Apply Connection Revalidation**: Validate `node.isConnected === true` for all nodes in the block group immediately before mutation.
- **Atomic Rollback**: If a marker is absent, corrupted, or connection revalidation fails, restore all nodes to original values using **immutable, session-scoped, owner-verified snapshots** and emit `logger.error` telemetry.
- Subtree exclusion guard via `activeRoots` Set.
- Unit tests: marker injection, splitting, unescaping, collision safety, pre-apply revalidation, all-or-nothing rollback, concurrency exclusion, cancellation safety.

### Phase 4 — Prompt Simplification + Structural Count Enforcement
- Remove dead marker instructions from `PROMPT_BASE_AI_BATCH` and `PROMPT_BASE_AI_BATCH_AUTO`.
- Add explicit printable marker copy instructions to prompt builder.
- Add segment count structural validation: response count ≠ expected count → log error + atomic rollback.
- Preserve `$_{PROMPT_INSTRUCTIONS}` injection for user-configurable linguistic guidance.

### Phase 5 — Bidi Handling
- Direction metadata captured at extraction: `directionHint` in IR.
- `dir` attribute propagation post-reconstruction.
- Bidi control character stripping from LLM input; re-applied by reconstruction.
- Test: mixed Persian/English paragraph, inline `dir` attributes, `unicode-bidi: isolate` CSS.

### Phase 6 — Migration Validation (Shadow Comparison)
- Enable shadow mode: both pipelines run on deeply cloned subtrees; only V2 result is shown to the user.
- **Reconstruction-Only Verification**: Asserts structural IR boundary and segment count matching.
- **Semantic Equivalence DOM Structural Diffing**: Deep recursive comparison of cloned post-reconstruction subtrees, tolerating layout-harmless whitespace, bidi isolation mark, and reactive element attribute normalizations.
- Surfacing any actual reconstruction corruption as a critical error.
- RTL linguistic quality review (human-evaluated: Persian, Arabic, Hebrew).
- Resolve all divergences before cutover approval.

### Phase 7 — Cutover
- Flip `FEATURE_SEMANTIC_BLOCK_GROUPING` default to `true`.
- Remove shadow comparison code.
- Remove V2 extraction and marker-instruction prompt code paths.
- Update `SELECT_ELEMENT_SYSTEM.md`, `WHOLE_PAGE_TRANSLATION.md`, `TRANSLATION_SYSTEM.md`, `PROVIDERS.md`.

---

## Rollback Guarantees

| Phase | Rollback action | Effect |
|-------|----------------|--------|
| Phase 2 | Set flag `false` | V2 extraction, V2 prompt, V2 reconstruction |
| Phase 3 | Set flag `false` | Full V2 path; no WeakMap, no markers |
| Phase 4 | Set flag `false` | V2 prompts with original marker instructions |
| Phase 5 | Set flag `false` | V2 bidi handling |
| Phase 6 | Set flag `false` | Shadow comparison disabled; V2 production |
| Phase 7 | Cannot flag-rollback; requires code revert | Post-cutover: revert commit |

**Invariant**: Until Phase 7, the feature flag is the complete rollback mechanism. No data migration, no schema change, no cleanup step is required.

---

## Failure Handling

### LLM drops or corrupts whitespace markers
- Reconstruction detects marker corruption or omission (missing `[--SEG:nN--]` pattern matching).
- Aborts reconstruction immediately for the entire block group.
- Restores original values using the **immutable, session-scoped, owner-verified snapshots** (All-or-Nothing).
- Emits a critical error: `logger.error('[Reconstruction] Reconstruction contract violation: marker corruption or omission in block ${blockId}.')`

### LLM returns fewer or extra segments than expected (count mismatch)
- `_validateSegmentCount(expected, actual)` called after each response.
- If `actual !== expected`: `logger.error('[Reconstruction] Structural segment count mismatch: expected ${expected}, received ${actual}')` + atomic rollback of the entire block group using owner-verified snapshots.

### Pre-apply validation finds stale/detached node reference
- Before mutating DOM, validates `node.isConnected === true` for all text nodes.
- If any node in group is detached: aborts the group apply, restores original text using owner-verified snapshots, and emits `logger.error('[Reconstruction] Aborting block group apply: stale/detached node reference found.')`

### Rollback Snapshot Ownership Violation
- When rollback/revert is requested, verifies calling session matches snapshot owner.
- Mismatched or stale sessions reject the restore to prevent race conditions and out-of-order overrides.
- `logger.warn('[Rollback] Block group rollback rejected: session ID mismatch.')`

### Session cancelled mid-stream
- Atomic rollback applies to any in-flight block group mutation.
- Already-written block groups (completed successfully) remain translated; pending block groups retain original text.
- Stable partial state guarantees that no text node is left empty or contains raw marker tokens.
- Subtree exclusion guard cleared on cancellation.

### Subtree exclusion fires
- User receives notification: "Translation is already in progress for this element".
- No DOM writes occur for the rejected session.
- `logger.warn('[DomTranslatorAdapter] Subtree exclusion: root element is already translating')`

### `pre`/`code` node encountered during extraction
- Node is extracted with `V2_PASSTHROUGH` flag in IR.
- Routed to V2 per-node path regardless of feature flag state.
- `logger.debug('[Extractor] Node excluded from block grouping (preformatted): ${tagName}')`

---

## Open Questions (Resolved)

| Question | Decision |
|----------|----------|
| Reconstruction: marker vs. positional-length | **Printable whitespace-marker** (`[--SEG:nN--]`) |
| `white-space: pre` nodes — include with flag or exclude? | **Exclude from grouping** in Phase 1 |
| `dataset.blockId` DOM mutation | **Prohibited** — use session-scoped WeakMap only |
