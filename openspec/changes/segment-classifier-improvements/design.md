## Context

The current `SegmentClassifier` uses a set of hardcoded binary heuristics to decide between `SKIP`, `PRESERVE`, and `TRANSLATE`. While effective for basic cases, it struggles with:
- Multilingual content (capitalization bias).
- False positives in mixed-language sentences.
- Performance overhead from redundant classification of identical segments in large DOM trees.
- Inflexible aggression tuning.

## Goals / Non-Goals

**Goals:**
- Implement a score-based heuristic engine for more nuanced classification.
- Reduce English-centric bias by prioritizing pattern shapes over capitalization.
- Improve cache hit-rates using a normalized LRU cache.
- Ensure strict semantic distinction in metadata for better observability.
- Maintain high performance (regex-based, no async dependencies in core loop).

**Non-Goals:**
- Introduction of NLP, ML, or embeddings.
- Full architectural redesign of the translation pipeline.
- Synchronous network calls during classification.
- Support for complex grammar analysis.

## Decisions

### 1. Categorized Scoring vs. Flat Heuristics
**Decision**: Group signals into internal categories (Technical, Entity, Structure, Semantic).
**Rationale**: Prevents "rule explosion" and makes the system easier to tune. High technical scores can override semantic penalties, while structural signals (like sentence length) can prevent false entity preservation.
**Alternatives**: Keeping flat rules (hard to maintain) or using a decision tree (too rigid).

### 2. Normalized LRU Cache
**Decision**: Use a bounded `Map`-based LRU cache with keys generated from `normalize(text)`.
**Rationale**: Large pages (infinite scroll) produce thousands of segments. Normalization (unicode, whitespace) ensures visually identical strings share cache entries. The 1000-item limit prevents memory leaks.
**Safety**: Cache entries are only stored for normalized texts ≤ 200 characters to avoid pollution from long fragments. Only final classification metadata (action, category, confidence) is cached.
**Alternatives**: Unbounded cache (memory risk) or no cache (CPU overhead).

### 5. Strict UI_ELEMENT Boundaries
**Decision**: Restrict `UI_ELEMENT` strictly to non-semantic navigational counters and markers.
**Rationale**: Avoids false skips of meaningful UI text.
**Exclusions**: Actionable buttons, menu items, labels, settings text, and interactive UI copy MUST be excluded and processed via standard heuristics.
**Included**: Pagination markers (e.g., "Page 1 of 10"), isolated counters, and badges.

### 3. Aggression as a Threshold Scalar
**Decision**: `aggression` will scale the `preserveThreshold` rather than modifying individual scores.
**Rationale**: Decouples the heuristic logic from user settings, ensuring that the relative weight of signals remains stable while only the sensitivity changes.
**Alternatives**: Multiplying global scores by aggression (unstable/unpredictable).

### 4. Locale-Aware Stopword Suppression
**Decision**: A lightweight static mapping of common words per language.
**Rationale**: Essential for reducing false positives in entities (e.g., "The Internet"). Fallback to a neutral set ensures safety when language detection is uncertain.
**Alternatives**: Full-scale dictionaries (too heavy for a browser extension).

## Risks / Trade-offs

- **[Risk] Regex Backtracking** → Mitigation: Use simple, non-nested regex patterns and enforce length limits before complex matching.
- **[Risk] Cache Fragmentation** → Mitigation: String normalization before hashing/storing keys.
- **[Risk] Language Bias** → Mitigation: Use script-transition and token-shape signals instead of relying solely on English-style capitalization.
