# ADR-013: PDF Viewer Toolbar Architecture

- **Status:** Accepted
- **Date:** 2026-07-26
- **Scope:** PDF Viewer toolbar product architecture
- **Decision Type:** Architectural
- **Implementation reference:** [PDF Viewer Toolbar Technical Reference](../technical/PDF_VIEWER_TOOLBAR_TECHNICAL.md)

## 1. Status and Problem

The PDF Viewer toolbar is a workflow surface, not a catalogue of commands. It must keep document work understandable and available while responsive presentation becomes constrained, without allowing incidental layout pressure to redefine product hierarchy, feature ownership, or accessibility.

The toolbar must provide stable paths to document context, navigation, document presentation, translation and OCR work, and secondary actions. It must not become a domain controller or a runtime overflow mechanism.

## 2. Decision

Adopt a workflow-first, logical-group architecture for the PDF Viewer toolbar.

1. Each toolbar control is classified by user workflow before implementation.
2. Each workflow maps to one logical group; each group owns presentation as a unit.
3. Priority protects workflows, not individual controls or incidental visual placement.
4. Presentation changes representation before capability, intent, ownership, or accessibility.
5. More is deliberate secondary hierarchy, not a width-driven overflow bucket.
6. Responsive transitions are intentional presentation states, never accidental wrapping or runtime command relocation.

Priority follows workflow continuity: primary operation and navigation protect task completion, view protects reading comprehension, identity protects orientation, and secondary actions protect follow-up and specialist access. Groups progress through expanded, compact, and essential presentation without bypassing preserved capability.

The current inventory, group mapping, priority mapping, presentation states, and responsive implementation are maintained in the Technical Reference.

## 3. Ownership Boundaries

| Owner | Responsibility | Does not own |
|---|---|---|
| `PdfApp` | Compose toolbar inputs and delegate user intent to application and feature APIs. | Toolbar hierarchy, child-control presentation, or domain behavior. |
| `PdfToolbar` | Render logical groups, own toolbar-level placement and responsive presentation, and emit user intent. | Navigation, translation, OCR, export, persistence, feature lifecycle, or provider state. |
| `ProviderSelector` | Own its localized primary-action presentation, accessible naming, and state-stable action sizing. | PDF placement, translation lifecycle, or toolbar-level responsive policy. |
| Feature modules | Own navigation, translation, OCR, export, provider, and document business behavior. | Toolbar hierarchy and placement. |

The toolbar renders presentation and emits intent. Application orchestration delegates that intent. Feature modules execute business behavior.

## 4. Architectural Principles

1. Workflow determines logical group; logical group determines presentation protection.
2. A control has one primary workflow, one logical group, and one priority tier.
3. Responsive presentation preserves capability, semantic meaning, ownership, keyboard access, focus visibility, and accessible naming.
4. Primary workflow access must not become secondary merely to fit unrelated lower-priority controls.
5. CSS media queries express responsive presentation. Runtime layout measurement, JavaScript responsive state, and dynamic DOM relocation do not own toolbar responsiveness.
6. State-dependent delegated control presentation must preserve stable localized sizing without duplicating interactive controls or accessible names.
7. Context may control whether a capability is relevant, but may not reclassify it.
8. New toolbar capacity is created through hierarchy and group presentation, not by reducing primary-control usability.
9. Presentation transitions are reversible without domain-state or action-availability loss.

## 5. Trade-offs

- Group-level presentation gives consistent workflow protection but limits per-control optimization.
- A stable More menu improves product hierarchy but keeps secondary actions out of direct toolbar space.
- CSS-first responsiveness avoids runtime coordination complexity but requires deliberate breakpoint and layout design.
- Delegated controls retain internal presentation ownership, which requires clear boundaries between toolbar placement and component internals.

## 6. Rejected Alternatives

- Treating the toolbar as a flat command inventory.
- Using More as a runtime overflow bucket.
- Letting individual controls independently negotiate layout or priority.
- Moving controls through JavaScript, ResizeObserver, or runtime measurement to respond to width.
- Allowing responsive presentation to change business ownership, event contracts, or action availability.
- Adding duplicate interactive controls solely to reserve state-dependent label width.

## 7. Consequences

Future toolbar changes must document workflow, logical group, priority, contextuality, ownership, emitted intent, accessibility contract, and presentation effect before implementation.

Related controls extend an existing group before a new group is proposed. A new workflow, group, priority tier, or departure from these principles requires product evidence and an ADR update.

New controls enter secondary presentation unless workflow evidence requires protected direct access. Feature growth does not justify runtime overflow behavior, incidental wrapping, or an independent layout policy.

Implementation details, current state flows, concrete responsive stages, control inventory, tests, and extension mappings belong in the [PDF Viewer Toolbar Technical Reference](../technical/PDF_VIEWER_TOOLBAR_TECHNICAL.md).
