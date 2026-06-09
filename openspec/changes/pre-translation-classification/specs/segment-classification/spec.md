## ADDED Requirements

### Requirement: Pre-Classification Normalization
The system SHALL apply a lightweight normalization pipeline to segments BEFORE heuristic evaluation.
- The pipeline MUST include: trimming, Unicode normalization (NFC), whitespace collapsing, and removal of zero-width characters/RTL-LTR markers.
- Normalization MUST NOT modify the original segment text used for DOM reconstruction.

### Requirement: Deterministic Heuristic Classification
The system SHALL classify translation segments into categories using deterministic heuristics to identify non-translatable content.

#### Scenario: Metric detection
- **WHEN** a segment contains a numeric value followed by a metric suffix (e.g., "20.6K", "1.2M", "5.5B")
- **THEN** the system SHALL classify it as `SKIP` with the category `METRIC`.

#### Scenario: Technical Identifier detection
- **WHEN** a segment contains a URL, a technical identifier (e.g., "gpt-4.1", "react-v18"), or a repository name
- **THEN** the system SHALL classify it as `PRESERVE` with the category `TECHNICAL_IDENTIFIER`.

#### Scenario: Emoji and Punctuation-only detection
- **WHEN** a segment contains only emojis, whitespace, or punctuation marks
- **THEN** the system SHALL classify it as `SKIP` with the category `NON_SEMANTIC`.

### Requirement: Proper Noun and Mixed-Language Heuristics
The system SHALL identify brand names, proper nouns, and mixed-script text that should remain unchanged.

#### Scenario: Mixed-script name preservation
- **WHEN** a segment contains a transliterated name followed by its original script (e.g., "Zara Kanaani فروغ کنعانی")
- **THEN** the system SHALL classify it as `PRESERVE` with the category `PROPER_NOUN`.

#### Scenario: Brand and Model detection
- **WHEN** a segment matches a known tech brand or model identifier (e.g., "OpenAI", "DeepSeek-R1", "Gemini")
- **THEN** the system SHALL classify it as `PRESERVE` with the category `BRAND`.

### Requirement: Language-Aware Skipping with Safeguards
The system SHALL compare the detected language of a segment with the target translation language while avoiding false positives for short segments.

#### Scenario: Short segment safeguard
- **WHEN** a segment is below the semantic length threshold (e.g., < 5 characters) or contains mixed scripts
- **THEN** the system SHALL bypass statistical language detection and default to `TRANSLATE` unless covered by other heuristics.

#### Scenario: Target language match
- **WHEN** the detected language of a segment > 10 characters matches the target language with high confidence
- **THEN** the system SHALL classify it as `SKIP` with the category `TARGET_LANGUAGE_MATCH`.

### Requirement: Three-State Action Decision
The system SHALL output exactly one action for every segment: `SKIP`, `PRESERVE`, or `TRANSLATE`.
- `SKIP`: Non-semantic or irrelevant to translation (Metrics, Emojis).
- `PRESERVE`: Semantically meaningful but should remain unchanged (Names, Brands).
- `TRANSLATE`: Requires AI provider translation.

