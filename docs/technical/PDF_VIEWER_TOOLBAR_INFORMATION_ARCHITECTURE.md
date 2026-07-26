# PDF Viewer Toolbar Information Architecture

**Status:** Phase 2 classification

**Authority:** [ADR-013: PDF Viewer Toolbar Architecture](../adr/ADR-013-pdf-viewer-toolbar-architecture.md)

## Purpose

This document classifies every current PDF Viewer toolbar control according to ADR-013. It records product meaning only: workflow and logical-group membership. It does not prescribe visual presentation or implementation.

The **Inventory** is the authoritative source of classification. The Workflow Mapping and Logical Group Mapping sections are derived summary views for readability only. When a summary and inventory appear to differ, the Inventory governs.

## 1. Inventory

| Conceptual control | Current access surface | Workflow | Logical group | Classification rationale |
|---|---|---|---|---|
| Brand / Title | Leading toolbar content before a document is loaded | Document entry and context | Identity and context | Identifies the application and establishes entry context. |
| Open PDF | More menu | Document entry and context | Identity and context | Starts or replaces the active document context. |
| Outline | Leading toolbar control when outline exists | Navigate and read | Navigation | Moves through document structure. |
| PDF Information | Leading icon and More menu item | Document entry and context | Identity and context | Inspects identity and metadata of the active document. |
| View Mode | Segmented control or select | Choose document presentation | View | Chooses the document representation being read. Both current renderings are one conceptual control. |
| Side-by-side | View control | Choose document presentation | View | Changes comparative document presentation. |
| Previous Page | Page navigation cluster | Navigate and read | Navigation | Moves to adjacent document position. |
| Page Number / Total Pages | Page navigation cluster | Navigate and read | Navigation | States and changes current document position. Total-page text is part of this same conceptual control. |
| Next Page | Page navigation cluster | Navigate and read | Navigation | Moves to adjacent document position. |
| Zoom Out | Zoom group | Choose document presentation | View | Changes reading scale. |
| Zoom Level | Zoom group | Choose document presentation | View | States and chooses reading scale. |
| Zoom In | Zoom group | Choose document presentation | View | Changes reading scale. |
| Fit | View control | Choose document presentation | View | Chooses reading-scale behavior. |
| Provider Selector | Translation operation control | Translate and recognize | Primary operation | Selects provider for the current translation operation; selection is directly coupled to initiating that operation. |
| Translate | Provider selector primary action | Translate and recognize | Primary operation | Starts the primary translation workflow. |
| Cancel | Provider selector primary action while active | Translate and recognize | Primary operation | Cancels the active primary translation workflow. |
| OCR primary action | OCR split control | Translate and recognize | Primary operation | Starts contextual recognition work for document content. |
| OCR action choice | OCR menu: region or page | Translate and recognize | Primary operation | Selects the scope of the current OCR operation. |
| OCR language choice | OCR menu language list | Translate and recognize | Primary operation | Selects language input for the current OCR operation. |
| Manage OCR Languages | OCR menu item | Configure and develop | Secondary actions | Manages installed OCR capability rather than executing the current OCR operation. |
| Export TXT | More menu export submenu | Output and manage | Secondary actions | Produces a document result outside the active reading/translation workflow. |
| Export Markdown | More menu export submenu | Output and manage | Secondary actions | Produces a document result outside the active reading/translation workflow. |
| Export HTML | More menu export submenu | Output and manage | Secondary actions | Produces a document result outside the active reading/translation workflow. |
| Language Settings | More menu language item and settings popover | Configure and develop | Secondary actions | Changes translation configuration rather than running the current operation. |
| Settings | More menu | Configure and develop | Secondary actions | Opens application-level configuration. |
| Clear Cache | More menu | Configure and develop | Secondary actions | Performs application/document maintenance. |
| Region execution mode | Conditional developer selection | Configure and develop | Secondary actions | Selects an advanced execution path. |
| Region Comparison | Conditional developer menu action | Configure and develop | Secondary actions | Runs an advanced diagnostic/comparison operation. |
| Cancel Region Comparison | Conditional developer action while active | Configure and develop | Secondary actions | Cancels an advanced diagnostic/comparison operation. |
| Export Region Comparison Artifact | Conditional developer menu action | Configure and develop | Secondary actions | Exports an advanced diagnostic result. |
| More Menu | Toolbar menu trigger | Output and manage | Secondary actions | Provides stable access to secondary and advanced actions. It is an access surface, not an independent business workflow. |

No current control requires a new workflow or logical group.

### Classification Notes

- **Outline** is visually near document context, but its user goal is moving through document structure. It therefore belongs to Navigate and read / Navigation.
- **PDF Information** has two current access surfaces. Both are the same conceptual control and retain one classification: Document entry and context / Identity and context.
- **Provider selection** is configuration in a narrow sense, but it configures the immediately available translation operation. Treating it as Primary operation preserves the unit of user intent: choose provider, then translate.
- **More Menu** receives one classification only to satisfy inventory completeness. It does not redefine the workflow of controls rendered inside it; each child keeps its own classification.

## 2. Workflow Mapping

| Workflow | Classified controls |
|---|---|
| Document entry and context | Brand / Title; Open PDF; PDF Information |
| Navigate and read | Outline; Previous Page; Page Number / Total Pages; Next Page |
| Choose document presentation | View Mode; Side-by-side; Zoom Out; Zoom Level; Zoom In; Fit |
| Translate and recognize | Provider Selector; Translate; Cancel; OCR primary action; OCR action choice; OCR language choice |
| Output and manage | Export TXT; Export Markdown; Export HTML; More Menu |
| Configure and develop | Manage OCR Languages; Language Settings; Settings; Clear Cache; Region execution mode; Region Comparison; Cancel Region Comparison; Export Region Comparison Artifact |

Each conceptual control has one workflow. Controls with multiple rendered states, such as Translate/Cancel or desktop/mobile View Mode, remain one conceptual control because their user goal is unchanged.

## 3. Logical Group Mapping

| Logical group | Workflows represented | Controls |
|---|---|---|
| Identity and context | Document entry and context | Brand / Title; Open PDF; PDF Information |
| Navigation | Navigate and read | Outline; Previous Page; Page Number / Total Pages; Next Page |
| View | Choose document presentation | View Mode; Side-by-side; Zoom Out; Zoom Level; Zoom In; Fit |
| Primary operation | Translate and recognize | Provider Selector; Translate; Cancel; OCR primary action; OCR action choice; OCR language choice |
| Secondary actions | Output and manage; Configure and develop | More Menu; Export actions; Language Settings; Manage OCR Languages; Settings; Clear Cache; developer and comparison actions |

Every classified workflow maps to one ADR-013 logical group. Every conceptual toolbar control belongs to one logical group.

## 4. Group Responsibilities

### Identity and Context

**Purpose:** Establish what document and application context the user is operating in.

**Controls:** Brand / Title, Open PDF, PDF Information.

These controls belong together because they establish, change, or inspect document identity. They do not move the user through document content or alter its presentation.

### Navigation

**Purpose:** Move through document structure and reading position.

**Controls:** Outline, Previous Page, Page Number / Total Pages, Next Page.

These controls belong together because each changes or describes where the user is in the document. Outline is structural navigation; page controls are sequential and direct-position navigation.

### View

**Purpose:** Change how document content is read and compared without changing document content or position.

**Controls:** View Mode, Side-by-side, Zoom Out, Zoom Level, Zoom In, Fit.

These controls belong together because they alter document presentation. They do not initiate an operation on document content.

### Primary Operation

**Purpose:** Execute or configure the immediate translation and recognition workflow.

**Controls:** Provider Selector, Translate, Cancel, OCR primary action, OCR action choice, OCR language choice.

These controls belong together because they directly prepare, initiate, alter, or cancel current translation and OCR work.

### Secondary Actions

**Purpose:** Provide document output, application configuration, maintenance, and advanced tooling without redefining the active reading or operation workflow.

**Controls:** More Menu, export actions, Language Settings, Manage OCR Languages, Settings, Clear Cache, region execution mode, Region Comparison, Cancel Region Comparison, Export Region Comparison Artifact.

These controls belong together because they are follow-up, configuration, maintenance, or specialist actions. More is the stable access surface for this group; it does not become a separate business workflow.

### Secondary Actions Cohesion

Secondary actions is intentionally cohesive by product hierarchy and presentation role, not shared business logic. Its controls are all stable follow-up, configuration, maintenance, or specialist access outside the active primary workflow. This does not make it an arbitrary destination for unrelated controls: every member must still satisfy the workflow and group classification defined in the Inventory.

## 5. Cohesion Audit

| Logical group | Cohesion | Assessment |
|---|---|---|
| Identity and context | High | All controls establish, change, or inspect document/application context. |
| Navigation | High | Outline and page controls have one common purpose: document position. |
| View | High | View selection, comparison, scale, and fit all change reading presentation. |
| Primary operation | High | Translation and OCR are distinct feature capabilities, but both transform or recognize document content in the active operation workflow. Provider choice is correctly retained with translation because it immediately configures that operation. |
| Secondary actions | Intentionally broad but coherent | This is a stable destination for output, configuration, maintenance, and advanced actions. Its shared purpose is secondary access, not a shared domain behavior. |

No current control obviously requires reassignment to a new logical group.

Two classification boundaries require continued discipline:

- **Manage OCR Languages** is configuration and therefore belongs to Secondary actions, even though it is currently exposed through the OCR menu for contextual convenience.
- **Region Comparison** is an advanced tool and therefore belongs to Secondary actions, even though its execution resembles an operation.

## 6. Coupling Audit

### Intentional Coupling

- Navigation controls share document position and structure context. This is workflow cohesion, not cross-group coupling.
- View Mode and Side-by-side share document-presentation meaning.
- Provider selection, Translate, Cancel, and OCR choices share the active content-operation context.
- More provides access to actions from several workflows while preserving each child's workflow and group classification.

### Architectural Tensions

- **OCR menu and Manage OCR Languages:** a Secondary actions control is rendered inside a Primary operation access surface. This is a contextual-access exception, not a workflow reclassification. Future changes must preserve its configuration meaning.
- **PDF Information duplication:** one Identity and context action is available both directly and through More. This is duplicate access, not duplicate classification. Both paths must retain the same document-context semantics.
- **Developer controls beside primary operations:** advanced execution choices may be visually near operational controls, but their architectural classification remains Secondary actions. They must not be interpreted as part of the normal translation workflow.

No workflow transfers ownership to another group. The identified tensions are presentation-location concerns, not business-logic coupling.

## 7. Growth Audit

| Future capability | Workflow | Logical group | Group fit |
|---|---|---|---|
| Search | Navigate and read | Navigation | Natural extension: it finds and moves to document content. |
| Rotate | Choose document presentation | View | Natural extension: it changes reading orientation. |
| Print | Output and manage | Secondary actions | Natural extension: it produces document output. |
| Compare | Choose document presentation | View | Natural extension of comparative presentation and Side-by-side. |
| Additional OCR actions | Translate and recognize | Primary operation | Natural extension of OCR operation configuration and execution. |
| Additional export actions | Output and manage | Secondary actions | Natural extension of document output. |

The current five groups can absorb the named future capabilities without structural change. A new logical group is not justified by any listed capability.

## 8. Validation

| Validation question | Result |
|---|---|
| Is every current conceptual toolbar control classified? | Yes. The inventory includes direct controls, menu controls, conditional developer controls, duplicate access surfaces, and state variants. |
| Does every control belong to exactly one workflow? | Yes. Ambiguous controls are resolved in the classification notes and cohesion audit. |
| Does every control belong to exactly one logical group? | Yes. All controls map to one of the five ADR-013 groups. |
| Are group responsibilities clear? | Yes. Each group has a distinct user goal: context, movement, presentation, primary content operation, or secondary action. |
| Can named future features be added without restructuring the toolbar architecture? | Yes. Search, Rotate, Print, Compare, OCR growth, and export growth extend existing workflows and groups. |

This Information Architecture is the authoritative input to later Priority Model, Presentation Ladder, and Responsive Contract phases.

## 9. Classification Rules

The following rules preserve this document as the long-term classification reference:

1. Classification is based on the user's intended goal, not implementation detail.
2. Visual placement does not determine workflow or logical-group membership.
3. Multiple access surfaces for one conceptual control do not create multiple classifications.
4. State changes do not create new conceptual controls when the user's goal remains the same.
5. Presentation changes do not alter workflow or logical-group classification.
6. A conceptual control retains one classification regardless of how many user-interface representations expose it.
