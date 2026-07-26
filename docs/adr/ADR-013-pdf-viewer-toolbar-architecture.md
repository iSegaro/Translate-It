# ADR-013: PDF Viewer Toolbar Architecture

- **Status:** Accepted
- **Date:** 2026-07-26
- **Scope:** PDF Viewer toolbar product architecture
- **Decision Type:** Architectural

## 1. Purpose

The PDF Viewer toolbar is the workflow surface for operating on an open PDF. It gives users a stable path to:

- orient themselves in the document and application;
- navigate and read the document;
- choose a document view;
- run translation and contextual OCR operations;
- reach secondary document actions and application configuration.

The toolbar is not a catalogue of available commands. It is a product surface that makes the current workflow clear, keeps primary actions available, and presents secondary actions through deliberate hierarchy.

This ADR establishes that hierarchy as the permanent contract for future toolbar work.

## 2. Non-Goals

The toolbar does not own:

- document navigation behavior or validation;
- translation, OCR, export, or comparison business logic;
- provider, language, or document state;
- application orchestration;
- feature lifecycle, cancellation, persistence, or error policy;
- deciding whether an action is available at the domain level;
- dynamic command placement based on runtime layout measurement.

The toolbar renders current presentation state and emits user intent. It does not become a domain controller.

## 3. Design Philosophy

Toolbar architecture is workflow-first.

```text
Workflow
    ↓
Information hierarchy
    ↓
Logical group
    ↓
Presentation ladder
    ↓
Responsive presentation
```

Viewport size does not define product importance. It only constrains how an already-classified group is presented.

This order prevents a new feature from becoming a direct toolbar control merely because space exists at one size. A feature first earns its placement through user workflow and priority. Responsive presentation then adapts the group without renegotiating individual controls.

The More menu is a product hierarchy decision. It is a stable home for secondary and advanced actions, not a runtime overflow bucket.

## 4. Core Principles

1. The toolbar represents workflows, not an inventory of buttons.
2. Every toolbar control is classified before implementation.
3. Workflow determines logical group; logical group determines presentation.
4. A control belongs to one primary workflow, one logical group, and one priority tier.
5. Logical groups own presentation changes. Individual controls do not independently negotiate layout.
6. Primary workflow access remains stable; presentation may change but intent and ownership do not.
7. Secondary and advanced actions use deliberate secondary presentation from first release.
8. Responsive transitions are intentional states, never incidental wrapping.
9. More reflects product hierarchy and remains static with respect to runtime available width.
10. Presentation remains separate from feature behavior and application orchestration.

## 5. Architectural Decision Tree

Every proposed toolbar control must pass this decision sequence before implementation:

```text
Does this belong in the toolbar?
    ↓
Which user workflow does it serve?
    ↓
Which logical group represents that workflow?
    ↓
Which priority tier does it require?
    ↓
What is the group's presentation ladder for this control?
    ↓
What accessibility contract must remain stable?
    ↓
Implementation
```

This is an architectural admission gate, not a post-implementation review. A control that cannot complete this sequence does not enter the toolbar.

## 6. Toolbar Invariants

The following invariants apply to every current and future toolbar control:

1. Every control has a documented workflow, group, priority tier, and presentation ladder before it enters the toolbar.
2. Every control appears in exactly one primary logical group.
3. Every logical group owns its internal presentation as a unit.
4. A group may change presentation, but its controls must not wrap or relocate accidentally.
5. Direct access is reserved for controls whose tier requires it; direct placement is never the default.
6. A control that is contextual appears only when its workflow context is meaningful.
7. Secondary presentation must preserve the action's discoverability, name, and accessibility.
8. More contains actions because product hierarchy assigns them there, not because a layout has run out of space.
9. Responsive presentation must not change domain ownership, event contracts, or business behavior.
10. New toolbar capacity is created by hierarchy and group presentation, not by reducing usability of primary controls.
11. Responsive presentation may change iconography, density, compactness, or placement inside the defined hierarchy. It must never change product meaning, workflow meaning, or the reason an action is available.

## 7. Workflow Model

The PDF Viewer toolbar recognizes these user workflows:

| Workflow | User intent | Current examples |
|---|---|---|
| Document entry and context | Open, identify, inspect, and orient within a document | Brand/title, Open PDF, Outline, PDF Information |
| Navigate and read | Move through and inspect document content | Previous page, page number, next page, Zoom, Fit |
| Choose document presentation | Select what representation of the document is being viewed | View Mode, Side-by-side |
| Translate and recognize | Produce, cancel, or configure translation and OCR work | Provider Selector, Translate, Cancel, contextual OCR |
| Output and manage | Export results or perform document-level follow-up actions | Export, Clear Cache, document actions |
| Configure and develop | Change application preferences or invoke advanced tools | Language Settings, Settings, Debug and Comparison tools |

These workflows are intentionally broader than individual features. Future controls must join an existing workflow unless product evidence establishes a genuinely new workflow.

## 8. Logical Groups

Logical groups are the presentation units of the toolbar. They exist so related controls change presentation together according to a shared workflow contract, rather than individually competing for layout space.

| Logical group | Maps from workflow | Owns presentation of |
|---|---|---|
| Identity and context | Document entry and context | Brand/title, document orientation, contextual document identity actions |
| Navigation | Navigate and read | Page navigation, document-structure access, and reading-position controls |
| View | Choose document presentation | View selection, comparison layout, zoom, and fit controls |
| Primary operation | Translate and recognize | Translation initiation/cancellation, provider choice, and contextual OCR access |
| Secondary actions | Output and manage; Configure and develop | Export, document follow-up, configuration, and advanced actions |

Every workflow maps into exactly one logical group. Every toolbar control belongs to exactly one logical group. A group owns its internal presentation and presentation ladder; controls inside it do not negotiate layout independently.

Existing logical groups must always be preferred over creating new groups. A new logical group requires explicit architectural justification that no existing workflow and group can represent the user goal. New groups are rare architectural events, not a convenience for feature placement.

## 9. Priority Model

The toolbar uses four priority tiers.

| Tier | Contract | Examples |
|---|---|---|
| Tier 1: Primary workflow | Directly reachable whenever its workflow is active. Its essential interaction remains stable. | Page navigation; Translate or Cancel; current document presentation selection |
| Tier 2: Contextual workflow | Direct when context makes it valuable. May use a compact presentation as a group. | OCR primary action; Zoom/Fit; Side-by-side; Outline |
| Tier 3: Secondary action | Reachable through stable secondary presentation. It does not claim permanent primary-toolbar space. | Export, PDF Information, Open PDF, language settings |
| Tier 4: Advanced or infrequent action | Available through More or a dedicated advanced surface. | Cache management, developer comparison, future specialist tools |

Context may raise or suppress a control's presentation within its own tier. Context does not allow a Tier 3 or Tier 4 feature to bypass classification and occupy primary workflow space.

## 10. Presentation Ladder

A Presentation Ladder is the architectural definition of how one logical group changes presentation as the toolbar transitions between intentional presentation states defined by the product architecture.

It preserves the group's workflow, ownership, accessibility, discoverability, and semantic meaning while its visual density, iconography, compactness, or placement inside the defined hierarchy changes. It is owned by the logical group, not by individual controls.

This ADR defines the concept only. Specific presentation levels are implementation decisions that must conform to this contract in later phases.

## 11. Ownership

| Owner | Responsibilities | Does Not Own |
|---|---|---|
| `PdfToolbar` | Toolbar rendering, information hierarchy, logical-group presentation, accessibility semantics, and user-intent emission | Domain behavior, navigation validation, feature lifecycle, persistence, responsive state outside toolbar presentation |
| `PdfApp` | Composition of toolbar inputs and handlers; delegation of toolbar intent to existing application and feature APIs | Toolbar hierarchy, group presentation policy, domain implementation owned by feature modules |
| Feature modules | Navigation, translation, OCR, export, provider, and other business behavior | Toolbar layout, product placement of unrelated controls, application-wide orchestration |

The navigation contract remains:

```text
PdfToolbar intent
    ↓
PdfApp delegation
    ↓
usePdfNavigation behavior
```

Equivalent contracts apply to translation, OCR, export, and other feature workflows.

Responsive ownership remains inside `PdfToolbar`. No responsive policy belongs in application orchestration, domain state, or shared feature logic.

## 12. Responsive Philosophy

Responsive behavior is the presentation ladder of a logical group.

For each group, the presentation ladder defines:

1. its primary presentation;
2. its compact presentation, if needed;
3. whether it is contextual rather than persistent;
4. whether it belongs in secondary presentation.

The presentation ladder changes before primary workflow access changes. It must preserve:

- the control's intent;
- semantic and keyboard access;
- focus visibility;
- accessible naming;
- feature ownership;
- group cohesion.

Primary navigation and primary operation access must not become secondary merely to make unrelated low-priority controls fit. Secondary and advanced actions must not force primary groups into accidental multi-line states.

CSS media queries remain the default mechanism for expressing intentional presentation states. Container Queries may be adopted only where parent allocation, rather than viewport class, is a proven architectural input to a group presentation decision. They remain presentation-only and do not introduce runtime responsive state.

## 13. Future Evolution Rules

Before adding, promoting, or moving a toolbar control, the proposal must document:

1. user workflow;
2. logical group;
3. priority tier;
4. whether it is persistent or contextual;
5. primary, compact, and secondary presentation ladder;
6. accessibility contract;
7. why existing direct controls cannot already satisfy the user goal;
8. ownership and emitted user intent.

The following rules apply:

- New controls enter secondary presentation unless evidence requires Tier 1 or Tier 2 access.
- Related actions extend their existing group rather than creating independent toolbar controls.
- Existing logical groups must be exhausted before a new logical group is proposed. A new group requires explicit architectural justification.
- New OCR actions extend the OCR workflow; new export actions extend Output and manage; new configuration actions extend Configure and develop.
- A new workflow requires explicit product and architectural justification.
- A control may be promoted only with evidence of frequent, time-sensitive, or workflow-blocking use.
- A feature may not rely on incidental layout wrapping as its compact presentation.
- A feature may not create runtime overflow behavior to bypass this hierarchy.

## 14. Architecture Validation

This architecture remains stable under foreseeable growth.

### Five New Controls

Five new controls do not automatically consume direct toolbar space. Each receives tier and workflow classification first. Most future controls are expected to extend secondary or advanced workflows, preserving primary workflow capacity.

### OCR Growth

OCR growth remains within Translate and recognize. Additional OCR choices extend contextual OCR presentation rather than creating parallel direct actions.

### Translation Growth

Translation remains primary only where users initiate, cancel, or must immediately understand work. Provider and configuration expansion stays within its existing workflow and does not change navigation ownership.

### Search, Rotate, Compare, and Print

- Search is classified according to whether it is an active reading workflow or secondary document action.
- Rotate is normally a secondary document-presentation action unless evidence makes it routine.
- Compare extends document presentation rather than creating an unrelated control family.
- Print is an output action and therefore enters secondary presentation by default.

The architecture scales because new capability is classified by workflow and priority before it is assigned presentation, rather than competing directly for toolbar space.

## Decision

Adopt this workflow-first, priority-based toolbar architecture as the permanent PDF Viewer toolbar contract.

Future toolbar changes must preserve its invariants, ownership boundaries, and future evolution rules. A departure requires new product evidence and an ADR update.
