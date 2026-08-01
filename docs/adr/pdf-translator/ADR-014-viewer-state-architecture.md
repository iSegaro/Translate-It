# ADR-014: Viewer State Restoration

**Status:** Accepted

**Scope:** Tab-local viewer-state snapshot, transport, validation, and restoration boundaries.

---

## Context

The PDF viewer must restore a limited reading context after a document source becomes available again. This requires a durable snapshot without making restored state a new source of truth or coupling viewing context to document-source recovery.

## Decision

Viewer State is an immutable, tab-local aggregate transported in the current tab URL hash. It contains exactly `documentIdentity`, `currentPage`, and `contentView`. Existing owners remain authoritative; restoration returns snapshot values to those owners only after the loaded document identity matches.

## Ownership

- Viewer State owns no runtime behavior. It is an immutable aggregate of document identity, navigation, and viewer-mode values.
- Browser Tab State owns source-restoration data for the tab, including remote URL and File System Access `fileHandle` values.
- `PdfDocumentSession` owns loaded-document identity and produces the identity used for post-load validation.
- `PdfApp` coordinates tab restoration by reading pending Viewer State, opening an available document source, validating identity, and returning restored values to their owners.

These components collaborate through explicit state boundaries. Viewer State MUST NOT own document-source restoration, and Browser Tab State MUST NOT become Viewer State.

## Related State

| State | Responsibility | Does Not Own |
|---|---|---|
| Viewer State | Immutable reading-context snapshot | Document source, runtime objects, cache, or restoration authority |
| Browser Tab State | Tab-local remote URL and file-handle source restoration data | Viewer position or viewer-mode snapshot |
| Document Session | Active PDF lifecycle and loaded-document identity | Pending Viewer State or Browser Tab State |

## Persisted Viewer State

Viewer State contains exactly:

- `documentIdentity`: identity of the document the snapshot belongs to.
- `currentPage`: reading position represented as a page number.
- `contentView`: active original, translation, or translated-PDF view.

Viewer State excludes layout mode, zoom state, scroll offsets, OCR state, translation operations, presentation state, region selection, runtime objects, caches, files, and document-source data.

## URL Transport

- The current Viewer State transport is the PDF tab URL hash.
- Serialization is deterministic and contains document identity, page, and content-view values only.
- URL writes use replacement semantics and do not create browser history entries.
- Browser storage and IndexedDB are not used for Viewer State.
- Browser Tab State is separate from Viewer State transport and preserves its own tab-local source-restoration data.

## Restore Lifecycle

```text
URL snapshot → Pending Viewer State → Document source restoration → PDF load → Identity validation → Restore or discard
```

A valid URL snapshot becomes Pending Viewer State while no document is attached. Browser Tab State may provide a source for restoration. After a document loads, its identity determines whether the pending snapshot is restored or discarded.

## Restore Order

For a matching pending snapshot, restoration occurs in this order:

```text
Content View → Layout Commit → Page Navigation
```

Restore order coordinates existing viewer owners. It does not imply that layout or zoom state is persisted in Viewer State.

## Identity Validation

- Identity validation occurs after PDF load, when `PdfDocumentSession` has resolved the document fingerprint or content-derived identity.
- Matching identity restores `contentView`, waits for initial layout commit, then navigates to `currentPage`.
- Mismatching identity discards Pending Viewer State and treats the loaded document as a new viewing context.

## Failure Policy

- Invalid or incomplete URL snapshots do not create Pending Viewer State.
- When no document source is available, Pending Viewer State remains available for a later source-open attempt.
- Failed document loading or source restoration leaves Pending Viewer State available because restoration has not completed.
- Identity mismatch discards Pending Viewer State.
- Successful matching restoration consumes Pending Viewer State.
- A cancelled layout commit or replaced document generation retains Pending Viewer State until a later restore attempt can complete.

## Invariants

- Viewer State MUST be an immutable aggregate, never a source of truth.
- Viewer State MUST contain exactly `documentIdentity`, `currentPage`, and `contentView`.
- Viewer State MUST NOT contain runtime objects, cache data, file objects, document-source data, or transient operation state.
- Viewer State serialization MUST be deterministic and serializable.
- Viewer State MUST remain tab-local; tabs do not share Viewer State or coordinate restoration.
- Document identity MUST be validated after PDF load.
- Viewer State MUST NOT own document-source restoration.
- Browser Tab State MUST remain separate from Viewer State.
- Pending Viewer State is consumed after successful identity-matched restoration or identity mismatch, and remains pending when restoration cannot yet complete.

## Rejected Alternatives

### Transport

- `browser.storage.local` for Viewer State. Tab-local URL transport avoids shared-state coordination and stale storage cleanup.
- IndexedDB for Viewer State or PDF file content. Viewer State needs only a small snapshot; storing document content adds quota, privacy, and invalidation concerns.

### Ownership

- Dedicated restore manager. A separate authority would duplicate Viewer State ownership and compete with document, navigation, and viewer-mode owners.

## Consequences

### Positive

- Viewer restoration is deterministic, immutable, and tab-local.
- Existing document, navigation, and viewer-mode ownership remains unchanged.
- Viewer context and document-source restoration remain independently understandable.

### Negative

- Restoration is intentionally limited to document identity, page, and content view.
- Viewer State cannot restore a document source by itself.
- Source restoration remains a separate Browser Tab State concern.
