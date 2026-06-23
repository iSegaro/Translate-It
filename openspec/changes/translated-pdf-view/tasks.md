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
- [x] 4.4 Ensure `PdfBlockHighlightOverlay` renders above the overlay layer (z-index ordering).
- [x] 4.5 Add integration test for overlay rendering in `translated-pdf` mode.

## 5. OCR and Edge Cases (Phase 1)

- [x] 5.1 Verify OCR blocks render correctly in overlay mode (same mechanism as text-content blocks).
- [x] 5.2 Handle pages with zero translated blocks (overlay layer renders nothing).
- [x] 5.3 Handle pages where all blocks are errors (no overlay rendered, canvas text visible).
- [x] 5.4 Test overlay re-rendering on translation state change (loading → translated, loading → error).

## 6. Selection and Interaction (Phase 1)

- [x] 6.1 Verify native text selection works on overlay DOM elements.
- [x] 6.2 Ensure overlay layer does not block pointer events for block targeting (pass-through for non-text areas).
- [x] 6.3 Test block targeting highlight renders correctly with overlay layer active.

## 7. Performance and Polish (Phase 1)

- [x] 7.1 Add `will-change: transform` CSS property to overlay elements for compositing optimization.
- [x] 7.2 Verify overlay re-rendering on window resize (page scale change).
- [x] 7.3 Run ESLint and fix any lint errors.
- [x] 7.4 Run full PDF test suite and verify no regressions.
- [ ] 7.5 Manual smoke test: open PDF, switch to overlay mode, translate visible pages, verify text positioning and selection.

## 8. Font Metadata Propagation (Phase 1.5 — Deferred)

- [ ] 8.1 Pass `textContent.styles` from `PdfPageSession.hydrate()` to `buildPdfTextLinesFromItems()` as optional third parameter.
- [ ] 8.2 Add optional `styles` parameter to `buildPdfTextLinesFromItems()` and forward to `buildLineFromBucket()`.
- [ ] 8.3 In `buildLineFromBucket()`, look up `styles[item.raw.fontName]` per item to get `ascent`, `descent`, `fontFamily`.
- [ ] 8.4 Propagate `fontFamily`, `ascent`, `descent` into line output and block `roleMetadata`.
- [ ] 8.5 Update `PdfBlockOverlayItem.vue` to use `style.ascent`/`style.descent` for vertical positioning when available, falling back to 0.8.
- [ ] 8.6 Update `PdfBlockOverlayItem.vue` to use resolved `fontFamily` from block metadata when available.
- [ ] 8.7 Add unit tests for font metadata propagation through the layout analyzer pipeline.
- [ ] 8.8 Add integration test verifying overlay uses propagated font metrics when available.

## 9. Structured Block Detection (Phase 2b)

> **Decision**: Proportional text splitting was rejected. Line-level overlay must NOT activate for plain paragraphs — only for explicitly structured blocks (table-region, table-cell, schedule-like, structured-list). Splitting translated text proportionally across source lines corrupts prose and produces misleading rendering.

- [x] 9.1 Add `isStructured` flag to `roleMetadata` for blocks detected as table-region, table-cell, schedule-like, or structured-list.
- [x] 9.2 Implement schedule-like block detection: identify repeated column-aligned rows with consistent x-positions and inter-column gaps across consecutive lines.
- [x] 9.3 Gate line-level overlay in `PdfBlockOverlayItem.vue` behind `roleMetadata.isStructured === true` (in addition to existing line count check).
- [x] 9.4 ~~Update `PdfOverlayLayer.vue` to pass structured metadata through to overlay items.~~ Already complete — `PdfOverlayLayer` passes the full `block` object directly, so `roleMetadata.isStructured` is available without any changes.
- [x] 9.5 Add unit tests for schedule-like detection and structured block flag propagation.
- [ ] 9.6 Add integration tests verifying line overlay activates only for structured blocks and stays off for paragraphs.

## 10. Advanced Table Overlay (Phase 2c — Deferred)

- [ ] 10.1 Create `PdfTableOverlayItem.vue` component that parses `\n`-separated translated text into rows, splits rows into cells using gap detection, and renders per-cell overlays at original `item.x`, `item.y` positions.
- [ ] 10.2 Implement cell text overflow handling with independent adaptive font shrinking per cell.
- [ ] 10.3 Handle mismatched cell counts between translated and original rows.
- [ ] 10.4 Add unit tests for `PdfTableOverlayItem.vue` row/cell parsing and positioning.
- [ ] 10.5 Integrate table overlay component into `PdfOverlayLayer.vue` for `table-region` blocks.

## 11. Intelligent Masking (Phase 3 — Deferred)

- [ ] 11.1 Implement background detection for text regions (plain vs. image/chart).
- [ ] 11.2 Apply selective masking only to plain-background regions.
- [ ] 11.3 Add contrast-enhancing techniques (text-shadow, outline) for readability without full occlusion.
- [ ] 11.4 Test with PDFs containing images, charts, and colored backgrounds behind text.

## 12. Export (Phase 4 — Deferred)

- [ ] 12.1 Implement translated PDF export with overlay content baked into output.
- [ ] 12.2 Add export format options (PDF, HTML).
- [ ] 12.3 Surface export progress and completion states.
