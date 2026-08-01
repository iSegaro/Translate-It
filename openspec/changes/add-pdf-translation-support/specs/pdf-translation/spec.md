## ADDED Requirements

### Requirement: Dedicated PDF Viewer
The extension MUST provide a dedicated PDF viewer surface for PDF translation and MUST NOT route PDF documents through Whole Page Translation or generic DOM translation flows.
The MVP MUST support opening and loading PDFs only inside the dedicated viewer surface.

#### Scenario: Open a PDF in the dedicated viewer
- **WHEN** the user opens a PDF translation entry point
- **THEN** the extension loads the PDF viewer app and renders the document inside the PDF-specific UI
- **AND** the document is managed by the PDF feature session model

#### Scenario: Attempt native interception in MVP
- **WHEN** the browser attempts to hand off a PDF URL automatically
- **THEN** the MVP does not intercept the flow
- **AND** the user must open the PDF inside the dedicated viewer surface

### Requirement: PDF.js Rendering
The PDF viewer MUST render documents using PDF.js and MUST preserve a pixel-accurate original pane.

#### Scenario: Render a visible PDF page
- **WHEN** a PDF page enters the visible viewport
- **THEN** the viewer renders the page canvas and text layer with PDF.js
- **AND** the original pane matches the source PDF rendering as closely as possible

#### Scenario: Load a PDF manually
- **WHEN** the user manually loads a PDF into the viewer
- **THEN** the viewer uses PDF.js to render the document
- **AND** the document stays within the dedicated PDF viewer surface

### Requirement: Logical Block Translation
The translation unit for PDF MUST be Logical Block, not page, line, or word.

#### Scenario: Translate visible content
- **WHEN** the user requests translation for visible PDF pages
- **THEN** the feature splits visible text into logical blocks
- **AND** each block is translated independently through the existing translation pipeline

### Requirement: List-Item Continuation Merging
Paragraph lines MUST be allowed to merge into active list-item blocks when they represent wrapped continuation text.

#### Scenario: Wrapped bullet item continuation
- **WHEN** a paragraph line follows a list-item block with vertical gap ≤ fontSize × 1.1 AND the line's x-coordinate is within the list-item's first 50% width range
- **THEN** the paragraph line SHALL be appended to the list-item block as a continuation line
- **AND** the block's bounding box SHALL expand to encompass the continuation

#### Scenario: Tight list items remain separate
- **WHEN** a paragraph line follows a list-item block but the vertical gap exceeds fontSize × 1.1 OR the line's x-coordinate is outside the list-item's first 50% width
- **THEN** the paragraph line SHALL start a new block, not merge into the list-item

### Requirement: Numeric List-Marker Year Guard
The layout analyzer MUST NOT classify 4+ digit leading numbers as list items unless they have explicit list punctuation.

#### Scenario: Year-like number not classified as list item
- **WHEN** a line starts with a 4+ digit number without `.`, `)`, or parentheses (e.g., "2029 onwards.")
- **THEN** the line role SHALL NOT be `list-item`

#### Scenario: 4-digit number with list punctuation is a list item
- **WHEN** a line starts with a 4+ digit number followed by `.` or `)` (e.g., "1234. Item") or wrapped in parentheses (e.g., "(1234) Item")
- **THEN** the line role SHALL be `list-item`

#### Scenario: Short numeric markers are always list items
- **WHEN** a line starts with a 1-3 digit number (with or without punctuation)
- **THEN** the line role SHALL be `list-item`

### Requirement: Stable Block Identity
PDF block cache keys MUST use stable identifiers that do not rely only on block index or page number.

#### Scenario: Reopen the same PDF after layout analysis changes
- **WHEN** the same PDF is reopened with minor layout reconstruction differences
- **THEN** unchanged blocks can still match persistent cache entries through stable block identity

### Requirement: PDF Cache Identity
PDF translation cache entries MUST use `pdfFingerprint + targetLanguage + provider + blockId + sourceTextHash + translationSettingsHash`.

#### Scenario: Change provider or settings
- **WHEN** the user changes the provider or translation settings
- **THEN** previously cached blocks with a different cache identity are not reused

### Requirement: Visible Page Translation Only
The MVP MUST translate only visible PDF pages and MUST NOT auto-translate the entire document on open.

#### Scenario: Open a large PDF
- **WHEN** the user opens a large PDF document
- **THEN** the viewer loads the visible pages only
- **AND** translation begins only when the user explicitly requests it

### Requirement: Bilingual Side-by-Side Viewer
The PDF viewer MUST support a side-by-side bilingual layout with Original Only, Translated Only, and Bilingual modes.

#### Scenario: Default viewer mode
- **WHEN** the viewer opens a PDF for translation
- **THEN** the default mode is Bilingual
- **AND** the original pane and translated pane are both visible

### Requirement: Adaptive Translated Pane
The translated pane MUST use adaptive geometry and MUST NOT require fixed translated boxes.

#### Scenario: Translated text expands
- **WHEN** translated text is longer than the source block
- **THEN** the translated pane can grow vertically or reflow text
- **AND** the layout remains readable

### Requirement: Text Selection Translation
The PDF text layer MUST support text selection translation through the existing selection workflow.

#### Scenario: User selects text in PDF text layer
- **WHEN** the user selects text inside the PDF text layer
- **THEN** the existing selection toolbar can trigger translation or TTS actions
- **AND** the PDF feature does not require a separate selection system

### Requirement: PDF-aware Select Element
The Select Element system MUST be able to target PDF logical blocks through a PDF-aware adapter.

#### Scenario: Select a PDF block
- **WHEN** the user enters Select Element mode on a PDF document
- **THEN** the selectable target corresponds to a logical block, not an arbitrary PDF.js text span

### Requirement: OCR Fallback With Approval
OCR MUST be a fallback path only and MUST require explicit user approval before processing a page that lacks a usable text layer.

#### Scenario: Scanned page without text layer
- **WHEN** a PDF page has no usable text layer
- **THEN** the viewer prompts the user before starting OCR
- **AND** OCR runs only after approval

### Requirement: Document-Level History Entry
The history system MUST store PDF translation history at document level rather than as one entry per translated block.

#### Scenario: Finish translating a PDF document
- **WHEN** the user translates one or more visible pages in a PDF
- **THEN** the history system stores a single document-level record with the PDF identity, pages translated, provider, and target language

### Requirement: MVP Export Formats
The MVP MUST support exporting translated PDF content as TXT and Markdown only.

#### Scenario: Export partially translated content
- **WHEN** the user exports a PDF that has only some translated pages or blocks
- **THEN** the export includes only translated content already available in cache
- **AND** the user is warned that the export is partial
