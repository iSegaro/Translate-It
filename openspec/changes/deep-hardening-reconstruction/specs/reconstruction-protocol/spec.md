## ADDED Requirements

### Requirement: Canonical Marker Generation
The system SHALL generate markers in a strict canonical format: `@@TI_SEG_<entropy>_<sessionId>_<segmentId>@@`. All components emitting markers MUST adhere to this format exactly, with no internal whitespace and consistent casing.

#### Scenario: Canonical marker emission
- **WHEN** the system injects a marker for session `s1`, entropy `ax9`, and segment `n1`
- **THEN** it MUST produce exactly `@@TI_SEG_ax9_s1_n1@@`.

### Requirement: Tolerant Metadata Parsing
The parser SHALL be tolerant of realistic LLM mutations within marker metadata (delimiters, keywords, underscores). Specifically, it MUST allow optional internal whitespace, case-insensitivity for the `TI_SEG` keyword, and ignore zero-width character noise.

#### Scenario: Fuzzy metadata recognition
- **WHEN** the input contains `@@ ti_seg _ ax9 _ s1 _ n1 @@`
- **THEN** the parser MUST correctly identify it as segment `n1` for session `s1` with entropy-scoped escaping `ax9`.

### Requirement: Exact ID & Entropy Matching
Despite metadata tolerance, the parser MUST require exact, case-sensitive matches for `<segmentId>`, `<sessionId>`, and the entropy-scoped escaping to validate a marker.

#### Scenario: Rejecting mismatched entropy-scoped escaping
- **WHEN** the active entropy-scoped escaping is `ax9` but the input contains `@@TI_SEG_by2_s1_n1@@`
- **THEN** it MUST treat this sequence as literal text.

### Requirement: Entropy-Scoped Escaping
The system SHALL implement a deterministic mechanism for literal `@@` sequences within content using entropy-scoped escaping. The escape token MUST follow the format `@@TI_ESC_<entropy>@@`.

#### Scenario: Practically collision-resistant escaping
- **WHEN** content contains literal `@@` and entropy-scoped escaping is `ax9`
- **THEN** the system MUST escape it to `@@TI_ESC_ax9@@` during injection and unescape it back to `@@` during reconstruction.
