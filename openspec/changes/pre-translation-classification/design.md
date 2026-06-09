## Context

The extension's translation pipeline is currently "blind" to the content it processes. Every text segment extracted from the DOM is treated as a candidate for translation. This leads to several issues when dealing with data-heavy pages (dashboards, social media feeds, technical documentation):
1. **Financial Waste**: AI providers charge per token. Sending segments like "20.6K" or "https://google.com" is a waste of money.
2. **Performance Bottleneck**: Large payloads increase request/response latency.
3. **Reasoning Waste**: Modern models (O1, DeepSeek-R1) spend time "thinking" about how to translate a number, which is unnecessary.

## Goals / Non-Goals

**Goals:**
- Implement a lightweight, deterministic classification layer.
- Support common "skip-worthy" patterns: Metrics, Numbers, URLs, Usernames, Hashtags, Emojis, Punctuation.
- Implement segment-level language detection to skip text already in the target language.
- Integrate the classifier into both `TranslationEngine` (single requests) and `OptimizedJsonHandler` (batch requests).
- Measure and report savings via the `TranslationStatsManager`.

**Non-Goals:**
- Using ML models for classification (too heavy for a browser extension).
- Semantic analysis of "contextual non-translatables" (e.g., proper nouns that MIGHT need translation depending on context).
- Modification of existing AI prompts (this is a pre-provider layer).

## Decisions

### 1. New Utility: `SegmentClassifier`
A dedicated class `src/features/translation/core/utils/SegmentClassifier.js` will encapsulate all classification logic.
- **Pre-classification Normalization**: Before processing, text is normalized (NFC, trimmed, whitespace collapsed) in a `normalize(text)` helper. This is used ONLY for heuristic matching.
- **Interface Definition**:
  ```ts
  interface ClassificationResult {
    action: 'SKIP' | 'PRESERVE' | 'TRANSLATE';
    category: string;
    confidence: number;
    normalizedText?: string;
    reason?: string;
  }
  ```

### 2. Implementation: Three-State Model
- **SKIP**: For data that adds no value to translation (Numbers, Metrics, Emojis).
- **PRESERVE**: For data that is semantically meaningful but should not be translated (Brands, Tech IDs, Mixed-script names).
- **TRANSLATE**: Default state for sentences, phrases, and uncertain segments.

### 3. Proper Noun & Mixed-Script Heuristics
- **Mixed-Script**: Detect segments containing both Latin and Non-Latin characters (e.g., Farsi + English). If the pattern looks like a transliteration pair, `PRESERVE`.
- **Known Entities**: Use a lightweight configurable `BrandPreserveRegistry` for brands, model identifiers, and repository/package names. This allows extension without modifying the core classifier logic.

### 4. Integration: `OptimizedJsonHandler`
The classifier will be applied to the `segments` array before batching.
- **Execution Flow**:
  1. `segments` are normalized and passed to `SegmentClassifier.classifyBatch()`.
  2. Skipped/Preserved segments are immediatey marked as "translated" in the internal tracking map.
  3. Only `TRANSLATE` segments are sent to the provider.

### 5. Provider-Aware Tuning
- **Aggression Levels**: Managed via a `classificationAggression` property in `ProviderConfigurations.js`.
  - **Range**: Bounded numeric range from `0.0` (disabled) to `1.0` (maximum).
  - **Defaults**: Conservative default around `0.4`.
  - **Safeguards**: Aggressive settings (e.g., `0.8` for Gemini) MUST NOT bypass low-confidence safeguards. Out-of-range values MUST safely clamp.
  - **Fallback**: Uncertain classifications always fallback to `TRANSLATE` regardless of aggression level.


## Edge Cases

- **Emoji + Text**: If a segment contains semantic text along with emojis (e.g., "Hello 🌍"), it MUST be marked as `TRANSLATE`.
- **Embedded Metrics**: Metrics inside a sentence (e.g., "It costs 20.6K dollars") are handled as `TRANSLATE` as part of the sentence block. Only isolated metric segments are skipped.
- **Short Multilingual Fragments**: Fragments like "Hello سلام" are marked as `TRANSLATE` to allow the AI to decide on the best bilingual representation.
- **Unicode Usernames**: Usernames containing non-latin characters are `PRESERVE` to maintain identity integrity.


## Migration Plan

1. **Phase 1**: Implement `SegmentClassifier` and unit tests.
2. **Phase 2**: Add telemetry to `TranslationStatsManager` (hidden/debug mode).
3. **Phase 3**: Integrate into `OptimizedJsonHandler` with a feature flag (`FEATURE_PRE_CLASSIFICATION`).
4. **Phase 4**: Enable by default for AI providers.
