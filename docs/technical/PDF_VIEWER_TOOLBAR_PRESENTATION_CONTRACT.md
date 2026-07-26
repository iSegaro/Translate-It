# PDF Viewer Toolbar Presentation Contract

**Status:** Phase 4 presentation contract

**Authority:** [ADR-013: PDF Viewer Toolbar Architecture](../adr/ADR-013-pdf-viewer-toolbar-architecture.md), [PDF Viewer Toolbar Information Architecture](PDF_VIEWER_TOOLBAR_INFORMATION_ARCHITECTURE.md), and [PDF Viewer Toolbar Priority Model](PDF_VIEWER_TOOLBAR_PRIORITY_MODEL.md)

## Purpose

This document defines the presentation capabilities available to each PDF Viewer toolbar Logical Group. It specifies what a group may change as presentation space becomes progressively constrained while preserving the workflow, priority, ownership, and meaning established by prior architectural phases.

This contract defines capability, not a particular user-interface implementation.

This Presentation Contract is derived entirely from the Information Architecture and Priority Model. It introduces no new workflow classifications, ownership boundaries, Logical Groups, or product priorities.

## 1. Presentation Principles

1. Presentation changes representation, never user intent.
2. Presentation changes preserve workflow meaning, logical-group membership, and priority.
3. Presentation never transfers domain ownership or changes emitted user intent.
4. Presentation may reduce visual complexity, but it must not remove product capability.
5. A Logical Group changes presentation as one architectural unit; its controls do not independently negotiate presentation.
6. Context may determine whether a contextual capability is relevant, but does not reclassify that capability.
7. Presentation must preserve semantic clarity, discoverability, keyboard access, focus visibility, and accessible naming.
8. Presentation state is not a priority tier. Priority defines architectural protection; presentation defines permitted representation.

## 2. Presentation States

| Presentation State | Description |
|---|---|
| Expanded | The group presents its complete set of relevant capabilities with full contextual clarity. |
| Compact | The group reduces visual complexity while preserving its complete workflow capability and semantic clarity. |
| Essential | The group emphasizes the capabilities necessary to preserve its protected user intent. All remaining group capability stays available through the group's defined reduced representation. |

These states are architectural vocabulary. They do not prescribe a specific rendering mechanism, interaction pattern, or transition condition.

## 3. Group Presentation Contract

| Logical Group | Expanded | Compact | Essential | Architectural Constraints |
|---|---|---|---|---|
| Identity and context | Presents application and document identity together with relevant entry and inspection capability. | Presents concise application and document orientation while retaining document entry and inspection capability. | Preserves clear active-document or application orientation and access to entry and inspection capability. | Must not make document identity ambiguous or reinterpret inspection as navigation. |
| Navigation | Presents structural navigation, sequential movement, and direct document-position capability together. | Presents the same navigation workflow with reduced visual complexity and preserved direct understanding of document position. | Preserves the ability to establish current position and move sequentially and directly through the document. | Must not remove position awareness, sequential movement, or direct document-position capability. |
| View | Presents complete document representation, comparison, scale, and fitting capability. | Presents the same reading and comparison capability with reduced visual complexity. | Preserves readable document presentation, current representation awareness, and access to essential reading adjustments. | Must not change document content, document position, or transform view actions into document operations. |
| Primary operation | Presents immediate translation and recognition initiation, active-operation control, and contextual operation configuration. | Presents the same immediate operation capability with concise representation of contextual choices. | Preserves immediate access to the active primary operation and its active-state control; relevant recognition capability remains available when context requires it. | Must not obscure whether an operation can start, is active, or can be cancelled. Must not turn operation configuration into unrelated application configuration. |
| Secondary actions | Presents complete output, configuration, maintenance, and advanced capability with clear action identity. | Presents the same secondary capability through a coherent, concise secondary representation. | Preserves discoverable access to all secondary capability while emphasizing the actions relevant to the current document context. | Must remain a deliberate product hierarchy. It must not change the workflow classification of contained actions or become an arbitrary destination for unclassified capability. |

## 4. Preservation Rules

Across every Presentation State, the following remain unchanged:

1. Domain and feature ownership.
2. Workflow classification.
3. Logical Group membership.
4. Priority Tier assignment.
5. User intent and semantic meaning.
6. Action availability when the relevant workflow context exists.
7. Accessibility contract, including keyboard access, focus visibility, accessible naming, and discoverability.
8. The distinction between primary document work and secondary follow-up, configuration, maintenance, or specialist work.

No Presentation State may promote, demote, merge, or reclassify a workflow. Such a change is an architectural decision and must be evaluated against ADR-013 and the preceding classification documents.

## 5. Validation

| Validation question | Result |
|---|---|
| Does every Logical Group have a presentation contract? | Yes. Identity and context, Navigation, View, Primary operation, and Secondary actions each define permitted forms and constraints. |
| Does presentation change workflow ownership? | No. Presentation remains within `PdfToolbar`; feature and domain ownership remain unchanged. |
| Does presentation change priority? | No. Priority remains assigned by Logical Group under the Priority Model. |
| Does presentation remain derived from prior phases? | Yes. Each contract preserves the workflow and group membership established by Information Architecture and the protection established by Priority Model. |
| Does every state preserve product capability? | Yes. States may reduce visual complexity but cannot remove capability or change its meaning. |
| Does this document introduce any new architectural classifications? | No. It derives presentation capabilities entirely from the Information Architecture and Priority Model. |

## 6. Growth Audit

Future capabilities inherit the Presentation Contract of their Logical Group because presentation belongs to the group rather than the individual capability.

| Future capability | Logical Group | Inherited contract rationale |
|---|---|---|
| Search | Navigation | It preserves document-position and content-finding workflow within Navigation's permitted forms. |
| Rotate | View | It changes reading presentation and inherits View's reading and representation constraints. |
| Print | Secondary actions | It remains document output and inherits Secondary actions' deliberate product-hierarchy constraints. |
| Compare | View | It extends comparative document presentation without changing document content or operation ownership. |
| Bookmark | Navigation | It extends saving and returning to document position. |
| Additional OCR actions | Primary operation | They extend contextual recognition without changing active-operation meaning. |
| Additional export actions | Secondary actions | They extend document output without changing their secondary workflow classification. |

New capability does not create a new presentation contract unless it requires a new Logical Group under ADR-013.

## 7. Future Rules

1. Presentation belongs to Logical Groups, never individual controls.
2. Every conceptual control inherits the Presentation Contract of its one Logical Group.
3. Presentation States may evolve, but a group's preserved workflow, priority, ownership, and semantic meaning remain stable.
4. New capabilities inherit the Presentation Contract of their Logical Group; they do not negotiate an independent presentation model.
5. Implementation must conform to the permitted forms and constraints in this contract.
6. A new Presentation State requires architectural justification that existing states cannot express the required representation while preserving all preservation rules.
7. A new Logical Group requires ADR-013 justification before it can define a new presentation contract.
8. Presentation must never be used to conceal a change in workflow, priority, ownership, or product meaning.
9. Presentation Contracts are architectural contracts, not implementation strategies. Implementation must conform to this contract and may not redefine it.

This Presentation Contract is the authoritative input to later implementation decisions.
