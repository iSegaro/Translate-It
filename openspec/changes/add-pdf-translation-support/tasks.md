## 1. PDF Viewer Foundation

- [x] 1.1 Add a dedicated `src/apps/pdf` Vue application entry, HTML bootstrap, and viewer shell.
- [x] 1.2 Wire the internal PDF viewer page into Vite build inputs, manifest generation, and extension-page routing.
- [x] 1.3 Add PDF.js asset handling, packaging, and runtime path resolution for the dedicated viewer.
- [x] 1.4 Add manual PDF open/load controls inside the viewer surface only.

## 2. Text Selection Integration

- [x] 2.1 Add PDF text-layer selection support that reuses the existing text selection workflows.
- [x] 2.2 Ensure selected PDF text can trigger translation and TTS actions without DOM-page assumptions.
- [x] 2.3 Add cleanup and ResourceTracker hooks for PDF text-layer listeners and viewer lifecycles.

## 3. Layout and Logical Blocks

- [x] 3.1 Implement PDF page session and logical block models.
- [x] 3.2 Add layout analysis and logical block construction for visible pages.
- [x] 3.3 Define stable block identity and bounding box normalization for cache and export reuse.

## 4. Translation Pipeline

- [x] 4.1 Add a PDF translation coordinator that batches visible logical blocks through the existing translation system.
- [x] 4.2 Extend translation mode and message routing so PDF uses UnifiedTranslationService without a separate provider stack.
- [x] 4.3 Maintain in-memory PDF block translation state for the active document session; defer persistent cache persistence and restore to Phase 9.

## 5. Bilingual Viewer

- [x] 5.1 Build the side-by-side bilingual viewer with an original pixel-accurate pane and an adaptive translated pane.
- [x] 5.2 Add visible-page-only translation controls, loading states, and cancellation behavior.
- [x] 5.3 Add status-based translated block rendering with idle/loading/translated/error visual states.

### Deferred from Phase 5

The following items are deferred to future phases:

- Scroll synchronization between original and translated panes
- Cross-pane block highlighting (original ↔ translated block correspondence)
- Page-level navigation system for translated content

## 6. Export MVP

- [x] 6.1 Implement TXT export for already translated PDF content.
- [x] 6.2 Implement Markdown export for already translated PDF content.
- [x] 6.3 Surface partial-export warnings when only some pages or blocks are translated.

## 7. PDF-aware Select Element

- [x] 7.1 Add a PDF block target adapter that maps pointer coordinates to logical blocks.
- [x] 7.2 Integrate PDF block targeting into the viewer without coupling to DOM Select Element translation.
- [x] 7.3 Add hover/highlight geometry support for PDF block targets in original and translated panes.

## 8. OCR Fallback

- [x] 8.1 Detect missing or unusable text layers and prompt the user before OCR.
- [x] 8.2 Reuse the existing OCR engine and cache path for PDF fallback recognition.
- [x] 8.3 Add OCR fallback state, approval handling, and cleanup semantics.

## 9. History and Cache UX

- [x] 9.1 Add document-level PDF history entries in an isolated PDF history store.
- [x] 9.2 Implement persistent PDF cache invalidation and reuse keyed by PDF identity, provider, target language, and translation settings.
- [x] 9.3 Add focused tests for PDF cache, history, coordinator filtering, and OCR cache persistence.
