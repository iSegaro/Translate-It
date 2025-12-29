## ADDED Requirements

### Requirement: Simplified Text Direction Detection
The Select Element feature SHALL determine text direction primarily based on target language rather than content analysis.

#### Scenario: RTL target language
- **WHEN** translating to an RTL language (Persian, Arabic, etc.)
- **THEN** system SHALL apply RTL direction regardless of English words or numbers in content
- **AND** SHALL NOT perform word-ratio calculations

#### Scenario: Unknown target language
- **WHEN** target language is not specified
- **THEN** system SHALL fallback to character-based RTL detection
- **AND** use single comprehensive RTL pattern

#### Scenario: LTR target language
- **WHEN** translating to LTR language
- **THEN** system SHALL apply LTR direction
- **AND** SHALL NOT attempt mixed content processing

## MODIFIED Requirements

### Requirement: Text Display and Styling
The Select Element feature SHALL display translated text with appropriate bidirectional styling.

#### Scenario: RTL text display
- **WHEN** translated content is in RTL language
- **THEN** system SHALL apply `direction: rtl` and `text-align: start` CSS properties
- **AND** SHALL NOT wrap English terms in special spans

#### Scenario: Mixed content handling
- **WHEN** translated content contains both RTL and LTR text
- **THEN** system SHALL rely on browser's built-in bidirectional algorithm
- **AND** SHALL NOT perform custom mixed content processing

#### Scenario: CSS class application
- **WHEN** applying direction styles to translated elements
- **THEN** system SHALL use only `.aiwc-rtl-text` or `.aiwc-ltr-text` classes
- **AND** SHALL NOT use `.ltr-term` or `.aiwc-mixed-text` classes

## REMOVED Requirements

### Requirement: Mixed Content Processing
**Reason**: Over-engineering causing more problems than solving. Browser's bidi algorithm handles mixed content adequately.
**Migration**: Remove all mixed content processing and let CSS/browser handle natural bidirectional text.

#### Scenario: LTR term wrapping (REMOVED)
- **REMOVED**: Wrapping English words in `<span dir="ltr">` within RTL text
- **REMOVED**: Complex regex detection of LTR terms
- **REMOVED**: HTML manipulation for mixed content

### Requirement: Word-Ratio Direction Calculation
**Reason**: Flawed algorithm causing RTL text to display as LTR when containing English words.
**Migration**: Use target language as primary determinant, remove character/word counting.

#### Scenario: Threshold-based direction (REMOVED)
- **REMOVED**: Calculating ratio of RTL vs LTR words
- **REMOVED**: 0.3 threshold for mixed content detection
- **REMOVED**: Complex word counting and classification logic