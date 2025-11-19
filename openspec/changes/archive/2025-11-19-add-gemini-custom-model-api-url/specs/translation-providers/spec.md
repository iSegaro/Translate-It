## ADDED Requirements

### Requirement: Gemini Custom Model Support
The translation system SHALL support custom Gemini model names that are not in the predefined list.

#### Scenario: User configures experimental Gemini model
- **WHEN** user selects "Custom Model" from the Gemini model dropdown
- **AND** enters a custom model name (e.g., "gemini-2.0-experimental")
- **THEN** system shall use this exact model name for API calls
- **AND** the custom model name should be persisted in settings

#### Scenario: User switches back to predefined model
- **WHEN** user previously had a custom model configured
- **AND** selects a predefined model from dropdown
- **THEN** the custom model input field should be hidden
- **AND** the predefined model should be used for API calls
- **AND** custom model name should remain saved for future use

### Requirement: Gemini API URL Customization
The translation system SHALL support configurable API endpoints for Gemini provider.

#### Scenario: User configures custom API endpoint
- **WHEN** user enters a custom API URL (e.g., "https://europe-west1-aiplatform.googleapis.com")
- **AND** performs translation with Gemini
- **THEN** provider shall use the custom URL for all API calls
- **AND** the custom URL should be persisted in settings

#### Scenario: User uses default API endpoint
- **WHEN** user does not specify a custom API URL
- **AND** performs translation with Gemini
- **THEN** provider shall use the default Gemini API endpoint
- **AND** empty URL field should not cause errors

### Requirement: Gemini Custom Model UI
The settings interface SHALL include conditional input field for custom Gemini model names.

#### Scenario: Custom model selection interaction
- **WHEN** user clicks the model dropdown and selects "Custom Model"
- **AND** the selection changes to "custom"
- **THEN** a text input field for custom model name should appear
- **AND** the field should show appropriate placeholder text
- **AND** help text should explain the format requirements

#### Scenario: Predefined model selection interaction
- **WHEN** user had previously selected "Custom Model"
- **AND** selects a predefined model (e.g., "Gemini 2.5 Flash")
- **THEN** the custom model input field should be hidden
- **AND** the UI should return to predefined model layout

### Requirement: Gemini API URL UI
The settings interface SHALL include input field for custom API URL configuration.

#### Scenario: API URL field availability
- **WHEN** user is on Gemini API settings page
- **AND** looks at the configuration options
- **THEN** there should be an "API URL" input field
- **AND** the field should show current custom URL if configured
- **AND** placeholder text should indicate the default URL

#### Scenario: API URL help information
- **WHEN** user reads the help text for API URL field
- **THEN** it should explain that leaving it empty uses the default endpoint
- **AND** it should provide guidance on when to use custom URLs

## MODIFIED Requirements

### Requirement: Gemini Provider Configuration Enhancement
The Gemini provider configuration SHALL be enhanced to detect and handle custom models and API URLs.

#### Scenario: Provider initialization with custom model
- **WHEN** user has configured a custom model name
- **AND** the Gemini provider initializes
- **THEN** it shall detect that the model is not in the predefined list
- **AND** it shall handle the custom model name appropriately
- **AND** it shall use custom API URL if provided

#### Scenario: Provider initialization with predefined model
- **WHEN** user has selected a predefined Gemini model
- **AND** the Gemini provider initializes
- **THEN** it shall use the predefined model configuration
- **AND** it shall use the hardcoded API URL for that model
- **AND** custom model detection shall return false

### Requirement: Gemini Settings Storage Enhancement
The settings store SHALL properly save and load custom model and API URL configurations.

#### Scenario: Settings persistence with custom configuration
- **WHEN** user enters custom model name "gemini-2.0-experimental"
- **AND** user enters custom API URL "https://custom-gemini.example.com"
- **AND** saves settings
- **THEN** both values shall be persisted to storage
- **AND** values shall be available when settings are reloaded

#### Scenario: Application startup with existing custom configuration
- **WHEN** user previously configured custom model and API URL
- **AND** the settings store loads on application start
- **THEN** custom model name shall be loaded into GEMINI_MODEL
- **AND** custom API URL shall be loaded into GEMINI_API_URL
- **AND** UI shall reflect the custom configuration