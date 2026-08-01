# PDF Viewer Toolbar Technical Reference

> **Scope:** PDF Viewer toolbar controls, responsive behavior, component integration, accessibility, and toolbar event flow.
> **Canonical responsibility:** Define current toolbar behavior and implementation ownership without owning translation pipeline, Viewer State Restoration, or table metadata contracts.
> **Intended audience:** PDF Viewer maintainers, UI contributors, and reviewers.
> **Related ADRs:** [ADR-013: Viewer Toolbar Architecture](../../adr/pdf-translator/ADR-013-viewer-toolbar-architecture.md)
> **Related technical references:** [PDF Translation Architecture](./pdf-translation-architecture.md)

**Status:** Current implementation reference  
**Architecture rationale:** [ADR-013: Viewer Toolbar Architecture](../../adr/pdf-translator/ADR-013-viewer-toolbar-architecture.md)

## 1. Purpose

This document describes how the PDF Viewer toolbar currently works: its controls, implementation ownership, state flow, priority model, presentation behavior, responsive stages, accessibility contract, and extension points. ADR-013 defines the architectural rationale, principles, trade-offs, and governance.

## 2. Information Architecture

The toolbar has five logical groups. Each conceptual control belongs to one workflow and one group.

| Logical group | Workflow | Current controls |
|---|---|---|
| Identity and context | Document entry and context | Brand / Title, Open PDF, PDF Information |
| Navigation | Navigate and read | Outline, Previous Page, Page Number / Total Pages, Next Page |
| View | Choose document presentation | View Mode, Side-by-Side, Zoom Out, Zoom Level, Zoom In, Fit |
| Primary operation | Translate and recognize | Provider Selector, Translate / Stop, OCR primary action, OCR action choice, OCR language choice |
| Secondary actions | Output and manage; Configure and develop | More Menu, export actions, Language Settings, Manage OCR Languages, Settings, Clear Cache, region execution mode, Region Comparison actions |

### Control Inventory

| Conceptual control | Current access surface | Notes |
|---|---|---|
| Brand / Title | Leading toolbar content before document load | Establishes application entry context. |
| Open PDF | More menu | Opens or replaces document context. |
| Outline | Leading control when outline exists | Structural navigation. |
| PDF Information | Leading icon and More item | Two access surfaces for one document metadata action. |
| View Mode | Desktop segmented control or compact select | One representation-selection control. |
| Side-by-Side | View control | Comparative presentation; visible at every responsive stage when translation content is available. |
| Previous / Next Page and Page Number / Total | Navigation cluster | Sequential and direct document position control. |
| Zoom Out / Level / In and Fit | View controls | Reading scale and fit behavior. |
| Provider Selector and Translate / Stop | Primary action split control | Provider selection and translation initiation/cancellation. |
| OCR controls | OCR split control and menu | Contextual page/region recognition and language choice. |
| More Menu | Secondary action trigger | Stable access surface for output, configuration, maintenance, and advanced actions. |
| Export actions | More export submenu | TXT, Markdown, and HTML output. |
| Language Settings, Settings, Clear Cache | More menu | Configuration and maintenance. |
| Region execution and comparison controls | Conditional developer controls | Advanced execution and diagnostics. |

### Group Responsibilities

- **Identity and context:** Establish, change, or inspect document and application identity.
- **Navigation:** Move through document structure and reading position.
- **View:** Change representation, comparison, scale, or fitting without changing document content.
- **Primary operation:** Configure, start, or stop current translation and OCR work.
- **Secondary actions:** Provide output, configuration, maintenance, and advanced access without redefining active document work.

Manage OCR Languages is a Secondary action even though it is exposed through the OCR menu. PDF Information remains one Identity and context action even though it has two access surfaces.

Secondary actions are cohesive by product hierarchy and follow-up role rather than shared business logic. They are not a destination for unclassified controls. Developer controls remain Secondary actions even when they are rendered near Primary operation controls.

## 3. Ownership Mapping

ADR-013 defines ownership boundaries. This section maps them to current components.

| Owner | Current implementation responsibility | Does not own |
|---|---|---|
| `PdfApp` | Composes toolbar props, receives emitted intent, and delegates to viewer, translation, OCR, export, and presentation APIs. | Toolbar layout, ProviderSelector labels, or business implementation. |
| `PdfToolbar` | Places logical groups, owns toolbar Grid and CSS responsive stages, passes loading/disabled/presentation inputs, and forwards user intent. | Translation lifecycle, provider persistence, ProviderSelector internal labels or width reservation. |
| `ProviderSelector` | Renders localized Translate / Stop state, exposes active accessible name, emits translate/cancel intent, and reserves localized action width with internal Grid overlay labels. | PDF placement, PDF translation lifecycle, or responsive stage selection. |
| PDF feature modules and composables | Viewer navigation, translation, OCR, export, document state, persistence, cancellation, and validation. | Toolbar hierarchy and placement. |

### Intent Flow

```text
PdfToolbar user intent
        ↓
PdfApp handler delegation
        ↓
PDF feature composable or module behavior
```

ProviderSelector is embedded by PdfToolbar but retains ownership of its split-button presentation. PdfToolbar supplies `loading`, disabled state, provider configuration, and event handlers; it does not calculate label width.

## 4. State Model

### Translation Lifecycle

```text
usePdfViewerController.isTranslating
        ↓
PdfApp :is-translating
        ↓
PdfToolbar :is-translating
        ↓
ProviderSelector :loading
        ↓
Translate or Stop label and click behavior
```

`usePdfViewerController.translateVisiblePages()` sets `isTranslating` before the translation coordinator runs and clears it in `finally`. `cancelTranslation()` cancels the active coordinator operation and clears the state. PdfApp maps toolbar `translate-visible` and `cancel-translation` events into those operations.

ProviderSelector reuses one primary interactive button. When `loading` is false it emits `translate`; when true it emits `cancel`. Its visible label, `title`, and `aria-label` change between localized `Translate` and `Stop` values.

### Translation Content Availability

```text
pdfDocumentSession.translationStates / page data
        ↓
usePdfViewerController.hasTranslationContent
        ↓
PdfApp :show-translation-option
        ↓
PdfToolbar presentation control bindings
```

`hasTranslationContent` is true when a translation state is translated or page data contains blocks. PdfToolbar uses it only for translation-presentation control availability: desktop/compact View Mode, Side-by-Side, and the related separator. When unavailable, these controls retain their current visibility-hidden presentation and accessibility state defined by PdfToolbar.

### Conditional Controls

- Outline renders only when `hasOutline` is true.
- PDF Information renders for loaded documents and is hidden by Stage 4 and Layout C.
- OCR renders when `ocrViewModel` is present.
- Region execution mode renders when more than one execution mode is available.
- Export and developer actions render only when their capability and debug conditions apply.

## 5. Priority Model

Priority applies to logical groups, not individual controls.

| Priority tier | Logical groups | Protected intent |
|---|---|---|
| Tier 1: Core workflow continuity | Primary operation, Navigation | Execute or stop document work while retaining document position. |
| Tier 2: Reading comprehension | View | Read, inspect, compare, scale, and fit document content. |
| Tier 3: Context and orientation | Identity and context | Establish, change, and inspect document context. |
| Tier 4: Follow-up and specialist work | Secondary actions | Output, configure, maintain, and access advanced tooling. |

Priority determines what presentation must protect as space narrows. It does not determine visual order or grant a control independent layout negotiation.

## 6. Presentation Contract

Presentation changes representation while preserving workflow meaning, logical-group membership, priority, ownership, action availability in relevant context, and accessibility.

| State | Current meaning |
|---|---|
| Expanded | Complete relevant group capability with full contextual clarity. |
| Compact | Reduced visual complexity while retaining complete capability and semantic clarity. |
| Essential | Emphasizes protected user intent while retaining remaining capability through defined reduced representation. |

Current implementation uses CSS media queries for intentional toolbar presentation. It does not use JavaScript responsive state, ResizeObserver-driven relocation, runtime measurement, or dynamic overflow placement.

Presentation progresses from Expanded through Compact to Essential without changing domain state, action availability, or group membership. A group does not bypass an intermediate presentation guarantee, and a presentation change must not introduce an unrelated interaction concept.

### Delegated Presentation

ProviderSelector owns its state-dependent label presentation. It renders localized Translate and Stop labels in a shared Grid cell; invisible `aria-hidden` reserve labels size that cell to the widest localized state label. The visible label remains the button's accessible name. This prevents translation state changes from changing the primary split-button inline width.

PdfToolbar owns placement of that control within Primary operation and hides the complete label-reservation wrapper in compact-label presentation. The provider icon and dropdown remain available in that representation.

## 7. Responsive Architecture

PdfToolbar CSS owns responsive presentation. Current flow:

```text
Desktop
  ↓
Stage 1: Compact View
  ↓
Stage 2: Compact OCR Labels
  ↓
Stage 3: Compact OCR Chrome
  ↓
Stage 4: Hide PDF Info
  ↓
Layout C
```

| Range | Stage | Current behavior |
|---|---|---|
| `>= 1100px` | Desktop | Desktop View Mode, full OCR labels/chrome, PDF Information, and provider action label are available. |
| `<= 1099px` | Stage 1 | Replaces desktop View Mode buttons with compact select; hides toolbar separators; applies compact toolbar chrome. |
| `<= 885px` | Stage 2 | Uses compact OCR labels. From `750px` through `885px`, hides ProviderSelector text label and removes its icon-label gap. |
| `<= 858px` | Stage 3 | Reduces OCR primary and arrow horizontal padding. |
| `<= 842px` | Stage 4 | Hides PDF Information. |
| `<= 749px` | Layout C | Uses two-row Grid, keeps Side-by-Side visible, restores OCR chrome padding, keeps ProviderSelector text hidden, and places primary/secondary actions in Layout C areas. |

Side-by-Side has no hide stage. It remains available across Desktop, Stages 1-4, and Layout C when translation content is available.

## 8. Accessibility Contract

- Toolbar controls expose semantic labels and visible focus behavior.
- Compact View Mode select keeps `aria-label="View mode"`; unavailable translation presentation uses `aria-hidden` and removes it from sequential tab focus.
- ProviderSelector has one primary interactive button. Its `title` and `aria-label` track the visible localized Translate or Stop label.
- ProviderSelector width-reservation labels are `aria-hidden="true"`; they do not duplicate the accessible name.
- Provider dropdown remains a separate button and is disabled while translation is active.
- Side-by-Side exposes pressed state with `aria-pressed` and a stable label.
- More Menu and OCR menus preserve keyboard interaction and discoverable item names.

## 9. Extension Points

Before adding or promoting a toolbar capability:

1. Classify its user workflow and logical group.
2. Inherit that group's priority tier and presentation contract.
3. Identify whether it is persistent, contextual, or secondary presentation.
4. Keep business behavior in its owning feature module.
5. Define PdfToolbar placement and emitted intent only after ownership is clear.
6. Preserve keyboard access, focus visibility, accessible naming, and state-stable sizing.
7. Extend existing groups before proposing a new group.

Current extension mapping:

| Capability | Logical group |
|---|---|
| Search, Bookmark | Navigation |
| Rotate, Compare | View |
| Print, additional exports | Secondary actions |
| Additional OCR actions | Primary operation |

## 10. References

- [ADR-013: Viewer Toolbar Architecture](../../adr/pdf-translator/ADR-013-viewer-toolbar-architecture.md)
- `src/apps/pdf/PdfApp.vue`
- `src/apps/pdf/components/PdfToolbar.vue`
- `src/apps/pdf/components/PdfToolbar.scss`
- `src/apps/pdf/components/_toolbar-variables.scss`
- `src/apps/pdf/composables/usePdfViewerController.js`
- `src/components/shared/ProviderSelector.vue`
- `src/components/shared/ProviderSelector.scss`
- `src/apps/pdf/components/PdfToolbar.test.js`
- `src/components/shared/ProviderSelector.test.js`
