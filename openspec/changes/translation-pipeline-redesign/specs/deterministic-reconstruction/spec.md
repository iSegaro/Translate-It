## ADDED Requirements

> **Status**: LOCKED. Decisions D2 (whitespace-marker reconstruction), D3 (subtree exclusion), and Strategy B (incremental-safe streaming) are confirmed and approved.

---

## Whitespace-Marker Protocol

This is the core reconstruction mechanism. It is an **internal-only** protocol — markers are never LLM-visible as semantic constructs; they are structural delimiters embedded within concatenated block group text.

### Marker Specification

| Property | Value |
|----------|-------|
| Format | `[--SEG:nN--]` (e.g. `[--SEG:n3--]`) |
| Delimiter | `[--SEG:` and `--]` (ASCII printable-only, tokenizer-safe, streaming-boundary resilient) |
| Payload | Node UID (`nN`) matching `TranslationUnit.id` |
| Collision safety | **Reversible Escaping**: occurrences of `[--SEG:` in source text are escaped to `[--ESCAPED_SEG:` at extraction, and unescaped back to `[--SEG:` at reconstruction time, ensuring zero content corruption or data loss |
| LLM behavior | Tokens are composed of standard, printable ASCII characters, which are parsed stably across OpenAI, Gemini, Claude, and Google providers |
| Corruption detection | Robust regex checking of the exact marker format. Any malformed or partially written marker (e.g., `[--SE:n3--]`) fails validation |
| Parsing guarantees | Deterministic splitting using strict regular expressions matching `/\[--SEG:n\d+--\]/` |
| Failure recovery | **All-or-Nothing Rollback**: If a marker is absent, corrupted, or structurally mismatched, the entire block group reconstruction is aborted and rolled back to original text |
| Relationship to `[[AIWC-0]]` | **Completely unrelated**. Different format, different purpose, different protocol. The `[[AIWC-0]]` system is dead code that will be removed in Phase 4. |

### Block Group Assembly (Injection)

```
Group nodes: [n1: "Hello ", n2: "world", n3: "."]
Assembled block: "Hello [--SEG:n2--]world[--SEG:n3--]."
```

- First node in group has no leading marker — its start is the block start
- Each subsequent node is preceded by `[--SEG:nN--]` where `nN` is that node's UID
- The assembled block string is the `text` field of the block group sent to the LLM

### Block Group Reconstruction (Splitting & Reversible Unescaping)

```
Translated block: "مرحبا [--SEG:n2--]بالعالم[--SEG:n3--]."
Split at markers → ["مرحبا ", "بالعالم", "."]
Map to nodes:       [n1,        n2,          n3]

Reversible Unescaping: If any split chunk contains "[--ESCAPED_SEG:",
                       it is unescaped back to "[--SEG:" to restore original content.

Write:   n1.nodeValue = leadingWS_n1 + unescape("مرحبا") + trailingWS_n1
         n2.nodeValue = leadingWS_n2 + unescape("بالعالم") + trailingWS_n2
         n3.nodeValue = leadingWS_n3 + unescape(".") + trailingWS_n3
```

---

### Requirement: Reconstruction must be deterministic given the same IR and translation output

The reconstruction engine SHALL produce identical DOM output for identical `TranslationUnit` IR + translation result inputs. It SHALL NOT use heuristics, pattern matching on translated text, or LLM-generated markers to locate DOM insertion points.

#### Scenario: Same input always produces same DOM output
- **WHEN** `BlockGroupReconstructor.apply(blockGroup, translatedBlockText)` is called twice with identical inputs
- **THEN** the resulting DOM node values are identical in both calls

---

### Requirement: DOM Existence and Connection Revalidation Immediately Before DOM Apply

The reconstruction engine MUST verify that all text nodes belonging to a block group are still actively connected to the live DOM immediately before mutating their values.

#### Scenario: All nodes connected allows apply
- **WHEN** all text nodes in a block group have `node.isConnected === true` and their parent nodes are intact
- **THEN** reconstruction continues and applies the translation synchronously

#### Scenario: Detached or stale node aborts reconstruction
- **WHEN** any text node in a block group is detached (`node.isConnected === false`) or replaced due to framework reactive re-rendering during async LLM latency
- **THEN** the reconstruction engine:
  1. Aborts the entire block group translation immediately
  2. Emits `logger.error('[Reconstruction] Stale node reference in block ${blockId}. Aborting apply to preserve DOM boundaries.')`
  3. Rolls back any touched nodes in that block group to their original text node values (All-or-Nothing)
  4. Does NOT crash the main thread, allowing the rest of the page to remain stable

---

### Requirement: Immutability and Session-Scoped Ownership Rules for Rollback Snapshots

To prevent stale-session restores, memory leaks, and overlapping execution race conditions, the system MUST enforce strict boundaries and immutability rules for rollback snapshots.

#### Scenario: Snapshots are strictly immutable
- **WHEN** a translation session captures the original text node contents during the extraction phase
- **THEN** these snapshots are stored in an immutable data structure (deep-copied strings or read-only map mappings) that cannot be altered by subsequent streaming operations or adjacent translation sessions

#### Scenario: Snapshots are session-scoped and namespaced per block group
- **WHEN** snapshots are registered in `DomTranslatorState`
- **THEN** they are keyed strictly by the combination of `(sessionId, blockId)`
- **AND** no global or un-namespaced snapshot pools are allowed to exist

#### Scenario: Rollback verifies session ownership before restoring
- **WHEN** a rollback or revert is triggered for a block group or root element
- **THEN** the engine compares the current active session ID with the owner ID of the captured snapshot
- **AND** if the session ID does not match exactly or is identified as stale/superseded, the restore operation is rejected, and a warning is logged: `logger.warn('[Rollback] Block group ${blockId} rollback rejected: session ID mismatch.')`

---

### Requirement: All-or-Nothing Reconstruction with Strict Rollback and Telemetry

Grouped block reconstruction MUST be atomic. Partial application of translations within a block group is strictly prohibited. If any validation fails, the entire block group is rolled back to its original state.

#### Scenario: Reversible escaping restores delimiters to source text
- **WHEN** a source text contains `"Hello [--SEG:n3--] world"`
- **THEN** the extractor escapes the sequence: `"Hello [--ESCAPED_SEG:n3--] world"`
- **AND** post-translation, the unescaping logic restores the exact sequence `"Hello [--SEG:n3--] world"` inside the final `nodeValue` text written to the DOM

#### Scenario: Malformed/corrupted/missing marker aborts and rolls back block group
- **WHEN** the LLM response is returned and a marker is corrupted (e.g. `[--SE:n2--]`) or missing entirely
- **THEN** the reconstruction engine:
  1. Detects the corruption or missing marker structure
  2. Emits a critical error: `logger.error('[Reconstruction] Reconstruction contract violation: marker absent or corrupted in block ${blockId}.')`
  3. Aborts reconstruction for the entire block group
  4. Restores all nodes in this block group to their original text node values using the immutable session-scoped snapshot
  5. Does NOT write partial block text to the DOM or silently discard segments

---

### Requirement: Reconstruction must satisfy the Streaming Safety Invariant — Strategy B (Incremental-Safe)

**Strategy B is the operative strategy** (confirmed by Phase 0 analysis). Each incremental streaming write IS itself a valid, complete, stable DOM state. When a batch of K block groups arrives as a streaming chunk:
- All K block groups are reconstructed atomically within a single synchronous execution context
- After the write, the DOM contains: all K newly-translated block groups (fully applied) + all remaining untranslated block groups in their original state
- No node within a block group is partially written — a block group write is all-or-nothing

---

### Requirement: Reconstruction must satisfy the Partial Batch Update Invariant

If a translation session of N block groups is cancelled after M < N block groups are complete, the DOM MUST be in one of exactly two states:
- All N original block groups (if cancelled before any write)
- All M translated block groups + (N-M) original block groups (if cancelled mid-stream)

No other states are permissible.

---

### Requirement: Reconstruction must satisfy the Concurrency Ordering Invariant — Strategy X (Subtree Exclusion)

**Strategy X is the operative strategy** (Decision D3). Overlapping subtree sessions are rejected at the point of session initiation, before any extraction or DOM writes occur.

**Implementation**:
- `DomTranslatorAdapter` maintains a module-level `activeTranslationRoots: Set<Element>`
- `translateElement(element)` checks: if `activeTranslationRoots` contains `element` OR any ancestor/descendant of `element`, reject the new request
- On session start: `activeTranslationRoots.add(element)`
- On session end (success or cancellation): `activeTranslationRoots.delete(element)`

---

### Requirement: Reconstruction must satisfy the Flicker Prevention Invariant — CSS Visibility Gate per Block Group

Each block group's DOM writes are gated by a CSS class that hides the block's content during reconstruction and reveals it on completion. This prevents visible intermediate states at the block group level.

**Implementation**:
- Before reconstructing a block group: add class `ti-translating` to the block group's root element (the element that owns the `blockId`)
- `ti-translating` CSS: `visibility: hidden` (not `display: none` — preserves layout)
- After all nodes in the block group are written: remove class `ti-translating`
- The add-write-remove sequence is synchronous — no frame renders with `visibility: hidden` applied for longer than one synchronous execution tick

---

### Requirement: Reconstruction must satisfy the Cancellation Safety Invariant — Stable Partial State

At any point during a streaming translation, calling cancel MUST result in a **stable partial state** (completed block groups remain translated; pending block groups retain original text). Full rollback (reverted to all-original) is available via the existing Revert mechanism.

---

### Requirement: Segment count mismatch is a structural error triggering all-or-nothing rollback

When the LLM returns a number of block group results that does not match the number sent, or when the response violates the expected structural mappings, the entire block group reconstruction is aborted and rolled back.
