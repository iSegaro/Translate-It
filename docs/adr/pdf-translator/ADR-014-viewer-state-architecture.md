# ADR-014: Viewer State Architecture

**Status:** Accepted
**Supersedes:** None

---

## Context

The PDF Viewer manages viewing position across several components: current page, zoom mode, content view, and layout mode. Each is owned by a different architectural component. When the browser tab is closed and restored (Ctrl+Shift+T or session restore), all in-memory state is lost. The user must manually re-open the document and re-configure their viewing position.

This ADR defines Viewer State — a read-only aggregate of viewing position — and how it is preserved, restored, and managed across tab lifecycle boundaries. Browser Session Restore is the feature that consumes Viewer State to resume the previous viewing context after tab restoration.

---

## Goals

- Preserve Viewer State across tab close and browser restart so the user can resume reading where they left off.
- Keep each browser tab independent — no shared session manager, no cross-tab synchronization.
- Integrate restore UI into the existing PdfEmptyState rather than introducing new modal or dialog patterns.
- Remain within the browser security model — automatic local file reopening is impossible and not attempted.
- Persist Viewer State through the browser tab transport. No new storage keys, no new permissions.

---

## Non-Goals

This ADR explicitly does **not** solve:

- **Automatic local file reopening** — Browsers block file access without user interaction. The user must re-select the file.
- **Recent documents** — No document history browser or launcher.
- **Session history** — No multi-session timeline or undo/redo across tab closures.
- **Multi-tab coordination** — Tabs are independent. Restoring Tab A has no effect on Tab B.
- **Cloud synchronization** — No cross-device or cross-browser restore.
- **Document persistence** — No caching of file content in extension storage.
- **Extension update recovery** — Extension reload invalidates all active extension pages. Out of scope.

---

## Architecture

### Viewer State Lifecycle

Viewer State has two lifecycle states. Both are the same Viewer State — same contract, same ownership, same invariants:

```
Viewer State
    ├── Attached   — document is loaded; state reflects active viewing position
    └── Pending    — no document loaded; state awaits attachment to a matching document
```

**Attached Viewer State** is the normal state when a document is open. A snapshot is created from current owners and persisted through the browser tab transport.

**Pending Viewer State** is simply Viewer State whose corresponding document has not yet been attached. It occurs when:

- The browser restores a tab that previously had a document loaded.
- A Viewer State snapshot from the previous session is available.
- No document is currently loaded in the tab.

Pending Viewer State is **not** a separate model, a new ownership boundary, or a different source of truth. It carries no runtime objects, no file references, and no cache data. The same ownership rules, contract, and invariants apply to both lifecycle states.

### Browser Session Restore

**Browser Session Restore** is the feature that consumes Viewer State to resume the previous viewing context after tab restoration.

### One-Shot Behavior

Pending Viewer State is one-shot. If the user opens any PDF — matching or not — the Pending Viewer State is discarded. No stale pending state may survive after any document load.

### Lifecycle

```
┌──────────────────────────────────────────────────────────┐
│                   Tab open (fresh)                       │
│                      │                                   │
│              No Pending Viewer State                     │
│              PdfEmptyState: default                      │
└──────────────────────┬───────────────────────────────────┘
                       │
                       │ User opens PDF
                       ▼
┌──────────────────────────────────────────────────────────┐
│                   Document loaded                        │
│                      │                                   │
│              Viewer State snapshot created               │
│              Transport updated with Viewer State         │
└──────────────────────┬───────────────────────────────────┘
                       │
                       │ Tab closed (user or browser)
                       ▼
┌──────────────────────────────────────────────────────────┐
│                   Tab closed                             │
│                      │                                   │
│              File/Blob destroyed                         │
│              Viewer State survives across boundary       │
└──────────────────────┬───────────────────────────────────┘
                       │
                       │ Browser restores tab (Ctrl+Shift+T or session restore)
                       ▼
┌──────────────────────────────────────────────────────────┐
│                   Tab restored                           │
│                      │                                   │
│              Pending Viewer State detected               │
│              PdfEmptyState: resume context               │
└──────────────────────┬───────────────────────────────────┘
                       │
                       │ User selects PDF file
                       ▼
┌──────────────────────────────────────────────────────────┐
│                   Document loading                       │
│                      │                                   │
│              ┌───────┴────────┐                          │
│              │                │                          │
│         Identity         Identity                        │
│         MATCH            MISMATCH                        │
│              │                │                          │
│              ▼                ▼                          │
│     Restore Viewer      Discard Pending                  │
│     State applied       Viewer State                     │
│              │                │                          │
│              └───────┬────────┘                          │
│                      │                                   │
│                      ▼                                   │
│              Pending Viewer State consumed (one-shot)    │
│              Normal viewer                               │
└──────────────────────────────────────────────────────────┘
```

### Resume UI

When a Pending Viewer State exists and no document is loaded, PdfEmptyState presents actions allowing the user to either resume the previous document or begin a new session:

- Displays the previous document name (from `pdfTranslationHistory`, matched by `documentIdentity`).
- Displays the previous viewing position.

If the user chooses to resume, the OS file picker opens. After file selection and document load, identity is verified. If identity matches, Viewer State is restored. If not, the document opens as new.

If the user chooses to begin a new session or drags a file onto the dropzone, the Pending Viewer State is discarded and the viewer behaves as a fresh session.

No modal, dialog, or banner is introduced for this flow.

---

## Viewer State Contract

### Required State

| State | Architectural Owner | Why Required |
|-------|-------------------|-------------|
| **Document Identity** | Document Identity Owner | Required to identify which document the Viewer State belongs to. |
| **Current Page** | Navigation Owner | Reading position. The most important piece of navigation state. |
| **Content View** | Viewer Mode Owner | Which view was visible: Original, Translation, or Translated PDF. |
| **Layout Mode** | Viewer Mode Owner | Pane arrangement: Single or Side-by-Side. |
| **Zoom State** | Zoom Owner | Page display mode: Fit-Width, Fit-Page, or specific percentage. |

### Optional State (Future)

| State | Status | Reason |
|-------|--------|--------|
| **Scroll Offset** | Future | Exact scroll restoration depends on window size and zoom. Page number alone provides 80% of UX value. |
| **Outline State** | Future | Outline panel visibility and expanded nodes. Convenience, not necessity. |
| **Search Query** | Future | If search capability is added to the PDF Viewer. |

### Must NOT Belong

These states must **never** be part of Viewer State:

| State | Reason |
|-------|--------|
| **OCR State** | Operation, not viewing position. OCR cache is automatically restored on document load. |
| **Translation Jobs** | In-progress operations. Expire when the tab closes. |
| **Translation Progress** | Belongs to the Presentation layer, not Viewer State. |
| **Toasts / Banner State** | Transient UI. Meaningless after tab close. |
| **Region Selection** | Debug/transient state. Not part of the reading experience. |
| **Presentation State** (Progress Bar) | Momentary feedback. Belongs to Operation Lifecycle. |
| **Runtime Objects** | File, Blob, PDF.js Document. Destroyed on tab close. |
| **Cache** (Bitmap Cache, Page Sessions) | In-memory. Rebuilt on document load. |
| **File Objects** | JavaScript heap objects. Lost on tab close. |

### Viewer State May Exist Without a Document

Viewer State is not coupled to a loaded document. It is valid for a Pending Viewer State to exist while no document is open. This is the normal state after tab restoration and before the user re-selects the file.

---

## Ownership

### Architectural Owner

An **Architectural Owner** is the single authoritative component responsible for producing and validating one piece of Viewer State. There is exactly one Architectural Owner for each state field. Viewer State never replaces or duplicates an Architectural Owner — it only aggregates values from them into a snapshot. Restoration returns values to the Architectural Owner; the owner remains the sole source of truth.

Viewer State is a **read-only aggregate**. It does not produce new data; it collects existing state.

### Ownership Does Not Change

| State | Architectural Owner | Changed? |
|-------|-------------------|:---:|
| Document Identity | Document Identity Owner | No |
| Current Page | Navigation Owner | No |
| Content View | Viewer Mode Owner | No |
| Layout Mode | Viewer Mode Owner | No |
| Zoom Mode / Percent | Zoom Owner | No |

No new owner is created. No existing owner's responsibility is moved.

### Scope

Browser Session Restore is scoped to a **single browser tab**. Each tab is a completely independent Viewer Application. There is no shared Session Manager, no cross-tab communication, and no global ownership. Closing Tab A has no effect on Tab B. Restoring Tab A restores only Tab A's Viewer State.

---

## Design Decisions

### Decision 1: The Browser Tab Is the Persistence Boundary

Viewer State is persisted through the browser tab — the only data the browser guarantees to preserve across session restore. The current implementation encodes state in the tab URL. No `browser.storage`, IndexedDB, or other persistence mechanism is used.

**Rationale:** The browser tab is the natural, scoped persistence boundary for tab-local state. It requires zero additional permissions. It ensures each tab carries only its own state. The transport mechanism (URL, in the current implementation) may change without affecting the architectural contract: the tab carries the state.

### Decision 2: No Automatic File Reopen

The browser security model prevents web pages from reading local files without explicit user interaction. The File object and Blob URL from the original session are destroyed when the tab closes. No extension API can re-acquire them.

**Rationale:** This is a platform constraint, not a design choice. Attempting to work around it (File System Access API, IndexedDB caching) introduces browser compatibility issues, storage quota problems, and privacy concerns disproportionate to the feature's value.

### Decision 3: Identity Check Is Post-Load

Document identity is verified after the user selects a file and the PDF is parsed — not before. If the identity does not match, the document opens as new and Pending Viewer State is discarded.

**Rationale:** Document identity depends on PDF content (fingerprint or SHA-256). It cannot be computed before the PDF is loaded and parsed. Pre-load identity checks are impossible.

### Decision 4: One-Shot Pending State

Pending Viewer State is consumed exactly once — on any document load. It is never reused, never persists across multiple document loads, and never survives after a different PDF is opened.

**Rationale:** Pending Viewer State is specific to one document. Opening a different PDF invalidates it. Allowing it to persist would create ambiguity (which document's state applies to which tab?).

### Decision 5: Empty State Integration

The Resume UI is part of PdfEmptyState, not a separate modal, dialog, or banner. When Pending Viewer State exists, PdfEmptyState renders a different context.

**Rationale:** The empty state is already the correct architectural surface for "no document loaded" scenarios. Adding a separate component would duplicate the empty-state concept and create ownership ambiguity.

---

## Rejected Alternatives

### Alternative: Persistent Storage (`browser.storage.local`)

**Rejected because:** Storage persists across all tabs and sessions, breaking tab isolation. Requires coordination to determine which stored state belongs to which tab. Introduces cleanup complexity (stale entries, storage quota). Adds permission dependency. Tab URL is the natural, scoped persistence mechanism.

### Alternative: File Content Caching (IndexedDB)

**Rejected because:** Storing arbitrary PDF content in IndexedDB consumes quota proportional to file size. A 50MB PDF would consume significant storage. Introduces privacy concerns (file content in extension storage). Requires cache invalidation, quota management, and TTL policies — complexity disproportionate to restore value.

### Alternative: Separate Restore Manager

**Rejected because:** Violates ownership invariants. Viewer State is an aggregate over existing owners, not a new authority. A Restore Manager would create a second source of truth for viewing position and duplicate existing owner logic.

### Alternative: Automatic Document Reopen via File System Access API

**Rejected because:** File System Access API is Chromium-only. Its support in MV3 extension pages is undocumented and unstable. Requires user permission grant on first use. Firefox has no equivalent. Browser compatibility risk unacceptable.

**Note:** This alternative was rejected for the current architecture revision. If cross-browser support for persistent file handles becomes available in the future, automatic file reopen may be reconsidered.

---

## Architectural Invariants

Every implementation of this ADR **must** preserve:

| # | Invariant |
|---|-----------|
| 1 | **One tab = one Viewer State** — Each browser tab has exactly one Viewer State. |
| 2 | **Tabs are independent** — No state sharing, no cross-tab communication, no global session manager. |
| 3 | **State is read from existing owners only** — Viewer State is an aggregate, not a source of truth. |
| 4 | **No new owners are created** — Page, Zoom, and View each retain their existing owners. |
| 5 | **No runtime objects in Viewer State** — File, Blob, PDF.js Document, and Cache are excluded. |
| 6 | **Persistence mechanism is independent of contract** — Changing how state is encoded must not change what state is preserved. |
| 7 | **Viewer State is immutable** — A snapshot, once created, is never mutated. Restoration reads from it, never writes to it. |
| 8 | **Viewer State is fully serializable** — Every field must be deterministic, serializable, and platform-independent. |
| 9 | **Pending Viewer State is one-shot** — Consumed on first document load. No stale pending state may survive. |
| 10 | **Identity check is post-load** — Document identity is verified after document load, not before. |
| 11 | **No automatic file reopen** — The architecture never attempts to reopen a local file without user interaction. |
| 12 | **Viewer State may exist without a document** — Pending Viewer State is valid even when no document is loaded. |

---

## Consequences

### Positive

- Each tab is independently restorable. No cross-tab coordination bugs.
- Zero new permissions. Zero new storage keys. Pure browser platform mechanism.
- Pending Viewer State is naturally scoped — destroyed when the tab URL changes or the user opens a different document.
- Clear ownership boundaries. No new managers, stores, or controllers.

### Negative

- User must manually re-select the file after tab restore. This is inherent to browser security and cannot be avoided.
- If the user selects a different file (identity mismatch), Viewer State is silently discarded. The user must re-navigate to their previous page manually.
- If the tab transport is cleared (user manually opens pdf.html without state), session restore is unavailable. This is expected behavior — the user explicitly chose a clean session.
- The browser tab transport carries additional Viewer State metadata alongside the page URL.
