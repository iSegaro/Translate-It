## Context

The PDF viewer currently supports four modes: Original (raw PDF rendering), Bilingual (side-by-side original + translated text panel), Translated (translated text panel only, no PDF canvas), and Translated PDF View (original PDF canvas with translated text overlays). All four are implemented via `usePdfBilingualMode.js` (4 mode constants) and `PdfViewerLayout.vue` (CSS grid layout switching).

The existing infrastructure provides:
- `PdfLogicalBlock` with `boundingBox` (page coordinates), `normalizedBoundingBox` (0-1), `roleMetadata.fontSize`, `roleMetadata.fontFamily`, `roleMetadata.ascent`, `roleMetadata.descent`, `roleMetadata.isStructured`, `lines[]` with per-line bounding boxes and item geometry.
- `PdfDocumentSession.translationStates` storing `translatedText` and `translatedCells` per block ID.
- `PdfTranslationAdapter` emitting per-cell provider items for structured blocks with `translatedCells` in the response.
- `PdfBlockHighlightOverlay` demonstrating coordinate-based positioning over the canvas.
- `PdfTextLayerRenderer` showing how to position elements at page coordinates.
- `PdfCacheManager` with block-based translation cache reusable across modes.
- Table detection via `isTableLikeLine()` producing `table-cell` and `table-region` roles.
- Font metadata propagation from `textContent.styles` through `PdfLayoutAnalyzer` into block `roleMetadata`.
- Canvas background sampling via `pdfCanvasSampler.js` for per-block background color detection.

The canvas renders at `Math.floor(viewport.width) × Math.floor(viewport.height)` CSS pixels. The text layer and overlay must share this coordinate space.

**Critical architectural fact**: The text layer spans have `color: transparent`. The visual text users see comes entirely from the canvas rendering (`page.render()`). The text layer exists only for selection hit-testing. Original text cannot be "hidden" by manipulating the text layer — it lives on the canvas.

## Goals / Non-Goals

**Goals:**

- Add a "Translated PDF View" mode that renders translated text over the original PDF canvas.
- Preserve original page geometry: images, tables, spacing, and layout remain visible via the unchanged canvas.
- Position translated blocks at the same coordinates as their source blocks.
- Support adaptive font shrinking when translated text overflows block boundaries.
- Support RTL text direction in overlay rendering.
- Support OCR-processed pages (OCR blocks already integrate with the translation pipeline).
- Allow selection of translated overlay text.
- Reuse existing translation cache, translation pipeline, and translation state.
- Keep existing Original, Bilingual, and Translated modes unchanged.
- Support line-level and cell-level overlay for structured (table) blocks.
- Sample actual canvas background color per block for accurate overlay masking.
- Export translated content as TXT, Markdown, or self-contained HTML.

**Non-Goals (deferred):**

- True PDF export via pdf-lib (deferred to future phase).
- Print-to-PDF automation (deferred).
- Complex KPI/table reconstruction for perfect column alignment (deferred — see Phase 2d).
- Intelligent full-page background masking beyond per-block canvas sampling (deferred).
- Export progress indicator and large document streaming (deferred).
- Do not guarantee pixel-perfect font matching between PDF embedded fonts and browser system fonts (known limitation).

## Decisions

### D1: Overlay rendering over PDF regeneration

**Decision**: Render translated text as DOM overlays positioned over the original PDF canvas.

**Rationale**: PDF regeneration requires re-rendering the entire page (images, vectors, fonts) which is computationally expensive, requires access to the full PDF rendering pipeline, and produces a static output that cannot adapt to window resizing. Overlay rendering reuses the existing canvas (unchanged) and adds lightweight DOM elements only where translations exist. This is faster, reversible, and maintains the original visual fidelity for non-text elements.

### D2: Sampled background masking (Phase 3 MVP)

**Decision**: Sample canvas pixels at block bounding-box positions to determine actual PDF background color instead of always using solid white.

**Implementation**: `pdfCanvasSampler.js` performs 7-point multi-sampling (center, 4 corners at 30% inset, mid-left, mid-right), applies neighbor-based text-pixel filtering (dark sample + light neighbor → text pixel, excluded), averages remaining light samples, and falls back to white. Near-white bias correction: when ≥ 2 sampled pixels have luminance ≥ 245, the background is forced to white to prevent gray anti-aliased edge pixels from corrupting white-background detection. Per-block color cache keyed by `${blockId}:${scale}`.

**Known limitation**: Canvas `getContext('2d')` may throw `SecurityError` on tainted canvases — handled with try/catch fallback to white.

**Future**: Full intelligent masking that detects plain-background regions and applies selective occlusion, or uses contrast-enhancing techniques (text-shadow, outline) without full background fills.

### D3: Block-level overlay, not span-level

**Decision**: Render one overlay per `LogicalBlock`, not per text span or per line (for non-structured blocks).

**Rationale**: The translation pipeline operates at the block level. Each block has a single translated text result. Splitting into per-line or per-span overlays would require re-parsing the translated text and introducing rendering complexity without translation-level benefit. Block-level overlays align with the translation unit and keep the rendering model simple.

### D4: Cell-level overlay for structured blocks

**Decision**: For structured blocks (`isStructured === true`), render per-cell overlays using `translatedCells` from the adapter, with source-text fallback for untranslated lines.

**Implementation**: `PdfBlockOverlayItem.vue` selects between three modes:
- `cell` — when `translatedCells` has multi-cell lines and block is structured
- `line` — when `translatedLines.length === sourceLineCount` and block is structured
- `block` — fallback for all other cases

Cell positioning uses `CELL_GAP_EXPANSION_RATIO = 0.4` to extend cells 40% into inter-column gaps. Minimum cell height is enforced as `fontSize * 0.8` for zero-height pdf.js items.

**Known limitation**: Complex KPI/table PDFs with irregular column layouts, spanning cells, or mixed role lines within a table-region may still have imperfect column reconstruction. This is deferred to Phase 2d.

### D5: Adaptive font fitting via iterative measurement

**Decision**: When translated text overflows a block's bounding box, iteratively reduce font-size until the text fits.

**Implementation**: `usePdfTextFitter` composable measures rendered text via `getBoundingClientRect()` and reduces font-size in 5% decrements (minimum 60% of original). Applied to block, line, and cell overlay items.

### D6: Font metadata propagation (Phase 1.5)

**Decision**: Pass `textContent.styles` from `PdfPageSession.hydrate()` through `buildPdfTextLinesFromItems()` into `buildLineFromBucket()`, look up `ascent`/`descent`/`fontFamily` per item by `fontName`, and propagate into block `roleMetadata`.

**Rationale**: The propagation is additive (new optional parameter with `= null` default), backward-compatible, and enables precise vertical positioning and better font matching in overlay rendering.

### D7: OCR blocks use same overlay mechanism

**Decision**: OCR blocks (`source: 'ocr'`) use the same overlay rendering as text-content blocks. No special handling needed.

### D8: Selection via native browser selection on overlay DOM

**Decision**: Translated overlay text is selectable via native browser text selection (`user-select: text`). No custom selection logic needed.

### D9: Mode architecture — 4 modes, clean extension

**Decision**: Add `'translated-pdf'` as a fourth mode value in `usePdfBilingualMode.js`, alongside existing `original`, `bilingual`, `translated`.

### D10: HTML export (Phase 4a MVP)

**Decision**: Export translated PDF as self-contained HTML with embedded canvas page images (`canvas.toDataURL('image/jpeg', 0.85)`) and absolutely-positioned translated block divs.

**Rationale**: Zero new dependencies. Canvas is not tainted (local File object). HTML preserves spatial layout, text selection, and RTL direction. Users can print-to-PDF from browser for a true PDF output.

**Known limitation**: Large multi-page documents may produce sizeable HTML files due to embedded base64 images.

### D11: HTML export RTL detection

**Decision**: Detect RTL in `buildHtmlOutput()` by counting RTL Unicode characters vs LTR characters with global regex matching. Apply `dir="rtl"` on block divs where RTL character count exceeds LTR.

### D12: Partial translatedCells rendering

**Decision**: Structured blocks with partial `translatedCells` (only some lines translated) render in cell mode. Lines without translations fall back to source `item.text`. This prevents silent block-fallback for partially-translated table-region blocks.

### D13: List-item continuation merging

**Decision**: Allow paragraph lines to merge into active list-item blocks in `canAppendLineToBlock()` when they represent wrapped continuation text.

**Implementation**: In `PdfLayoutAnalyzer.js`, the list-item branch of `canAppendLineToBlock()` permits appending when: (1) vertical gap ≤ fontSize × 1.1, and (2) line x is within the list-item's first 50% width range. Heading and caption singleton behavior unchanged.

**Rationale**: Without this, wrapped bullet items get split into a list-item block followed by separate paragraph blocks for continuation lines, producing fragmented translation output.

### D14: Numeric list-marker year guard

**Decision**: Prevent 4+ digit leading numbers (e.g., years) from being classified as list items unless they have explicit list punctuation.

**Implementation**: `isListItemText()` delegates to `isNumericListMarker()` helper. Rule: 1-3 digit main number → always list marker. 4+ digits → only if followed by `.` or `)`, or wrapped in parentheses.

**Rationale**: PDFs frequently contain year-like text ("2029 onwards") that should be paragraph, not list-item. Without this guard, year-starting lines produce spurious bullet formatting in the bilingual viewer.

## Risks / Trade-offs

- **Font fidelity**: Browser fallback fonts will not match PDF embedded fonts exactly. Mitigated by font metadata propagation and static font-family mapping.
- **Complex table alignment**: Irregular KPI/table PDFs with spanning cells, mixed roles, or non-uniform column spacing may render imperfectly. Documented as deferred Phase 2d.
- **OCR block positioning**: OCR blocks may have less precise bounding boxes. Mitigated by same overlay mechanism — no special case.
- **Performance**: Dense pages may render 50+ overlay divs. Mitigated by only overlaying translated blocks and using `will-change: transform`.
- **Canvas sampling SecurityError**: Tainted canvases (future cross-origin PDF sources) may fail `getContext('2d')`. Mitigated by try/catch fallback to white.
- **HTML export size**: Multi-page documents with embedded JPEG canvas images can produce large files. Acceptable for MVP.
- **Partial translation rendering**: Table-region blocks where only some lines are translated render a mix of translated cells and source text. This is visually imperfect but prevents full block-fallback.

## Phased Rollout

### Phase 1 (MVP): Basic Block Overlay — COMPLETE

- Paragraph, heading, list, caption, and OCR block overlay
- Adaptive font shrinking
- RTL support
- Text selection
- 4th viewer mode
- Font-size from `roleMetadata.fontSize`, hardcoded 0.8 ascent ratio, static font-family mapping

### Phase 1.5: Font Metadata Propagation — COMPLETE

- Pass `textContent.styles` from `PdfPageSession.hydrate()` through layout analyzer
- Propagate `fontFamily`/`ascent`/`descent` into line and block `roleMetadata`
- Use precise font metrics in overlay rendering

### Phase 2a: Line-Level Overlay — COMPLETE

- Render each source line as a positioned overlay for structured blocks
- Block container positioned at `block.boundingBox`; each line positioned relative to block origin

### Phase 2b: Structured Block Detection — COMPLETE

- Detect schedule-like, table-region, table-cell blocks via `isTableLikeLine()` and `isScheduleLikeBlock()`
- Gate line/cell overlay behind `roleMetadata.isStructured === true`

### Phase 2c: Cell-Level Overlay — COMPLETE

- Per-cell overlay via `translatedCells` from adapter
- `PdfCellOverlayItem` and `PdfLineOverlayItem` components
- `CELL_GAP_EXPANSION_RATIO = 0.4` for inter-cell gap handling
- Minimum cell height floor for zero-height pdf.js items
- Partial translatedCells fallback

### Phase 2d: Complex Table Reconstruction — DEFERRED

- Perfect column alignment for KPI/table PDFs with irregular layouts
- Spanning cells, mixed role lines within table-region blocks
- Non-uniform column spacing

### Phase 3: Intelligent Masking — MVP COMPLETE (Full Deferred)

- **MVP**: Canvas pixel sampling per block via `pdfCanvasSampler.js` with 30% inset sampling, near-white bias correction (≥ 2 luminance ≥ 245 → white), and text-pixel exclusion
- **Deferred**: Full-page intelligent masking, text-shadow/outline contrast enhancement

### Phase 4: Export — HTML MVP COMPLETE (PDF Deferred)

- **Complete**: TXT export, Markdown export, HTML export MVP
- **Deferred**: True PDF export via pdf-lib, print-to-PDF helper, export progress/streaming

### Phase 5: Diagnostics — COMPLETE

- DEV-only diagnostics harness (`pdfOverlayDiagnostics.js`)
- `window.__PDF_OVERLAY_DIAGNOSTICS__.dumpCurrentPage()` console API
- Full pipeline trace: extraction → adapter → translation → overlay render
