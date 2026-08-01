## 1. Viewer Mode Extension

- [x] 1.1 Add `TRANSLATED_PDF: 'translated-pdf'` constant to `usePdfBilingualMode.js` VIEWER_MODES and update MODE_ORDER.
- [x] 1.2 Add `isTranslatedPdf` computed property and `showOverlayLayer` computed (true only in `translated-pdf` mode) to `usePdfBilingualMode.js`.
- [x] 1.3 Add "Translated PDF View" button to `PdfToolbar.vue` modeOptions array.
- [x] 1.4 Update `PdfViewerLayout.vue` to handle `translated-pdf` mode class (single pane, no translated slot).

## 2. Overlay Layer Component (Phase 1)

- [x] 2.1 Create `PdfOverlayLayer.vue` component that renders a positioned container over the page stage, receiving `blocks`, `translationStates`, `pageMetric`, and `visible` props.
- [x] 2.2 Create `PdfBlockOverlayItem.vue` component that renders a single translated block overlay with solid background, translated text, and adaptive font sizing.
- [x] 2.3 Implement initial adaptive font fitting in `PdfBlockOverlayItem.vue`: measure rendered text, reduce font-size incrementally (proposed: 5% steps, 60% minimum) until text fits or minimum reached.
- [x] 2.4 Implement RTL detection and `dir` attribute application in `PdfBlockOverlayItem.vue`.
- [x] 2.5 Add unit tests for `PdfBlockOverlayItem.vue` positioning, font shrinking, and RTL behavior.

## 3. Font Handling (Phase 1)

- [x] 3.1 Create `pdfFontMap.js` utility with static mapping from common PDF font names to CSS font stacks.
- [x] 3.2 Update `PdfBlockOverlayItem.vue` to resolve font-family from the font map with generic fallback (no `textContent.styles` dependency in Phase 1).
- [x] 3.3 Add unit tests for font mapping and font-size calculation.

## 4. Integration (Phase 1)

- [x] 4.1 Add `PdfOverlayLayer` to `PdfPageView.vue` template, positioned in the stage grid alongside canvas and text layer.
- [x] 4.2 Pass `translatedPageData`, `translationStates`, `pageMetric`, and `showOverlay` props from `PdfViewer.vue` through to `PdfPageView.vue`.
- [x] 4.3 Wire `usePdfBilingualMode` overlay visibility into `PdfApp.vue` and `PdfViewer.vue`.
- [x] 4.4 Add integration test for overlay rendering in `translated-pdf` mode.

## 5. OCR and Edge Cases (Phase 1)

- [x] 5.1 Verify OCR blocks render correctly in overlay mode (same mechanism as text-content blocks).
- [x] 5.2 Handle pages with zero translated blocks (overlay layer renders nothing).
- [x] 5.3 Handle pages where all blocks are errors (no overlay rendered, canvas text visible).
- [x] 5.4 Test overlay re-rendering on translation state change (loading → translated, loading → error).

## 6. Selection and Interaction (Phase 1)

- [x] 6.1 Verify native text selection works on overlay DOM elements.

## 7. Performance and Polish (Phase 1)

- [x] 7.1 Add `will-change: transform` CSS property to overlay elements for compositing optimization.
- [x] 7.2 Verify overlay re-rendering on window resize (page scale change).
- [x] 7.3 Run ESLint and fix any lint errors.
- [x] 7.4 Run full PDF test suite and verify no regressions.
- [x] 7.5 Manual smoke test: open PDF, switch to overlay mode, translate visible pages, verify text positioning and selection.

## 8. Font Metadata Propagation (Phase 1.5)

- [x] 8.1 Pass `textContent.styles` from `PdfPageSession.hydrate()` to `buildPdfTextLinesFromItems()` as optional third parameter.
- [x] 8.2 Add optional `styles` parameter to `buildPdfTextLinesFromItems()` and forward to `buildLineFromBucket()`.
- [x] 8.3 In `buildLineFromBucket()`, look up `styles[item.raw.fontName]` per item to get `ascent`, `descent`, `fontFamily`.
- [x] 8.4 Propagate `fontFamily`, `ascent`, `descent` into line output and block `roleMetadata`.
- [x] 8.5 Update `PdfBlockOverlayItem.vue` to use `style.ascent`/`style.descent` for vertical positioning when available, falling back to 0.8.
- [x] 8.6 Update `PdfBlockOverlayItem.vue` to use resolved `fontFamily` from block metadata when available.
- [x] 8.7 Add unit tests for font metadata propagation through the layout analyzer pipeline.
- [x] 8.8 Add integration test verifying overlay uses propagated font metrics when available.

## 9. Structured Block Detection (Phase 2b)

- [x] 9.1 Add `isStructured` flag to `roleMetadata` for blocks detected as table-region, table-cell, schedule-like, or structured-list.
- [x] 9.2 Implement schedule-like block detection: identify repeated column-aligned rows with consistent x-positions and inter-column gaps across consecutive lines.
- [x] 9.3 Gate line-level overlay in `PdfBlockOverlayItem.vue` behind `roleMetadata.isStructured === true` (in addition to existing line count check).
- [x] 9.4 `PdfOverlayLayer` passes the full `block` object directly, so `roleMetadata.isStructured` is available without changes.
- [x] 9.5 Add unit tests for schedule-like detection and structured block flag propagation.
- [x] 9.6 Add integration tests verifying line overlay activates only for structured blocks and stays off for paragraphs.

## 10. Cell-Level Overlay (Phase 2c)

> **Decision**: Proportional text splitting was rejected. Cell overlay uses per-cell provider items from `PdfTranslationAdapter`, with `translatedCells` passed through the coordinator to session state.

- [x] 10.1 Create `PdfCellOverlayItem.vue` component that renders individual cells at original item positions with independent font fitting.
- [x] 10.2 Create `PdfLineOverlayItem.vue` component for line-level overlay of structured blocks without multi-cell data.
- [x] 10.3 Implement `useCellOverlay` / `useLineOverlay` mode selection in `PdfBlockOverlayItem.vue` based on `translatedCells`, `isStructured`, and line count.
- [x] 10.4 Implement `cellOverlayData` computation with `CELL_GAP_EXPANSION_RATIO = 0.4` for inter-cell gap expansion.
- [x] 10.5 Implement minimum cell height floor using `fontSize * 0.8` for zero-height pdf.js items.
- [x] 10.6 Implement partial `translatedCells` fallback: structured blocks with partial translations render cell mode for translated lines, source text fallback for untranslated lines.
- [x] 10.7 Add unit tests for cell overlay positioning, cell height floor, and partial translatedCells fallback.
- [ ] 10.8 Complex KPI/table reconstruction for perfect column alignment (deferred — see Phase 2d).

## 11. Sampled Background Masking (Phase 3 MVP)

> **Decision**: Full intelligent masking deferred. MVP uses canvas pixel sampling to determine actual background color per block, replacing hardcoded white with sampled color.

- [x] 11.1 Create `pdfCanvasSampler.js` with multi-point canvas pixel sampling (7-point: center, 4 corners at 20% inset, mid-left, mid-right).
- [x] 11.2 Implement neighbor-based text-pixel filtering (dark sample + light neighbor → text pixel, excluded from average).
- [x] 11.3 Implement per-block color cache keyed by `${blockId}:${scale}`, cleaned on `onBeforeUnmount`.
- [x] 11.4 Integrate canvas sampling into `PdfBlockOverlayItem.vue` via `sampleCanvasBackgroundColor()`.
- [x] 11.5 Wrap `canvas.getContext('2d')` in try/catch for SecurityError on tainted canvases.
- [ ] 11.6 Full intelligent masking for plain-background regions (deferred).
- [ ] 11.7 Contrast-enhancing techniques — text-shadow, outline (deferred).

## 12. Export (Phase 4)

- [x] 12.1 Implement TXT export with page separators and role-aware formatting (existing — `PdfExportCollector` + `PdfExportFormatter`).
- [x] 12.2 Implement Markdown export with headings, lists, and captions (existing).
- [x] 12.3 Implement HTML export MVP: self-contained HTML with embedded canvas page images + positioned translated block overlays (`buildHtmlOutput`, `exportHtml`).
- [x] 12.4 Add "Export HTML" button to toolbar with event wiring through `PdfApp.vue`.
- [x] 12.5 Implement canvas dataURL collection via `PdfViewer.collectCanvasDataUrls()` with JPEG compression (quality 0.85) and try/catch for tainted canvases.
- [x] 12.6 RTL detection in HTML export with `dir="rtl"` on RTL text blocks.
- [x] 12.7 HTML escape for XSS prevention in translated text.
- [ ] 12.8 True PDF export via pdf-lib with selectable text (deferred).
- [ ] 12.9 Print-to-PDF helper (deferred).
- [ ] 12.10 Export progress indicator and large document streaming (deferred).

## 13. Diagnostics Harness (DEV-only)

- [x] 13.1 Create `src/apps/pdf/debug/pdfOverlayDiagnostics.js` with `buildPageReport()`, `dumpCurrentPage()`, `dumpAllPages()`.
- [x] 13.2 Register on `globalThis.__PDF_OVERLAY_DIAGNOSTICS__` for console access.
- [x] 13.3 Dynamic import in `PdfApp.vue` in dev mode only (`import.meta.env.DEV`).
- [x] 13.4 Trace extraction → adapter → translation → overlay render pipeline per block with warning detection.
- [x] 13.5 Add tests for diagnostics report structure, cell mode detection, and partial translatedCells warnings.
