# translation-providers Specification Delta

## ADDED Requirements

### Requirement: Multiple API Keys Configuration
The translation system SHALL support configuration of multiple API keys per provider through a multiline input interface.

#### Scenario: User enters multiple API keys
- **WHEN** user opens provider settings in Options page
- **AND** provider requires an API key (OpenAI, Gemini, DeepSeek, OpenRouter, DeepL, Custom)
- **THEN** system SHALL display a textarea input for API keys
- **AND** user MAY enter multiple API keys, one per line
- **AND** system SHALL preserve all entered keys

#### Scenario: Backward compatibility with single API key
- **WHEN** user has existing single API key configuration
- **THEN** system SHALL automatically convert single key to multi-key format
- **AND** existing functionality SHALL continue without interruption

#### Scenario: API key storage format
- **WHEN** user saves multiple API keys
- **THEN** system SHALL store keys as newline-separated string
- **AND** system SHALL parse keys into array for provider use
- **AND** empty lines SHALL be ignored
- **AND** whitespace around keys SHALL be trimmed

### Requirement: Automatic API Key Failover
The translation system SHALL automatically attempt the next available API key when a key-related error occurs.

#### Scenario: API key invalid error triggers failover
- **WHEN** translation request fails with `API_KEY_INVALID` error
- **AND** provider has multiple API keys configured
- **THEN** system SHALL retry the request with the next API key in the list
- **AND** system SHALL continue retrying until a key succeeds or all keys are exhausted

#### Scenario: Rate limit error triggers failover
- **WHEN** translation request fails with `RATE_LIMIT_REACHED` error
- **AND** provider has multiple API keys configured
- **THEN** system SHALL retry the request with the next API key in the list
- **AND** system SHALL continue retrying until a key succeeds or all keys are exhausted

#### Scenario: Quota exceeded error triggers failover
- **WHEN** translation request fails with `QUOTA_EXCEEDED`, `INSUFFICIENT_BALANCE`, or `DEEPL_QUOTA_EXCEEDED` error
- **AND** provider has multiple API keys configured
- **THEN** system SHALL retry the request with the next API key in the list
- **AND** system SHALL continue retrying until a key succeeds or all keys are exhausted

#### Scenario: Non-key errors do not trigger failover
- **WHEN** translation request fails with `NETWORK_ERROR`, `SERVER_ERROR`, or `INVALID_REQUEST` error
- **THEN** system SHALL NOT retry with different API key
- **AND** error SHALL be reported immediately to the user

#### Scenario: All API keys exhausted
- **WHEN** all configured API keys have been attempted and failed
- **THEN** system SHALL report the last error encountered
- **AND** error message SHALL indicate that all API keys were tried

### Requirement: Successful Key Promotion
The translation system SHALL promote successfully used API keys to the top of the list to optimize subsequent requests.

#### Scenario: Key promoted after successful translation
- **WHEN** translation request succeeds with a non-primary API key
- **THEN** system SHALL move the successful key to the top of the key list
- **AND** system SHALL persist the updated key order to storage
- **AND** subsequent requests SHALL use the promoted key first

#### Scenario: Primary key succeeds without reordering
- **WHEN** translation request succeeds with the first (primary) API key
- **THEN** key order SHALL remain unchanged
- **AND** no storage update SHALL occur

#### Scenario: Key promotion during concurrent requests
- **WHEN** multiple translation requests succeed simultaneously with different keys
- **THEN** last successful request's key SHALL be promoted
- **AND** system SHALL handle concurrent storage updates gracefully

### Requirement: API Key Testing Interface
The translation system SHALL provide a "Test Keys" button in API settings to validate all configured keys and automatically reorder them based on validity.

#### Scenario: Test Keys button availability
- **WHEN** user opens provider settings that require API keys
- **THEN** system SHALL display a "Test Keys" button next to the API key textarea
- **AND** button SHALL be enabled when at least one API key is entered

#### Scenario: Valid keys are promoted to top
- **WHEN** user clicks "Test Keys" button
- **AND** provider has multiple API keys with mixed validity
- **THEN** system SHALL validate each key with a minimal API request
- **AND** valid keys SHALL be moved to the top of the list in order of testing
- **AND** invalid keys SHALL remain at the bottom of the list
- **AND** updated order SHALL be saved to storage

#### Scenario: All keys invalid shows error
- **WHEN** user clicks "Test Keys" button
- **AND** all configured API keys fail validation
- **THEN** system SHALL display an error message indicating no valid keys were found
- **AND** system SHALL suggest user check their API keys

#### Scenario: Loading state during testing
- **WHEN** user clicks "Test Keys" button
- **THEN** button SHALL show loading state during validation
- **AND** button SHALL be disabled during validation
- **AND** system SHALL display progress indicator for multiple keys

#### Scenario: Test results feedback
- **WHEN** key validation completes
- **THEN** system SHALL display count of valid and invalid keys
- **AND** system SHALL show success message if at least one key is valid
- **AND** for invalid keys, system SHALL display the error reason (invalid, quota exceeded, etc.)

## MODIFIED Requirements

### Requirement: Z.AI API Configuration Management
The system SHALL provide configuration management for Z.AI API credentials and settings.

#### Scenario: Multiple API keys configuration
- **WHEN** user configures Z.AI provider settings
- **THEN** system SHALL support multiple API keys via multiline textarea
- **AND** system SHALL allow entering one API key per line
- **AND** system SHALL automatically failover to next key on authentication errors

#### Scenario: API key validation with multiple keys
- **WHEN** user enters multiple Z.AI API keys in settings
- **THEN** system SHALL validate key format for all non-empty keys
- **AND** system SHALL show appropriate error messages for invalid keys
- **AND** first valid key SHALL be used as primary

#### Scenario: Endpoint configuration with multiple keys
- **WHEN** configuring Z.AI provider with multiple API keys
- **THEN** system SHALL allow custom API endpoint URL (shared across all keys)
- **AND** system SHALL use default Z.AI endpoint when custom URL not provided
