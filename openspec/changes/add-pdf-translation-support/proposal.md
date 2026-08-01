## Why

Translate It already has strong translation primitives, but it does not yet have a first-class PDF experience. PDFs are currently outside the extension’s owned UI surface, which makes it impossible to provide a dedicated viewer, block-level translation, persistent PDF cache, or PDF-aware selection workflows without treating the document like a regular web page.

The proposed PDF feature must reuse the existing translation provider, history, storage, logging, and memory-management infrastructure while preserving PDF-specific layout and rendering semantics. This avoids creating a parallel translation stack and keeps PDF behavior isolated from Whole Page Translation and DOM translation.

## What Changes

Add a dedicated PDF translation feature with its own app entry point and feature module boundary:

- `src/apps/pdf/` for the dedicated PDF viewer application.
- `src/features/pdf-translation/` for PDF session, layout, translation, cache, export, and selection adapters.

The MVP will provide:

- dedicated PDF viewer
- PDF.js rendering
- text layer support
- text selection translation
- WindowsManager integration
- visible page translation only
- logical block translation
- persistent block cache
- bilingual side-by-side viewer
- adaptive translated pane
- export translated TXT
- export translated Markdown
- OCR fallback with user approval
- document-level history entry

PDF opening flow for the MVP is dedicated-viewer-only:

- no browser-native PDF interception
- no right-click "Open with Translate It"
- no toolbar "open current PDF"
- no automatic PDF URL handoff

The MVP only supports opening/loading a PDF inside the dedicated Translate It PDF Viewer surface.

Out of MVP:

- full document auto-translation
- translated PDF regeneration
- bilingual PDF generation
- advanced table reconstruction
- automatic OCR for all scanned pages
- translated search

## Capabilities

### New Capabilities
- `pdf-translation`: Dedicated PDF viewer, PDF.js rendering, logical block translation, cache, export, OCR fallback, and history integration for PDF documents.

### Modified Capabilities
None.

## Impact

- New extension page entry for PDF viewer routing and manifest wiring.
- New Vue application bootstrap for PDF UI.
- New PDF-specific feature module for session state, logical blocks, cache identity, export, and OCR fallback.
- New translation-mode integration point in the existing provider pipeline.
- New storage keys and persistence flow for PDF caches and document metadata.
- New i18n strings for PDF viewer, export, OCR approval, and translation state messaging.
- New test coverage for PDF viewer bootstrapping, block identity, cache keys, export formatting, and OCR gating.
