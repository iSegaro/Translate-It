## Why

The current translation pipeline suffers from inefficiencies in token usage and latency because it sends non-semantic segments (metrics, IDs, boilerplate) to AI providers. This change enhances the `SegmentClassifier` with a score-based heuristic engine to intelligently skip or preserve segments, reducing costs and improving responsiveness.

## What Changes

- **Score-Based Classification**: Transition from binary rules to a categorized scoring system (Technical, Entity, Structure, Semantic signals).
- **Proper Noun & ID Detection**: Enhanced detection for names, technical IDs (camelCase, versioning), and brands independent of capitalization bias.
- **Stopword Suppression**: Added lightweight, locale-aware stopword filtering to prevent false preservation of common phrases.
- **Bounded LRU Cache**: Implementation of a normalized, limited-size cache to optimize performance and prevent memory leaks during large DOM processing.
- **Contextual Punctuation Handling**: Smarter penalty logic for punctuation that distinguishes between short entities and full sentences.
- **Telemetry & Stats**: Refined metadata reporting for better observability of "saved" tokens and segments.

## Capabilities

### New Capabilities
- `segment-classifier-scoring`: The core scoring engine and signal categories for deterministic classification.
- `locale-aware-stopwords`: Multi-language stopword suppression and fallback mechanisms.
- `normalized-lru-cache`: Bounded caching mechanism for optimized heuristic lookup.

### Modified Capabilities
- `pre-translation-classification`: Updating the existing classification pipeline to support the new scoring metadata and action taxonomy.

## Impact

- **Affected Code**: `src/features/translation/core/utils/SegmentClassifier.js`, `src/features/translation/core/managers/OptimizedJsonHandler.js`, `src/features/translation/core/TranslationStatsManager.js`.
- **Latency**: Reduced for pages with many technical/numeric segments due to immediate streaming of skipped segments.
- **Cost**: Significant reduction in AI provider token consumption.
- **Observability**: Improved debugging through detailed classification metadata (category, confidence, reason).
