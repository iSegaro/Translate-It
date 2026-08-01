## Why

The current bilingual mode displays the original PDF alongside a separate translated text panel. This forces users to visually scan between two disconnected views, breaking reading flow and making it difficult to understand translated content in context. Users reading translated documents need to see translations within the original page structure — where images, tables, spacing, and reading order provide essential context that a flat text panel cannot convey.

The proposed "Translated PDF View" mode renders translated text directly over the original PDF canvas, preserving the visual structure of the document while adding translated content as positioned overlays. This creates a reading experience similar to opening a translated PDF, without regenerating the PDF file.

## What Changes

Add a fourth viewer mode to the existing PDF viewer:

- **Original** (existing): Raw PDF rendering, no translation overlay.
- **Bilingual** (existing): Side-by-side original + translated text panel.
- **Translated** (existing): Translated text panel only, no PDF canvas.
- **Translated PDF View** (new): Original PDF canvas with translated text rendered as positioned overlays over original text regions.

The new mode introduces:

- A layout-aware overlay layer that positions translated text at the same coordinates as the original text blocks, with a solid background per block to improve readability against the canvas.
- Adaptive font shrinking to fit translated text within original bounding boxes.
- RTL text direction support in overlay rendering.
- Selection of translated overlay text.
- OCR page support (OCR blocks already integrate with the translation pipeline).

The new mode does NOT:

- Regenerate or modify the PDF file.
- Modify the canvas rendering.
- Introduce a new translation architecture.
- Change the existing bilingual, original, or translated modes.
- Require translated-text search.
- Include PDF export in the initial scope.
- Include table cell-aware rendering in Phase 1 (deferred to Phase 2).
- Include intelligent background-aware masking in Phase 1 (deferred to Phase 3).

## Capabilities

### New Capabilities

- `overlay-rendering`: Layout-aware overlay system that renders translated text blocks at original page coordinates over the PDF canvas, including font-aware positioning, adaptive shrinking, and text selection support.
- `viewer-mode-management`: Extension of the existing viewer mode system to support the new "Translated PDF View" mode, including mode switching, UI controls, and per-mode rendering strategies.

### Modified Capabilities

None. The existing translation pipeline, cache, and bilingual mode remain unchanged.

## Impact

- New Vue components: `PdfOverlayLayer.vue`, `PdfBlockOverlayItem.vue`.
- New composable: `usePdfOverlayMode.js`.
- Modified components: `PdfPageView.vue` (add overlay layer slot), `PdfViewer.vue` (pass block data to overlay), `PdfToolbar.vue` (add mode button), `PdfApp.vue` (wire overlay composable), `PdfViewerLayout.vue` (handle overlay mode).
- No changes to `PdfTranslationCoordinator.js`, `PdfCacheManager.js`, `PdfTranslationAdapter.js`, or `PdfTranslationBatchPlanner.js`.
- No new storage keys or persistence model.
- No new dependencies.
