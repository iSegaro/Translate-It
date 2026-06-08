# Markdown Rendering Architecture

## Overview

Translate-It now uses a shared markdown rendering architecture for user-facing previews and a separate extraction path for plain-text cleanup.

The key design rule is simple:

- Providers emit raw translation content and Markdown shape only.
- UI rendering is handled by a shared preview pipeline.
- Cleanup, copy, TTS, and export extraction stay in `SimpleMarkdown`.

This keeps display concerns, text extraction concerns, and provider contracts isolated from one another.

## Ownership Boundaries

### Providers
- Providers own the translation payload and its markdown structure.
- Providers must not emit HTML.
- Providers should use markdown conventions that the UI can render consistently:
  - bold-label sections for dictionary entries
  - inline code for IPA / pronunciation snippets
  - plain markdown paragraphs, lists, headings, and code fences where appropriate

### Shared preview renderer
- `renderMarkdownPreview()` owns safe UI markdown rendering.
- It is the shared display pipeline for:
  - `TranslationDisplay`
  - Sidepanel history previews
  - Mobile history previews
- It is responsible for:
  - `marked` parsing
  - DOMPurify sanitization
  - legacy `SimpleMarkdown` fallback rendering when needed
  - link normalization
  - dictionary label/list grouping
  - whitespace cleanup
  - per-block direction normalization

### Safe HTML boundary
- `SafeMarkdownPreview` owns the only controlled `v-html` sink in the UI.
- The component must only receive sanitized HTML produced by `renderMarkdownPreview()`.

### Cleanup and extraction
- `SimpleMarkdown` owns:
  - legacy fallback extraction
  - plain-text cleanup for copy/TTS/export
  - pronunciation-guide stripping
  - dictionary primary-text extraction
- `SimpleMarkdown` is not the UI markdown renderer.

## Rendering Pipeline

The shared markdown preview pipeline is:

1. Receive provider output or history text.
2. Decide whether modern markdown rendering is appropriate.
3. Render markdown with `marked` when possible.
4. Sanitize the output with DOMPurify.
5. Parse the sanitized markup in a detached DOM.
6. Apply structural normalization:
   - label/list grouping
   - whitespace text-node cleanup
   - direction normalization
7. Re-sanitize the final HTML.
8. Pass the sanitized result to `SafeMarkdownPreview`.

If the content matches a legacy dictionary shape, the helper falls back to the legacy `SimpleMarkdown` path to preserve compatibility.

## History Rendering

Translation history stores raw text and preserves the original markdown-rich translation payload.

- `sourceText` remains plain text in history views.
- `translatedText` is rendered through the shared preview pipeline only.
- History views do not own markdown parsing or sanitization.

Exports remain independent from display rendering:

- `json_raw` preserves the raw stored content.
- `json_clean`, `csv`, and `anki` use cleaned plain-text extraction.

## Cleanup, Copy, TTS, and Export

Text extraction must stay in `SimpleMarkdown`.

Use `SimpleMarkdown` for:

- copy cleanup
- TTS text extraction
- export cleaning
- dictionary primary-text extraction
- pronunciation guide stripping
- legacy plain-text fallback

Dictionary mode should use the primary-only extraction strategy so pronunciation and metadata do not leak into spoken or copied text.

## Provider Markdown Contract

Providers must follow a markdown-first, HTML-free contract:

- emit Markdown or plain text only
- never emit HTML
- use bold-label markdown for dictionary sections
- use inline code for pronunciation / IPA snippets
- avoid display-specific wrappers or UI-specific formatting
- keep pronunciation metadata in display text only when that metadata is part of the provider contract

New provider output shapes must be validated in:

- provider contract tests
- preview rendering tests
- extraction tests when the output affects copy/TTS/export behavior

## Testing Checklist

When changing provider markdown or preview behavior, verify:

- provider output matches the expected markdown contract
- `renderMarkdownPreview()` renders the intended HTML
- `SafeMarkdownPreview` remains the only `v-html` sink
- history previews still render only `translatedText`
- `SimpleMarkdown` still strips/normalizes the expected plain text
- TTS still speaks the intended text only
- export modes still produce the expected raw or cleaned output
- dictionary sections still render correctly in Google, Vajehyab, and AI output
- pronunciation / IPA lines still preserve inline code rendering in display mode
- Prefer MockProvider fixtures for UI rendering regressions because they provide deterministic markdown samples that can be exercised consistently across TranslationDisplay, History previews, TTS extraction, and future UI surfaces.

## Future Maintenance Notes

- Keep preview rendering and text extraction separate.
- Do not move display formatting logic back into providers.
- Add new markdown patterns to the shared preview helper first, not to the history views.
- Add new cleanup rules to `SimpleMarkdown` only when they affect copy/TTS/export extraction.
- If a new provider introduces a special dictionary shape, add:
  - a provider fixture
  - a preview rendering test
  - an extraction test if the text is meant for TTS or copy
