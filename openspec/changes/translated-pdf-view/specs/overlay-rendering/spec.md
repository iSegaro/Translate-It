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

### Requirement: Overlay blocks render with sampled background for readability

Each overlay block SHALL render with a background color determined by canvas pixel sampling at the block's bounding-box position. The system samples 7 points (center, 4 corners at 30% inset, mid-left, mid-right), filters text-pixel outliers, and averages remaining light samples. Falls back to white when sampling fails.

#### Scenario: Standard white-background PDF

- **WHEN** a translated block overlay is rendered on a page with white background
- **THEN** the overlay background SHALL be `#ffffff` (or the sampled page background color) and SHALL cover the block's bounding box area

#### Scenario: Colored background region

- **WHEN** a translated block overlays a region with a non-white background (e.g., gray header, colored band)
- **THEN** the overlay background SHALL match the sampled background color, not hardcoded white

#### Scenario: Near-white background bias correction

- **WHEN** the lightSamples contain at least 2 near-white pixels (luminance ≥ 245)
- **THEN** the overlay background SHALL be `rgb(255, 255, 255)` regardless of gray anti-aliased edge pixels in the remaining samples

#### Scenario: Uniform off-white background preserved

- **WHEN** all sampled pixels are uniformly off-white (e.g., rgb(230, 230, 230)) with no near-white samples
- **THEN** the overlay background SHALL be the averaged sampled color, not forced to white

#### Scenario: Tainted canvas fallback

- **WHEN** `canvas.getContext('2d')` throws a SecurityError (tainted canvas)
- **THEN** the overlay background SHALL fall back to `rgb(255, 255, 255)`

#### Scenario: Overlay does not modify canvas

- **WHEN** overlay rendering is active
- **THEN** the canvas element SHALL remain unchanged and continue displaying the original PDF rendering

#### Scenario: Original text partially visible between blocks

- **WHEN** overlay blocks have gaps between them
- **THEN** original canvas text MAY be visible in the gaps (documented as expected behavior)

### Requirement: Three rendering modes — block, line, and cell

The system SHALL select between block-level, line-level, and cell-level overlay rendering based on block structure and translation data.

#### Scenario: Non-structured block renders as block overlay

- **WHEN** a block has `roleMetadata.isStructured !== true` or has only one source line
- **THEN** the block SHALL render as a single overlay element containing the full translated text

#### Scenario: Structured block with line-matched translation renders as line overlay

- **WHEN** a block has `roleMetadata.isStructured === true`, `sourceLineCount > 1`, and `translatedText.split('\n').length === sourceLineCount`
- **THEN** the block SHALL render as separate line overlays, one per source line, each positioned at the line's bounding box relative to the block origin

#### Scenario: Structured block with multi-cell translatedCells renders as cell overlay

- **WHEN** a block has `translatedCells` with at least one line having multiple cells
- **THEN** the block SHALL render as per-cell overlays positioned at original item coordinates with `CELL_GAP_EXPANSION_RATIO = 0.4` for inter-cell gap expansion

#### Scenario: Partial translatedCells renders cell mode with source fallback

- **WHEN** a structured block has `translatedCells` for only some source lines
- **THEN** translated lines SHALL use cell overlay with translated text, and untranslated lines SHALL use source `item.text` as fallback — the block SHALL NOT fall back to block mode

#### Scenario: Cell height floor for zero-height items

- **WHEN** a source item has `height: 0` (pdf.js extraction artifact)
- **THEN** the cell overlay SHALL use a minimum height of `fontSize * 0.8`

### Requirement: Adaptive font fitting for overflow

The system SHALL apply an adaptive fitting strategy to reduce overflow while maintaining readability when translated text exceeds the block's bounding box dimensions. The initial font-size SHALL be derived from `roleMetadata.fontSize` scaled by the page display scale.

#### Scenario: Short translation fits without adjustment

- **WHEN** translated text renders within the block's width and height at the initial font-size
- **THEN** the font-size SHALL remain unchanged

#### Scenario: Long translation triggers fitting

- **WHEN** translated text overflows the block's width at the initial font-size
- **THEN** the system SHALL reduce font-size in 5% decrements until the text fits or 60% minimum is reached

#### Scenario: Extreme overflow

- **WHEN** translated text cannot fit within the block bounds at any readable font-size
- **THEN** the text SHALL render at the minimum readable font-size and MAY overflow (documented as expected behavior)

### Requirement: Font metadata from PDF styles

The system SHALL propagate `fontFamily`, `ascent`, and `descent` from `textContent.styles` through the layout analyzer into block `roleMetadata`. When available, these metrics SHALL be used for precise vertical positioning and font family selection.

#### Scenario: Font metrics available

- **WHEN** `textContent.styles` provides ascent/descent/fontFamily for the block's dominant font
- **THEN** the overlay SHALL use the propagated `ascent`/`descent` for line-height and `fontFamily` for font selection

#### Scenario: Font metrics unavailable

- **WHEN** font metadata is not available (fallback scenario)
- **THEN** the overlay SHALL use 0.8 ascent ratio and static font-family mapping as fallback

### Requirement: RTL text direction support

The system SHALL detect RTL text direction for overlay blocks and apply appropriate `dir` attributes and text alignment.

#### Scenario: RTL translated text

- **WHEN** a translated block contains predominantly RTL characters (Arabic, Hebrew, etc.)
- **THEN** the overlay element SHALL have `dir="rtl"` and text SHALL be right-aligned within the block bounds

#### Scenario: LTR translated text

- **WHEN** a translated block contains predominantly LTR characters
- **THEN** the overlay element SHALL have `dir="ltr"` (default) and text SHALL be left-aligned

### Requirement: OCR block overlay support

The system SHALL render OCR-sourced blocks using the same overlay mechanism as text-content blocks.

#### Scenario: OCR page overlay

- **WHEN** a page has been processed via OCR and the user triggers translation in "Translated PDF View" mode
- **THEN** OCR blocks SHALL be rendered as overlays at their `boundingBox` coordinates

### Requirement: Translated overlay text is selectable

The system SHALL render overlay text as selectable DOM elements via native browser text selection (`user-select: text`).

#### Scenario: Text selection in overlay

- **WHEN** the user clicks and drags over translated overlay text
- **THEN** the browser SHALL select the overlay text (not the underlying canvas text)

### Requirement: Overlay re-renders on translation state changes

The system SHALL re-render the overlay layer when translation state changes.

#### Scenario: Translation completes while viewing

- **WHEN** a block transitions from `loading` to `translated` while the page is visible
- **THEN** the overlay SHALL update to show the translated text

#### Scenario: Translation fails

- **WHEN** a block transitions from `loading` to `error`
- **THEN** no overlay SHALL be rendered for that block

### Requirement: Overlay scales with page resize

The system SHALL re-render overlay positions and sizes when the page scale changes.

#### Scenario: Window resize triggers overlay update

- **WHEN** the viewer width changes and page metrics are rebuilt
- **THEN** all overlay elements SHALL be repositioned and resized to match the new scale

### Known Limitations

- **Complex table alignment**: KPI/table PDFs with irregular column layouts, spanning cells, or mixed role lines within a table-region block may have imperfect column reconstruction. This is deferred to Phase 2d.
- **Original text visibility**: Original canvas text may be partially visible between overlay blocks. Canvas sampling improves background matching but does not fully occlude original text.
- **Partial translations**: Table-region blocks with only some lines translated render a mix of translated cells and source text fallback. This is visually imperfect but prevents full block-fallback.
