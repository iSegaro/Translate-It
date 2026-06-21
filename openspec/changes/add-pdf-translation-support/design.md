## Context

Translate It currently exposes popup, sidepanel, options, subtitle, offscreen, and content-script surfaces. It already has an established translation pipeline, storage core, logging system, resource tracking, and history persistence. The PDF feature must fit into those systems without being treated as Whole Page Translation or as generic DOM translation.

The architecture source of truth is `Proposal-PDF.md`. Its core requirement is that PDF is an independent feature with its own session model, dedicated viewer, logical block pipeline, and adaptive bilingual rendering.

## Goals / Non-Goals

**Goals:**

- Ship a dedicated PDF viewer under `src/apps/pdf`.
- Keep PDF translation isolated under `src/features/pdf-translation`.
- Render PDFs with PDF.js and preserve a pixel-accurate original pane.
- Support only dedicated-viewer PDF opening/loading in the MVP.
- Translate visible pages only in the MVP.
- Translate logical blocks, not whole pages or individual words/lines.
- Reuse the existing translation providers and UnifiedTranslationService.
- Persist PDF translation cache with stable cache identity.
- Support text selection in the PDF text layer and PDF-aware Select Element behavior.
- Support OCR fallback only when the text layer is unusable and the user approves it.
- Persist a document-level history record for each PDF translation session.

**Non-Goals:**

- Do not intercept browser-native PDF opening in the MVP.
- Do not add a right-click "Open with Translate It" action in the MVP.
- Do not add a toolbar "open current PDF" action in the MVP.
- Do not implement automatic PDF URL handoff in the MVP.
- Do not regenerate translated PDFs in the MVP.
- Do not generate bilingual PDFs in the MVP.
- Do not auto-translate entire documents on open.
- Do not implement advanced table reconstruction in the MVP.
- Do not enable automatic OCR on all scanned pages.
- Do not implement translated search in the MVP.

## Decisions

- PDF is an independent feature with its own app and feature module boundaries.
- PDF viewer rendering is owned by PDF.js, not the browser native viewer.
- PDF opening/loading in MVP happens only inside the dedicated viewer surface.
- The MVP text layer uses the official PDF.js `TextLayerBuilder` path from `web/pdf_viewer.mjs` with the matching `pdf_viewer.css` runtime styles.
- The translation unit is `Logical Block`.
- The original pane remains pixel-accurate.
- The translated pane uses adaptive geometry for readability.
- The existing provider infrastructure is reused directly; no separate PDF provider system is introduced.
- Cache identity uses `pdfFingerprint + targetLanguage + provider + blockId + sourceTextHash + translationSettingsHash`.
- Block identity must not rely only on block index or page number.
- OCR is fallback only and requires explicit user approval.
- MVP export formats are TXT and Markdown only.
- The initial bilingual view is side-by-side, with original and translated panes visible together by default.

## Risks / Trade-offs

- PDF logical block detection will be imperfect for complex layouts, especially tables and multi-column documents.
- Adaptive translated geometry may diverge significantly from the original layout in dense documents, but this is preferable to unreadable fixed boxes.
- OCR fallback improves coverage but adds latency and memory pressure, so the approval gate is required.
- PDF history at document scope is simpler for users, but detailed block state must remain in the PDF cache to avoid noisy history growth.
- PDF.js asset handling and extension packaging must be validated carefully across Chrome and Firefox to avoid broken viewer loads.
