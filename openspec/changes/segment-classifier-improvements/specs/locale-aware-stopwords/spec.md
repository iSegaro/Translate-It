## ADDED Requirements

### Requirement: Multi-Language Stopword Suppression
The SegmentClassifier SHALL use locale-aware stopword sets to penalize common semantic words. It SHALL support a fallback set when the source language is unknown.

#### Scenario: English stopword penalty
- **WHEN** text is "The Internet" and locale is "en"
- **THEN** "The" and "Internet" are identified as stopwords, SemanticSignals penalizes -10, and action is "TRANSLATE"

#### Scenario: Fallback stopword usage
- **WHEN** locale is unknown and text contains "and"
- **THEN** the fallback stopword set is used, "and" is penalized, and action is "TRANSLATE"
