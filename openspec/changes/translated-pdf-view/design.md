## Context

The PDF viewer currently supports three modes: Original (raw PDF rendering), Bilingual (side-by-side original + translated text panel), and Translated (translated text panel only, no PDF canvas). All three are implemented via `usePdfBilingualMode.js` (3 mode constants) and `PdfViewerLayout.vue` (CSS grid layout switching).

The existing infrastructure provides:
- `PdfLogicalBlock` with `boundingBox` (page coordinates), `normalizedBoundingBox` (0-1), `roleMetadata.fontSize`, `lines[]` with per-line bounding boxes.
- `PdfDocumentSession.translationStates` storing translated text per block ID.
- `PdfBlockHighlightOverlay` demonstrating coordinate-based positioning over the canvas.
- `PdfTextLayerRenderer` showing how to position elements at page coordinates using percentage-based CSS.
- `PdfCacheManager` with block-based translation cache reusable across modes.
- Table detection via `isTableLikeLine()` producing `table-cell` and `table-region` roles.

The canvas renders at `Math.floor(viewport.width) × Math.floor(viewport.height)` CSS pixels. The text layer and overlay must share this coordinate space.

**Critical architectural fact**: The text layer spans have `color: transparent` (`PdfPageView.scss:17`). The visual text users see comes entirely from the canvas rendering (`page.render()`). The text layer exists only for selection hit-testing. This means original text cannot be "hidden" by manipulating the text layer — it lives on the canvas.

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

**Non-Goals (Phase 1):**

- Do not regenerate or modify the PDF file.
- Do not modify the canvas rendering.
- Do not introduce a new translation architecture or provider system.
- Do not implement translated-text search.
- Do not implement PDF export.
- Do not implement cell-level table overlay rendering (Phase 2).
- Do not implement intelligent background-aware masking (Phase 3).
- Do not guarantee pixel-perfect font matching between PDF embedded fonts and browser system fonts.

## Decisions

### D1: Overlay rendering over PDF regeneration

**Decision**: Render translated text as DOM overlays positioned over the original PDF canvas.

**Rationale**: PDF regeneration requires re-rendering the entire page (images, vectors, fonts) which is computationally expensive, requires access to the full PDF rendering pipeline, and produces a static output that cannot adapt to window resizing. Overlay rendering reuses the existing canvas (unchanged) and adds lightweight DOM elements only where translations exist. This is faster, reversible, and maintains the original visual fidelity for non-text elements.

**Alternatives considered**:
- PDF regeneration (rejected: too expensive, loses interactive features, requires full rendering pipeline access).
- Canvas-based text rendering (rejected: loses text selection, accessibility, and requires manual font rendering).
- CSS `mix-blend-mode` masking (rejected: unreliable cross-browser, cannot selectively hide text regions).

### D2: No background masking in Phase 1 — solid background per overlay block

**Decision**: Do NOT attempt to mask or hide original canvas text in Phase 1. Each overlay block renders with a solid background (matching page background color) behind the translated text, improving readability against the canvas without occluding non-text content.

**Rationale**: The original text lives on the canvas (`page.render()`), not the text layer. A masking approach that draws rectangles over text regions would also occlude images, charts, colored backgrounds, and any visual content behind the text. This is a significant visual regression for PDFs with figures or styled content. A solid background per overlay block achieves readable translated text without the occlusion risk.

**Known limitation**: Original canvas text remains partially visible underneath the overlay. The solid background of each overlay block covers the text directly behind it, but gaps between blocks may show original text. This is acceptable for MVP.

**Future (Phase 3)**: Intelligent masking that detects plain-background regions and applies selective occlusion, or uses contrast-enhancing techniques (text-shadow, outline) without full background fills.

### D3: Block-level overlay, not span-level

**Decision**: Render one overlay per `LogicalBlock`, not per text span or per line.

**Rationale**: The translation pipeline operates at the block level. Each block has a single translated text result. Splitting into per-line or per-span overlays would require re-parsing the translated text and introducing rendering complexity without translation-level benefit. Block-level overlays align with the translation unit and keep the rendering model simple.

**Trade-off**: Multi-line blocks may have text that wraps differently in the overlay than in the original. Adaptive font shrinking mitigates this.

### D4: Table-region translation with simple overlay in Phase 1

**Decision**: In Phase 1, render `table-region` blocks as single overlay blocks (same as paragraphs). Cell-aware rendering is deferred to Phase 2.

**Rationale**: Reverse-parsing translated `\n`-separated text back into cells is unreliable because:
- Translation providers may normalize whitespace (collapse spaces, add/remove newlines)
- RTL languages may reorder content
- Some providers add introductory text or reformat
- The gap detection threshold used for original items may not apply to translated text

The cell-aware rendering approach (parsing translated text back into cells using gap detection) is fragile and should only be attempted after the basic overlay is proven stable.

**Phase 2 addition**: Cell-aware table overlay using `line.items[]` geometry, with the same gap-detection parsing used in `isTableLikeLine()` applied to translated text.

### D5: Adaptive font fitting via iterative measurement

**Decision**: When translated text overflows a block's bounding box, iteratively reduce font-size until the text fits.

**Proposed initial implementation**: Reduce font-size by 5% increments (minimum 60% of original). This is an implementation choice, not a formal requirement — the spec mandates adaptive fitting strategy, not specific parameters.

**Implementation**: After rendering the overlay text, measure its rendered width/height via `getBoundingClientRect()`. If it exceeds the block bounds, reduce font-size incrementally and re-measure. Stop when text fits or minimum is reached.

**Rationale**: This is the simplest approach that handles variable-length translations across languages. More sophisticated approaches (line-break analysis, hyphenation) add complexity without proportional benefit for MVP.

**Known limitation**: Very long translations may shrink to near-unreadable sizes. This is documented as expected behavior for extreme cases.

### D6: Font handling — Phase 1 uses existing fontSize with fallback, exact metrics deferred

**Decision (Phase 1)**: Use `roleMetadata.fontSize` (already available in `PdfLogicalBlock`) as the overlay font-size. Use hardcoded 0.8 ascent ratio for vertical positioning. Use a static font-family mapping table with generic fallback. Accept that browser fallback fonts will differ from PDF embedded fonts.

**Rationale**: pdf.js `textContent.styles` provides `ascent`, `descent`, and `fontFamily` per font name. However, these values are NOT currently propagated through `PdfLayoutAnalyzer` into `PdfLogicalBlock` metadata. The propagation is straightforward (~15 lines across 4 files) but touches the shared `buildPdfTextLinesFromItems()` → `buildLineFromBucket()` code path used by all block-building. Shipping this change in Phase 1 adds regression risk to the layout analyzer without proportional benefit for initial overlay rendering.

**Phase 1 font approach**:
- Font-size: `roleMetadata.fontSize × pageMetric.scale` (already available)
- Vertical positioning: `fontHeight × 0.8` (hardcoded, matches existing text layer behavior)
- Font family: static mapping table (`"Times-Roman"` → `"Times New Roman", Times, serif`, etc.) with generic fallback
- Horizontal correction: `scaleX` per block (measured post-render)

**Font metadata propagation (deferred to Phase 1.5)**: Add optional `styles` parameter to `buildPdfTextLinesFromItems()`, look up `styles[item.fontName]` per item, propagate `fontFamily`/`ascent`/`descent` into line and block metadata. This is additive (new optional parameter with `= null` default), backward-compatible, and testable in isolation.

**Known limitation**: Font drift of 1-3px per block is expected and acceptable for MVP. Vertical positioning uses 0.8 fallback instead of exact ascent — this is adequate for most standard PDFs and will be improved when font metadata propagation ships.

### D7: OCR blocks use same overlay mechanism

**Decision**: OCR blocks (`source: 'ocr'`) use the same overlay rendering as text-content blocks.

**Rationale**: OCR blocks already have `boundingBox` in page coordinates and are stored in `pageSession.ocrBlocks[]`. They integrate with `getLogicalBlocks()` and the translation pipeline. No special handling is needed — the overlay renders them identically to text-content blocks.

### D8: Selection via native browser selection on overlay DOM

**Decision**: Translated overlay text is selectable via native browser text selection (the overlay spans are regular DOM elements with `user-select: text`).

**Rationale**: The overlay layer is a regular DOM tree positioned over the canvas. Browser text selection works on DOM elements natively. No custom selection logic is needed for the overlay layer itself.

**Known limitation**: Selection may include both overlay text and underlying canvas text if the masking is incomplete. This is acceptable for MVP.

### D9: Mode architecture — 4 modes, clean extension

**Decision**: Add `'translated-pdf'` as a fourth mode value in `usePdfBilingualMode.js`, alongside existing `original`, `bilingual`, `translated`.

**Rationale**: The existing `translated` mode is a real user-visible mode (in the toolbar, clickable by users) that shows ONLY the `PdfTranslatedPane` (flat text panel), NOT the PDF canvas. The new `translated-pdf` mode shows the PDF canvas with overlay. These are fundamentally different rendering strategies and should be separate modes.

The existing mode system is simple (ref + computed properties). Adding a fourth mode value requires minimal changes: new constant, new computed property for overlay visibility, and new layout class in `PdfViewerLayout.vue`.

## Risks / Trade-offs

- **Font fidelity**: Browser fallback fonts will not match PDF embedded fonts exactly. Horizontal drift of 1-3px per block is expected. Mitigated by `scaleX` correction per block. Vertical positioning uses 0.8 fallback ratio — adequate for MVP, improved in Phase 1.5 when font metadata propagation ships.
- **Table detection accuracy**: Current detection relies on horizontal gaps. Tables with tight spacing or visual-only borders may not be detected. Mitigated by fallback to paragraph-level overlay for undetected tables.
- **OCR block positioning**: OCR blocks may have less precise bounding boxes than text-content blocks. Mitigated by same overlay mechanism — no special case needed.
- **Performance**: Each visible page renders N overlay divs (N = translated block count). For dense pages, this could be 50+ elements. Mitigated by only overlaying translated blocks (not all blocks) and using `will-change: transform` for compositing.
- **Overflow handling**: Very long translations may shrink to near-unreadable sizes. Documented as expected behavior for extreme cases.
- **Original text visibility**: In Phase 1, original canvas text remains partially visible between overlay blocks. The solid background per block covers text directly behind it, but gaps may show original text. Acceptable for MVP; Phase 3 adds intelligent masking.
- **Mixed-direction text**: Blocks containing both RTL and LTR text may render incorrectly. Mitigated by per-block direction detection (existing `roleMetadata.direction`).

## Phased Rollout

### Phase 1 (MVP): Basic Block Overlay

- Paragraph, heading, list, caption, and OCR block overlay
- Adaptive font shrinking
- RTL support
- Text selection
- 4th viewer mode
- Font-size from `roleMetadata.fontSize`, hardcoded 0.8 ascent ratio, static font-family mapping

### Phase 1.5: Font Metadata Propagation

- Pass `textContent.styles` from `PdfPageSession.hydrate()` through `buildPdfTextLinesFromItems()` into `buildLineFromBucket()`
- Look up `ascent`/`descent`/`fontFamily` per item by `fontName`
- Propagate font metadata into line and block `roleMetadata`
- Use `style.ascent`/`style.descent` in overlay for precise vertical positioning
- Use resolved `fontFamily` in overlay for better font matching

### Phase 2: Advanced Table Overlay

- Cell-aware table rendering using `line.items[]` geometry
- Per-cell positioning and font shrinking
- Table-specific gap detection for translated text parsing

### Phase 3: Intelligent Masking

- Background-aware masking that detects plain-background regions
- Selective occlusion without image/chart interference
- Contrast-enhancing techniques (text-shadow, outline)

### Phase 4: Export

- Translated PDF export
- Overlay-aware export formatting
