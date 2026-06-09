## ADDED Requirements

### Requirement: Bounded LRU Classification Cache
The SegmentClassifier SHALL maintain a bounded LRU cache of classification results. Identical segments SHALL be retrieved from cache instead of being re-evaluated.

#### Scenario: Cache hit for identical segment
- **WHEN** the same text is classified twice
- **THEN** the second request returns the cached result without re-evaluating heuristics

### Requirement: Cache Key Normalization
Cache keys SHALL be generated from normalized text (unicode NFC, collapsed whitespace, zero-width char removal).

#### Scenario: Cache hit for visually identical segments
- **WHEN** text with zero-width characters and text without them are classified
- **THEN** both resolve to the same normalized key and share a cache entry

### Requirement: Cache Entry Constraints
The SegmentClassifier SHALL only store cache entries for normalized texts with a length of 200 characters or less. Cached values SHALL only contain final classification metadata (action, category, confidence).

#### Scenario: Avoiding cache pollution for long segments
- **WHEN** a segment longer than 200 characters is classified
- **THEN** its result MUST NOT be stored in the LRU cache
