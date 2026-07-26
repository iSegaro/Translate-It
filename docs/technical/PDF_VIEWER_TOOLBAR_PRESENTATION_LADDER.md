# PDF Viewer Toolbar Presentation Ladder

**Status:** Phase 5 presentation ladder

**Authority:** [ADR-013: PDF Viewer Toolbar Architecture](../adr/ADR-013-pdf-viewer-toolbar-architecture.md), [PDF Viewer Toolbar Information Architecture](PDF_VIEWER_TOOLBAR_INFORMATION_ARCHITECTURE.md), [PDF Viewer Toolbar Priority Model](PDF_VIEWER_TOOLBAR_PRIORITY_MODEL.md), and [PDF Viewer Toolbar Presentation Contract](PDF_VIEWER_TOOLBAR_PRESENTATION_CONTRACT.md)

## Purpose

This document defines the ordered architectural progression through which toolbar Logical Groups simplify their presentation. It defines order and permitted progression only. It does not define implementation.

The Presentation Ladder derives entirely from the Presentation Contract. It introduces no new workflows, Logical Groups, priorities, ownership boundaries, capabilities, or presentation contracts.

## 1. Ladder Principles

1. Presentation becomes progressively simpler while preserving the group's established product capability.
2. Visual and informational complexity is reduced before user intent, semantic meaning, or capability.
3. Every transition preserves the workflow, Logical Group, priority, ownership, accessibility contract, and presentation contract established by prior phases.
4. Each transition is reversible: returning to an earlier level restores richer presentation without changing domain state, action availability, or product meaning.
5. Each level derives from the level before it. A group may not bypass the guarantees established by an intermediate level.
6. Logical Groups progress as coherent units. Individual controls do not define independent progression.
7. The ladder is not a priority model. It defines permitted presentation progression for priorities established elsewhere.

## 2. Presentation Ladder

| Level | Architectural Goal | Presentation Contract relationship |
|---|---|---|
| Level 1: Complete context | Present the complete relevant capability and contextual clarity of each Logical Group. | Expanded |
| Level 2: Concentrated capability | Reduce visual and informational redundancy while retaining complete group capability and clear meaning. | Compact |
| Level 3: Essential continuity | Emphasize the capability necessary to preserve the group's protected user intent while retaining all remaining group capability through its reduced representation. | Essential |

Levels are ordered architectural progression, not new Presentation States. Each level maps directly to the corresponding state already defined by the Presentation Contract.

The ladder levels are architectural progression stages, not implementation levels, responsive breakpoints, or layout states.

## 3. Transition Rules

### Level 1 to Level 2: Complete Context to Concentrated Capability

**Allowed changes:**

- reduce visual and informational redundancy within a Logical Group;
- consolidate related context when the group's meaning remains clear;
- reduce the prominence of supporting detail while retaining complete group capability.

**Prohibited changes:**

- remove capability;
- alter workflow, Logical Group, priority, ownership, or semantic meaning;
- make a capability undiscoverable or inaccessible;
- split related controls into unrelated progression paths.
- introduce new interaction concepts.

**Preserved guarantees:**

- complete workflow capability;
- clear group identity and user intent;
- accessibility contract;
- reversible return to Level 1.

### Level 2 to Level 3: Concentrated Capability to Essential Continuity

**Allowed changes:**

- emphasize the capability necessary for the group's protected user intent;
- reduce peripheral contextual detail;
- use the group's defined reduced representation for remaining capability.

**Prohibited changes:**

- remove or reclassify capability;
- obscure active operation state, cancellation meaning, document position, or primary document purpose;
- transfer responsibility between groups or owners;
- redefine a secondary action as primary work, or primary work as secondary action.
- introduce new interaction concepts.

**Preserved guarantees:**

- all group capability remains available;
- workflow and priority remain stable;
- semantic meaning and accessibility remain clear;
- reversible return to Level 2 or Level 1.

## 4. Logical Group Progression

| Logical Group | Level 1: Complete context | Level 2: Concentrated capability | Level 3: Essential continuity |
|---|---|---|---|
| Identity and context | Complete application and document orientation, entry, and inspection capability. | Concise orientation while retaining entry and inspection capability. | Clear active document or application identity with preserved entry and inspection capability. |
| Navigation | Structural navigation, sequential movement, and direct position capability together. | The same navigation capability with reduced contextual redundancy and preserved position understanding. | Position awareness plus sequential and direct document movement remain protected. |
| View | Complete representation, comparison, scale, and fitting capability. | The same reading and comparison capability with concentrated contextual detail. | Readable presentation, representation awareness, and essential reading adjustments remain protected. |
| Primary operation | Immediate translation and recognition capability, active-operation control, and contextual operation configuration. | The same immediate operation capability with concentrated contextual choices. | Immediate operation and active-state control remain clear; relevant recognition capability remains available when context requires it. |
| Secondary actions | Complete output, configuration, maintenance, and advanced capability with clear action identity. | The same secondary capability with concentrated action context. | Discoverable access to all secondary capability remains protected while current-context relevance is emphasized. |

Every row is constrained by the corresponding Group Presentation Contract. No group receives an independent ladder or a progression that conflicts with its workflow meaning.

## 5. Preservation Guarantees

Across every ladder transition, the following are preserved:

1. Domain and feature ownership.
2. Workflow classification.
3. Logical Group membership.
4. Priority Tier assignment.
5. Presentation Contract constraints.
6. User intent and semantic meaning.
7. Complete product capability when the relevant workflow context exists.
8. Accessibility contract, including discoverability, keyboard access, focus visibility, and accessible naming.
9. Reversible progression without domain-state or action-availability loss.
10. Stable user expectations of product behavior across every ladder transition.

## 6. Validation

| Validation question | Result |
|---|---|
| Does every ladder transition preserve Phase 4? | Yes. Each level maps to a Presentation Contract state and retains its constraints. |
| Does any transition change Priority? | No. Priority remains assigned by Logical Group under the Priority Model. |
| Does any transition change Logical Groups? | No. Each group follows its own coherent row in Logical Group Progression. |
| Does any transition change ownership? | No. Ownership remains unchanged across all levels. |
| Does every group follow one coherent progression? | Yes. Every group moves from complete context, through concentrated capability, to essential continuity without independent control-level progression. |
| Does the ladder introduce new architectural classification? | No. It orders the existing Presentation Contract states only. |

## 7. Growth Audit

Future capabilities inherit the Presentation Ladder of their one Logical Group. They do not define an independent ladder because workflow, priority, and presentation contract are already inherited from that group.

| Future capability | Logical Group | Inherited progression |
|---|---|---|
| Search | Navigation | Complete document-finding context, concentrated navigation capability, then essential position and finding continuity. |
| Rotate | View | Complete reading-orientation context, concentrated view capability, then essential readable presentation continuity. |
| Print | Secondary actions | Complete output context, concentrated secondary capability, then preserved discoverable output access. |
| Compare | View | Complete comparative context, concentrated comparison capability, then essential representation continuity. |
| Bookmark | Navigation | Complete position-management context, concentrated navigation capability, then essential position continuity. |
| Additional OCR actions | Primary operation | Complete recognition context, concentrated operation capability, then essential active-operation continuity. |
| Additional export actions | Secondary actions | Complete output context, concentrated secondary capability, then preserved discoverable output access. |

Feature growth does not create a new ladder. A new ladder requires a new Logical Group justified under ADR-013.

## 8. Future Rules

1. Presentation Ladder derives from the Presentation Contract and may not redefine it.
2. The ladder defines ordered progression, not implementation.
3. Logical Groups move together through the ladder; individual controls do not define independent progression.
4. Every conceptual control inherits the ladder of its one Logical Group.
5. Each transition must preserve all Preservation Guarantees.
6. A group may not bypass a level or use a later level to justify lost capability, changed meaning, or reclassification.
7. Implementation must conform to the ordered progression and may not redefine it.
8. A new ladder level requires architectural justification that the existing progression cannot preserve the Presentation Contract.
9. A new Logical Group requires ADR-013 justification before it can establish a distinct ladder progression.
10. The Presentation Ladder defines progression, not optimization. It preserves architectural consistency during presentation evolution and must not be repurposed to justify unrelated optimization goals.

This Presentation Ladder is the authoritative input to later implementation decisions.
