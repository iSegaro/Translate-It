# PDF Translation Feature Architecture

## Status

Draft — Approved for Initial Implementation

## Last Updated

June 2026

---

# Vision

Provide a first-class PDF reading, translation, and export experience inside Translate It.

The PDF experience should feel like a native extension feature rather than a file converter.

Users should be able to:

* Open PDFs inside Translate It.
* Read PDFs in a dedicated Translate It PDF Viewer.
* Select text and translate it using existing extension workflows.
* Use WindowsManager translation windows.
* Use Select Element mode in a PDF-aware way.
* Translate visible PDF pages.
* Read translated content in a bilingual side-by-side viewer.
* Export translated content from the MVP.
* Reuse existing Translation Provider infrastructure.
* Reuse existing Language Detection infrastructure.
* Reuse existing History infrastructure.
* Reuse existing Settings infrastructure.

The PDF feature must remain architecturally independent while integrating with existing shared systems.

---

# Architectural Principles

## Feature Isolation

PDF translation is implemented as an independent feature.

```txt
src/apps/pdf/
src/features/pdf-translation/
```

PDF must not be merged into:

```txt
Whole Page Translation
Select Element
Subtitle Translation
Screen Capture
```

PDF may reuse existing shared services, but it owns its own lifecycle, state model, rendering model, cache model, and export flow.

---

## Viewer Ownership

Decision:

```txt
Use dedicated Translate It PDF Viewer
```

Rejected:

```txt
Browser native PDF viewer integration
```

Reason:

* inconsistent browser behavior
* reduced feature control
* limited future extensibility
* harder Select Element integration
* harder bilingual rendering
* harder export support
* harder cache and session ownership

---

## Translation Philosophy

PDF is treated as a structured document.

Not as:

```txt
plain text
```

Not as:

```txt
web page DOM
```

But as:

```txt
document with layout metadata
```

The PDF pipeline must preserve page identity, block geometry, reading order, and document-level context.

---

# Core Architecture

## High-Level Flow

```txt
PDF File / PDF URL
    ↓
PDF.js
    ↓
PdfDocumentSession
    ↓
Page Model
    ↓
Layout Analysis
    ↓
Logical Block Builder
    ↓
Translation System
    ↓
Translation Cache
    ↓
Bilingual Renderer
    ↓
Export Pipeline
```

---

# PDF Session Model

PDF uses an explicit session model.

This keeps rendering, translation, cache, and export state deterministic and avoids coupling PDF behavior to page translation or DOM translation systems.

## PdfDocumentSession

Owns:

```txt
pdf identity
document metadata
source language state
target language state
provider state
document-level translation state
cache scope
history scope
export state
page session registry
```

Does not own:

```txt
provider execution internals
global settings persistence
WindowsManager rendering
Select Element implementation
OCR engine internals
```

---

## PdfPageSession

Owns:

```txt
page number
page viewport
page render state
text layer state
logical blocks
visible block state
translated block state
page export state
```

Does not own:

```txt
document identity
global translation settings
persistent cache ownership
provider selection logic
```

---

## PdfTranslationCoordinator

Owns:

```txt
translation lifecycle
visible page translation
block batching
provider request preparation
translation result normalization
translation status updates
```

It delegates actual translation to the existing translation provider infrastructure.

---

# PDF Identity

PDF identity must be stable across file rename and repeated opens.

## Primary Identity

```txt
PDF.js fingerprint
```

## Fallback Identity

```txt
SHA256(fileBytes)
```

## Rejected Identity Sources

```txt
fileName
url only
pageNumber only
lastModified only
```

Reason:

* filenames can change
* URLs may be temporary
* page numbers are not document identities
* cache must survive rename and repeated usage

---

# Rendering Architecture

## Left Pane

Original PDF.

Rendered using:

```txt
pdf.js canvas layer
pdf.js text layer
```

The left pane should remain visually faithful to the original PDF.

---

## Right Pane

Translated PDF representation.

Rendered using:

```txt
adaptive translated page layout
translated logical blocks
original images
original diagrams
original page-level visual anchors
```

The translated page is not a regenerated PDF.

It is a readable visual reconstruction of the original page.

---

# Bilingual Viewer Decision

Approved:

```txt
Side-by-Side Viewer
```

Layout:

```txt
┌──────────────┬────────────────────┐
│ Original PDF │ Translated Version │
└──────────────┴────────────────────┘
```

Supported modes:

```txt
Original Only
Translated Only
Bilingual
```

MVP default:

```txt
Bilingual
```

---

# Translated Layout Model

Decision:

```txt
Original PDF = Pixel Accurate
Translated Pane = Adaptive Geometry
```

The original pane preserves the exact PDF rendering.

The translated pane prioritizes readability over pixel-perfect reconstruction.

## Rejected for MVP

```txt
Fixed translated geometry
```

Reason:

* translated text may expand
* RTL languages need more careful layout handling
* paragraph wrapping may differ
* fixed boxes can hurt readability
* table and caption handling becomes fragile

## Approved

```txt
Adaptive translated geometry
```

This means:

* translated paragraphs may grow vertically
* translated blocks preserve the original reading order
* images and diagrams stay visually aligned as much as practical
* page structure remains recognizable
* exact pixel parity is not required in the translated pane

---

# Translation Unit Decision

Approved:

```txt
Logical Block Translation
```

Rejected:

```txt
Word Translation
Line Translation
Full Page Translation
```

Reason:

* higher translation quality
* better context preservation
* better caching
* lower provider cost
* easier export support
* easier history grouping
* easier Select Element integration

---

# Logical Block Model

Example source structure:

```txt
Title

Paragraph

Paragraph

List

Caption
```

Becomes:

```txt
Block 1: Title
Block 2: Paragraph
Block 3: Paragraph
Block 4: List
Block 5: Caption
```

Each block is translated independently.

---

# Stable Block Identity

Block IDs must not rely only on sequential numbering.

Rejected:

```txt
blockIndex
pageNumber + blockIndex
```

Approved block identity:

```txt
pdfFingerprint
pageNumber
normalizedBoundingBox
normalizedTextHash
blockRole
```

Example:

```txt
pdfFingerprint: abc123
pageNumber: 12
bbox: 80,140,420,95
textHash: sha256(normalizedText)
role: paragraph
```

Reason:

* layout analyzer changes should not destroy all cache entries
* minor ordering changes should not invalidate unrelated blocks
* cache should survive repeated opens
* export should map translated blocks reliably

---

# PDF Layout Analysis

Component:

```txt
PdfLayoutAnalyzer
```

Responsibilities:

```txt
line detection
paragraph detection
title detection
caption detection
list detection
table region detection
reading order detection
block role classification
bounding box normalization
```

Output:

```txt
PdfLogicalBlock[]
```

---

# Logical Block Builder

Component:

```txt
PdfLogicalBlockBuilder
```

Responsibilities:

```txt
merge PDF.js text items into lines
merge lines into logical blocks
assign block roles
assign stable block IDs
preserve page-level reading order
attach geometry metadata
attach table/cell metadata when available
```

---

# Table Strategy

## MVP

Tables are supported in a basic way.

Decision:

```txt
Treat table cells as logical blocks
```

But preserve table metadata from the beginning.

Each table cell block should keep:

```txt
tableId
rowIndex
columnIndex
rowSpan when detectable
columnSpan when detectable
cellBoundingBox
```

Reason:

* MVP remains simple
* future table rendering becomes possible
* future export quality improves
* cache identity remains stable

## Future

Improve table support with:

```txt
table structure reconstruction
row/column layout preservation
table-aware export
merged cell support
```

---

# Text Selection Support

Goal:

Existing Text Selection feature should work with minimal changes whenever possible.

Expected UX:

```txt
Select text in PDF text layer
↓
Selection Toolbar
↓
Translate / TTS actions
↓
WindowsManager
```

PDF text selection must integrate with the existing selection toolbar and WindowsManager behavior.

PDF-specific selection handling should only be added where PDF.js text layers behave differently from regular DOM text.

---

# Select Element Support

Goal:

Support PDF-aware element selection.

Implementation:

```txt
PdfElementAdapter
```

Responsibilities:

```txt
map PDF.js text spans to logical blocks
expose block boundaries
provide hover/highlight geometry
integrate with existing Select Element workflow
prevent coupling with DOM page translation
```

Select Element should operate on PDF logical blocks, not arbitrary PDF.js spans.

---

# Page Translation Support

Supported in MVP:

```txt
Translate Visible Pages
```

Future support:

```txt
Translate Current Page
Translate Page Range
Translate Entire Document
```

## MVP Decision

```txt
Visible Pages Only
```

Reason:

* safer for large PDFs
* lower provider cost
* faster perceived UX
* better memory profile
* easier cancellation and retry

---

# Translation Trigger Strategy

MVP supports manual translation.

Approved:

```txt
Manual trigger
Translate Visible Pages
```

Rejected for MVP:

```txt
Auto-translate entire document on open
```

Reason:

* unpredictable cost
* poor UX for large documents
* unnecessary provider load
* harder cancellation semantics

Future:

```txt
auto-translate visible pages
preload next page
translate selected page range
```

---

# Translation Provider Integration

PDF translation reuses the existing translation provider infrastructure.

PDF must not introduce a separate translation provider system.

The PDF translation adapter prepares logical blocks and delegates execution to the existing translation flow.

## PdfTranslationAdapter

Responsibilities:

```txt
convert logical blocks into provider-compatible batch requests
preserve block IDs
normalize provider responses
map translated text back to logical blocks
respect provider optimization levels
respect provider rate limits
respect provider bulk capabilities
```

---

# Translation Priority

PDF visible-page translation should be treated as a background or normal-priority translation task.

Suggested priority:

```txt
NORMAL for user-triggered visible page translation
LOW for future preloading/background translation
HIGH is reserved for direct interactive translation windows
```

---

# Language Detection and Direction

PDF reuses the existing Language Detection and Direction system.

Responsibilities:

```txt
detect source language from extracted text
apply RTL/LTR direction to translated blocks
preserve mixed-direction text behavior
avoid page-level direction flipping
```

Direction must be applied at block or text container level, not at the entire translated page level, unless the page is confidently single-direction.

---

# Cache Architecture

## Cache Identity

Approved:

```txt
pdfFingerprint
targetLanguage
provider
blockId
sourceTextHash
translationSettingsHash
```

Rejected:

```txt
fileName
url only
pageNumber only
blockIndex only
```

Reason:

* translation cache must survive file rename
* provider changes must not reuse stale output
* settings changes may affect translation result
* block identity must be stable

---

## Cache Levels

### Memory Cache

Fast session cache.

Used for:

```txt
currently open PDF
visible pages
recently translated blocks
quick renderer updates
```

### Persistent Cache

IndexedDB.

Used for:

```txt
translated blocks
document metadata
translation status
export reuse
```

---

## Cache Ownership

Component:

```txt
PdfCacheManager
```

Responsibilities:

```txt
read translated blocks
write translated blocks
invalidate by provider/language/settings
clear document cache
clear all PDF translation cache
skip persistent writes when required by privacy mode
```

---

# OCR Strategy

Decision:

```txt
OCR Fallback Only
```

OCR is never the primary path.

Flow:

```txt
Text Layer Exists?
    ├─ Yes → Standard Pipeline
    └─ No → Ask User → OCR Pipeline
```

## MVP OCR Behavior

If a PDF page has no usable text layer:

```txt
Ask user before running OCR
```

Reason:

* OCR can be slow
* OCR can be resource-intensive
* OCR quality varies
* user should understand the cost and delay

## OCR Engine

Preferred MVP engine:

```txt
Tesseract.js
```

Reason:

* local processing
* privacy-friendly
* aligns with existing screen capture OCR direction
* avoids adding cloud OCR dependency for MVP

---

# Image Support

MVP:

```txt
Images remain unchanged
Diagrams remain unchanged
Text inside images is not translated unless OCR fallback is explicitly triggered
```

Future:

```txt
image-region OCR
diagram-aware text replacement
image translation
```

---

# Search Strategy

## MVP

```txt
Original PDF Search Only
```

Reason:

* PDF.js already supports original text search patterns
* translated search requires translation index management
* avoids extra complexity in MVP

## Future

```txt
Search Original
Search Translation
Search Both
```

Future translated search requires:

```txt
translated block index
block-to-page mapping
highlight mapping in translated pane
```

---

# History Integration

PDF reuses existing History infrastructure but must not store every translated block as a separate user-facing history item.

## MVP History Unit

Approved:

```txt
Per Document
```

Example history entry:

```txt
Document: research-paper.pdf
Source: auto/en
Target: fa
Provider: Gemini
Pages translated: 1-3, 8
Last opened: timestamp
```

Detailed block-level data belongs in PDF cache, not user-facing history.

---

# Export Strategy

Export is included in MVP.

## MVP Export

Supported:

```txt
Export Translated TXT
Export Translated Markdown
```

Optional if implementation cost is acceptable:

```txt
Export Bilingual Markdown
```

## MVP Export Scope

Export only includes translated content that has already been translated.

For MVP, export does not automatically translate the entire document unless the user has already translated all required pages.

Approved behavior:

```txt
Export translated visible/processed pages
```

If the document is only partially translated, the export UI must clearly indicate:

```txt
This export includes only translated pages/blocks.
```

## Rejected for MVP

```txt
Export regenerated translated PDF
Export pixel-perfect bilingual PDF
```

Reason:

* PDF regeneration is complex
* fonts and layout are difficult
* translated text expansion breaks fixed layout
* table and image alignment require more work

## Future Export

```txt
Export Translated PDF
Export Bilingual PDF
Export selected page range
Export entire translated document
```

---

# Virtualization Strategy

Approved:

```txt
Visible Page Rendering
```

Only visible pages are rendered.

Large documents must not load or translate all pages simultaneously.

Virtualization responsibilities:

```txt
render visible pages
keep nearby page buffers small
dispose distant page render resources
preserve translated block cache
avoid memory leaks
```

---

# Performance Strategy

PDF translation must remain memory-safe for large documents.

Rules:

```txt
Do not render all pages at once
Do not translate all pages automatically
Do not keep all page canvases alive
Do not keep all PDF.js text layers mounted
Do not OCR without user approval
Do not store raw OCR images persistently
```

Use:

```txt
ResourceTracker
structured cleanup
page-level disposal
visible-page scheduling
cache-backed restoration
```

---

# UI Architecture

## PDF App

Entry point:

```txt
src/apps/pdf/
```

Suggested components:

```txt
PdfApp.vue
PdfViewerLayout.vue
PdfToolbar.vue
PdfSidebar.vue
PdfPageView.vue
PdfBilingualView.vue
PdfExportDialog.vue
PdfOcrNotice.vue
```

---

## PDF Feature

Feature implementation:

```txt
src/features/pdf-translation/
```

Suggested structure:

```txt
src/features/pdf-translation/

core/
  PdfDocumentSession.js
  PdfPageSession.js
  PdfTranslationCoordinator.js
  PdfFeatureController.js

viewer/
  PdfViewerController.js
  PdfPageRenderer.js
  PdfTextLayerAdapter.js
  PdfVirtualPageManager.js

layout/
  PdfLayoutAnalyzer.js
  PdfLogicalBlockBuilder.js
  PdfReadingOrderResolver.js

translation/
  PdfTranslationAdapter.js
  PdfTranslationBatchPlanner.js
  PdfTranslationResultMapper.js

bilingual/
  PdfBilingualRenderer.js
  PdfTranslatedPageView.js
  PdfTranslatedBlock.vue

cache/
  PdfCacheManager.js
  PdfCacheSchema.js

ocr/
  PdfOcrAdapter.js
  PdfOcrConsentController.js

export/
  PdfExportCoordinator.js
  PdfMarkdownExporter.js
  PdfTextExporter.js

selection/
  PdfSelectionAdapter.js
  PdfElementAdapter.js
```

---

# Messaging Architecture

PDF should define PDF-specific message actions while delegating translation execution to existing translation systems.

Example actions:

```txt
PDF_OPEN_DOCUMENT
PDF_RENDER_PAGE
PDF_TRANSLATE_VISIBLE_PAGES
PDF_TRANSLATE_PAGE
PDF_EXPORT_TRANSLATED_TEXT
PDF_EXPORT_TRANSLATED_MARKDOWN
PDF_RUN_OCR_FOR_PAGE
PDF_CLEAR_DOCUMENT_CACHE
```

PDF-specific actions should not duplicate generic translation provider actions.

---

# Settings Integration

PDF should reuse existing settings where possible:

```txt
source language
target language
provider
optimization level
theme
TTS availability
history settings
```

PDF-specific settings may include:

```txt
default PDF view mode
default export format
ask before OCR
remember PDF cache
```

---

# Privacy Model

PDF processing should be privacy-aware.

Rules:

```txt
Do not upload the PDF file itself to translation providers.
Only send extracted text blocks for translation.
Do not persist raw OCR images.
Do not run OCR without user approval.
Do not store cache if privacy/incognito mode disables persistence.
```

---

# Error Handling

PDF must use existing centralized error handling patterns.

Expected error categories:

```txt
PDF load error
PDF parse error
PDF text extraction error
PDF render error
PDF translation error
PDF OCR error
PDF export error
cache read/write error
```

Failure behavior:

```txt
single block failure must not fail entire page
single page failure must not fail entire document
export should clearly report missing or failed blocks
OCR failure should fall back to unsupported/scanned-page notice
```

---

# Logging

Use structured scoped logging.

Suggested component:

```txt
LOG_COMPONENTS.PDF_TRANSLATION
```

Log metadata only.

Allowed log data:

```txt
documentId
pageNumber
blockCount
translatedBlockCount
provider
sourceLanguage
targetLanguage
durationMs
cacheHitCount
cacheMissCount
exportFormat
```

Do not log by default:

```txt
full PDF text
full translated text
API keys
raw OCR image data
file contents
```

---

# Development Roadmap

## Phase 1 — PDF Viewer Foundation

Deliver:

```txt
dedicated PDF app
PDF.js integration
PDF open flow
page rendering
text layer rendering
visible page virtualization
basic toolbar
document session model
page session model
```

---

## Phase 2 — Text Selection Integration

Deliver:

```txt
selection support on PDF text layer
Selection Toolbar integration
WindowsManager integration
TTS action compatibility where available
PDF selection adapter
```

---

## Phase 3 — Layout and Logical Blocks

Deliver:

```txt
PdfLayoutAnalyzer
PdfLogicalBlockBuilder
reading order resolver
stable block identity
paragraph/title/caption/list detection
basic table cell block detection
block metadata model
```

---

## Phase 4 — Translation Pipeline

Deliver:

```txt
PdfTranslationCoordinator
PdfTranslationAdapter
visible page translation
block translation
translation result mapping
provider batching
cache read/write
translation progress state
```

---

## Phase 5 — Bilingual Viewer

Deliver:

```txt
side-by-side mode
translated pane
adaptive translated layout
translated block rendering
RTL/LTR block direction
original/translated scroll sync
```

---

## Phase 6 — Export MVP

Deliver:

```txt
Export Translated TXT
Export Translated Markdown
Export processed translated pages/blocks
partial export warning
basic export dialog
```

Optional:

```txt
Export Bilingual Markdown
```

---

## Phase 7 — PDF-Aware Select Element

Deliver:

```txt
PdfElementAdapter
PDF block hover/highlight
PDF block selection
Select Element integration
block-level translation trigger
```

---

## Phase 8 — OCR Fallback

Deliver:

```txt
detect missing text layer
ask user before OCR
Tesseract.js OCR fallback
OCR result mapped to logical blocks
OCR cache integration
```

---

## Phase 9 — History and Cache UX

Deliver:

```txt
document-level history entries
translated page status
clear document cache
clear all PDF cache
resume previous translated document state
```

---

## Phase 10 — Future Export Investigation

Deliver investigation for:

```txt
Export Translated PDF
Export Bilingual PDF
page range export
table-aware export
font embedding constraints
RTL PDF generation constraints
```

---

# Do Not Violate

* Do not use browser native PDF viewer as the primary architecture.
* Do not treat PDF as a normal web page DOM.
* Do not use page-level translation as the fundamental translation unit.
* Do not use word-level or line-level translation as the default unit.
* Do not make OCR the primary extraction strategy.
* Do not run OCR without user approval.
* Do not tightly couple PDF logic to Whole Page Translation.
* Do not tightly couple PDF logic to Select Element.
* Do not introduce a separate translation provider system for PDF.
* Do not use filename-based cache identity.
* Do not use block index as the only block identity.
* Do not translate the entire document automatically in MVP.
* Do not render all pages simultaneously.
* Do not regenerate translated PDFs during MVP.
* Do not store every block translation as a separate user-facing history item.
* Do not log full PDF text or translated text by default.
* Do not persist raw OCR image data.
* Do not abandon logical block translation.

---

# Final MVP Scope

MVP includes:

```txt
Dedicated PDF Viewer
PDF.js rendering
Text layer support
Text selection translation
WindowsManager integration
Visible page translation
Logical block translation
Persistent block cache
Bilingual side-by-side viewer
Adaptive translated pane
Export Translated TXT
Export Translated Markdown
OCR fallback with user approval
Document-level history entry
```

MVP does not include:

```txt
full document auto-translation
translated PDF regeneration
bilingual PDF generation
advanced table reconstruction
image text replacement
automatic OCR for all scanned pages
translated search
```
