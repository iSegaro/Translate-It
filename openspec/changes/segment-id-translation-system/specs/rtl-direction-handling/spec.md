# RTL Direction Handling Specification

## Purpose
Ensure proper display of bidirectional text content, especially technical terms in RTL contexts, using Unicode control characters and CSS isolation.

## ADDED Requirements

### Requirement: Technical Term Detection and Isolation
The system SHALL detect technical terms in text and apply proper directional isolation for RTL contexts.

#### Scenario: API acronym display in Persian
- **WHEN** translating to Persian with "API" in the text
- **THEN** "API" SHALL be wrapped with LTR Unicode controls
- **AND** display as "API" (left-to-right) within Persian text flow

#### Scenario: Domain name display in Arabic
- **WHEN** translating to Arabic with "Z.ai" in the text
- **THEN** "Z.ai" SHALL maintain LTR direction
- **AND** display correctly as "Z.ai" within Arabic context

#### Scenario: Mixed technical content
- **WHEN** text contains multiple technical terms (HTTP, JSON, v2.0)
- **THEN** each term SHALL be individually isolated with LTR controls
- **AND** maintain proper spacing and order in RTL text

### Requirement: Unicode Control Character Insertion
The system SHALL automatically insert appropriate Unicode control characters for bidirectional text handling.

#### Scenario: LTR embedding for acronyms
- **WHEN** processing text for RTL target language
- **AND** detecting all-caps technical terms
- **THEN** system SHALL insert LRE (U+202A) before the term
- **AND** insert PDF (U+202C) after the term

#### Scenario: Domain name isolation
- **WHEN** detecting domain patterns (example.com, z.ai)
- **THEN** system SHALL apply LTR isolation to entire domain
- **AND** preserve domain formatting and dots

#### Scenario: Version number handling
- **WHEN** encountering version strings (v2.0, 3.1.4)
- **THEN** system SHALL apply LTR isolation to version pattern
- **AND** maintain numeric order display

### Requirement: CSS Direction Management
The system SHALL apply appropriate CSS properties to support bidirectional text rendering.

#### Scenario: Container direction setting
- **WHEN** applying translation to RTL target language
- **THEN** container SHALL have `direction: rtl` and `unicode-bidi: plaintext`
- **AND** allow browser to handle mixed content naturally

#### Scenario: Technical term CSS isolation
- **WHEN** displaying technical terms in RTL context
- **THEN** system SHALL use CSS isolation for terms with Unicode controls
- **AND** prevent parent direction from affecting term display

#### Scenario: Nested element handling
- **WHEN** translations are applied to nested DOM structures
- **THEN** each level SHALL maintain its directional context
- **AND** Unicode controls SHALL work correctly across nesting

### Requirement: Content Processing Pipeline
The system SHALL process text through a bidirectional handling pipeline before application.

#### Scenario: Pre-translation processing
- **WHEN** preparing text for translation
- **THEN** system SHALL analyze for bidirectional requirements
- **AND** mark text requiring special handling

#### Scenario: Post-translation enhancement
- **WHEN** receiving translation results
- **THEN** system SHALL apply Unicode controls where needed
- **AND** ensure proper display in target language context

#### Scenario: Performance optimization
- **WHEN** processing large amounts of text
- **THEN** system SHALL cache technical term patterns
- **AND** optimize Unicode character insertion

## Implementation Notes

### Technical Term Patterns
```javascript
const TECHNICAL_PATTERNS = [
  /\b[A-Z]{2,}\b/g,        // Acronyms: API, HTTP, JSON
  /\b\w+\.\w+\b/g,        // Domains: z.ai, example.com
  /\b\w+\d+\b/g,          // Versioned: v2, api3
  /\b\d+\w+\b/g,          // Numbered: 3D, 4K
];
```

### Unicode Control Characters
```javascript
const UNICODE_CONTROLS = {
  LRE: '\u202A',  // Left-to-Right Embedding
  RLE: '\u202B',  // Right-to-Left Embedding
  PDF: '\u202C',  // Pop Directional Format
  LRO: '\u202D',  // Left-to-Right Override
  RLO: '\u202E',  // Right-to-Left Override
};
```

### Processing Pipeline
```javascript
function processBidirectionalText(text, targetLanguage) {
  if (!isRTLLanguage(targetLanguage)) {
    return text;
  }

  return text.replace(TECHNICAL_PATTERNS, (match) => {
    return `${UNICODE_CONTROLS.LRE}${match}${UNICODE_CONTROLS.PDF}`;
  });
}
```