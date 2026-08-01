# ADR-004: PdfPageSession Hydration Ownership

**Status:** Accepted

**Scope:** PdfPageSession Hydration Strategy

**Decision Type:** Architectural

---

## Context

The PDF Viewer system has a `PdfPageSession` that represents hydrated document content for a single page: text content, logical blocks, layout, OCR blocks, and page metadata. It is not translation state — translation is one consumer among many.

Current consumers of `PdfPageSession` include:

- **Translation** — reads text content and blocks, writes translated blocks.
- **OCR** — reads layout, writes OCR blocks.
- **OCR cache restore** — restores previously cached OCR results into sessions.
- **Export** — reads text content and translated blocks across all pages.
- **Rendering** — reads text layer data for page presentation.
- **Future Search** — will need full-page text access.
- **Future Annotation** — will need block/page metadata.
- **Future Diagnostics** — will need access to page state for debugging.

The `PdfPageSession` creation path is:

```
PdfDocumentSession
    → PdfPageContentRepository.getPageSession()
        → _hydratePageSession()
            → new PdfPageSession()
```

During development of the OCR subsystem, an architectural issue was discovered: the only production path that reliably triggered `PdfPageSession` hydration was the Translation pipeline. Other consumers — specifically OCR detection and OCR cache restore — depended on sessions being available, but no mechanism guaranteed hydration outside the Translation path.

Some consumers used hydration APIs (e.g., `getPageSession()` with implicit hydration). Others bypassed hydration entirely by reading the raw `pageSessions` map directly, which only contained sessions previously created by Translation.

---

## Problem Statement

**Who owns `PdfPageSession` hydration?**

The system had an implicit answer: Translation. This was an ownership inversion.

Translation is a consumer of page content. It should not be responsible for making that content available to other consumers. When Translation drives hydration, every other consumer — OCR, Export, Search, future features — either:

1. Depends on Translation having already processed the relevant pages, or
2. Must duplicate hydration logic, or
3. Accesses the raw `pageSessions` map directly, violating encapsulation.

All three outcomes create architectural coupling, hidden dependencies, and brittle initialization ordering.

The core problem: **hydration responsibility must live with the document, not with any single consumer.**

---

## Decision

1. **DocumentSession owns hydration.** `PdfDocumentSession` (via `PdfPageContentRepository`) is the sole authority for creating `PdfPageSession` instances. No consumer creates, triggers, or schedules hydration.

2. **Hydration is visibility-driven with lazy fallback.** The primary hydration trigger is page visibility, reported by the Viewer. Requests from consumers serve as a fallback mechanism for non-visible pages.

3. **Consumers use hydration APIs, never raw maps.** The `pageSessions` map is an implementation detail of `PdfPageContentRepository`. Consumers access page sessions only through `getPageSession()` or equivalent hydration-safe APIs.

4. **OCR never hydrates.** OCR is a pure consumer. The OCR Detector is a query. The OCR Processor is a transformer. Neither owns session lifecycle.

5. **Translation never hydrates.** Translation is a pure consumer. It reads sessions made available by the hydration system. It does not own session existence.

---

## Rationale

### Why Translation-driven hydration is an ownership inversion

Translation consumes `PdfPageSession` content. It does not own it. When Translation is the implicit hydration trigger, the system embeds a hidden dependency: every consumer that needs page content must wait for Translation to act first.

This is not merely an OCR bug. The problem is structural: a feature — Translation — controls the lifecycle of a shared architectural resource — `PdfPageSession` — used by multiple independent features.

This violates separation of responsibilities:

- The feature that benefits from a resource should not be the feature that manages that resource's lifecycle.
- Lifecycle management belongs to the layer that owns the resource, not to a peer consumer.
- When one consumer controls lifecycle, it becomes an implicit gatekeeper for all other consumers.

The concrete consequences:

- **Brittle ordering.** OCR must translate before it can OCR, or must reimplement hydration internally.
- **Encapsulation leaks.** Consumers reach into `pageSessions` directly because no hydration-safe API exists for non-Translation paths.
- **Feature gatekeeping.** Adding a new consumer (Search, Annotation) requires understanding and working around Translation's hydration schedule.
- **Test complexity.** Tests must set up Translation state even when testing unrelated features.

Ownership inversion inverts the dependency graph: instead of consumers depending on available content, they depend on another consumer having acted. This is the architectural equivalent of requiring the mail carrier to unlock your front door.

The fix is not to make OCR or Export also drive hydration. The fix is to remove hydration responsibility from all features and centralize it in DocumentSession, where it belongs.

### Why visibility-driven hydration with lazy fallback

Visibility-driven hydration aligns hydration cost with user attention. Pages the user can see should be ready — text extracted, blocks built, OCR status known. Pages the user cannot see should still be reachable on demand.

| Trigger | Scope | Rationale |
|---------|-------|-----------|
| **Visible page** | Hydrate proactively | User can see this page. Content should be available immediately. |
| **Consumer request** | Hydrate lazily | Export, Search, full-document translation need non-visible pages. Hydrate on first request, cache for subsequent requests. |

This dual strategy:

- **Minimizes upfront cost.** Only visible pages hydrate on open. A 500-page PDF hydrates ~3-5 visible pages, not all 500.
- **Eliminates consumer coupling.** Any consumer can request any page session without depending on another consumer's prior activity.
- **Preserves lazy semantics.** Non-visible pages hydrate exactly once and remain hydrated (per ADR-003 lifetime model). The lazy path is a cache-fill, not a continuous lifecycle.

### Why this scales better

Visibility-driven hydration decouples content availability from consumer behavior.

```
Viewer
    ↓
visible pages changed
    ↓
DocumentSession
    ↓
hydrate visible PageSessions
    ↓
PageSessions available
    ↓
Consumers
    ├── Translation
    ├── OCR
    ├── OCR cache restore
    ├── Export
    ├── Future Search
    ├── Future Annotation
    └── Future Diagnostics
```

This architecture:

- **Single trigger.** One event — visible pages changed — drives all proactive hydration.
- **Single fallback.** One API — `getPageSession()` — serves all lazy requests.
- **Consumer agnostic.** New consumers do not need to understand hydration schedules. They call `getPageSession()` and receive content.
- **Testable.** DocumentSession hydration can be tested independently of any consumer. Consumer tests can inject pre-hydrated sessions without mocking hydration internals.
- **Observable.** Hydration events (session created, hydration failed) have a single source, making debugging and monitoring straightforward.

### Visibility Responsibility

Viewer owns visibility. DocumentSession owns document content. These are separate concerns with a clear contract.

Visibility is an input signal — nothing more. The Viewer reports which pages are visible. It does not decide how or when hydration happens.

DocumentSession receives the visibility signal and applies its hydration policy. It may hydrate visible pages immediately, defer hydration, batch requests, or apply backpressure. The policy belongs exclusively to DocumentSession.

The Viewer never:

- Decides the hydration strategy
- Triggers hydration directly
- Manages PageSession lifecycle
- Determines content availability for non-visible pages

The Viewer's sole responsibility is: detect visible page changes and report them.

This separation ensures that hydration policy can evolve without modifying the Viewer, and the Viewer can change its visibility detection strategy without affecting hydration.

---

## Ownership Contract

Three architectural actors with explicit responsibilities.

### Viewer

Responsibilities:

- Owns viewport state.
- Owns visibility detection.
- Reports visible page changes.

Does NOT:

- Hydrate page content.
- Own PageSession lifecycle.
- Decide hydration policy.

### DocumentSession

Responsibilities:

- Owns document content lifecycle.
- Owns PageSession creation.
- Owns hydration policy.
- Owns hydration deduplication.
- Owns lazy fallback.
- Decides when PageSessions become available.

### Feature Consumers

Examples: Translation, OCR, Export, Search, Annotation, Diagnostics.

Responsibilities:

- Consume PageSessions.
- Request page content through hydration-safe APIs.

Do NOT:

- Own PageSession existence.
- Implement their own hydration strategy.
- Depend on another feature to create PageSessions.

### Ownership diagram

```
Viewer
    ↓ reports visibility

DocumentSession
    ↓ manages PageSession lifecycle

Consumers
    ↓ consume page content
```

### What consumers may not do

- Create `PdfPageSession` instances
- Access the raw `pageSessions` map
- Assume sessions exist for any page
- Trigger hydration outside the public API
- Bypass `PdfPageContentRepository` to read page content

---

## Ownership Hierarchy

Ownership flows downward through architectural layers. Consumption flows upward. Consumers never become owners.

```
Document
    ↓ owns

DocumentSession
    ↓ owns

PageSession
    ↓ provides

Page Content

    ↓ consumed by

- Translation
- OCR
- Export
- Search
- Annotation
- Diagnostics
- Future AI features
```

### Principles

**Features do not own PageSessions.** A feature may request a session, read from it, write to it, but never create or destroy it.

**Features ultimately consume page content.** The purpose of a feature is to transform or present content, not to manage the infrastructure that provides it.

**PageSession is the document's representation of page content.** It is not a feature artifact. It exists because the document exists, not because a feature needs it.

**PageSession exists independently of any consumer.** If every feature were removed, PageSessions would still exist — they simply would not be consumed.

**Multiple consumers may use the same PageSession simultaneously.** Translation writes translated blocks while OCR writes OCR blocks while Export reads both. No consumer blocks another. No consumer owns exclusive access.

**Ownership always flows downward.** Document → DocumentSession → PageSession → Page Content.

**Consumption always flows upward.** Features consume page content. They never own the layers below.

This hierarchy is the canonical ownership model for all future features. Any feature that inverts this flow — a feature that reaches downward to own document infrastructure — is architecturally wrong.

---

## Mutation Contract

Ownership of a resource and ownership of data written into that resource are different concepts. This section defines who owns what inside `PageSession`.

### Lifecycle ownership vs. data ownership

**DocumentSession owns:**

- PageSession lifecycle
- PageSession identity
- Hydration
- Creation
- Destruction

Feature consumers never own these responsibilities.

**Feature consumers may own feature-specific data that lives inside PageSession.**

### The model

```
DocumentSession
    owns PageSession
    
PageSession
    contains multiple feature-owned domains

Translation
    owns translated blocks

OCR
    owns OCR blocks

Search
    owns search metadata

Annotation
    owns annotation metadata

Future AI
    owns AI-generated metadata
```

Each feature owns only its own data. No feature owns `PageSession` itself.

### Rules

**Features MAY:**

- Enrich PageSession with feature-specific metadata.
- Attach feature-owned data to a session.
- Update only the data they own.

**Features MUST NOT:**

- Create PageSessions.
- Destroy PageSessions.
- Replace PageSessions.
- Redefine PageSession identity.
- Coordinate PageSession lifecycle.
- Modify another feature's owned data unless an explicit shared contract exists.

### Why this separation matters

Separating lifecycle ownership from feature data ownership allows multiple independent features to coexist safely inside the same `PageSession`.

Translation and OCR can both enrich the same `PageSession` without competing for lifecycle ownership. Translation owns the translation domain
OCR owns the OCR domain. Search owns the search domain. Annotation owns the annotation domain. Both write to the same session. Neither controls the session itself.

Future features can add new domains without introducing new owners. Search adds search metadata. Annotation adds annotation metadata. AI features add AI metadata. Each extends the session horizontally. None needs to own the session.

### Relationship to other sections

This Mutation Contract complements:

- **Ownership Contract** — defines who controls the resource.
- **Ownership Hierarchy** — defines how ownership flows through layers.
- **Consumer Contract** — defines how features access content.
- **Architectural Invariants** — defines properties that must always hold.

Ownership determines who controls the resource. Mutation Contract determines who controls individual data inside the resource. Both contracts must remain true simultaneously.

### Future extensibility

New features should extend `PageSession` by adding new feature-owned domains rather than introducing new `PageSession` owners or parallel page-content models. This preserves a single document representation while allowing unlimited feature growth.

---

## Architectural Rule

> **PageSession existence must never depend on a feature.**

Translation, OCR, Export, Search, Annotation — all are consumers. None may become responsible for creating or managing the lifecycle of PageSessions.

Document content exists independently from any individual feature. The document does not hydrate pages because Translation needs them. It hydrates pages because content should be available. Consumers are beneficiaries of that availability, not causes of it.

This rule is non-negotiable. Any future feature that requires page content must use hydration-safe APIs. Any future feature that bypasses this rule reintroduces the ownership inversion this ADR was written to eliminate.

---

## Consumer Contract

### Consumers should

- Request page content through hydration-safe APIs.
- Consume page content from returned PageSessions.
- React to page content changes.

### Consumers should NOT

- Create PageSessions.
- Coordinate hydration timing.
- Duplicate hydration logic.
- Access internal repository state when hydration APIs exist.
- Assume PageSessions exist without requesting them.

Hydration-safe APIs (e.g., `getPageSession()`) are the public contract. The raw `pageSessions` collection is an implementation detail. Consumers must not rely on its internal state, structure, or contents.

A consumer that bypasses hydration APIs introduces a hidden dependency on the internal state of `PdfPageContentRepository`. This dependency is invisible, untestable, and fragile — it breaks when the repository's internal structure changes.

---

## Lifecycle

```
Document opened
    ↓
PdfDocumentSession initializes PdfPageContentRepository
    ↓
Viewer reports initial visible pages
    ↓ (visibility-driven)
PdfPageContentRepository hydrates visible PageSessions
    ↓
[PageSessions available for visible pages]
    ↓
Consumer requests page N                          Consumer triggers action on visible page
    │                                                     │
    ▼                                                     ▼
getPageSession(N) → session exists              getPageSession(N) → session exists
         ↓                                                     ↓
    return cached session                             return cached session
    ↓
[session does not exist — lazy fallback]
    ↓
hydrate PageSession(N)
    ↓
return fresh session
    ↓
[PageSession remains hydrated until document close]
    ↓
Scroll → Viewer reports visible pages changed
    ↓
PdfPageContentRepository hydrates newly visible PageSessions
    ↓
Document closes
    ↓
PdfDocumentSession destroys all PageSessions
```

### Key properties

- **Hydrate exactly once.** First access creates the session. Subsequent access returns the cached instance.
- **No cleanup.** Per ADR-003, PageSessions remain hydrated for the document lifetime. No release, no eviction, no rehydration.
- **All paths converge.** Whether triggered by visibility or consumer request, the hydration code path is identical. There is no "visibility hydration" vs. "lazy hydration" — only "hydration."
- **Consumer interaction is read-only with respect to lifecycle.** Consumers read sessions, write blocks, but never create or destroy sessions.

---

## Consequences

### Positive

- **Encapsulation.** The `pageSessions` map is now an implementation detail. All access goes through hydration-safe APIs.
- **Consumer independence.** OCR, Export, and future features no longer depend on Translation having processed pages.
- **Clear ordering.** Hydration always precedes consumption. No consumer races against an implicit hydration trigger.
- **Testability.** DocumentSession hydration can be unit tested. Consumer tests use pre-hydrated sessions.
- **Observability.** Hydration has a single owner. Events, metrics, and error handling are centralized.
- **Extensibility.** New consumers (Search, Annotation, Diagnostics) follow the same pattern: call `getPageSession()`, consume content.

### Negative

- **Explicit visibility reporting required.** The Viewer must integrate with the hydration system to report visible pages. This is a one-time integration cost.
- **Initial hydration cost.** Opening a document hydrates visible pages upfront. This cost existed implicitly under Translation-driven hydration; now it is explicit and owned by the correct component.

---

## Alternatives Considered

### Consumer-owned hydration

Each consumer hydrates pages as needed, internally.

Rejected because: duplicates hydration logic across N consumers. Each new consumer must reimplement or reuse hydration internally. Does not solve the `pageSessions` bypass problem — consumers still need access to the repository. Centralized hydration is a simpler contract with less duplication.

### Lazy-only hydration (no visibility trigger)

Consumers always trigger hydration on first access. No proactive hydration for visible pages.

Rejected because: visible pages would hydrate on Translation trigger, not on display. The user would see a blank page until a consumer acts. Visibility-driven hydration ensures content readiness aligns with user attention.

### Full hydration on document open

All pages hydrate immediately when a document opens.

Rejected because: violates the "hydrate on demand" principle from ADR-003. A 1000-page PDF would hydrate all sessions upfront, defeating the purpose of document-lifetime caching (hydrate only what is needed).

### Translation-driven hydration (status quo)

Translation continues to be the implicit hydration trigger.

Rejected because: ownership inversion. Translation becomes a hidden dependency for all other consumers. New features require understanding Translation's internals. The `pageSessions` map remains unprotected.

### Hydration-per-consumer with centralized registry

A central registry tracks which consumers have requested which pages. Hydration is still centralized, but the trigger is consumer activity.

Rejected because: adds complexity (registry, tracking, cleanup) without benefit. Visibility-driven hydration already covers the proactive case. Lazy fallback covers the on-demand case. A registry is coordination without improved semantics.

---

## Future Extensions

### Long-term benefits of this ownership model

This ownership model allows future features to plug into the same PageSession lifecycle without introducing new ownership rules. Every new feature becomes another consumer instead of another owner.

| Feature | Becomes | Instead of |
|---------|---------|------------|
| OCR | Consumer of page content | Owner of hydration + content |
| Search | Consumer of text content | Owner of text extraction |
| Annotation | Consumer of block structure | Owner of layout parsing |
| Cross-pane sync | Consumer of page geometry | Owner of layout coordination |
| Cached metadata | Consumer of hydrated state | Owner of cache lifecycle |
| Future AI features | Consumer of page content | Owner of content preparation |

When a feature owns lifecycle, every new feature adds ownership complexity to the system — new creation paths, new lifecycle states, new coordination. When a feature is only a consumer, every new feature adds only consumption logic.

This keeps the architecture stable as the viewer grows. The hydration system handles N consumers with the same complexity as one consumer. Scaling is O(1) for the infrastructure, O(N) only for the feature logic.

### Concrete examples

### Search

Search needs text content for all pages, not just visible ones. Under this architecture, Search iterates over page numbers and calls `getPageSession()` for each. Non-hydrated pages hydrate lazily. No special search-awareness needed in the hydration system.

### Full-document Translation

If a future "translate all" feature is added, it iterates over all pages and calls `getPageSession()` for each. The hydration system provides content on demand. Non-visible pages hydrate once and remain available for the document lifetime.

### Annotation

Annotations need page metadata and block structure. Same pattern: `getPageSession()` returns the content, annotation system reads layout/block data independently.

### Diagnostics

A diagnostic panel showing page content state reads sessions through the same API. Hydration state becomes observable through the centralized system.

### All future consumers

The pattern is uniform: consumer calls `getPageSession(pageNumber)` → hydration system provides content → consumer operates on content. No consumer needs to understand when, how, or why sessions are created.

---

## Architectural Invariants

These invariants protect the architecture against future ownership inversion. They are long-term guarantees. As new features are added, developers must verify they preserve every invariant. If a proposed feature violates an invariant, the design should be reconsidered rather than extending the exception.

These invariants are intended to remain stable even if implementation details evolve over time.

### Invariant 1 — Exactly one PageSession per (document, page)

Exactly one `PdfPageSession` exists for each `(documentIdentity, pageNumber)` pair.

No consumer may create competing PageSessions. There is exactly one source of truth for a page's content, and that source is `PdfPageContentRepository`.

### Invariant 2 — Hydration is deterministic

Regardless of which feature requests page content first — Translation, OCR, Export, Search, Annotation — the resulting `PdfPageSession` must be identical.

Consumers may change. Hydration behavior must not.

Deterministic hydration ensures that feature ordering does not affect page content. A page hydrated by an OCR request produces the same session as a page hydrated by a Translation request.

### Invariant 3 — Feature ordering must not affect document state

Feature ordering must not affect document state. For example:

```
OCR
↓

Translation
```

must produce the same `PdfPageSession` as:

```
Translation
↓

OCR
```

Likewise, Export followed by Search must not change `PageSession` lifecycle compared to Search followed by Export.

Page content is invariant under consumer reordering.

### Invariant 4 — Document content lifecycle is feature-independent

Document content exists because the document exists. Not because a feature requested it.

Features consume document content. They never define its lifecycle. If all features were removed, the document would still have page content — it simply would not be consumed.

### Invariant 5 — Visibility signals, ownership never shifts

Visibility influences hydration timing. Visibility never changes ownership.

The Viewer reports which pages are visible. `DocumentSession` owns the hydration decision. This invariant must remain true even if the hydration strategy evolves — batching, prefetching, predictive loading, or other future optimizations.

### Why invariants matter

These invariants collectively ensure that PageSession lifecycle is owned by the document layer, not by any feature. They protect the architecture against future ownership inversion by making the boundaries explicit and enforceable.

When a new feature is proposed, developers should check:

- Does this feature create PageSessions? (violates Invariant 1)
- Does this feature depend on a specific hydration order? (violates Invariant 2 or 3)
- Does this feature try to control PageSession lifecycle? (violates Invariant 4)
- Does this feature assume visibility ownership includes hydration authority? (violates Invariant 5)

If the answer to any question is yes, the design must be restructured. The feature should consume page content through existing APIs, not own it.

---

## Relationship to Existing ADRs

| ADR | Relationship |
|-----|--------------|
| **ADR-003** | Accepts the document-lifetime PageSession model. This ADR specifies how sessions enter that lifetime — hydration ownership and trigger. ADR-003 says sessions live until document close. This ADR says sessions are created by visibility or lazy request, owned by DocumentSession. |
