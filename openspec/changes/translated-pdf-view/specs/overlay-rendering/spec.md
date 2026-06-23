## ADDED Requirements

### Requirement: Overlay layer renders translated blocks at original page coordinates

The system SHALL render a positioned overlay layer over the PDF canvas for each visible page when the "Translated PDF View" mode is active. Each translated `LogicalBlock` SHALL be rendered as a DOM element positioned at the block's `boundingBox` coordinates, scaled by the page's display scale.

#### Scenario: Translated paragraph overlay positioning

- **WHEN** a page has a translated paragraph block with `boundingBox: { x: 40, y: 100, width: 200, height: 30 }` and the page scale is 1.5
- **THEN** the overlay element SHALL be positioned at `left: 60px, top: 150px` with `width: 300px, height: 45px` relative to the page stage

#### Scenario: Untranslated blocks are not overlaid

- **WHEN** a block has `translationState.status !== 'translated'`
- **THEN** no overlay element SHALL be rendered for that block

#### Scenario: Overlay layer is inactive in non-overlay modes

- **WHEN** the viewer mode is `original`, `bilingual`, or `translated`
- **THEN** no overlay layer SHALL be rendered on any page

### Requirement: Overlay blocks render with solid background for readability

Each overlay block SHALL render with a solid background color (matching the page background, typically `#ffffff`) behind the translated text. This improves readability against the canvas without occluding non-text content outside the block bounds.

#### Scenario: Standard white-background PDF

- **WHEN** a translated block overlay is rendered on a page with white background
- **THEN** the overlay background SHALL be `#ffffff` (or the page's background color) and SHALL cover the block's bounding box area

#### Scenario: Overlay does not modify canvas

- **WHEN** overlay rendering is active
- **THEN** the canvas element SHALL remain unchanged and continue displaying the original PDF rendering

#### Scenario: Original text partially visible between blocks

- **WHEN** overlay blocks have gaps between them
- **THEN** original canvas text MAY be visible in the gaps (documented as expected Phase 1 behavior)

### Requirement: Adaptive font fitting for overflow

The system SHALL apply an adaptive fitting strategy to reduce overflow while maintaining readability when translated text exceeds the block's bounding box dimensions. The initial font-size SHALL be derived from `roleMetadata.fontSize` (already available in `PdfLogicalBlock`) scaled by the page display scale.

#### Scenario: Short translation fits without adjustment

- **WHEN** translated text renders within the block's width and height at the initial font-size
- **THEN** the font-size SHALL remain unchanged

#### Scenario: Long translation triggers fitting

- **WHEN** translated text overflows the block's width at the initial font-size
- **THEN** the system SHALL apply an adaptive strategy to reduce the font-size until the text fits or a readable minimum is reached

#### Scenario: Extreme overflow

- **WHEN** translated text cannot fit within the block bounds at any readable font-size
- **THEN** the text SHALL render at the minimum readable font-size and MAY overflow (documented as expected behavior)

#### Scenario: Vertical positioning uses fallback ascent ratio

- **WHEN** the overlay renders in Phase 1 (before font metadata propagation)
- **THEN** vertical positioning SHALL use a hardcoded 0.8 ascent ratio (matching existing text layer behavior)

#### Scenario: Precise font metrics (future enhancement)

- **WHEN** font metadata propagation has shipped (Phase 1.5)
- **THEN** the overlay SHALL use `style.ascent` and `style.descent` from `textContent.styles` for precise vertical positioning, falling back to 0.8 when unavailable

### Requirement: RTL text direction support

The system SHALL detect RTL text direction for overlay blocks and apply appropriate `dir` attributes and text alignment.

#### Scenario: RTL translated text

- **WHEN** a translated block contains predominantly RTL characters (Arabic, Hebrew, etc.)
- **THEN** the overlay element SHALL have `dir="rtl"` and text SHALL be right-aligned within the block bounds

#### Scenario: LTR translated text

- **WHEN** a translated block contains predominantly LTR characters
- **THEN** the overlay element SHALL have `dir="ltr"` (default) and text SHALL be left-aligned

### Requirement: OCR block overlay support

The system SHALL render OCR-sourced blocks using the same overlay mechanism as text-content blocks. OCR blocks with `boundingBox` in page coordinates SHALL be positioned identically to text-content blocks.

#### Scenario: OCR page overlay

- **WHEN** a page has been processed via OCR and the user triggers translation in "Translated PDF View" mode
- **THEN** OCR blocks SHALL be rendered as overlays at their `boundingBox` coordinates

### Requirement: Translated overlay text is selectable

The system SHALL render overlay text as selectable DOM elements. Users SHALL be able to select translated text in the overlay layer using native browser text selection.

#### Scenario: Text selection in overlay

- **WHEN** the user clicks and drags over translated overlay text
- **THEN** the browser SHALL select the overlay text (not the underlying canvas text)

### Requirement: Overlay re-renders on translation state changes

The system SHALL re-render the overlay layer when translation state changes (new translations arrive, errors occur, or translation is cancelled). The overlay SHALL reflect the current translation state at all times.

#### Scenario: Translation completes while viewing

- **WHEN** a block transitions from `loading` to `translated` while the page is visible
- **THEN** the overlay SHALL update to show the translated text

#### Scenario: Translation fails

- **WHEN** a block transitions from `loading` to `error`
- **THEN** no overlay SHALL be rendered for that block (falling back to original canvas text)

### Requirement: Overlay scales with page resize

The system SHALL re-render overlay positions and sizes when the page scale changes (e.g., window resize). Overlay coordinates SHALL be recalculated using the updated `pageMetric.scale`.

#### Scenario: Window resize triggers overlay update

- **WHEN** the viewer width changes and page metrics are rebuilt
- **THEN** all overlay elements SHALL be repositioned and resized to match the new scale
