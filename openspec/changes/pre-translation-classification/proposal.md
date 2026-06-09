## Why

The current translation pipeline sends all extracted text segments to AI providers, regardless of their semantic content. This results in significant inefficiencies: unnecessary token usage (including high-cost reasoning tokens), increased latency due to oversized payloads, and avoidable provider expenses for segments like numeric metrics, proper nouns, and already-target-language text.

## What Changes

- **Translation Segment Classifier**: A new specialized layer to analyze segments before they reach the provider.
- **Three-State Action Model**: Implementation of `SKIP` (non-semantic), `PRESERVE` (meaningful but unchanged), and `TRANSLATE` actions.
- **Normalization Pipeline**: A lightweight pre-processing stage (trim, Unicode normalization, whitespace collapse) for classification accuracy.
- **Heuristic-Based Filtering**: Implementation of deterministic rules to detect non-translatable patterns (metrics, URLs, usernames, hashtags) and proper nouns (brands, model IDs).
- **Segment-Level Language Guard**: Quick check with conservative safeguards for short or mixed-language segments.
- **Hybrid Batching Strategy**: The `OptimizedJsonHandler` will be updated to pre-fill skipped/preserved segments while only sending "true" translation candidates to the provider.
- **Savings Analytics**: Integration with telemetry to report on skipped segments and estimated token/cost savings.

## Capabilities

### New Capabilities
- `segment-classification`: Comprehensive heuristic engine for categorizing translatable vs. non-translatable content.
- `translation-savings-tracking`: Telemetry system to measure the impact of the classification layer (skipped segments, token savings).

### Modified Capabilities
- `translation-pipeline`: Updated flow in `TranslationEngine` and `ProviderCoordinator` to include the classification step.

## Impact

- **Core Translation Logic**: `TranslationEngine` and `OptimizedJsonHandler` will incorporate the classifier.
- **Provider Layer**: Providers will receive fewer segments and smaller payloads, improving reliability and speed.
- **Analytics**: New metrics will be available in the stats system.
- **User Experience**: Faster initial translation for pages with many metrics or technical data.
