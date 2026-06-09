## ADDED Requirements

### Requirement: Segment Categorized Scoring
The SegmentClassifier SHALL evaluate segments using four scoring categories: TechnicalSignals, EntitySignals, StructureSignals, and SemanticSignals. The aggregate score SHALL determine whether a segment is preserved or translated.

#### Scenario: Preserving camelCase technical ID
- **WHEN** text is "myFunction"
- **THEN** TechnicalSignals grants +10, aggregate score meets threshold, and action is "PRESERVE" with category "TECHNICAL_IDENTIFIER"

#### Scenario: Translating long sentence with entity
- **WHEN** text is "We are using React to build this UI."
- **THEN** EntitySignals grants +3 for "React", but StructureSignals penalizes heavily for length/punctuation, and action is "TRANSLATE"

#### Scenario: Mixed-language sentence with semantic structure
- **WHEN** text is "من در React مشکل دارم"
- **THEN** EntitySignals grants weak signal for "React", but StructureSignals identifies semantic structure/length, and action MUST resolve to "TRANSLATE"

### Requirement: Signal Weight Restrictions
EntitySignals based on capitalization MUST ONLY apply to Latin script. Non-Latin scripts (Arabic, Persian, CJK, etc.) SHALL NOT receive capitalization bonuses.

### Requirement: Progressive Structure Penalties
StructureSignals SHALL apply progressive penalties based on word count:
- 1–2 words: Minimal or no penalty.
- 3–5 words: Moderate penalty.
- 6+ words: Strong penalty.

### Requirement: Strict UI_ELEMENT Boundaries
The UI_ELEMENT classification SHALL be restricted to pagination markers, isolated counters, and badges. It SHALL EXCLUDE actionable buttons, menu items, labels, and settings text.

### Requirement: Aggression Threshold Scaling
The SegmentClassifier SHALL scale the `preserveThreshold` based on the `aggression` parameter. Higher aggression SHALL lower the threshold, making preservation more likely.

#### Scenario: High aggression preservation
- **WHEN** aggression is 0.8 and text has a moderate score of 5
- **THEN** the lowered threshold is met and action is "PRESERVE"
