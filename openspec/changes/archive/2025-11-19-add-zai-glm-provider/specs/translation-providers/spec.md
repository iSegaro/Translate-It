## ADDED Requirements

### Requirement: Z.AI GLM Provider Integration
The translation system SHALL support Z.AI GLM models as an AI translation provider using OpenAI-compatible API format.

#### Scenario: Successful translation with ChatGLM3-6B
- **WHEN** user selects Z.AI provider with ChatGLM3-6B model
- **AND** provides valid API key and text to translate
- **THEN** system shall translate text using ZAI API with OpenAI-compatible format
- **AND** return accurate translation results

#### Scenario: Model selection
- **WHEN** user configures Z.AI provider settings
- **THEN** system shall offer selection between ChatGLM3-6B and ChatGLM4 models
- **AND** save selected model preference for future translations

#### Scenario: Rate limiting compliance
- **WHEN** multiple translation requests are made to Z.AI API
- **THEN** system shall use Gemini-like rate limiting configuration
- **AND** implement circuit breaker pattern for API protection

#### Scenario: Chunk-based streaming translation
- **WHEN** translating large text with Z.AI provider
- **THEN** system shall support chunk-based streaming like Gemini
- **AND** process text segments efficiently for optimal performance

### Requirement: Z.AI API Configuration Management
The system SHALL provide configuration management for Z.AI API credentials and settings.

#### Scenario: API key validation
- **WHEN** user enters Z.AI API key in settings
- **THEN** system shall validate key format and connectivity
- **AND** show appropriate error messages for invalid keys

#### Scenario: Endpoint configuration
- **WHEN** configuring Z.AI provider
- **THEN** system shall allow custom API endpoint URL
- **AND** use default Z.AI endpoint when custom URL not provided

### Requirement: Z.AI Provider Registration
The system SHALL register Z.AI provider in the provider registry for discovery and initialization.

#### Scenario: Provider discovery
- **WHEN** application loads available translation providers
- **THEN** Z.AI GLM provider shall appear in provider selection UI
- **AND** be properly categorized as an AI provider type

#### Scenario: Lazy loading initialization
- **WHEN** Z.AI provider is selected for first use
- **THEN** system shall load provider implementation on-demand
- **AND** initialize with user configuration settings

#### Scenario: Options page integration
- **WHEN** user opens Options page for translation providers
- **THEN** Z.AI GLM provider shall appear with configuration fields
- **AND** allow API key and model selection like other AI providers