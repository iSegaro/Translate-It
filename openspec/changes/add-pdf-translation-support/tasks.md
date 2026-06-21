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

- [ ] 3.1 Implement PDF page session and logical block models.
- [ ] 3.2 Add layout analysis and logical block construction for visible pages.
- [ ] 3.3 Define stable block identity and bounding box normalization for cache and export reuse.

## 4. Translation Pipeline

- [ ] 4.1 Add a PDF translation coordinator that batches visible logical blocks through the existing translation system.
- [ ] 4.2 Extend translation mode and message routing so PDF uses UnifiedTranslationService without a separate provider stack.
- [ ] 4.3 Persist and restore block translation state through memory and persistent cache layers.

## 5. Bilingual Viewer

- [ ] 5.1 Build the side-by-side bilingual viewer with an original pixel-accurate pane and an adaptive translated pane.
- [ ] 5.2 Add visible-page-only translation controls, loading states, and cancellation behavior.
- [ ] 5.3 Add page-level navigation and block highlighting for translated results.

## 6. Export MVP

- [ ] 6.1 Implement TXT export for already translated PDF content.
- [ ] 6.2 Implement Markdown export for already translated PDF content.
- [ ] 6.3 Surface partial-export warnings when only some pages or blocks are translated.

## 7. PDF-aware Select Element

- [ ] 7.1 Add a PDF element adapter that maps PDF.js text spans to logical blocks.
- [ ] 7.2 Integrate PDF-aware selection into the Select Element workflow without coupling to DOM translation.
- [ ] 7.3 Add hover/highlight geometry support for PDF block targets.

## 8. OCR Fallback

- [ ] 8.1 Detect missing or unusable text layers and prompt the user before OCR.
- [ ] 8.2 Reuse the existing OCR engine and cache path for PDF fallback recognition.
- [ ] 8.3 Add OCR fallback state, approval handling, and cleanup semantics.

## 9. History and Cache UX

- [ ] 9.1 Add document-level PDF history entries and expose them in the existing history system.
- [ ] 9.2 Implement persistent PDF cache invalidation and reuse keyed by PDF identity, provider, target language, and translation settings.
- [ ] 9.3 Add PDF-specific i18n strings and tests for viewer, cache, export, OCR, and history flows.
