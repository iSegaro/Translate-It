## 1. Foundation & Telemetry

## 1. Foundation & Telemetry

- [x] 1.1 Update `TranslationStatsManager.js` to include `totalSavedChars` and `totalSavedSegments` tracking.
- [x] 1.2 Add `FEATURE_PRE_CLASSIFICATION` flag to `src/features/settings/stores/settings.js` or central config.
- [x] 1.3 Update `TranslationStatsManager.printSummary` to display savings metrics in debug logs.

## 2. Segment Classification Layer

- [x] 2.1 Create `src/features/translation/core/utils/SegmentClassifier.js` with `normalize(text)` helper.
- [x] 2.2 Implement `SKIP` heuristics for metrics, isolated emojis, and punctuation.
- [x] 2.3 Create `src/features/translation/core/utils/BrandPreserveRegistry.js` for brands and model patterns.
- [x] 2.4 Implement `PRESERVE` logic for mixed-script name detection and registry-based brands.
- [x] 2.5 Implement `classifyBatch` with conservative language detection safeguards for short segments.
- [x] 2.6 Add validation and clamping logic for `classificationAggression` (range 0.0-1.0).
- [x] 2.7 Add comprehensive unit tests covering all edge cases (emoji+text, etc.).

## 3. Translation Pipeline Integration

- [x] 3.1 Integrate `SegmentClassifier` into `OptimizedJsonHandler.js` with `PRESERVE` / `SKIP` handling.
- [x] 3.2 Update `OptimizedJsonHandler._mapResults` to handle the three-state classification mapping.
- [x] 3.3 Update `ProviderConfigurations.js` with default `classificationAggression` levels for major providers.
- [x] 3.4 Integrate simplified classification into `TranslationEngine.js` for single-text modes.



## 4. Verification & Validation

- [x] 4.1 Create integration tests for "Select Element" mode with high-density non-translatable data.
- [x] 4.2 Verify that already-target-language text is correctly skipped using segment-level detection.
- [x] 4.3 Ensure no regression in DOM reconstruction by verifying segment indices remain consistent.
- [x] 4.4 Conduct performance audit on large pages (e.g., Twitter feed) to ensure classification doesn't block the UI thread.
