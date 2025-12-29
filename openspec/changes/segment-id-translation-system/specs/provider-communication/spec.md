# Provider Communication Specification

## Purpose
Implement intelligent provider communication that supports both JSON and array response formats across different provider types.

## ADDED Requirements

### Requirement: Smart JSON Mode Detection
The system SHALL intelligently determine when to use JSON format based on provider capabilities and content characteristics.

#### Scenario: AI provider JSON preference
- **WHEN** using AI providers (OpenAI, Gemini, etc.)
- **AND** provider supports JSON mode
- **THEN** system SHALL use JSON format for segment-based requests
- **AND** expect JSON response with segment mappings

#### Scenario: Traditional provider array handling
- **WHEN** using traditional providers (Google, Bing, Yandex)
- **THEN** system SHALL use array format for compatibility
- **AND** map array responses back to segment IDs

#### Scenario: Hybrid format selection
- **WHEN** provider supports both formats
- **AND** content is simple (few segments, no complex structure)
- **THEN** system SHALL prefer JSON format for better mapping
- **AND** fallback to array if JSON fails

### Requirement: Request Format Standardization
The system SHALL create standardized request formats that work across all provider types.

#### Scenario: Segmented request creation
- **WHEN** preparing translation request with segments
- **THEN** system SHALL include segment IDs in the request payload
- **AND** maintain segment ordering information

#### Scenario: JSON request structure
- **WHEN** using JSON format with provider
- **THEN** request SHALL contain structured segments with IDs and text
- **AND** include metadata for processing hints

#### Scenario: Array request fallback
- **WHEN** JSON format is not supported
- **THEN** system SHALL create array of texts for traditional API
- **AND** maintain internal ID-to-index mapping

### Requirement: Response Format Handling
The system SHALL handle both JSON and array response formats and standardize them internally.

#### Scenario: JSON response processing
- **WHEN** provider returns JSON with segment mappings
- **THEN** system SHALL validate response structure
- **AND** extract translations with corresponding segment IDs

#### Scenario: Array response processing
- **WHEN** provider returns array of translations
- **THEN** system SHALL map array indices to segment IDs
- **AND** create standardized response format

#### Scenario: Mixed response validation
- **WHEN** response format is unclear or malformed
- **THEN** system SHALL attempt both JSON and array parsing
- **AND** use successful parsing method

### Requirement: Error Handling and Fallback
The system SHALL provide robust error handling with graceful fallbacks between communication formats.

#### Scenario: JSON format failure
- **WHEN** JSON request fails with provider error
- **AND** provider supports array format
- **THEN** system SHALL automatically retry with array format
- **AND** log format switch for debugging

#### Scenario: Response mapping failure
- **WHEN** response cannot be mapped to original segments
- **THEN** system SHALL fallback to sequential application
- **AND** preserve as many translations as possible

#### Scenario: Provider capability detection
- **WHEN** provider capabilities are unknown
- **THEN** system SHALL probe with simple JSON request first
- **AND** fall back to array if JSON fails

## Implementation Notes

### Provider Capability Interface
```javascript
interface ProviderCapability {
  supportsJson: boolean;
  supportsSegments: boolean;
  maxSegments: number;
  preferredFormat: 'json' | 'array';
}
```

### Request Builder Pattern
```javascript
class RequestBuilder {
  buildForProvider(segments, provider) {
    if (this.shouldUseJsonFormat(provider, segments)) {
      return this.buildJsonRequest(segments);
    }
    return this.buildArrayRequest(segments);
  }
}
```

### Response Processor
```javascript
class ResponseProcessor {
  process(response, originalSegments, format) {
    switch (format) {
      case 'json':
        return this.processJsonResponse(response);
      case 'array':
        return this.processArrayResponse(response, originalSegments);
      default:
        return this.detectAndProcess(response, originalSegments);
    }
  }
}
```