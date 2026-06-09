## 1. Core Architecture & Caching

- [x] 1.1 Implement language-agnostic `LRUCache`.
- [x] 1.2 Update `classifySegment` for cache/normalization and aggression-aware keys.

## 2. Multilingual Scoring Engine

- [x] 2.1 Refactor scoring into `_evaluateHeuristics` using `Intl.Segmenter` for safe tokenization.
- [x] 2.2 Implement technical signals (camelCase, snake_case, version IDs, paths, GUIDs, URLs) with structure immunity.
- [x] 2.3 Implement generic mixed-script detection via Latin-pivot subtraction heuristic.
- [x] 2.4 Implement structure signals (Punctuation density, word count penalties) with technical exclusion.
- [x] 2.5 Stabilize threshold scaling (`8.0 - aggression * 4.0`) to reduce volatility.
- [x] 2.6 Tuning: Common UI phrases ("Open Settings") translate by default; proper names preserve at high aggression.
- [x] 2.7 Implement purely structural UI-label preservation for platform-style labels/actions using Unicode property escapes.
- [x] 2.8 Implement early structural garbage-fragment filter to skip low-information noise (e.g., "ri.", "..").

## 3. UI_ELEMENT & Category Mapping

- [x] 3.1 Refine `UI_ELEMENT` regex to be strictly symbolic/numeric and language-agnostic.
- [x] 3.2 Update metadata mapping to return explicit categories (`ENTITY`, `TECHNICAL_IDENTIFIER`, `UI_LABEL`, etc.).

## 4. Verification

- [x] 4.1 Update `SegmentClassifier.test.js` to cover multilingual and structural scoring scenarios.
- [x] 4.2 Verify aggression behavior with stabilized sensitivity levels.
- [x] 4.3 Verify that non-whitespace languages (CJK) are correctly handled via character-length fallbacks.
- [x] 4.4 Verify UI label preservation behavior with new test cases.
