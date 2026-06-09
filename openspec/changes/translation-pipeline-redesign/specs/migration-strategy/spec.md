## ADDED Requirements

> **Status**: LOCKED. Decision D6 (feature flag), Decision D7 (namespaced state), and the findings of Phase 0 analysis are confirmed and approved.

---

### Requirement: New pipeline must be feature-flagged and disabled by default

The redesigned pipeline SHALL be controlled by a feature flag `FEATURE_SEMANTIC_BLOCK_GROUPING` that defaults to `false` (V2 behavior active). The flag SHALL be togglable without a page reload or extension reinstall.

#### Scenario: Default behavior is V2
- **WHEN** the extension loads with no explicit feature flag override
- **THEN** all translation flows use the existing V2 pipeline

#### Scenario: Flag enables new pipeline
- **WHEN** `FEATURE_SEMANTIC_BLOCK_GROUPING` is set to `true`
- **THEN** all translation flows route through the new block-group-based pipeline

---

### Requirement: Precise Shadow Comparison Scope via Semantic Equivalence Validation

During the migration validation phase, the shadow-mode comparison system MUST operate with double validation gates, running both **reconstruction-only metadata verification** and **final DOM structural semantic equivalence diffing** to eliminate any false confidence during rollout.

To prevent false-positive failures during structural comparisons, the shadow diff system SHALL compare the final post-reconstruction trees of the V2 and V3-block pipelines (run on cloned subtrees) under a **semantic equivalence contract** rather than strict byte-perfect comparisons.

#### Scenario: Reconstruction-only comparison verifies metadata parity
- **WHEN** a translation request occurs in shadow mode
- **THEN** the system compares the extracted metadata: verifying that segment boundaries, UIDs, and block grouping bounds align perfectly with the target textual content
- **AND** any segment count mismatch between V2 extraction units and V3 block extraction subunits is logged as a critical error

#### Scenario: Semantic equivalence shadow diff tolerates minor runtime variations
- **WHEN** comparing the final reconstructed cloned trees of the V2 versus V3 pipelines
- **THEN** the comparison engine asserts equivalence of critical node structures, tag sequencing, translation contents, and reading directions, while tolerating:
  - **Browser whitespace normalization**: Treating different whitespace patterns (multiple spaces, newlines, tabs) similarly when they have identical layout rendering.
  - **Bidi isolation mark normalization**: Disregarding differences in invisible bidirectional markers (like `U+200E` LRM, `U+200F` RLM, or `U+202C` PDF) that have identical textual layout direction.
  - **Harmless runtime/framework attributes**: Ignoring dynamic reactive track attributes or unique ID strings appended by front-end framework compilation (e.g. `data-v-*` or framework internal indexing keys).
- **AND** any actual structural, positional, or translation value corruption (e.g. missing nodes, swapped child orders, incorrect content translation mappings) is logged as a critical shadow mismatch error

---

### Requirement: Shadow comparison must validate semantic translation equivalence

Structural output equivalence is necessary but insufficient for migration approval. The migration validation phase SHALL include a semantic quality validation step that confirms translated text is linguistically equivalent — not just structurally placed correctly.

#### Scenario: RTL linguistic quality gate required before cutover
- **WHEN** the migration validation phase reaches the cutover approval gate
- **THEN** a human-evaluated sample of RTL translations (Persian, Arabic, Hebrew) using the new pipeline must be reviewed and confirmed linguistically correct — automated structural diff alone is not sufficient

#### Scenario: Mixed-direction content quality validated
- **WHEN** shadow comparison runs on a page containing mixed Persian/English content
- **THEN** the translated output is evaluated for: correct word order in translated sentences, correct punctuation placement, and correct bidi rendering — not just for DOM structural match

---

### Requirement: Rollback must be instantaneous and guaranteed state-clean

The migration strategy SHALL ensure that disabling the feature flag `FEATURE_SEMANTIC_BLOCK_GROUPING` immediately restores V2 behavior without any data migration, schema change, or cleanup step.

#### Scenario: Flag off restores V2 immediately
- **WHEN** the feature flag is set to `false` at runtime
- **THEN** the next translation request uses V2 pipeline; no restart or cleanup is required

#### Scenario: Zero persistent DOM or state contamination on rollback
- **WHEN** the new pipeline is active, executes several translations, and then the feature flag is flipped to `false`
- **THEN** all subsequent extractions and translations operate entirely on the legacy V2 paths, and no metadata written by the new pipeline affects the V2 logic (guaranteed by WeakMap-only tracking and namespace isolation)

---

### Requirement: New pipeline phases must be independently deployable

Each migration phase (IR layer, extraction adapter, reconstruction engine, prompt simplification) SHALL be independently deployable and independently disableable. No phase SHALL be a prerequisite for rolling back a previous phase.

---

### Requirement: Strict Coexistence and State Isolation

To prevent race conditions, memory leaks, and state contamination when V2 and new pipeline components coexist during the migration phase, the system MUST enforce absolute boundaries between their runtimes.

#### Scenario: State namespacing by pipeline version
- **WHEN** a translation session is initialized
- **THEN** `globalSelectElementState` and intermediate revert structures are namespaced or tagged explicitly with the pipeline version (`v2` or `v3-block`)
- **AND** a revert action reads the version tag to invoke the appropriate reversion algorithm, ensuring a V2 revert does not touch V3-scoped state and vice versa

#### Scenario: Extraction leaves DOM clean of block metadata
- **WHEN** the new pipeline extracts a DOM subtree
- **THEN** it assign block IDs and node IDs purely within a session-scoped `WeakMap<Element, string>` context
- **AND** no `dataset.blockId` or custom attributes are written to the live DOM elements, avoiding MutationObserver cascades and framework hydration mismatches

---

### Requirement: Failure Handling with All-or-Nothing Rollback and Snapshot Ownership Checks

The system MUST enforce strict atomic block group reconstruction, backed by immutable session-owned rollback snapshots.

#### Scenario: Rollback verifies session ownership of immutable snapshot
- **WHEN** a rollback or revert is triggered for a block group or target root element
- **THEN** the rollback system verifies that the caller's session ID matches the owner ID of the immutable rollback snapshot captured during extraction
- **AND** any stale or mismatched session restoration request is rejected to avoid overlapping mutation race conditions

#### Scenario: Stale or detached node during async LLM latency triggers abort and rollback
- **WHEN** a block group is ready to be written to the DOM, but immediately before apply, a check shows one or more text nodes are detached (`node.isConnected === false`) or mutated by external framework scripts
- **THEN** the entire block group reconstruction is aborted
- **AND** all other text nodes in the group are immediately rolled back to their original values using their immutable session-owned snapshot
- **AND** the system emits a critical error: `logger.error('[Reconstruction] Aborting block group ${blockId} due to stale or detached node reference.')`

#### Scenario: Missing, corrupted, or mismatched printable markers triggers full rollback
- **WHEN** the LLM response is returned, but the printable markers `[--SEG:nN--]` are missing, partially corrupted, or their positions do not match the expected structural segment mappings
- **THEN** the reconstruction engine:
  1. Aborts reconstruction for the entire block group immediately
  2. Restores all text nodes in this block group to their original values (all-or-nothing) using their immutable session-owned snapshot
  3. Emits `logger.error('[Reconstruction] Reconstruction contract violation: marker mismatch or corruption in block ${blockId}.')`
  4. Never performs a partial apply or writes incomplete/garbled block text to the first node

#### Scenario: Segment count mismatch (Under-count or Over-count)
- **WHEN** the parsed response has a segment count that diverges from the expected count
- **THEN** the pipeline:
  1. Aborts the entire block group reconstruction
  2. Rolls back all touched text nodes to their original values using their immutable session-owned snapshot
  3. Emits `logger.error('[Reconstruction] Structural segment count mismatch: expected ${expected}, received ${actual}. Rolling back.')`

#### Scenario: Overlapping concurrent subtree translation requested
- **WHEN** a new translation is requested on a DOM subtree that overlaps with an active translation session (Strategy X - Subtree Exclusion)
- **THEN** the new session is rejected, a warning is logged, and the user is notified without any changes or extraction occurring in the DOM

#### Scenario: Preformatted node encountered
- **WHEN** a text node belongs to a `pre`, `code`, or `white-space: pre` element (Decision D4)
- **THEN** the node is marked with `mode: 'V2_PASSTHROUGH'` in the IR
- **AND** it bypasses the block-grouping pipeline completely, routing instead through the V2 per-node flow to preserve whitespace sensitivity

#### Scenario: Session cancelled mid-stream
- **WHEN** a streaming translation session is cancelled mid-stream
- **THEN** all written block groups (which completed with all-or-nothing success) remain translated, all pending block groups retain their original values, the subtree exclusion lock is immediately cleared, and the UI remains in a stable partial state
