# PDF Viewer Toolbar Priority Model

**Status:** Phase 3 priority model

**Authority:** [ADR-013: PDF Viewer Toolbar Architecture](../adr/ADR-013-pdf-viewer-toolbar-architecture.md) and [PDF Viewer Toolbar Information Architecture](PDF_VIEWER_TOOLBAR_INFORMATION_ARCHITECTURE.md)

## Purpose

This document assigns architectural priority to each PDF Viewer toolbar Logical Group. Priority records product importance: which user workflows must be protected as available presentation space becomes more constrained.

Priority is not visual order, implementation order, or a description of any specific presentation. It is a stable product classification derived from user intent and workflow importance.

## 1. Priority Principles

Priority is assigned only from product concerns:

1. **Primary product purpose:** Translation and recognition are central product outcomes.
2. **Task completion:** A user must be able to move through and act on the document to complete the active task.
3. **Document reading:** Reading position and comprehension are protected ahead of follow-up actions.
4. **Workflow continuity:** Operations that would block, misdirect, or prevent the current task receive higher priority than optional follow-up work.
5. **User intent:** Classification follows the user's goal, never current code placement, implementation cost, or feature history.
6. **Group integrity:** Priority applies to Logical Groups because groups represent workflows. Individual controls do not receive independent priority assignments.

## 2. Priority Tiers

| Priority Tier | Architectural description | Protected user intent | Group characteristics |
|---|---|---|---|
| Tier 1 | Core workflow continuity | Complete the primary document task and maintain position in the document | Workflows essential to translating, recognizing, navigating, and acting on the current document |
| Tier 2 | Reading comprehension | Understand, inspect, and compare document content effectively | Workflows that materially improve how content is read without changing the primary task itself |
| Tier 3 | Context and orientation | Establish what document and application context the user is operating in | Workflows that establish or inspect context but do not themselves advance the active document task |
| Tier 4 | Follow-up and specialist work | Complete optional output, configuration, maintenance, and advanced work | Workflows valuable after, around, or outside the primary document task |

## 3. Group Priority

| Logical Group | Priority Tier | Justification |
|---|---|---|
| Primary operation | Tier 1 | Translation and recognition are the primary product outcomes. Without this group, the user cannot execute or control the active content operation. |
| Navigation | Tier 1 | Users must retain document position and move through relevant content to read, translate, recognize, and verify work. |
| View | Tier 2 | View selection, comparison, and reading scale determine how effectively the user understands content. They support the core task without constituting the task outcome. |
| Identity and context | Tier 3 | Document identity, entry, and metadata establish orientation. They are important but do not directly advance active reading or translation work. |
| Secondary actions | Tier 4 | Output, configuration, maintenance, and advanced actions are useful but do not define the immediate primary document task. |

## 4. Tier Responsibilities

Priority tiers define architectural protection, not presentation behavior.

### Tier 1

**Architectural description:** Core workflow continuity.

Tier 1 protects the ability to complete the active document task. It contains workflows that execute the product's primary purpose or preserve the user's position while performing that work.

Tier 1 is reserved for Primary operation and Navigation. It must not expand merely because an action is useful or frequently requested.

### Tier 2

**Architectural description:** Reading comprehension.

Tier 2 protects effective reading, inspection, and comparison. It contains workflows that make document content understandable and usable while remaining distinct from task execution and document movement.

Tier 2 is reserved for View. It supports, but does not replace, Core workflow continuity.

### Tier 3

**Architectural description:** Context and orientation.

Tier 3 protects clear document and application orientation. It contains workflows that establish, change, or inspect the user's context.

Tier 3 is reserved for Identity and context. It matters before and around active work, but does not supersede the user's ability to complete that work.

### Tier 4

**Architectural description:** Follow-up and specialist work.

Tier 4 protects access to valuable but non-primary follow-up activity. It contains output, configuration, maintenance, and advanced workflows.

Tier 4 is reserved for Secondary actions. Its breadth is intentional because its shared product role is work outside the immediate primary document task.

## 5. Priority Validation

| Validation question | Result |
|---|---|
| Does every Logical Group belong to exactly one Priority Tier? | Yes. All five Logical Groups appear once in Group Priority. |
| Are Priority Tiers mutually exclusive? | Yes. A Logical Group has one tier only. |
| Does every workflow belong to one tier? | Yes. A workflow inherits the tier of its one Logical Group. |
| Do priorities follow the product purpose? | Yes. Translation/recognition and document navigation protect core task completion; reading presentation supports comprehension; context supports orientation; follow-up and advanced work remains secondary. |
| Does any control receive an independent priority? | No. Controls inherit group priority and are not separately tiered. |

## 6. Growth Audit

| Future capability | Logical Group | Inherited Priority Tier | Rationale |
|---|---|---|---|
| Search | Navigation | Tier 1 | Finding and moving to document content extends reading and document-position workflow. |
| Rotate | View | Tier 2 | Orientation changes how the document is read. |
| Print | Secondary actions | Tier 4 | Printing is document output outside the active task. |
| Compare | View | Tier 2 | Comparison extends document presentation and inspection. |
| Bookmark | Navigation | Tier 1 | Saving or returning to reading position extends document navigation. |
| Additional OCR actions | Primary operation | Tier 1 | OCR remains part of the primary recognition workflow. |
| Additional export actions | Secondary actions | Tier 4 | Export remains document output. |

No listed capability requires a new Priority Tier. Each inherits priority from its Phase 2 Logical Group.

## 7. Future Rules

1. Priority belongs to Logical Groups, never individual controls.
2. A conceptual control inherits the priority of its one Logical Group.
3. Visual location, implementation location, and access surface do not change priority.
4. Priority is derived from workflow, never from presentation.
5. Presentation changes do not change priority.
6. Future capabilities inherit the priority of their Logical Group; they do not negotiate priority through feature growth or implementation need.
7. New features inherit their Logical Group's priority unless a new group is explicitly justified under ADR-013.
8. A new Priority Tier requires architectural justification that existing tiers cannot express a distinct product importance.
9. Priority changes require evidence that the user workflow or primary product purpose has changed; feature growth alone is insufficient.
10. Tier 1 must remain narrow. Convenience, novelty, and implementation proximity are not reasons for promotion.

This Priority Model is the authoritative input to later presentation phases.
