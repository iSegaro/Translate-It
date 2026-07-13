# ADR-003: Core PDF Viewer Ownership and Lifecycle Decisions

**Status:** Proposed

> **Note**
>
> This ADR is currently **Proposed**.
> It becomes **Accepted** only after the implementation has been completed and the resulting architecture has been validated through testing and architectural review.

**Scope:** Core PDF Viewer Architecture

**Decision Type:** Architectural

---

# Purpose

This document records the architectural decisions reached after multiple independent architecture audits.

These decisions are considered the baseline architecture for future development.

Future changes should challenge these decisions only with new evidence, not preference.

---

# Decision Process

This ADR was produced after multiple independent architecture audits rather than a single design discussion.

The following areas were audited independently before reaching the final conclusions:

- Render Scheduler
- Bitmap Cache
- PageSession ownership
- Cleanup architecture
- Memory trade-offs

Multiple alternative architectures were evaluated before reaching the recorded decisions.

These decisions are evidence-driven, not opinion-driven.

---

# Decision 1 — Render Scheduler

## Decision

Keep independent `PdfRenderScheduler` instances.

## Rationale

Scheduling is inherently viewer-local.

Each viewer owns:

* render window
* primary page
* render priority
* eligibility
* queue ordering
* cancellation
* presentation timing

A shared scheduler would need to own multiple viewer states simultaneously, introducing arbitration and violating single responsibility.

## Consequences

Accepted:

* one scheduler per viewer
* viewer-local scheduling policy
* scheduler remains pure
* scheduler remains DOM-free
* scheduler remains Vue-free

Rejected:

* shared scheduler
* global render queue
* scheduler-level viewer coordination

Cross-viewer coordination belongs at the document layer, never inside the scheduler.

---

# Decision 2 — Bitmap Cache

## Decision

Keep the current document-scoped shared `PdfBitmapCache`.

## Rationale

The cache already has:

* explicit ownership
* deterministic lifecycle
* clear invalidation
* bounded memory
* correct separation from presentation

The architecture is already well isolated.

## Consequences

Accepted:

* shared bitmap cache
* viewer-independent bitmap reuse

Rejected:

* bitmap-cache redesign
* viewer-local bitmap caches

---

# Decision 3 — In-flight Raster Deduplication

## Decision

Do not introduce in-flight raster deduplication.

## Rationale

Duplicate rasterization occurs only during narrow cold-cache races.

Avoiding that work would require introducing:

* shared promises
* ownership rules
* cancellation propagation
* error propagation
* synchronization

The architectural complexity outweighs the temporary performance benefit.

---

# Decision 4 — PageSession Ownership

## Decision

`PdfPageSession` is document-owned state.

It is not:

* viewer state
* scheduler state
* render state

It represents hydrated document content.

Examples include:

* text content
* text lines
* logical blocks
* page layout
* OCR data
* derived page models

Its natural lifetime is the document.

---

# Decision 5 — PageSession Cleanup

## Decision

Adopt a document-lifetime PageSession model by removing the PageSession cleanup subsystem.

## Rationale

Architecture audits showed that cleanup exists solely to reclaim modest JavaScript heap while introducing significant architectural complexity.

Cleanup introduces:

* timers
* debounce
* keep-set logic
* release lifecycle
* rehydration lifecycle
* viewer lifetime coupling
* loaded-state transitions
* cleanup-specific tests

Cleanup does not improve:

* rendering
* rasterization
* GPU memory
* bitmap cache
* RenderTask count
* pdf.js worker memory

Its benefit is limited to modest retained JS heap reduction.

The complexity cost exceeds the architectural value.

---

# Decision 6 — Lifetime Model

## Decision

PageSession lifetime becomes:

```text
Document opened
        ↓
Hydrate once on demand
        ↓
Remain hydrated
        ↓
Document closes
        ↓
Destroy
```

No intermediate release.

No rehydration.

No cleanup timer.

No viewer-driven lifetime.

---

# Architectural Principles

Future work should preserve these principles.

## Ownership

Document owns:

* PdfDocumentSession
* PdfPageContentRepository
* PdfPageSession
* PdfBitmapCache

Viewer owns:

* PdfRenderScheduler
* render window
* canvases
* text-layer DOM
* presentation

## Scheduler

Scheduler never owns:

* document lifetime
* bitmap cache
* page content
* cross-viewer coordination

## Bitmap Cache

Bitmap cache never owns:

* DOM
* viewers
* scheduling
* text layers

## PageSession

PageSession never owns:

* viewer lifetime
* rendering lifecycle
* scheduler state

---

# Rejected Architectures

The following were audited and rejected.

* Shared Render Scheduler
* Viewer-owned PageSession lifetime
* Reference-counted PageSessions
* Consumer leases
* In-flight raster deduplication
* Bitmap-cache redesign
* Cleanup expansion through additional viewer coordination
* Shared cleanup ownership

---

# Future Guidance

Future architectural work should continue following the principles established during these audits.

- **Prefer removing mechanisms before introducing new coordination.** Deletion is simpler than coordination. When a mechanism no longer earns its keep, remove it rather than adding more code to work around it.

- **New ownership relationships require explicit architectural justification.** Every new owner relationship adds coupling. Do not introduce one without documenting why existing ownership models are insufficient.

- **Avoid adding lifecycle states unless correctness requires them.** Each additional state doubles the transition matrix. Prefer simpler lifecycles with fewer states and no intermediate transitions.

- **Prefer deterministic document ownership over viewer coordination.** Document-owned state is simpler to reason about than viewer-coordinated state. When a choice exists between document ownership and viewer coordination, prefer document ownership.

- **Preserve explicit ownership boundaries.** Each subsystem should have a clear, documented set of owned responsibilities. Ownership crossing is a design smell that should be explicitly justified.

- **Base architecture decisions on evidence, not hypothetical optimization.** Avoid introducing coordination, synchronization, caching, lifecycle mechanisms, or ownership relationships unless profiling, measurements, or architectural analysis demonstrate that they are actually required. Speculative mechanism design is a common source of unnecessary complexity.

This section is guidance only. It does not introduce new architectural decisions.

---

# Long-Term Direction

Future architecture should continue to favor:

* explicit ownership
* deterministic lifetime
* document-centric state
* viewer-local presentation
* deletion instead of coordination
* fewer lifecycle states
* lower maintenance cost

When faced with a design choice, prefer removing mechanisms over coordinating them unless correctness requires otherwise.

---

# Baseline

This ADR becomes the architectural baseline for future PDF Viewer work.

Future proposals should assume these decisions are accepted unless new evidence demonstrates that one of them is incorrect.
