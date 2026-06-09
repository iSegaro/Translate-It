## ADDED Requirements

### Requirement: Token Savings Calculation
The system SHALL estimate the number of tokens saved by skipping non-translatable segments based on character count and provider-specific tokenization heuristics.

#### Scenario: Character-to-token estimation
- **WHEN** a segment of 100 characters is skipped
- **THEN** the system SHALL record a savings of approximately 25 tokens (assuming 4 chars per token).

### Requirement: Savings Telemetry Reporting
The system SHALL collect and report metrics regarding the efficiency gains from the classification layer.

#### Scenario: Aggregate savings report
- **WHEN** a translation session completes
- **THEN** the system SHALL provide the total number of segments skipped and total characters saved to the `TranslationStatsManager`.
