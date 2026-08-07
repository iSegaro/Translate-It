# Translation Identity and Fragment Contract

Authoritative reference for how the translation pipeline derives logical identity, detects duplicates, and aggregates split transport fragments. It documents **current production behavior** of the structured `OptimizedJsonHandler` workflow.

- **Owner(s)**: `OptimizedJsonHandler`, `TranslationBatcher`, `RequestUnitManifest`, `TranslationContractValidator`, `AIResponseParser`
- **Consumers**: `DomTranslatorAdapter`, `PdfTranslationAdapter`, `BlockGroupReconstructor`
- **Scope**: structured Select Element and PDF flows
- **Status**: final for the documented scope

---

## 1. Purpose and Scope

Logical identity is required because:

- **Positional mapping alone is unsafe.** Providers may reorder, drop, or re-emit items. Relying on array index risks assigning a translation to the wrong unit.
- **Duplicate identities can hide missing units.** If the same identity is emitted twice, the second occurrence can mask the absence of a third unit unless duplicates are detected.
- **Structured PDF cells may share a block identity.** Multiple cells of one block carry the same `blockId`; per-cell identity is needed to keep them distinct.
- **Split fragments are transport units, not logical translation units.** Oversized units are split for transport; only the assembled parent is a valid logical result.

This contract currently applies to the **structured Select Element** and **PDF** flows handled by `OptimizedJsonHandler`. It is not the universal representation for every translation mode.

---

## 2. Terminology

| Term | Definition |
|---|---|
| **logical unit** | A single translatable semantic unit (a text node, a PDF cell, a block group) that the consumer treats as one result. |
| **transport fragment** | A split piece of an oversized unit, produced for batching limits. Fragments carry identity metadata that references the parent. |
| **parent identity** | The logical identity a fragment belongs to. Used to reassemble fragments into one result. |
| **response identity** | The identity value returned by the provider in a structured response that is matched back to a source unit. |
| **manifest unit** | A request-owned record in `RequestUnitManifest` identifying one input unit by `unitId` and `requestIndex`. |
| **same-batch duplicate** | The same logical identity appearing more than once within one completed batch response. |
| **cross-batch duplicate** | The same logical identity appearing in a later batch after it was already accepted earlier in the same `execute()` request. |
| **assembled parent** | The single logical output produced by concatenating the ordered fragments of one parent. |

**Source identity differs from translated text equality.** Identity is determined by structural id fields (`uid`/`cellId`/`i`/`id`/`blockId`), not by comparing text. Two distinct source units may translate to identical text; that is not a duplicate. Conversely, one unit returned twice with different text is still a duplicate if identity matches.

---

## 3. Logical Identity Precedence

`OptimizedJsonHandler` resolves the logical identity of a structured item using a **nullish coalescing chain**:

```js
item.uid ?? item.cellId ?? item.i ?? item.id ?? item.blockId
```

- **Nullish semantics are intentional.** The chain only falls through on `null`/`undefined`. It does not skip other falsy values.
- **Numeric `0` is valid.** `0` is a valid identity (e.g. `cellId: 0`); it is not treated as "missing".
- **`uid` takes precedence.** When present, it is the identity.
- **`cellId` prevents structured PDF cells sharing one `blockId` from colliding.** Distinct cells of one block normally share `i`/`blockId`; the cell-level `cellId` disambiguates them.
- **Non-PDF items normally fall through to `i`/`id`/`blockId`.** When no `uid`/`cellId` exists, identity resolves from the legacy fields.

Do not interpret this as an `||` fallback: `0` and other falsy values are preserved, not skipped.

---

## 4. PDF Structured Cell Identity

For structured PDF cells, two identity axes coexist:

| Field | Role |
|---|---|
| `blockId` / `i` | **Block-level grouping identity** — all items of one PDF block share it. Used to group a block's lines/cells together. |
| `cellId` | **Per-cell logical identity** — distinguishes individual cells within a block that otherwise share `blockId`. |

Rules:

- **Multiple cells from the same block are valid.** Sharing `blockId` is expected and does not make them duplicates.
- **Duplicate `cellId` in one batch is invalid** and is treated as a same-batch duplicate.
- **`cellId: 0` is valid** and preserved by the nullish identity chain.
- **Cell ordering remains positional after identity validation.** Within a block, cells are placed by their positional index once identity validation passes.
- **Missing cells remain unresolved without shifting later cells.** A missing cell leaves a gap; it does not cause subsequent cells to slide into the wrong position.

---

## 5. Same-Batch Duplicate Policy

> A same logical identity appearing twice in **one completed batch** →
> typed fatal `VALIDATION` error →
> no stream emission for that batch.

- **Same-text and different-text duplicates are treated equally.** Duplicate detection is identity-based, not text-based.
- **A duplicate count cannot mask a missing unit.** The fatal error aborts the batch rather than accepting a duplicate that would hide an absent unit.
- **Fragments are not handled by this plain-item duplicate rule until assembled.** Raw fragments are suppressed/assembled first; the plain duplicate rule applies to the assembled parent.
- **Original source remains feature-owned.** A duplicated unit is never silently source-filled to look like a success.

---

## 6. Cross-Batch Duplicate Policy

> **A logical identity already emitted earlier in the same `execute()` request → suppress the later occurrence → first accepted result wins → diagnostic emitted.**

- **Request-local scope.** Suppression uses a `Set` local to one `execute()` invocation.
- **Separate `execute()` calls may reuse the same identity.** There is no cross-call suppression and no global cache.
- **First accepted result wins.** The first occurrence survives; later ones are dropped.
- **Suppressed items are excluded from:**
  - streaming (`_streamResults`),
  - final accumulated results (`accumulatedResults`),
  - terminal manifest accounting (`acceptedManifestUnits`).

Diagnostic name:

```text
DUPLICATE_IDENTITY_SUPPRESSED
```

Do not imply a global identity cache — scope is one `execute()` request only.

---

## 7. V2 Fragment Contract

Metadata produced for split V2 units:

| Field | Role |
|---|---|
| `isV2Unit` | Marks the item as a V2 unit. |
| `isSplitFragment` | True when this payload is a split piece. |
| `parentId` | Identity of the parent the fragment belongs to (`i`/`uid`/`id` of the original unit). |
| `fragmentIndex` | Positional index within the parent (0-based). |
| `fragmentCount` | Total number of fragments for the parent. |
| `fragmentJoinerBefore` | Whitespace to reinsert before this fragment when joining. |

Behavior:

- **Fragments are buffered request-locally** in `OptimizedJsonHandler` via a `fragmentedUnits` map.
- **Arrival may be out of order.** Fragments are stored by `fragmentIndex`, not by arrival order.
- **Assembly occurs only when all indexes exist** — when the buffered count equals `fragmentCount`.
- **Duplicate fragment index** reuses the existing first-accepted semantics; a second fragment with an already-stored index is ignored.
- **Raw fragments never reach consumers** — only the assembled parent is forwarded through stream/final acceptance.
- **Parent failure discards buffered siblings.**
- **Joiner metadata preserves boundary whitespace.** `fragmentJoinerBefore` re-inserts whitespace that would otherwise be lost when joining pieces.

---

## 8. V3 Fragment Contract

Metadata produced for split V3 block groups:

| Field | Role |
|---|---|
| `isV3Fragment` | Marks the item as a V3 fragment. |
| `parentId = blockId` | The block identity is the V3 parent identity. |
| `fragmentIndex` | Positional index within the block group. |
| `fragmentCount` | Total fragments for the block group. |
| `fragmentJoinerBefore` | Whitespace preserved before this fragment. |

Behavior:

- **V3 block groups use the same aggregation owner** as V2, in `OptimizedJsonHandler`.
- **V3 and V2 metadata remain distinct** — `isV3Fragment` is separate from `isV2Unit`/`isSplitFragment`; they do not overlap.
- **Assembled V3 parent is emitted once.**
- **Marker structure is validated later by `BlockGroupReconstructor`.** The reconstructor's `splitTranslatedBlock` verifies marker integrity and monotonic UID order.
- **Raw V3 fragments are suppressed defensively by `DomTranslatorAdapter`** — it drops any `isV3Fragment` item it would otherwise apply to the DOM.

---

## 9. Fragment Failure and Settlement

Covered failure/settlement cases:

- **Invalid fragment metadata**: missing `parentId`, non-integer `fragmentIndex`, non-integer `fragmentCount`, or out-of-range index → fragment suppressed, `INCOMPLETE_FRAGMENT_EVENT_SUPPRESSED` diagnostic.
- **Missing fragment**: when assembly cannot collect all indexes, the incomplete parent is suppressed, never partially emitted.
- **First/middle/last fragment failure**: on batch failure, buffered siblings of the failing parent are discarded via `FRAGMENTED_UNIT_FAILED`.
- **Late success after parent failure**: a fragment arriving after its parent was marked failed is dropped.
- **Late settlement after timeout or cancellation**: cleanup drops any in-flight buffered fragments.
- **Request cleanup**: the buffer is cleared when the request settles and on abort.

Required invariant:

```text
complete parent
OR
no parent emission
```

Never partial parent output.

---

## 10. Manifest Relationship

The three participants have distinct roles:

| Participant | Role |
|---|---|
| **`RequestUnitManifest`** | **Canonical request membership and IDs.** Defines `unitId` / `requestIndex` per input unit and distinguishes `IDENTITY_REQUIRED` from `POSITIONAL_ONLY` mapping. |
| **`TranslationContractValidator`** | **Observational validation facts.** Produces a validation result (unmapped, unknown, missing, duplicate IDs, cardinality) without changing execution. |
| **`OptimizedJsonHandler`** | **Runtime enforcement.** Performs duplicate suppression, fragment aggregation, and stream/final acceptance. |

Do not state that `RequestUnitManifest` itself rejects duplicates — that enforcement is `OptimizedJsonHandler`'s job, guided by manifest membership and validator facts.

Fragment batches may not have a positionally usable manifest view. Runtime acceptance resumes only after fragments are assembled into logical parents.

---

## 11. Consumer Guarantees

Consumers may assume:

- **No raw V2/V3 fragments** — only assembled parents reach consumers.
- **One accepted result per logical identity.**
- **Assembled parent fields no longer contain fragment metadata.**
- **The final results and the streamed results contain the same accepted identity set.**
- **Failed/incomplete units are not disguised using original source text.**

Consumers must not:

- **Perform text-equality-based duplicate detection.**
- **Infer failure from source-equal output.**
- **Rebuild raw fragments independently.**
- **Reinterpret `blockId` as a cell identity when `cellId` exists.**

---

## 12. Source-Equal Output

```text
source text === translated text
```

is **not** an identity or failure signal.

Examples of valid source-equal translations:

```text
URL → URL
OpenAI → OpenAI
2026 → 2026
```

These may be perfectly valid translated output; they imply nothing about duplication or failure.

---

## 13. Diagnostics

Relevant diagnostics emitted by `OptimizedJsonHandler`:

```text
FRAGMENTED_UNIT_COMPLETED
INCOMPLETE_FRAGMENT_EVENT_SUPPRESSED
DUPLICATE_IDENTITY_SUPPRESSED
```

Diagnostics must contain identifiers and structural facts only, not raw source or translated text.

---

## 14. Non-Goals

This document does not define:

- **Provider selection** — see [`PROVIDERS.md`](../providers/PROVIDERS.md).
- **QueueManager retries** — see [`TRANSLATION_SYSTEM.md`](../architecture/TRANSLATION_SYSTEM.md).
- **API-key failover** — see [`PROVIDERS.md`](../providers/PROVIDERS.md).
- **Structured AI recovery** — see [`PROVIDERS.md`](../providers/PROVIDERS.md) and [`ADR-015`](../../adr/ADR-015-translation-outcome-semantics.md).
- **Feature revert behavior** — see [`TRANSLATION_SYSTEM.md`](../architecture/TRANSLATION_SYSTEM.md).
- **Canonical `TranslationOutcome` runtime adoption** — see [`ADR-015`](../../adr/ADR-015-translation-outcome-semantics.md).

For structured-response recovery details, see PROVIDERS.md's *Structured Response Handling* and ADR-015's *Production Improvements*.

---

## 15. Test Map

| Contract area | Test file |
|---|---|
| Fragment metadata; batching | `src/features/translation/core/utils/TranslationBatcher.test.js` |
| Duplicate and fragment enforcement | `src/features/translation/core/managers/OptimizedJsonHandler.test.js` |
| Raw-fragment DOM suppression | `src/features/element-selection/core/DomTranslatorAdapter.test.js` |
| PDF cell identity / block grouping | `src/features/pdf-translation/core/PdfTranslationAdapter.test.js` |
| Duplicate/missing/cardinality facts | `src/features/translation/core/TranslationContractValidator.test.js` |
| Fragment parse / structured contract | `src/features/translation/providers/utils/AIResponseParser.test.js` |
| V3 marker validation | `src/features/element-selection/core/BlockGroupReconstructor.test.js` |

Test counts are intentionally omitted; they change frequently.
