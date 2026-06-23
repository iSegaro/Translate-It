## 1. Viewer Mode Extension

- [ ] 1.1 Add `TRANSLATED_PDF: 'translated-pdf'` constant to `usePdfBilingualMode.js` VIEWER_MODES and update MODE_ORDER.
- [ ] 1.2 Add `isTranslatedPdf` computed property and `showOverlayLayer` computed (true only in `translated-pdf` mode) to `usePdfBilingualMode.js`.
- [ ] 1.3 Add "Translated PDF View" button to `PdfToolbar.vue` modeOptions array.
- [ ] 1.4 Update `PdfViewerLayout.vue` to handle `translated-pdf` mode class (single pane, no translated slot).

## 2. Overlay Layer Component (Phase 1)

- [ ] 2.1 Create `PdfOverlayLayer.vue` component that renders a positioned container over the page stage, receiving `blocks`, `translationStates`, `pageMetric`, and `visible` props.
- [ ] 2.2 Create `PdfBlockOverlayItem.vue` component that renders a single translated block overlay with solid background, translated text, and adaptive font sizing.
- [ ] 2.3 Implement initial adaptive font fitting in `PdfBlockOverlayItem.vue`: measure rendered text, reduce font-size incrementally (proposed: 5% steps, 60% minimum) until text fits or minimum reached.
- [ ] 2.4 Implement RTL detection and `dir` attribute application in `PdfBlockOverlayItem.vue`.
- [ ] 2.5 Add unit tests for `PdfBlockOverlayItem.vue` positioning, font shrinking, and RTL behavior.

## 3. Font Handling (Phase 1)

- [ ] 3.1 Create `pdfFontMap.js` utility with static mapping from common PDF font names to CSS font stacks.
- [ ] 3.2 Update `PdfBlockOverlayItem.vue` to resolve font-family from the font map with generic fallback (no `textContent.styles` dependency in Phase 1).
- [ ] 3.3 Add unit tests for font mapping and font-size calculation.

## 4. Integration (Phase 1)

- [ ] 4.1 Add `PdfOverlayLayer` to `PdfPageView.vue` template, positioned in the stage grid alongside canvas and text layer.
- [ ] 4.2 Pass `translatedPageData`, `translationStates`, `pageMetric`, and `showOverlay` props from `PdfViewer.vue` through to `PdfPageView.vue`.
- [ ] 4.3 Wire `usePdfBilingualMode` overlay visibility into `PdfApp.vue` and `PdfViewer.vue`.
- [ ] 4.4 Ensure `PdfBlockHighlightOverlay` renders above the overlay layer (z-index ordering).
- [ ] 4.5 Add integration test for overlay rendering in `translated-pdf` mode.

## 5. OCR and Edge Cases (Phase 1)

- [ ] 5.1 Verify OCR blocks render correctly in overlay mode (same mechanism as text-content blocks).
- [ ] 5.2 Handle pages with zero translated blocks (overlay layer renders nothing).
- [ ] 5.3 Handle pages where all blocks are errors (no overlay rendered, canvas text visible).
- [ ] 5.4 Test overlay re-rendering on translation state change (loading → translated, loading → error).

## 6. Selection and Interaction (Phase 1)

- [ ] 6.1 Verify native text selection works on overlay DOM elements.
- [ ] 6.2 Ensure overlay layer does not block pointer events for block targeting (pass-through for non-text areas).
- [ ] 6.3 Test block targeting highlight renders correctly with overlay layer active.

## 7. Performance and Polish (Phase 1)

- [ ] 7.1 Add `will-change: transform` CSS property to overlay elements for compositing optimization.
- [ ] 7.2 Verify overlay re-rendering on window resize (page scale change).
- [ ] 7.3 Run ESLint and fix any lint errors.
- [ ] 7.4 Run full PDF test suite and verify no regressions.
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

## 9. Advanced Table Overlay (Phase 2 — Deferred)

- [ ] 9.1 Create `PdfTableOverlayItem.vue` component that parses `\n`-separated translated text into rows, splits rows into cells using gap detection, and renders per-cell overlays at original `item.x`, `item.y` positions.
- [ ] 9.2 Implement cell text overflow handling with independent adaptive font shrinking per cell.
- [ ] 9.3 Handle mismatched cell counts between translated and original rows.
- [ ] 9.4 Add unit tests for `PdfTableOverlayItem.vue` row/cell parsing and positioning.
- [ ] 9.5 Integrate table overlay component into `PdfOverlayLayer.vue` for `table-region` blocks.

## 10. Intelligent Masking (Phase 3 — Deferred)

- [ ] 10.1 Implement background detection for text regions (plain vs. image/chart).
- [ ] 10.2 Apply selective masking only to plain-background regions.
- [ ] 10.3 Add contrast-enhancing techniques (text-shadow, outline) for readability without full occlusion.
- [ ] 10.4 Test with PDFs containing images, charts, and colored backgrounds behind text.

## 11. Export (Phase 4 — Deferred)

- [ ] 11.1 Implement translated PDF export with overlay content baked into output.
- [ ] 11.2 Add export format options (PDF, HTML).
- [ ] 11.3 Surface export progress and completion states.
