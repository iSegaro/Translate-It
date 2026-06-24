## ADDED Requirements

### Requirement: Export translated content as TXT, Markdown, or HTML

The system SHALL provide export functionality for translated PDF content in three formats: TXT, Markdown, and HTML. Export SHALL be available when at least one block has been translated.

#### Scenario: Export buttons appear when translations exist

- **WHEN** a PDF has at least one translated block
- **THEN** the toolbar SHALL display "Export TXT", "Export Markdown", and "Export HTML" buttons

#### Scenario: Export buttons hidden when no translations

- **WHEN** no blocks have been translated
- **THEN** no export buttons SHALL be displayed

### Requirement: TXT export preserves reading order

TXT export SHALL output translated text blocks ordered by page number and reading order, with page separators.

#### Scenario: Multi-page TXT export

- **WHEN** the user exports a 3-page document with translations on pages 1 and 3
- **THEN** the output SHALL contain `--- Page 1 ---`, page 1 blocks, `--- Page 3 ---`, page 3 blocks, in reading order

### Requirement: Markdown export formats roles

Markdown export SHALL apply role-aware formatting: headings as `##`, list items as `-`, captions as `*italic*`, paragraphs as plain text.

#### Scenario: Heading and list formatting

- **WHEN** the exported blocks include a heading "Introduction" and a list item "Item one"
- **THEN** the markdown output SHALL contain `## Introduction` and `- Item one`

### Requirement: HTML export preserves spatial layout

HTML export SHALL generate a self-contained HTML document with:
- Per-page containers at display dimensions
- Embedded canvas page images (JPEG, quality 0.85) as `<img>` elements
- Absolutely-positioned translated block `<div>` elements at `boundingBox × scale` coordinates
- Inline CSS for font-size, font-family, direction, and background
- HTML-escaped translated text for XSS prevention

#### Scenario: HTML export with canvas background

- **WHEN** canvas dataURLs are available for rendered pages
- **THEN** the HTML SHALL include `<img class="page-bg">` elements with the canvas dataURL as `src`

#### Scenario: HTML export without canvas background

- **WHEN** canvas dataURLs are not available (page not rendered)
- **THEN** the HTML SHALL render block overlays on a plain background without page images

#### Scenario: RTL text in HTML export

- **WHEN** a translated block contains predominantly RTL characters
- **THEN** the block `<div>` SHALL have `dir="rtl"` attribute

#### Scenario: LTR text in HTML export

- **WHEN** a translated block contains predominantly LTR characters
- **THEN** the block `<div>` SHALL NOT have `dir="rtl"` attribute

#### Scenario: HTML export escapes special characters

- **WHEN** translated text contains `<`, `>`, `&`, `"`, or `'`
- **THEN** the HTML output SHALL use proper HTML entities

#### Scenario: HTML export skips untranslated blocks

- **WHEN** a block has `translationState.status !== 'translated'`
- **THEN** no overlay div SHALL be generated for that block in the HTML output

#### Scenario: HTML export filename

- **WHEN** the document title is "My Report.pdf"
- **THEN** the downloaded filename SHALL be `My_Report_translated.html`

### Requirement: Export does not block UI

All export operations SHALL be synchronous and immediate for MVP. No progress indicator is required.

#### Scenario: Export triggers download

- **WHEN** the user clicks "Export HTML"
- **THEN** a file download SHALL be triggered immediately with the generated content

### Known Limitations

- **HTML export size**: Multi-page documents with embedded JPEG canvas images can produce large HTML files (50KB-500KB+ depending on page count and image quality).
- **No true PDF export**: Export produces HTML, not PDF. Users can print-to-PDF from browser for a true PDF output.
- **Block-level only**: HTML export renders block-level overlays, not per-cell table reconstruction.
- **No progress indicator**: Large documents may briefly block the UI during HTML generation.
