# PDF Translation Architecture

## Overview

The PDF Translation feature is a **self-contained, dedicated PDF viewer and translation system**. It runs as a standalone Vue 3 application backed by a rich core library. The system uses **pdfjs-dist** for rendering, a custom text layer renderer for selection, a layout analysis engine for logical block extraction, a batch translation pipeline, OCR support for scanned pages, persistent caching, document history, and export to TXT/Markdown.

**Architecture Status**: Production Ready (MVP Complete)

**Key Metrics**: ~20 core source modules, custom text layer with sub-pixel accuracy, per-block deterministic identity, local Tesseract.js OCR, dual-format export.

---

## Table of Contents

- [Goals and Non-Goals](#goals-and-non-goals)
- [Architectural Overview](#architectural-overview)
- [Module Boundaries](#module-boundaries)
- [PDF Application Architecture](#pdf-application-architecture)
- [PDF Viewer Lifecycle](#pdf-viewer-lifecycle)
- [Text Layer Architecture](#text-layer-architecture)
- [Selection Integration](#selection-integration)
- [Logical Block Model](#logical-block-model)
- [Translation Pipeline](#translation-pipeline)
- [Bilingual Rendering Model](#bilingual-rendering-model)
- [OCR Fallback Architecture](#ocr-fallback-architecture)
- [Cache Architecture](#cache-architecture)
- [History Architecture](#history-architecture)
- [Export Architecture](#export-architecture)
- [Block Targeting](#block-targeting)
- [Storage Model](#storage-model)
- [Event Flow](#event-flow)
- [Cross-Feature Dependencies](#cross-feature-dependencies)
- [Major Design Decisions](#major-design-decisions)
- [Known Technical Debt](#known-technical-debt)
- [Future Extension Points](#future-extension-points)

---

## Goals and Non-Goals

### Goals

1. **Dedicated PDF Viewer**: A first-class, pixel-accurate PDF viewer with side-by-side bilingual rendering.
2. **Logical Block Translation**: Translate meaningful semantic units (paragraphs, headings, lists) rather than pages or lines.
3. **Stable Block Identity**: Block IDs survive layout analyzer changes, file renames, and cache invalidation via normalized bounding boxes and text hashes.
4. **Visible Page Only**: Only translate pages currently in the viewport — safer for large PDFs, lower cost, faster UX.
5. **Persistent Cache**: Translation results are cached per-document and restored on re-open.
6. **OCR Fallback**: Scanned/image-based pages are detected and processed via local Tesseract.js OCR with explicit user consent.
7. **Export**: Translated content can be exported to TXT and Markdown.
8. **Selection Integration**: Native text selection within the PDF emits standard extension selection events via the shared `pageEventBus` contract, handled by a PDF-specific subscriber.

### Non-Goals (MVP)

1. **No browser-native PDF interception** — Users open PDFs inside the dedicated viewer only.
2. **No auto-translate on open** — Translation is manually triggered per visible pages.
3. **No translated PDF regeneration** — Output is text-based export, not a translated PDF file.
4. **No advanced table reconstruction** — Tables are translated as flat text blocks.
5. **No translated search** — Search operates on the original text only.
6. **No scroll synchronization** — Original and translated panes scroll independently.

---

## Architectural Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        PdfApp.vue (Root)                        │
│  usePdfViewerController │ usePdfBilingualMode │ usePdfExport    │
│  usePdfBlockSelection   │ usePdfOcr           │ usePdfSelection │
└───────────┬─────────────────────────────────────────────────────┘
            │
┌───────────▼─────────────────────────────────────────────────────┐
│                    Feature Layer (core/)                         │
│                                                                 │
│  ┌──────────────────┐  ┌────────────────────┐  ┌─────────────┐ │
│  │ PdfDocument      │  │ PdfTranslation     │  │ PdfLayout   │ │
│  │ Session          │  │ Coordinator        │  │ Analyzer    │ │
│  │ (Singleton)      │  │ (Orchestrator)     │  │             │ │
│  └──────┬───────────┘  └──────┬─────────────┘  └──────┬──────┘ │
│         │                     │                       │        │
│  ┌──────▼──────┐    ┌────────▼────────┐    ┌─────────▼──────┐ │
│  │PdfPageSession│    │PdfTranslation   │    │PdfLogicalBlock │ │
│  │ (Per-page)  │    │Adapter + Batch  │    │Builder         │ │
│  └──────┬──────┘    │Planner          │    └────────────────┘ │
│         │           └────────┬────────┘                        │
│  ┌──────▼──────┐    ┌───────▼───────┐                          │
│  │PdfTextLayer │    │UnifiedMessaging│                          │
│  │Renderer     │    │(to background) │                          │
│  └─────────────┘    └───────────────┘                          │
│                                                                 │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │PdfCache    │  │PdfHistory    │  │PdfExport     │            │
│  │Manager     │  │Manager       │  │Collector+    │            │
│  └────────────┘  └──────────────┘  │Formatter     │            │
│                                     └──────────────┘            │
│  ┌────────────────────────────────────────────────┐            │
│  │ OCR Pipeline: PdfOcrDetector → PdfOcrProcessor │            │
│  └────────────────────────────────────────────────┘            │
└─────────────────────────────────────────────────────────────────┘
            │
┌───────────▼─────────────────────────────────────────────────────┐
│                    pdfjs-dist (Rendering)                        │
│  PDF parsing, canvas rendering, text content extraction          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Module Boundaries

### Two-Layer Architecture

| Layer | Directory | Purpose | Framework |
|-------|-----------|---------|-----------|
| **Application Layer** | `src/apps/pdf/` | Vue components, composables, UI | Vue 3 + Pinia |
| **Feature Layer** | `src/features/pdf-translation/core/` | Domain logic, state management, orchestration | Vanilla JS + ResourceTracker |

**Key Principle**: The feature layer is **framework-agnostic**. It uses no Vue reactivity — translation states are stored in `Map` objects on `PdfDocumentSession`. Composables in the application layer bridge feature-layer classes to Vue's reactive system via refs and computed properties.

### Singletons

Three services are module-level singletons shared across all composables:

| Singleton | Purpose | Storage Key |
|-----------|---------|-------------|
| `pdfDocumentSession` | Document lifecycle, page sessions, translation state | N/A (in-memory) |
| `pdfCacheManager` | Persistent translation + OCR cache | `pdfDocumentCache` |
| `pdfHistoryManager` | Document open/translation history | `pdfTranslationHistory` |

---

## PDF Application Architecture

### Entry Point

```
src/html/pdf.html → src/app/main/pdf.js → src/apps/pdf/PdfApp.vue
```

Standard Vue 3 bootstrap: `createApp`, Pinia install, error handlers, mount to `#app`.

### Render Tree

```
PdfApp
├── PdfToolbar (file info, mode selector, action buttons)
├── PdfOcrConsentPrompt (user consent before OCR)
├── PdfOcrProgress (progress bar during OCR)
├── PdfDropzone (drag-and-drop or empty state)
│   └── PdfViewerLayout (CSS Grid: single/dual pane)
│       ├── PdfViewer (original pane, scrollable page list)
│       │   ├── PdfPageView × N (canvas + text layer per page)
│       │   └── PdfBlockHighlightOverlay × N (targeting highlight)
│       └── PdfTranslatedPane (translated blocks per page)
│           ├── PdfTranslatedBlock × M
│           └── PdfOcrStatus × N
└── PdfSelectionAction (floating translate button + result popup)
```

### Composable Responsibilities

| Composable | Purpose | Key Dependencies |
|------------|---------|-----------------|
| `usePdfViewerController` | Document lifecycle, translation, cache restore | `pdfDocumentSession`, `PdfTranslationCoordinator` |
| `usePdfBilingualMode` | Viewer mode state (original/bilingual/translated) | Standalone |
| `usePdfExport` | Export to TXT/Markdown | `PdfExportCollector`, `PdfExportFormatter` |
| `usePdfBlockSelection` | Block targeting mode | `PdfBlockTargetingManager` |
| `usePdfOcr` | OCR detection + processing workflow | `PdfOcrDetector`, `PdfOcrProcessor` |
| `usePdfSelectionAction` | Text selection translation popup | `pageEventBus`, `UnifiedMessaging` |
| `usePdfSelectionBridge` | Lifecycle wrapper for `PdfSelectionBridge` | `PdfSelectionBridge` |

---

## PDF Viewer Lifecycle

### File Loading Sequence

```
1. User drops/selects PDF file
2. usePdfViewerController.loadPdfFile(file, viewerWidth)
   ├── Cancel active translation (if any)
   ├── Reset all state (pageMetrics, translationSummary, etc.)
   ├── pdfDocumentSession.openFile(file, viewerWidth)
   │   ├── Create object URL
   │   ├── Load PDF via pdfjs-dist (useSystemFonts: true)
   │   ├── Compute document identity (fingerprint → SHA-256 fallback)
   │   ├── Build page metrics (dimensions, scale per page)
   │   └── Return state snapshot
   ├── restoreFromCache(documentIdentity)
   │   ├── pdfCacheManager.loadDocument(documentIdentity)
   │   ├── Validate sourceTextHash for each cached entry
   │   └── Apply matching translations to session
   └── pdfHistoryManager.updateAfterOpen(session)
```

### Page Rendering Sequence

```
1. PdfPageView watches [visible, pageNumber, scale, width, height]
2. When visible: PdfTextLayerRenderer.render(page, viewport)
   ├── page.getTextContent() → text items
   ├── Create positioned <span> elements (left/top %, font-size, rotation)
   ├── Append to DOM
   └── Post-render: measure widths → apply scaleX for accuracy
3. PdfDocumentSession.renderPage() renders canvas via pdfjs page.render()
4. When hidden: clearPage() cancels render, clears canvas + text layer
```

### Cleanup Sequence

```
1. PdfApp unmounts
2. Each composable calls its cleanup
3. pdfDocumentSession.cleanupDocument()
   ├── Cancel all active render tasks
   ├── Destroy pdfjs document object
   ├── Revoke object URL
   └── Clear all Maps (pageSessions, translationStates, renderTasks)
```

---

## Text Layer Architecture

### Why Custom Renderer Instead of `TextLayerBuilder`

The pdfjs-dist `TextLayerBuilder` was evaluated and **intentionally replaced** with a custom `PdfTextLayerRenderer`. The rationale:

| Factor | `TextLayerBuilder` | Custom Renderer |
|--------|-------------------|-----------------|
| **Bundle leakage** | Imports from `pdfjs-dist/web/pdf_viewer.mjs` (~300KB) which pulls in annotation layer, find controller, and UI utilities | Zero external dependencies — ~130 lines of pure DOM manipulation |
| **CSS coupling** | Requires `pdf_viewer.css` (160KB) with hundreds of rules for annotations, find highlights, editor layers | Only 36 lines of focused SCSS in `PdfPageView.scss` |
| **Positioning** | Uses pdfjs internal transform composition with CSS custom properties | Direct matrix math + percentage-based `left`/`top` positioning |
| **Post-render accuracy** | No horizontal scaling adjustment | Post-render width measurement with scaleX adjustment for sub-pixel accuracy |
| **Annotation overhead** | Renders link annotations, form widgets, annotation editor layers | Renders only pure text — no annotation coupling |
| **Selection integration** | Internal event system tied to pdfjs viewer | Emits standard `SELECTION_EVENTS` via `pageEventBus` for contract-level compatibility across extension contexts. |

### Text Layer Renderer (`PdfTextLayerRenderer`)

**File**: `src/features/pdf-translation/core/PdfTextLayerRenderer.js`

**Architecture**:

The renderer positions invisible, selectable text spans over the PDF canvas using percentage-based coordinates derived from the pdfjs viewport transform. For each text item:

1. **Coordinate transform**: Computes a page-to-screen transform matrix from `viewport.rawDims`, then multiplies it with each item's transform to derive screen-space position.
2. **Font sizing**: Derives font height from the transform matrix diagonal. Font size is set via a CSS custom property (`--font-height`) and scaled by the viewport's total scale factor.
3. **Positioning**: Spans are positioned using percentage-based `left` and `top` values relative to page dimensions, accounting for viewport offsets.
4. **Rotation**: Detected via the transform matrix angle and applied via a `--rotate` CSS variable.
5. **Post-render accuracy**: After all spans are in the DOM, a measurement pass compares each span's rendered width against the PDF item's natural width and applies `scaleX()` to correct any discrepancy.

**CSS Strategy** (`PdfPageView.scss`):

- Text spans are **invisible** (`color: transparent`) so the canvas shows through, but remain selectable via `user-select: text`.
- `::selection` uses `background: Highlight; color: transparent` — the native selection highlight is visible without rendering duplicate text.
- `line-height: 1` and normalized spacing ensure predictable layout. `transform-origin: 0% 0%` ensures scaleX expands from the left edge.

---

## Selection Integration

### Context: Why Not WindowsManager?

The PDF viewer runs as an **extension-internal page** (`extension://.../pdf.html`). Content-script features — including WindowsManager, Desktop FAB, and Mobile FAB — are loaded by the content script system and are **never injected into extension pages**. Therefore, the PDF viewer implements its own selection-to-translation flow.

The selection event contract (`SELECTION_EVENTS.GLOBAL_SELECTION_CHANGE`) is **shared** across the extension. On web pages, WindowsManager subscribes to this event. In the PDF viewer, `usePdfSelectionAction` subscribes instead. The payload format is identical, enabling potential future cross-context integration.

### PdfSelectionBridge

**File**: `src/features/pdf-translation/core/PdfSelectionBridge.js`

Bridges native browser text selection within the PDF text layer to the extension's selection event system.

**Flow**:

```
Browser selectionchange
    │
    ▼
PdfSelectionBridge.handleSelectionChange()
    │
    ├── isSelectionInsidePdfTextLayer(selection, viewerRoot)
    │   └── Validates: selection exists, not collapsed, start/end
    │       nodes are inside .textLayer within viewer root
    │
    ├── buildPdfSelectionPayload(selection, viewerRoot)
    │   ├── buildPdfSelectionText() — normalizes \u00A0, trims
    │   └── buildPdfSelectionPosition() — bounding rect + 10px offset
    │
    ├── Signature deduplication (text|x|y|width|height)
    │
    └── pageEventBus.emit(GLOBAL_SELECTION_CHANGE, {
            text, position, mode, options,
            context: { source: 'pdf-viewer', isPdf: true }
        })
            │
            ▼
    usePdfSelectionAction (PDF-specific subscriber)
```

### PdfSelectionAction (PDF-Specific Translation UI)

**Composable**: `src/apps/pdf/composables/usePdfSelectionAction.js`
**Component**: `src/apps/pdf/components/PdfSelectionAction.vue`

Since WindowsManager cannot run in the PDF viewer, `usePdfSelectionAction` provides the selection-to-translation flow:

1. **Listens** to `GLOBAL_SELECTION_CHANGE` and `GLOBAL_SELECTION_CLEAR` on `pageEventBus`.
2. **Stores** selected text and position in local Vue refs.
3. **Renders** a floating translate button (`PdfSelectionAction.vue`) at the selection position.
4. On user click, **sends** a translation request directly via `UnifiedMessaging.sendRegularMessage()` with `TranslationMode.Selection`.
5. **Displays** the translated result (or error) in a positioned popup below the selection.

This is a self-contained, PDF-specific implementation. It does not share components or state with WindowsManager.

### Shared Event Contract

The `PdfSelectionBridge` emits the standard selection event payload:

```javascript
{
    text: string,           // Selected text (normalized)
    position: { x, y, width, height }, // Bounding rect for UI positioning
    mode: SelectionTranslationMode,    // From settings
    options: {},                         // Additional options
    context: {
        source: 'pdf-viewer',           // Identifies PDF origin
        isPdf: true                     // Flag for subscriber filtering
    }
}
```

This matches the contract used by web-page selection detectors (SelectionManager, TextFieldDoubleClickHandler), ensuring architectural consistency across contexts.

---

## Logical Block Model

### What Is a Logical Block?

A **logical block** is the atomic translation unit — a semantically meaningful group of text lines (paragraph, heading, list item, caption, table cell). Blocks are NOT pages, NOT lines, NOT individual words.

### Block Creation Pipeline

```
pdfjs textContent.items
    │
    ▼
PdfLayoutAnalyzer.buildPdfTextLinesFromItems()
    ├── Groups items into lines by vertical proximity (0.75× median font height)
    ├── Computes line bounding boxes, direction, font size
    └── Returns sorted line objects
    │
    ▼
PdfLayoutAnalyzer.resolvePdfReadingOrder()
    ├── Detects column clusters (gap ≥ 18% of page width or 48px)
    ├── Handles RTL (reverses column order)
    └── Assigns readingOrderIndex to each line
    │
    ▼
PdfLayoutAnalyzer.buildPdfLogicalBlocksFromLines()
    ├── Merges consecutive lines by role, column, gap, alignment
    ├── paragraph lines merge at gap ≤ 1.1× font size
    ├── table cells merge at 1.25× tolerance
    └── Returns raw block objects
    │
    ▼
PdfLogicalBlockBuilder.build()
    └── Wraps each block via createPdfLogicalBlock()
        ├── Normalizes text and bounding box
        ├── Computes sourceTextHash (SHA-256)
        ├── Generates deterministic id via createPdfLogicalBlockIdentity()
        └── Returns frozen block structure
```

### Block Identity

Block IDs are **deterministic** and survive across sessions:

```
{documentIdentity}|p{pageNumber}|r:{role}|x:{normalizedX}|y:{normalizedY}|w:{normalizedW}|h:{normalizedH}|t:{textHash}
```

Where normalized values are `[0,1]` relative to page dimensions, and `textHash` is SHA-256 of normalized text.

### Block Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Deterministic identity |
| `documentIdentity` | string | PDF fingerprint or SHA-256 hash |
| `pageNumber` | number | 1-based page number |
| `role` | string | `paragraph`, `heading`, `list-item`, `caption`, `table-cell` |
| `text` | string | Full block text content |
| `sourceTextHash` | string | SHA-256 of normalized text |
| `boundingBox` | `{x, y, width, height}` | Absolute coordinates in PDF units |
| `normalizedBoundingBox` | `{x, y, width, height}` | [0,1] relative to page |
| `lines` | array | Ordered line objects with bounding boxes |
| `columnIndex` | number | Column cluster index |
| `readingOrderIndex` | number | Reading order position |
| `roleMetadata` | object | Role-specific data (font size ratio, pattern matches) |

---

## Translation Pipeline

### Orchestration (`PdfTranslationCoordinator`)

**File**: `src/features/pdf-translation/core/PdfTranslationCoordinator.js`

```
translateVisibleBlocks()
    │
    ├── 1. Increment activeRunId (stale-run detection)
    │
    ├── 2. Get visible logical blocks from session
    │       └── Filter: skip blocks with status === 'translated'
    │
    ├── 3. Resolve provider (mode-specific → global fallback)
    │
    ├── 4. Read settings (source/target language, optimization level)
    │
    ├── 5. Batch planning via PdfTranslationBatchPlanner
    │       ├── Get provider configuration + limits
    │       ├── Convert blocks to provider items
    │       └── Chunk via TranslationBatcher.createIntelligentBatches()
    │
    ├── 6. For each batch:
    │       ├── Mark blocks as 'loading' in session state
    │       ├── Build request via PdfTranslationAdapter
    │       ├── Send via UnifiedMessaging (to background)
    │       ├── Map response back to per-block results
    │       ├── Apply results to session state
    │       └── Notify state change (triggers Vue reactivity)
    │
    └── 7. Return summary: { status, translatedCount, failedCount, totalCount }
```

### Cancellation

Uses **run ID pattern** — a monotonic counter (`activeRunId`) ensures only the latest translation run processes results. Stale runs break out of the processing loop. Active request IDs are tracked for targeted background cancellation.

### Translation Request Format

```javascript
{
    action: MessageActions.TRANSLATE,
    context: MessageContexts.PDF_TRANSLATION,
    data: {
        mode: TranslationMode.PDF,
        text: "block text content",
        // ... provider/language settings
    }
}
```

---

## Bilingual Rendering Model

### Viewer Modes

| Mode | Layout | Description |
|------|--------|-------------|
| `original` | Single pane | PDF canvas with text layer only |
| `bilingual` | Side-by-side | Original pane (left) + Translated pane (right) |
| `translated` | Single pane | Translated blocks only |

### Adaptive Translated Pane

The translated pane (`PdfTranslatedPane` + `PdfTranslatedBlock`) uses **adaptive geometry** — translated text blocks are rendered with flexible sizing because:

- Translated text may expand or contract compared to the source.
- RTL languages require different layout flow.
- Fixed bounding boxes would hurt readability.

The original pane always renders the **pixel-accurate** PDF canvas. Geometry adaptation is only on the translated side.

### PdfTranslatedBlock States

| State | Visual | Description |
|-------|--------|-------------|
| `idle` | Dimmed | Block exists but not yet translated |
| `loading` | Spinner | Translation in progress |
| `translated` | Full text | Translation complete, auto-detects RTL |
| `error` | Error message | Translation failed, shows error info |

---

## OCR Fallback Architecture

### Detection (`PdfOcrDetector`)

A page is classified as a **scanned candidate** when:
- `logicalBlocks.length === 0` (no extractable text blocks)
- AND `textContent.items.length ≤ 5` (minimal text items)
- AND `charCount ≤ 20` (almost no characters)

### Processing (`PdfOcrProcessor`)

```
1. User approves OCR (PdfOcrConsentPrompt)
2. PdfOcrProcessor.processPages(pageNumbers, { language })
   ├── For each page:
   │   ├── Render page to canvas
   │   ├── Call Tesseract.js recognizeStructured()
   │   ├── Primary: _createBlocksFromLines() — uses structured line bboxes
   │   └── Fallback: _createBlocksFromPlainText() — splits by newlines
   └── Report progress via callbacks
3. Results stored as OCR blocks on PdfPageSession
4. Cached via pdfCacheManager.saveOcr()
```

### OCR Block Integration

OCR blocks are stored separately from text-content blocks on `PdfPageSession`. The `getLogicalBlocks()` method returns text-content blocks if available, falling back to OCR blocks. The `allBlocks` getter returns both.

---

## Cache Architecture

### Cache Identity

Cached translations are keyed by:

```
documentIdentity + blockId + sourceTextHash + targetLanguage + provider + translationSettingsHash
```

The `sourceTextHash` validation ensures that if the source text changes (e.g., different PDF version), stale translations are **not** restored.

### Cache Structure

```javascript
{
    documentIdentity: {
        translations: {
            [blockId]: {
                blockId, documentIdentity, pageNumber,
                sourceTextHash, translatedText, status,
                provider, sourceLanguage, targetLanguage,
                translationSettingsHash, updatedAt
            }
        },
        ocr: {
            [pageNumber]: {
                ocrLanguage, ocrBlocks: [...]
            }
        }
    }
}
```

### Restoration Flow

```
loadPdfFile()
    └── restoreFromCache(documentIdentity)
        ├── pdfCacheManager.loadDocument(documentIdentity)
        ├── For each cached translation:
        │   ├── Find block in session by blockId
        │   ├── Validate sourceTextHash matches
        │   └── Apply translation to session state
        └── For each cached OCR entry:
            ├── Find page session by pageNumber
            └── Set OCR blocks
```

---

## History Architecture

### History Entry

```javascript
{
    id: string,           // documentIdentity
    fileName: string,
    totalPages: number,
    translatedBlockCount: number,
    translatedPageCount: number,
    provider: string,
    sourceLanguage: string,
    targetLanguage: string,
    lastOpenedAt: number, // timestamp
    lastTranslatedAt: number // timestamp
}
```

### Behavior

- **On file open**: `updateAfterOpen(session)` — creates or updates entry with filename and page count.
- **After translation**: `updateAfterTranslation(session)` — updates with translation stats, provider, languages.
- **Max 100 entries** — oldest entries are evicted when limit is exceeded.
- **Deduplication** by `documentIdentity` — same document updates in place.

---

## Export Architecture

### Pipeline

```
usePdfExport.exportTxt() / exportMarkdown()
    │
    ├── PdfExportCollector.collectTranslatedBlocks()
    │   └── Returns translated blocks sorted by page + readingOrderIndex
    │
    ├── PdfExportFormatter.buildTxtOutput() / buildMarkdownOutput()
    │   ├── Page separators: "--- Page N ---"
    │   ├── Role-based formatting (headings, lists, captions)
    │   └── Document title header
    │
    └── PdfFileDownloader.downloadFile()
        ├── Create Blob with appropriate MIME type
        ├── Generate filename: "{title}_translated.{ext}"
        └── Trigger browser download via anchor click
```

### Export Stats

Reactive via `translationTick`:
- `totalBlocks`, `translatedCount`, `failedCount`
- `totalPages`, `translatedPageCount`
- `isPartial` (not all blocks translated)
- `hasTranslatedBlocks` (at least one block translated)

---

## Block Targeting

### Interactive Selection Mode

When block targeting is active:
1. User moves pointer over the PDF — the nearest block is highlighted.
2. User clicks — the targeted block is set on `pdfDocumentSession`.
3. Targeting mode deactivates.

### Architecture

```
PdfBlockTargetingManager
    ├── activate() / deactivate()
    ├── handlePointerMove({ pageNumber, x, y })
    │   └── PdfBlockTargetAdapter.findBlockAtPoint()
    │       └── Smallest-area block containing point (6px tolerance)
    ├── handleClick({ pageNumber, x, y })
    │   ├── Find block at point
    │   ├── pdfDocumentSession.setTargetedBlock(blockId)
    │   └── Deactivate targeting
    └── getBlockBounds(blockId)
        └── Returns bounding rect for overlay rendering
```

---

## Storage Model

| Storage Key | Manager | Contents | Lifecycle |
|-------------|---------|----------|-----------|
| `pdfDocumentCache` | `PdfCacheManager` | Per-document translations + OCR results | Persists until user clears |
| `pdfTranslationHistory` | `PdfHistoryManager` | Recently opened/translated documents (max 100) | Persists until user clears |

Both use `storageCore` (extension's unified storage API) for persistence across sessions.

---

## Event Flow

### Selection Event Flow

```
Browser selectionchange
    → PdfSelectionBridge.handleSelectionChange()
        → isSelectionInsidePdfTextLayer()
        → buildPdfSelectionPayload()
        → pageEventBus.emit(GLOBAL_SELECTION_CHANGE)
            → usePdfSelectionAction (PDF subscriber)
                → PdfSelectionAction.vue (floating translate button)
                → User clicks → sendRegularMessage() → Background
```

### Translation Event Flow

```
User clicks "Translate Visible"
    → usePdfViewerController.translateVisiblePages()
        → PdfTranslationCoordinator.translateVisibleBlocks()
            → PdfTranslationBatchPlanner.plan()
            → PdfTranslationAdapter.buildTranslationRequest()
            → UnifiedMessaging.sendRegularMessage()
                → Background script → Provider API
            → PdfTranslationAdapter.mapBatchResponse()
            → session.setBlockTranslationState()
            → onStateChange callback
                → translationTick.value++ (Vue reactivity)
                    → PdfTranslatedPane re-renders
```

### OCR Event Flow

```
User clicks "OCR Scanned Pages"
    → usePdfOcr.requestOcr()
        → PdfOcrDetector.detectScannedPages()
        → Show consent prompt
    → User confirms
    → usePdfOcr.confirmOcr()
        → PdfOcrProcessor.processPages()
            → Per page: render → Tesseract.js → create blocks
        → session.setOcrBlocks()
        → pdfCacheManager.saveOcr()
        → onOcrComplete callback
            → translationTick.value++
```

---

## Cross-Feature Dependencies

| External Module | Used By | Purpose |
|----------------|---------|---------|
| `ResourceTracker` | PdfDocumentSession, PdfSelectionBridge, PdfBlockTargetingManager | Memory-safe event listener / timeout tracking |
| `pageEventBus` + `SELECTION_EVENTS` | PdfSelectionBridge, usePdfSelectionAction | Decoupled selection event system |
| `UnifiedMessaging` | PdfTranslationCoordinator, PdfTranslationAdapter, usePdfSelectionAction | Extension message passing to background |
| `storageCore` | PdfCacheManager, PdfHistoryManager | Persistent storage |
| `settingsManager` | PdfSelectionBridge | Reads selection translation mode |
| `recognizeStructured` | PdfOcrProcessor | Tesseract.js OCR engine |
| `toTesseractLanguageCode` | PdfOcrProcessor | Language code mapping |
| `TranslationBatcher` | PdfTranslationBatchPlanner | Intelligent batch chunking |
| `getProviderConfiguration` | PdfTranslationBatchPlanner | Provider limits and optimization |
| Config functions | PdfTranslationCoordinator, usePdfOcr | Provider, language, optimization settings |
| `pdfjs-dist` | pdfjs.js | PDF parsing and rendering |

---

## Major Design Decisions

### 1. Dedicated Viewer vs. Browser-Native Interception

**Decision**: Build a dedicated PDF viewer inside the extension.

**Rationale**: Browser-native PDF viewing varies across browsers, provides limited control over rendering, cannot integrate bilingual side-by-side layout, cannot cache per-block translations, and cannot provide OCR fallback. A dedicated viewer ensures consistent behavior and full feature control.

### 2. Logical Block as Translation Unit

**Decision**: Translate semantic blocks (paragraphs, headings) rather than pages, lines, or words.

**Rationale**: Blocks preserve context for better translation quality, enable per-block caching with stable identity, reduce provider API cost (fewer requests), and support export with structure (headings, lists, captions).

### 3. Custom Text Layer vs. TextLayerBuilder

**Decision**: Replace pdfjs `TextLayerBuilder` with `PdfTextLayerRenderer`.

**Rationale**: `TextLayerBuilder` imports from `pdfjs-dist/web/pdf_viewer.mjs` (~300KB) and requires `pdf_viewer.css` (~160KB). This would leak into the extension bundle and affect non-PDF pages. The custom renderer is ~130 lines with zero external dependencies, provides post-render `scaleX` measurement for sub-pixel accuracy, and integrates directly with the extension's selection event system.

### 4. Visible Pages Only

**Decision**: Only translate pages currently in the viewport.

**Rationale**: Safer for large PDFs (hundreds of pages), lower API cost, faster initial UX, and better memory profile. Full-document translation can be added as an opt-in feature later.

### 5. Source Text Hash Validation for Cache

**Decision**: Validate `sourceTextHash` before restoring cached translations.

**Rationale**: Prevents displaying stale translations if the source PDF is a different version with the same fingerprint. The hash is computed from normalized text content, making it sensitive to actual text changes while tolerant of formatting differences.

### 6. OCR with Explicit User Consent

**Decision**: OCR requires explicit user approval before processing.

**Rationale**: Tesseract.js OCR is slow and resource-intensive. Users should understand the cost (time, CPU) before initiating. The consent prompt explains what will happen and allows cancellation.

### 7. Stable Block Identity via Normalized Coordinates

**Decision**: Block IDs use normalized bounding boxes (0-1 range) rather than absolute PDF coordinates.

**Rationale**: Normalized coordinates are invariant to PDF version differences, viewer zoom levels, and layout analyzer refinements. Combined with text hashes, this ensures cache stability across sessions.

---

## Known Technical Debt

### 1. Text Layer Rotated/Skewed Text Dimensions

The text layer renderer uses viewport diagonal scale factors for font height computation rather than transformed corner bounding boxes. For most PDFs this is accurate, but rotated or heavily skewed text may have minor positioning offsets. **Impact**: Low — affects a small percentage of PDFs with non-standard rotations.

### 2. No Scroll Synchronization

Original and translated panes scroll independently. Users must manually align corresponding blocks. **Impact**: Medium UX inconvenience for bilingual mode.

### 3. No Cross-Pane Block Highlighting

No visual correspondence between original and translated blocks. **Impact**: Low — users can match blocks by position, but explicit highlighting would improve clarity.

### 4. Flat Feature Module Structure

The `src/features/pdf-translation/core/` directory is flat (all source and test files in one directory) rather than organized into subdirectories (layout/, translation/, cache/, etc.). **Impact**: Low — manageable at current scale but may need restructuring as the feature grows.

### 5. Fixed ASCENT_RATIO

The text layer uses a constant `ASCENT_RATIO = 0.8` for font ascent computation rather than measuring actual font metrics via canvas. **Impact**: Minor positioning offset for fonts with unusual ascent ratios. Could be improved with optional canvas measurement.

---

## Future Extension Points

### 1. Scroll Synchronization

The `PdfViewer` component uses `IntersectionObserver` for page visibility. Scroll position data is available and could be used to synchronize scrolling between original and translated panes.

### 2. Cross-Pane Block Highlighting

Block IDs are stable and shared between panes. A highlight overlay system (similar to `PdfBlockHighlightOverlay`) could be extended to the translated pane to show correspondence.

### 3. Auto-Translation on Open

The translation pipeline is triggered manually but could be extended to auto-translate visible pages after a configurable delay.

### 4. Full-Document Translation

The batch planner and coordinator already support arbitrary page lists. A "translate all pages" mode could iterate through all pages sequentially.

### 5. Translated PDF Regeneration

The export system currently produces TXT/Markdown. A PDF regeneration pipeline (e.g., using pdf-lib) could overlay translated text onto the original PDF.

### 6. Provider-Specific PDF Optimization

The batch planner already supports per-provider overrides via `modeOverrides[TranslationMode.PDF]`. This can be extended with PDF-specific prompt engineering for AI providers.

### 7. Advanced Table Detection

The layout analyzer currently uses gap-based column detection and role classification. More sophisticated table detection (grid analysis, cell merging) could improve table translation quality.

---

**Last Updated**: June 2026
