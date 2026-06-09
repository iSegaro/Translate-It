## Why

The current translation pipeline has three distinct failure modes confirmed by Phase 0 analysis:

1. **Inline boundary fragmentation**: The pipeline extracts raw text nodes individually. A sentence spanning `<p>Hello <b>world</b>.</p>` becomes 2–3 independent segments — the LLM translates them without grammatical context, breaking morphological agreement in Persian/Arabic compound words and clitic attachment.

2. **Non-enforced segment count contract**: When the LLM returns fewer results than expected, the pipeline silently falls back to original text without propagating an error. Mismatches are only `warn()`-logged.

3. **Dead marker instructions in prompts**: The `[[AIWC-0]]` and `<n1/>` references in `PROMPT_BASE_AI_BATCH` are vestigial from a reverted architecture. The actual payload uses UID-tagged JSON. These zombie instructions contradict the real payload format and create semantic confusion with no benefit.

The architectural redesign promoted by Phase 0 findings and approved here:
- Promotes `blockId` from a metadata hint to a **first-class grouping primitive** — text nodes sharing the same block-level ancestor are grouped into a single logical translation unit, eliminating inline fragmentation.
- Replaces dead marker instructions with a clean, structurally-enforced prompt contract and safe printable marker guidelines.
- Adds a **collision-safe, provider-safe printable marker contract** (`[--SEG:nN--]`) using a **reversible escaping pattern** (`[--ESCAPED_SEG:`) to prevent source text marker collisions and guarantee zero data corruption.
- Implements **strict all-or-nothing rollback semantics** backed by **immutable, session-scoped, owner-verified snapshots** to eliminate race conditions and stale-session restores.
- Revalidates node connection (`node.isConnected`) immediately before DOM mutation to ensure DOM synchronization safety.
- Moves all intermediate state out of the live DOM (`dataset.blockId` removed) into session-scoped WeakMap structures.

## What Changes

- **Phase 0 — Complete**: Formal architectural audit produced. Root causes confirmed. Hypotheses validated. Architecture approved.
- **Phase 1 — Spec finalization**: Specs revised to reflect confirmed architecture, printable marker contracts, reversible escaping, pre-apply connection validation, immutable session-owned snapshots, and semantic equivalence shadow diffing.
- **Phase 2 — IR enrichment**: Extend `{t, i, b, r}` tuple to include whitespace boundary metadata, CSS context flags, direction hints, and reversible escaping of `[--SEG:` in source text. Exclude `pre`/`code`/`white-space:pre` nodes from block grouping in Phase 1 scope.
- **Phase 3 — Extraction adapter**: Block-group extractor replacing per-text-node extraction for standard nodes. Uses session-scoped WeakMap for `blockId` tracking — no DOM writes.
- **Phase 4 — Reconstruction engine**: Whitespace-marker-based reconstruction. Printable markers (`[--SEG:nN--]`) are injected at segment boundaries. Post-translation, markers are validated, text is split, and escaped source patterns are restored. Checks DOM connection before mutating, enforcing strict all-or-nothing rollback using session-verified immutable snapshots and emitting error telemetry.
- **Phase 5 — Prompt simplification**: Remove dead marker instructions. Instruct the LLM to preserve active printable segment markers. Enforce segment count structurally in the pipeline with strict rollback on mismatch.
- **Phase 6 — Bidi handling**: Direction metadata, isolation boundaries, punctuation normalization for RTL content.
- **Phase 7 — Migration validation (Shadow Comparison)**: Enable shadow mode on cloned subtrees. Perform **dual validation gates** consisting of **reconstruction-only verification** and **semantic equivalence DOM structural diffing** (tolerating layout-harmless whitespace, bidi, and framework attribute normalization) combined with an RTL linguistic quality gate before cutover approval.
- **Phase 8 — Cutover and cleanup**: Feature flag flipped, V2 code paths removed, documentation updated.
- **BREAKING** *(Phase 5)*: `[[AIWC-0]]`, `<n1/>`, and equivalent marker instructions removed from all LLM prompts. Segment count enforcement moves from prompt advisory text to pipeline-level structural validation.

## Capabilities

### New Capabilities

- `pipeline-architecture-analysis` ✅ **Complete** — Formal technical report produced. Root causes confirmed (inline fragmentation, non-enforced count contract, dead marker instructions). All five hypotheses rendered verdicts. Architecture approved.

- `semantic-ir-layer` — Enriched `TranslationUnit` IR: `{id, blockId, text, leadingWS, trailingWS, preWhitespace, directionHint, inlineParentTags}`. Block-level grouping is the primary structural innovation. `pre`/`code`/preformatted nodes are excluded from grouping scope in Phase 1. Complete reversible escaping of segment delimiters for source text collision-resistance.

- `deterministic-reconstruction` — Whitespace-marker-based reconstruction engine using the printable `[--SEG:nN--]` marker contract with unescaping. Revalidates node connection (`node.isConnected`) immediately before mutating, and implements strict all-or-nothing rollback (aborting and restoring original values using immutable, session-scoped, owner-verified snapshots) on any marker corruption or structural mismatch. Strategy B (incremental-safe) + Strategy X (subtree exclusion).

- `bidi-text-handling` — First-class RTL support. Direction metadata captured at extraction. BiDi marks (RLM/LRM) applied at segment boundaries. `dir` attribute propagated post-reconstruction. Mixed-direction content validated as part of migration quality gate.

- `prompt-simplification` — Dead marker instructions (`[[AIWC-0]]`, `<n1/>`) removed. Stable instruction to copy `[--SEG:nN--]` markers verbatim. Segment count enforcement moved to pipeline structural validation layer.

- `migration-strategy` — Feature flag `FEATURE_SEMANTIC_BLOCK_GROUPING` (default `false`). Independent per-phase rollback. Shadow comparison with dual gates (reconstruction verification + semantic equivalence DOM structural diffing on cloned elements). RTL linguistic quality gate before cutover. `globalSelectElementState` namespaced by pipeline version for safe coexistence.

### Modified Capabilities

- `promptBuilder.js` — Dead marker references removed. New `buildBlockGroupPrompt()` function for grouped-segment mode with printable marker preservation rules. Legacy `buildPrompt()` preserved under feature flag `false` path.
- `DomTranslatorUtils.js` — `collectTextNodes()` extended to return block groups. `blockId` tracking moved from `dataset.blockId` DOM writes to session-scoped `WeakMap` (no live DOM mutations), with reversible delimiter sequence escaping.
- `DomTranslatorAdapter.js` — Reconstruction logic updated to use printable marker splitting, reversible unescaping, pre-apply DOM revalidation, and session-owned atomic rollback.

## Impact

- **`src/features/element-selection/core/DomTranslatorUtils.js`** — `collectTextNodes()`: block grouping, WeakMap-based `blockId` tracking, `pre`/`code` node exclusion, reversible delimiter sequence escaping.
- **`src/features/element-selection/core/DomTranslatorAdapter.js`** — Reconstruction: `BlockGroupReconstructor` integration, printable marker parsing, unescaping, pre-apply connection validation, session-owned all-or-nothing rollback, subtree exclusion guard.
- **`src/features/translation/core/managers/OptimizedJsonHandler.js`** — `_mapResults()`: block-group-aware result mapping, structural segment count validation and error rollback.
- **`src/features/translation/utils/promptBuilder.js`** — Dead marker instruction removal, new block-group prompt branch with marker preservation guidelines.
- **`src/shared/config/config.js`** — `PROMPT_BASE_AI_BATCH` updated, `FEATURE_SEMANTIC_BLOCK_GROUPING` flag added.
- **`src/features/page-translation/PageTranslationBridge.js`** — `dataset.blockId` reads replaced with session-context WeakMap lookups.
- **Docs** — `SELECT_ELEMENT_SYSTEM.md`, `WHOLE_PAGE_TRANSLATION.md`, `TRANSLATION_SYSTEM.md`, `PROVIDERS.md` updated at Phase 8.
