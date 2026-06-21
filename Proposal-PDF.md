# PDF Translation Feature Architecture

## Status

Draft (Approved for Initial Design)

## Last Updated

June 2026

---

# Vision

Provide a first-class PDF reading and translation experience inside Translate It.

The PDF experience should feel like a native extension feature rather than a file converter.

Users should be able to:

* Open PDFs inside Translate It.
* Select text and translate it using existing extension workflows.
* Use WindowsManager translation windows.
* Use Select Element mode.
* Use Page Translation.
* Read translated content in a bilingual side-by-side viewer.
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

* Whole Page Translation
* Select Element
* Subtitle Translation
* Screen Capture

PDF may reuse existing services but owns its own lifecycle.

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

---

# Core Architecture

## High Level Flow

```txt
PDF File
    ↓
PDF.js
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
```

---

# Rendering Architecture

## Left Pane

Original PDF

Rendered using:

```txt
pdf.js canvas layer
pdf.js text layer
```

---

## Right Pane

Translated PDF Representation

Rendered using:

```txt
original page geometry
translated block overlays
original images
original diagrams
```

The translated page is not a regenerated PDF.

It is a visual reconstruction.

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
* better caching
* lower provider cost
* easier future features

---

# Logical Block Model

Example:

```txt
Title

Paragraph

Paragraph

List

Caption
```

Becomes:

```txt
Block 1
Block 2
Block 3
Block 4
Block 5
```

Each block is translated independently.

---

# Bilingual Viewer Decision

Approved:

```txt
Side-by-Side Viewer
```

Layout:

```txt
┌──────────────┬──────────────┐
│ Original PDF │ Translation  │
└──────────────┴──────────────┘
```

Future support:

```txt
Original Only
Translation Only
Bilingual
```

---

# Text Selection Support

Goal:

Existing Text Selection feature should work without modification whenever possible.

Expected UX:

```txt
Select text
↓
Translation Icon
↓
WindowsManager
```

---

# Select Element Support

Goal:

Support PDF-aware element selection.

Implementation:

```txt
PdfElementAdapter
```

Responsibilities:

* map spans to logical blocks
* expose block boundaries
* integrate with existing Select Element workflow

---

# Page Translation Support

Supported:

```txt
Translate Current Page
Translate Visible Pages
Translate Entire Document
```

Implementation:

Page translation operates on logical blocks.

Not on raw text nodes.

---

# Cache Architecture

## Identity

Approved:

```txt
pdfFingerprint
targetLanguage
provider
blockId
```

Rejected:

```txt
fileName
url
pageNumberOnly
```

---

## Cache Levels

### Memory Cache

Fast session cache.

### Persistent Cache

IndexedDB.

---

# OCR Strategy

Decision:

```txt
OCR Fallback Only
```

Flow:

```txt
Text Layer Exists?
    ├─ Yes → Standard Pipeline
    └─ No → OCR Pipeline
```

OCR is never the primary path.

---

# PDF Layout Analysis

Component:

```txt
PdfLayoutAnalyzer
```

Responsibilities:

* line detection
* paragraph detection
* title detection
* caption detection
* list detection
* table region detection

Output:

```txt
Logical Blocks
```

---

# Future Table Support

Phase:

Future

Goal:

Preserve table structure.

Current MVP:

Treat table cells as blocks.

---

# Future Image Support

Images remain unchanged.

No image translation in MVP.

Future:

```txt
OCR inside images
Image Translation
```

---

# Export Strategy

Phase 1

Supported:

```txt
None
```

Phase 2

Supported:

```txt
Export Markdown
Export TXT
```

Phase 3

Supported:

```txt
Export Translated PDF
```

---

# Virtualization Strategy

Approved:

```txt
Visible Page Rendering
```

Only visible pages are rendered.

Large documents must not load all pages simultaneously.

---

# PDF Feature Modules

```txt
src/features/pdf-translation/

core/
  PdfTranslationCoordinator.js
  PdfTranslationCache.js
  PdfPageSession.js

viewer/
  PdfViewerController.js
  PdfPageRenderer.js
  PdfTextLayerAdapter.js

layout/
  PdfLayoutAnalyzer.js
  PdfLogicalBlockBuilder.js

translation/
  PdfTranslationAdapter.js

bilingual/
  PdfBilingualRenderer.js
  PdfTranslatedOverlayLayer.js

cache/
  PdfCacheManager.js

ocr/
  PdfOcrAdapter.js
```

---

# Development Roadmap

## Phase 1

Foundation

Deliver:

* PDF viewer
* PDF.js integration
* text extraction
* text selection support
* WindowsManager integration

---

## Phase 2

Document Structure

Deliver:

* layout analysis
* logical block generation
* block cache

---

## Phase 3

Translation

Deliver:

* block translation
* current page translation
* visible page translation

---

## Phase 4

Bilingual Viewer

Deliver:

* side-by-side mode
* translated page rendering
* block overlay system

---

## Phase 5

PDF-Aware Features

Deliver:

* Select Element integration
* page translation integration
* history integration

---

## Phase 6

OCR Support

Deliver:

* scanned PDF support
* OCR fallback

---

## Phase 7

Export

Deliver:

* markdown export
* txt export
* translated PDF investigation

---

# Do Not Violate

* Do not use browser native PDF viewer as the primary architecture.
* Do not use page-level translation as the fundamental translation unit.
* Do not make OCR the primary extraction strategy.
* Do not tightly couple PDF logic to Whole Page Translation.
* Do not tightly couple PDF logic to Select Element.
* Do not use filename-based cache identities.
* Do not regenerate translated PDFs during MVP phases.
* Do not abandon logical block translation.
