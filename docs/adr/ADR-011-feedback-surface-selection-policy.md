# ADR: Feedback Surface Selection Policy

**Status:** Accepted

---

## Context

Each feature in the application independently decides which UI surface to use for operation feedback:

```js
// Export feature
toast.success('TXT exported successfully')

// Translation feature
statusBanner.show({ variant: 'warning', message: 'Partial translation' })

// Region OCR feature
toast.error('Region OCR failed. Please try another region.')
```

This couples presentation decisions to feature logic. As the application grows, this produces:

- **Inconsistent UX.** Two features may use Toast for semantically different result types, or different surfaces for identical semantics. The user cannot predict where feedback will appear.
- **Duplicated decision-making.** Every feature author re-asks the same question: "Should this be a toast, a banner, or inline?" The answers are not documented.
- **Weak ownership boundaries.** Features own both domain logic and presentation routing. A feature that changes its feedback surface requires changes to the feature code, not to a centralized policy.
- **Costly migrations.** Moving all export confirmations from Toast to a future side panel would require touching every export call site. There is no single point of change.

The root cause is that presentation surface selection belongs to the presentation layer, not to individual features. Features should describe *what* occurred. The system should decide *how* to display it.

---

## Operation Result

An **Operation Result** is the architectural boundary between Feature and Presentation. It represents the outcome of an operation, independent of any UI surface, semantic classification, or presentation concept.

**Characteristics:**

- Describes *what* the operation produced or *what* condition resulted.
- Contains only domain-relevant data (file format, error details, metrics, comparison values). Never contains presentation directives.
- Independent of which surface will display it, how wide it will be, or how long it will be visible.
- Produced by features. Consumed independently by Semantic Classification and Presentation Scope.

**Examples of valid Operation Results:**

```js
{ type: 'export-completed', format: 'txt' }
{ type: 'comparison-completed', winner: 'scale-1', timingMs: 1234, cer: {...} }
{ type: 'translation-partial', pageCount: 42, translatedCount: 38 }
{ type: 'activity-completed', pageNumbers: [1, 2, 3] }
{ type: 'ocr-failed', reason: 'model-not-installed' }
{ type: 'region-ocr-no-text' }
{ type: 'block-translation-loading', blockId: 'b12', pageNumber: 3 }
```

**Examples of INVALID Operation Results:**

```js
{ type: 'persistent-information', ... }    // Semantic category — belongs to Classification
{ type: 'acknowledgement', ... }           // Semantic category — belongs to Classification
{ type: 'global', ... }                    // Presentation scope — belongs to Scope resolution
{ type: 'toast-error', ... }               // Presentation surface — belongs to Policy
{ type: 'banner-warning', ... }            // Presentation surface — belongs to Policy
```

Features must never emit semantic categories. Features must never name presentation surfaces or scopes. Features produce Operation Results only.

---

## Decision

Introduce four independent architectural layers:

- **Semantic Classification** — determines *what kind of information* this result represents.
- **Presentation Scope** — determines *where* this information is meaningful.
- **Feedback Policy** — decides *which surface* should display Global-scoped results of a given category.
- **Presentation Surface** — the abstract UI destination that a Presentation Component renders.

These are separate responsibilities. No layer contains domain logic. No layer depends on implementation details of adjacent layers.

### Architecture

```
                    Operation Result
                           │
          ┌────────────────┴────────────────┐
          ▼                                 ▼
  Semantic Classification           Presentation Scope
  (what kind of information)        (where meaningful)
          │                                 │
          │                                 ▼
          │                          Scope Resolver
          │                           Global?
          │                          ┌───┴───┐
          │                         YES      NO
          │                          │        │
          ▼                          ▼        ▼
  Semantic Category           Feedback     Inline
                              Policy      rendering
                                 │
                                 ▼
                       Presentation Surface
                                 │
                                 ▼
                      Presentation Component
```

Semantic Classification and Presentation Scope are **sibling analyses** of the same Operation Result. Neither depends on the other. Neither is derived from the other.

Presentation Scope determines whether Feedback Policy is invoked. Policy itself is a pure mapping — it receives a Semantic Category and returns a Presentation Surface. Policy is never aware of Scope, Component contexts, or Element contexts.

| Semantic Category | Presentation Surface |
|---|---|
| Acknowledgement | Toast |
| Persistent Information | PdfStatusBanner (or future Results Panel) |
| Progress | PdfProgressBar |

For Component and Element scoped results, Scope Resolver routes to Inline rendering. Policy is not involved. Features never import `toast`, never instantiate a banner, and never render feedback UI for operation outcomes. They produce an Operation Result.

---

## Semantic Classification

Semantic Classification determines *what kind of information* a result represents. It answers semantic questions about the result, never execution-state questions.

There are exactly three semantic categories.

### 1. Acknowledgement

A result that merely confirms an action occurred. Nothing to study. Nothing to interpret.

**Classification question:**

Is this merely an acknowledgement — nothing to read, nothing to interpret, no data to study?

**If YES: this is an Acknowledgement.**

**Characteristics:**

- Confirms an action happened (success or failure).
- No data to study or interpret — binary outcome.
- The information already exists elsewhere (file on disk, changed state in UI, inline content) or is trivially reproducible.
- Losing the notification is acceptable. The user can rediscover the outcome from other sources.

**Examples:**

| Result | Why Acknowledgement? |
|---|---|
| Export completed | File exists on disk. |
| Export failed | No file created; retry is instant. |
| Region OCR complete | Recognized text appears inline in the pane. |
| Region OCR failed | Redrawing a region takes under one second. |
| Batch OCR failed | Per-page pills carry persistent per-page failure state. |
| OCR language missing | OCR menu already shows "No languages installed." |

---

### 2. Persistent Information

A result whose primary outcome IS information that the user must read, interpret, and potentially act on. It is not reducible to "it worked" or "it didn't."

**Classification questions:**

- Does this result contain information requiring interpretation beyond binary success/failure?
- Would losing this information constitute information loss (no redundant source exists)?

**If YES to either: this is Persistent Information.**

**Characteristics:**

- Contains multi-valued data requiring human study (comparisons, metrics, diagnostics).
- The operation's purpose was to produce this information.
- No external element carries a copy. The feedback IS the artifact.
- The user benefits from time to read and study the result.

**Examples:**

| Result | Why Persistent Information? |
|---|---|
| Region comparison results | Multi-valued data: winner, scale, timing, CER. No other artifact. User needs to study. |
| Validation summaries | Actionable diagnostic data requiring correction decisions. |
| Partial translation | Indicates some pages untranslated. Influences whether to translate more pages. |

---

### 3. Progress

A result whose primary meaning IS ongoing progress rather than a completed outcome. It is the result of an operation that, by its nature, produces progressive updates before reaching a terminal state.

**Classification question:**

Is the core meaning of this result ongoing progress?

**If YES: this is Progress.**

Progress is classified because of what the result *means*, not because someone inspected a state machine or checked whether an operation is still running. A Progress Result is the semantic product of an in-flight operation — it carries a progress value and a terminal completion is expected later.

**Characteristics:**

- Indicates ongoing work with incremental updates.
- May include determinate progress (percentage) or indeterminate animation.
- May include a cancellation mechanism for the underlying operation.
- Always transient — a terminal result (success or failure) replaces it once the operation ends.

**Examples:**

| Result | Why Progress? |
|---|---|
| Translating visible pages | The meaning is ongoing translation progress. |
| OCR processing pages | The meaning is ongoing OCR progress. |
| Scanning a selected region | The meaning is ongoing region scan progress. |
| Running a region comparison | The meaning is ongoing comparison progress. |
| Loading a document | The meaning is ongoing load progress. |

---

### Classification Decision Tree

```
Operation Result
│
├── Is the core meaning of this result ongoing progress?
│   └── YES  →  PROGRESS
│
├── Is this merely an acknowledgement — nothing to study, nothing to interpret?
│   └── YES  →  ACKNOWLEDGEMENT
│
├── Does this contain information requiring interpretation beyond binary success/failure?
│   └── YES  →  PERSISTENT INFORMATION
│
├── Would losing this notification cause information loss?
│   └── YES  →  PERSISTENT INFORMATION
│
└── Fallback → ACKNOWLEDGEMENT
```

Classification decisions are made by answering semantic questions about the result's meaning. They are never driven by execution state, component location, or surface availability.

---

## Presentation Scope

Presentation Scope answers *where* a result is meaningful. It is determined independently of Semantic Classification — the same category can appear at any scope, and changing scope never changes category.

### Scope Levels

| Scope | Definition | Determining Question |
|---|---|---|
| **Global** | Meaningful across the entire application or document. | Is this result meaningful to any part of the UI? |
| **Component** | Meaningful only within one component instance. | Is this result only meaningful inside the component that produced it? |
| **Element** | Meaningful only for one specific DOM element. | Is this result only meaningful for the element it describes? |

### Independence from Semantic Classification

Scope and category are orthogonal dimensions. Neither determines the other.

A Persistent Information result at Component scope is still Persistent Information — it contains data requiring interpretation, but only within its owning component. A Progress result at Element scope is still Progress — it represents ongoing progress, but only for a specific element.

| Semantic Category | Global Example | Component Example | Element Example |
|---|---|---|---|
| **Acknowledgement** | Export failed | Empty translated pane | — |
| **Persistent Information** | Partial translation | Floating window translation error | Per-block translation failure |
| **Progress** | Translating visible pages | — | Per-block "Translating..." |

### Routing

- **Global-scoped** results are routed by the Feedback Policy. Policy maps the result's Semantic Category to a Presentation Surface.
- **Component-scoped** results remain inline within their owning component. The component renders them directly.
- **Element-scoped** results remain inline within their owning element. The element or its parent renders them directly.

Feedback Policy is only relevant for Global-scoped results. Component and Element scoped results are resolved by scope alone — Inline rendering is a consequence of scope, not of feedback routing.

---

## Feedback Policy

The Feedback Policy is a pure mapping from Semantic Category to Presentation Surface. It is invoked only when Presentation Scope is Global. Policy has no knowledge of Scope — it receives a Semantic Category and returns a Presentation Surface.

The Policy does not classify results — that is the role of Semantic Classification. It does not determine scope — that is the role of Presentation Scope. It is never invoked for Component or Element scoped results. It does not render — that is the role of Presentation.

### Current Mapping

| Semantic Category | Presentation Surface |
|---|---|
| Acknowledgement | Toast |
| Persistent Information | PdfStatusBanner (or future Results Panel / Side Panel) |
| Progress | PdfProgressBar |

The Policy is the single source of truth for surface selection. Changing a surface (e.g., migrating Persistent Information from Banner to Panel) requires changing only this table — no feature code, no classification code, no scope code, no presentation component code.

---

## Decision Framework

Two independent analyses are performed on every Operation Result. Scope then gates whether Policy is invoked.

```
                    Operation Result
                           │
          ┌────────────────┴────────────────┐
          ▼                                 ▼
  1. Semantic Classification        2. Presentation Scope
     (what kind of info)              (where meaningful)
          │                                 │
          ├── Ongoing progress?             ├── Only within one element?
          │   → PROGRESS                    │   → Element
          │                                 │
          ├── Merely acknowledgement?       ├── Only within one component?
          │   → ACKNOWLEDGEMENT             │   → Component
          │                                 │
          ├── Requires interpretation?      └── Across the application?
          │   → PERSISTENT INFORMATION          → Global
          │
          ├── Losing it = information loss?
          │   → PERSISTENT INFORMATION
          │
          └── Fallback → ACKNOWLEDGEMENT
                     │                          │
                     │                   Global? │
                     │                  ┌────────┴────────┐
                     │                 YES                NO
                     │                  │                  │
                     ▼                  ▼                  ▼
             Semantic Category   Feedback          Inline rendering
                                Policy             in owning context
                                  │
                                  ▼
                        Presentation Surface
```

Classification and Scope are derived independently from the same Operation Result. Scope determines whether Policy is invoked. Policy maps Category → Surface. Policy never sees Scope.

---

## Ownership

| Layer | Responsibility | Must NOT |
|---|---|---|
| **Feature** | Produces an Operation Result — domain-relevant data describing what occurred. | Import presentation surfaces. Classify results. Name semantic categories or scopes. |
| **Semantic Classification** | Determines the semantic category of a result by answering semantic questions. | Contain domain logic. Determine scope. Depend on UI surfaces. |
| **Presentation Scope** | Determines where a result is meaningful (Global, Component, Element). | Depend on semantic category. Depend on UI surfaces. Contain domain logic. |
| **Feedback Policy** | Maps Semantic Category to Presentation Surface. Invoked only when Presentation Scope is Global. Never aware of Scope. | Classify results. Determine scope. Render UI. Contain domain logic. |
| **Presentation Surface** | An abstract destination (Toast, Banner, ProgressBar) that a Presentation Component renders. | Classify results. Determine scope. Contain domain knowledge. |
| **Presentation Component** | Renders feedback in a specific UI implementation. | Classify results. Make routing decisions. Determine scope. |

Classification and Scope are sibling consumers of Operation Result. Policy depends on both. Presentation Components depend only on Surface. No layer reaches across the dependency boundaries shown in the diagram above.

---

## Dependency Direction

```
  Feature                                          Surface         Component
  (domain)          Classification   Scope         (abstract)      (concrete
                    (semantics)      (where)                       renderer)
     │                   │             │               │               │
     │ Operation Result  │             │               │               │
     ├───────────────────┼─────────────┤               │               │
     │                   │             │               │               │
     │              ┌────┴────┐   ┌────┴────┐         │               │
     │              │ Semantic│   │Present. │         │               │
     │              │ Category│   │ Scope   │         │               │
     │              └────┬────┘   └────┬────┘         │               │
     │                   │             │               │               │
     │                   │        Global? │            │               │
     │                   │       ┌────────┴────────┐   │               │
     │                   │      YES                NO   │               │
     │                   │       │                  │   │               │
     │                   │       ▼                  ▼   │               │
     │                   │   Policy                 │   │               │
     │                   │   (Category→Surface)     │   │               │
     │                   │       │                  │   │               │
     │                   └───────┼──────────────────┼───┤               │
     │                           │  Surface         │   │               │
     │                           ├──────────────────┼──►├──────────────►│
     │                           │                  │   │               │
     │                           │                  │  Inline           │
     │                           │                  └───┼──────────────►│
```

Feature depends only on Operation Result. Classification and Scope are sibling consumers — neither depends on the other. Scope gates whether Policy is invoked — Policy itself depends only on Semantic Category, never on Scope. Presentation Component depends on Surface.

Feature and Presentation Component are fully decoupled — they share only the Operation Result abstraction.

---

## Examples

Each example shows the two independent analyses (Classification and Scope) and the resulting route.

### Example 1: Export completed

```
Result:     { type: 'export-completed', format: 'txt' }
Classify:   Merely acknowledgement? YES → Acknowledgement
Scope:      Meaningful across application? YES → Global
Route:      Global → Policy maps Acknowledgement → Toast
```

### Example 2: Region Comparison complete

```
Result:     { type: 'comparison-completed', winner: 'scale-1', timingMs: 1234, cer: {...} }
Classify:   Requires interpretation? YES → Persistent Information
Scope:      Global
Route:      Global → Policy maps Persistent Information → StatusBanner
```

### Example 3: Region Comparison failed

```
Result:     { type: 'comparison-failed', reason: 'all-candidates-rejected' }
Classify:   Would losing this cause information loss? YES
            (No results exist elsewhere. User must re-run to recover.)
            → Persistent Information
Scope:      Global
Route:      Global → Policy maps Persistent Information → StatusBanner
```

### Example 4: Translating visible pages

```
Result:     { type: 'translation-progress', current: 45, total: 100 }
Classify:   Ongoing progress? YES → Progress
Scope:      Global
Route:      Global → Policy maps Progress → PdfProgressBar
```

### Example 5: Per-block translation loading

```
Result:     { type: 'block-translation-loading', blockId: 'b12', pageNumber: 3 }
Classify:   Ongoing progress? YES → Progress
Scope:      Meaningful only within one element? YES → Element
Route:      Element scope → Inline within the block element
            (Scope Resolver: not Global, Policy not involved)
```

### Example 6: Per-page OCR status

```
Result:     { type: 'page-ocr-complete', pageNumber: 5 }
Classify:   Merely acknowledgement? YES → Acknowledgement
Scope:      Meaningful only within one element? YES → Element
Route:      Element scope → Inline pill on the page
            (Scope Resolver: not Global, Policy not involved)
```

### Example 7: Empty translated pane

```
Result:     { type: 'pane-empty', pane: 'translated' }
Classify:   Merely acknowledgement? YES → Acknowledgement
            (Confirms a condition; the emptiness is self-evident)
Scope:      Meaningful only within one component? YES → Component
Route:      Component scope → Inline in the translated pane
            (Scope Resolver: not Global, Policy not involved)
```

### Example 8: Validation report (future)

```
Result:     { type: 'validation-completed', errors: [...] }
Classify:   Requires interpretation? YES → Persistent Information
Scope:      Global
Route:      Global → Policy maps Persistent Information → StatusBanner
            Future: if surface migrates from Banner to Panel, only Policy table changes.
```

### Example 9: Quality analysis (future)

```
Result:     { type: 'quality-analysis-completed', scores: {...} }
Classify:   Requires interpretation? YES → Persistent Information
Scope:      Global
Route:      Global → Policy maps Persistent Information → StatusBanner
            Same policy table as Validation report. No per-feature deliberation.
```

---

## Future Evolution

Semantic Classification rules are **stable**. Presentation Scope rules are **stable**. Presentation Surfaces for Global results **evolve**. This is the primary architectural value of the separation.

### Today

| Semantic Category | Global Surface |
|---|---|
| Acknowledgement | Toast |
| Persistent Information | PdfStatusBanner |
| Progress | PdfProgressBar |

Component and Element scoped results render inline — this is a consequence of scope, not a policy mapping. It does not change.

### Future (hypothetical)

| Semantic Category | Global Surface |
|---|---|
| Acknowledgement | Toast |
| Persistent Information | Results Panel (side drawer) |
| Progress | PdfProgressBar |

No feature code changes. No classification changes. No scope changes. Only the Feedback Policy mapping changes. A developer migrates all Persistent Information Global results from Banner to Panel by modifying one mapping — not every feature call site.

### New Semantic Categories

Additional categories may emerge as the application grows. Candidates for future consideration:

| Candidate Category | Definition | Distinct From |
|---|---|---|
| **Critical State** | A blocking condition the user must resolve to proceed (e.g., "This PDF requires a password"). | Persistent Information — Critical State is a precondition, not a result. May warrant elevated presentation (dedicated surface, modal, or non-dismissible banner variant). |
| **Aggregate Summary** | A condensed overview of multiple operation results (e.g., "3 of 12 pages failed OCR"). | Persistent Information — Aggregate summarizes multiple results rather than presenting raw analytical data. May warrant a compact summary strip or badge. |

These are hypothetical. Introduce only when real use cases demand them, following the same ADR process.

---

## Consequences

### Positive

- **Centralized routing for Global feedback.** One policy mapping determines surface selection for all features. Changing a surface changes behavior everywhere.
- **Feature decoupling.** Features do not import toast libraries, banner components, or progress bars. They emit Operation Results.
- **Consistent UX.** Users learn a predictable pattern. Binary confirmations appear as toasts. Analytical results appear in a persistent surface. Progress appears in the progress bar. Inline states stay with their context.
- **Cheap migrations.** Moving all Persistent Information Global results from Banner to a future Panel requires changing the policy mapping, not N feature files.
- **Onboarding clarity.** New feature authors follow the classification tree and scope questions instead of making subjective choices.

### Trade-offs

- **Indirection cost.** A developer must understand classification, scope, and policy to trace which surface a result will use.
  - *Mitigation*: Documented in this ADR. The process answers questions in one minute. The alternative — N developers making N undocumented decisions — is higher total cost.
- **Abstract result model.** Features emit structured result objects instead of calling `toast.error()` directly.
  - *Mitigation*: Result objects are simple data — no inheritance, no factories. The complexity budget moves from the call site to the classification and policy layers.
- **Incremental adoption.** The current codebase has features that call toast and banner APIs directly. Full adoption is a migration, not a flag day.
  - *Mitigation*: Migration can be incremental. Each feature adopts the policy independently. Working features continue working. New features follow the policy from day one.

### Migration Strategy

1. **Document policy** — this ADR.
2. **New features** follow the classification tree and scope questions. No new direct surface imports in feature code.
3. **Existing features** refactored incrementally. Prioritize features with the most call sites or the most inconsistent surface usage.
4. **Cleanup** — remove direct surface imports from feature code once all features are migrated.

No flag day. No feature breaks. Each migration is a self-contained, testable change.

---

## Non-Goals

This ADR does **not** define:

- Visual design of any UI surface.
- Toast styling, duration, or positioning.
- Banner layout, colors, or dismiss behavior.
- Progress bar animation, height, or motion.
- Component implementation details.
- Specific Vue component names or CSS classes.

It only defines the architectural policy for: what kind of result is this, where is it meaningful, who decides, and how that decision reaches a UI surface.

---

## Architectural Invariants

Future changes must preserve:

1. **Features must never import presentation surfaces.** No `toast.*`, no banner components, no progress bar components in feature code. Features emit Operation Results.
2. **Features must never classify their own results.** A feature never emits `{ type: 'persistent-information' }` or `{ type: 'acknowledgement' }`. Semantic categories belong exclusively to Classification.
3. **Classification must never depend on Presentation Scope or UI surfaces.** Classification answers semantic questions about meaning. Scope is determined independently.
4. **Presentation Scope must never depend on Semantic Category.** Scope answers where a result is meaningful. Category answers what kind of information it is. They are orthogonal.
5. **Feedback Policy is a pure Category → Surface mapping.** It is invoked only when Presentation Scope is Global. Policy never depends on Scope and is never aware of Component or Element contexts.
6. **Presentation surfaces must never classify results or determine scope.** Surfaces render what the policy routes to them.
7. **The classification tree answers all category questions.** No per-feature deliberation, undocumented exceptions, or "this feature is special" carve-outs without updating this ADR.
8. **Operation Result, Semantic Category, and Presentation Scope are the public interfaces between feature and presentation.** Both sides depend on these abstractions, never on each other.
