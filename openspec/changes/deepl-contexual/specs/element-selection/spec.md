# Element Selection Capability Specification Delta

**Change**: `deepl-contexual`
**Type**: Enhancement
**Source Spec**: `element-selection`

---

## MODIFIED Requirements

### Requirement: Provider-Aware Extraction Routing

The system SHALL route text extraction requests to appropriate methods based on translation provider type.

#### Scenario: AI provider detection
- **WHEN** translation provider is Gemini, OpenAI, Claude, or DeepL
- **THEN** system routes to placeholder-based extraction
- **AND** block-level grouping with inline element replacement is used

#### Scenario: DeepL XML provider detection (NEW)
- **WHEN** translation provider is DeepL
- **THEN** system routes to XML-based placeholder extraction
- **AND** placeholder format `<x id="N"/>` is used instead of `[[AIWC-N]]`
- **AND** DeepL's native `tag_handling="xml"` API parameter is enabled

#### Scenario: Traditional provider detection
- **WHEN** translation provider is Google, Yandex, or Bing
- **THEN** system routes to atomic extraction
- **AND** existing text node extraction behavior is maintained

#### Scenario: Provider type ambiguity
- **WHEN** provider type cannot be determined
- **THEN** system defaults to atomic extraction
- **AND** warning is logged for debugging

---

### Requirement: Placeholder Registry Management

The system SHALL maintain a registry of placeholder markers mapped to original DOM elements during extraction.

#### Scenario: Placeholder registration
- **WHEN** inline element is encountered during extraction
- **THEN** unique numeric placeholder ID is assigned
- **AND** `data-aiwc-original-id` attribute is set on element with unique identifier
- **AND** placeholder ID to DOM element mapping is stored
- **AND** formatted placeholder marker is returned based on provider format

#### Scenario: AI format placeholder registration (EXISTING)
- **WHEN** provider is Gemini, OpenAI, Claude, or DeepSeek
- **THEN** placeholder marker `[[AIWC-ID]]` is generated and returned

#### Scenario: XML format placeholder registration (NEW)
- **WHEN** provider is DeepL
- **THEN** placeholder marker `<x id="ID"/>` is generated and returned
- **AND** format field 'xml' is stored in registry entry
- **AND** self-closing XML tag syntax is used

#### Scenario: Placeholder retrieval
- **WHEN** placeholder ID is provided to registry
- **THEN** corresponding DOM element is returned
- **AND** element can be cloned for reassembly

#### Scenario: Format-aware placeholder retrieval (NEW)
- **WHEN** placeholder ID is provided to registry
- **THEN** format information is also returned from registry
- **AND** reassembly process uses correct regex pattern for format

#### Scenario: Registry cleanup
- **WHEN** translation is completed or cancelled
- **THEN** placeholder registry is cleared
- **AND** all `data-aiwc-original-id` attributes are removed from DOM elements
- **AND** all DOM element references are released

---

### Requirement: Inline Element Placeholder Replacement

The system SHALL replace inline elements with placeholder markers during extraction while preserving element references.

#### Scenario: Standard inline element replacement
- **WHEN** inline element (EM, STRONG, A, CODE, SPAN, MARK, etc.) is encountered
- **THEN** element is registered with placeholder registry
- **AND** placeholder marker replaces element in extracted text
- **AND** original element styling and event listeners are preserved

#### Scenario: AI format placeholder generation (EXISTING)
- **WHEN** extracting for AI provider
- **THEN** placeholder format is `[[AIWC-ID]]`
- **AND** brackets format is used for all AI providers

#### Scenario: XML format placeholder generation (NEW)
- **WHEN** extracting for DeepL provider
- **THEN** placeholder format is `<x id="ID"/>`
- **AND** XML self-closing tag syntax is used
- **AND** placeholder ID matches numeric ID from registry

#### Scenario: Nested inline element handling
- **WHEN** inline elements are nested (e.g., <strong><em>nested</em></strong>)
- **THEN** entire nested structure is treated as single placeholder
- **AND** placeholder marker replaces outermost element
- **AND** complete nested structure is preserved in registry

#### Scenario: Inline element detection
- **WHEN** determining if element is inline
- **THEN** element's CSS display property is checked
- **AND** inline or inline-block elements are identified
- **AND** block-level elements are not replaced with placeholders

---

### Requirement: Placeholder Extraction from Translations

The system SHALL extract and parse placeholder markers from translated text returned by translation providers.

#### Scenario: Standard AI placeholder extraction (EXISTING)
- **WHEN** translated text contains placeholder markers in format [[AIWC-0]], [[AIWC-1]], [[AIWC-2]]
- **THEN** regex pattern `/\[\[\s*AIWC-(\d+)\s*\]\]/g` is used for extraction
- **AND** all placeholder markers are extracted with positions
- **AND** placeholder IDs are parsed from marker text
- **AND** extraction order is preserved for reassembly

#### Scenario: XML placeholder extraction (NEW)
- **WHEN** translated text contains XML placeholder markers in format <x id="0"/>, <x id="1"/>, <x id="2"/>
- **THEN** regex pattern `/<x\s+id\s*=\s*["'](\d+)["']\s*\/?>/gi` is used for extraction
- **AND** pattern is whitespace-tolerant (matches `<x id = "0" >`)
- **AND** pattern is quote-agnostic (matches single and double quotes)
- **AND** pattern is RTL-safe (handles Persian/Arabic character interference)
- **AND** all placeholder markers are extracted with positions
- **AND** placeholder IDs are parsed from id attribute

#### Scenario: Fuzzy AI placeholder format matching
- **WHEN** AI provider adds spaces around placeholder IDs ([[ AIWC-0 ]], [[ AIWC-1 ]])
- **THEN** regex pattern extracts placeholders despite whitespace
- **AND** correct IDs are parsed from modified format

#### Scenario: Missing placeholder detection
- **WHEN** translated text does not contain expected placeholders
- **THEN** missing placeholder condition is detected
- **AND** fallback to atomic extraction is triggered
- **AND** retry attempt is logged for monitoring

---

### Requirement: Fallback and Error Recovery

The system SHALL gracefully handle placeholder system failures by falling back to atomic extraction.

#### Scenario: Placeholder preservation failure
- **WHEN** AI provider removes all placeholders from translation
- **THEN** system detects missing placeholders
- **AND** translation is marked for retry with atomic extraction
- **AND** user is notified of fallback (optional, based on settings)

#### Scenario: XML tag corruption detection (NEW)
- **WHEN** DeepL returns translated text with corrupted XML tags
- **THEN** system performs validation checks:
  - Tag count mismatch: response tag count ≠ request tag count
  - Malformed tags: missing closing slash, quotes, or id attribute
  - Duplicate IDs: same placeholder ID appears multiple times
- **AND** if validation fails, error with `isXMLCorruptionError` flag is thrown
- **AND** automatic fallback to atomic extraction is triggered

#### Scenario: Malformed tag detection examples (NEW)
- **WHEN** DeepL response contains `<x id="0">` (missing closing slash)
- **THEN** malformed tag is detected and fallback is triggered
- **WHEN** DeepL response contains `<x id=0/>` (missing quotes)
- **THEN** malformed tag is detected and fallback is triggered
- **WHEN** DeepL response contains `<x/>` (missing id attribute)
- **THEN** malformed tag is detected and fallback is triggered

#### Scenario: Placeholder reassembly error
- **WHEN** placeholder registry lookup fails during reassembly
- **THEN** placeholder marker is preserved as text in final output
- **AND** translation is still applied to DOM
- **AND** error is logged for debugging

#### Scenario: Registry corruption
- **WHEN** placeholder registry contains invalid references
- **THEN** system falls back to atomic extraction
- **AND** registry is cleared and reinitialized
- **AND** translation is reattempted

---

### Requirement: Text Processing and Segmentation

The system SHALL handle large text content through intelligent segmentation.

#### Scenario: Large content segmentation
- **WHEN** extracted text exceeds provider limits
- **THEN** text is segmented at appropriate boundaries
- **AND** segments are translated individually

#### Scenario: Placeholder-aware text expansion (MODIFIED)
- **WHEN** expanding texts for translation with placeholders
- **THEN** system checks for both AI format `[[AIWC-0]]` and XML format `<x id="0"/>`
- **AND** texts containing placeholders of either format are never split
- **AND** placeholder-containing texts are added as single segments

#### Scenario: Translation reassembly
- **WHEN** all segments are translated
- **THEN** translated segments are reassembled in original order
- **AND** reassembled translation is applied to DOM

---

## ADDED Requirements

### Requirement: DeepL XML API Integration

The system SHALL integrate with DeepL's native XML tag handling API when processing translations with XML placeholders.

#### Scenario: XML tag detection in request
- **WHEN** translation text contains XML placeholder markers
- **THEN** system detects presence of `<x id="N"/>` patterns
- **AND** XML tag count is calculated before API call
- **AND** tag counts are stored for post-response validation

#### Scenario: XML API parameter configuration
- **WHEN** XML placeholders are detected in translation request
- **THEN** `tag_handling` parameter is set to `"xml"`
- **AND** `ignore_tags` parameter is set to `"x"`
- **AND** parameters are included in DeepL API request

#### Scenario: XML tag preservation validation
- **WHEN** DeepL API response is received
- **THEN** XML tag count in response is compared to request count
- **AND** tag syntax integrity is validated
- **AND** placeholder ID uniqueness is verified
- **AND** validation result determines success or fallback

#### Scenario: DeepL translation example with XML
- **GIVEN** HTML: `<p>This is <strong>bold</strong> text</p>`
- **WHEN** extracted for DeepL: `"This is <x id="0"/> text"`
- **AND** sent to DeepL API with `tag_handling="xml"`
- **THEN** response preserves tags: `"Das ist <x id="0"/> Text"` (German)
- **AND** reassembled: `<p>Das ist <strong>bold</strong> Text</p>`

---

### Requirement: Format-Aware Placeholder Reassembly

The system SHALL reassemble translated text by replacing format-specific placeholder markers with original inline elements.

#### Scenario: Format auto-detection
- **WHEN** translated text is received
- **THEN** system detects placeholder format from text pattern
- **AND** AI format detected by presence of `[[AIWC-N]]` pattern
- **AND** XML format detected by presence of `<x id="N"/>` pattern
- **AND** atomic mode assumed if no patterns detected

#### Scenario: AI format reassembly (EXISTING)
- **WHEN** AI format placeholders are detected
- **THEN** regex pattern `/\[\[\s*AIWC-(\d+)\s*\]\]/g` is used
- **AND** placeholders are replaced with original HTML from registry
- **AND** translated text with inline elements is applied to DOM

#### Scenario: XML format reassembly (NEW)
- **WHEN** XML format placeholders are detected
- **THEN** regex pattern `/<x\s+id\s*=\s*["'](\d+)["']\s*\/?>/gi` is used
- **AND** whitespace-tolerant matching handles format variations
- **AND** placeholders are replaced with original HTML from registry
- **AND** translated text with inline elements is applied to DOM

#### Scenario: Reassembly failure handling
- **WHEN** placeholder ID not found in registry during reassembly
- **THEN** placeholder marker is preserved as-is in final output
- **AND** warning is logged for debugging
- **AND** translation is still applied to DOM

---

### Requirement: DeepL Newline System Compatibility

The system SHALL maintain compatibility with DeepL's existing @@@ newline marker system when using XML placeholders.

#### Scenario: Newline marker application order
- **WHEN** extracting text with both newlines and inline elements
- **THEN** newlines are replaced with @@@ markers FIRST
- **AND** inline elements are replaced with XML placeholders SECOND
- **AND** final text contains both @@@ and `<x id="N"/>` markers

#### Scenario: Translation with both marker types
- **GIVEN** HTML: `<p>Line 1\n<strong>bold</strong>\nLine 2</p>`
- **WHEN** extracted for DeepL
- **THEN** result is: `"Line 1@@@<x id="0"/>@@@Line 2"`
- **AND** DeepL preserves both @@@ and XML tags during translation
- **AND** response contains both markers in translated form

#### Scenario: Marker restoration order
- **WHEN** DeepL translation response is received
- **THEN** @@@ markers are restored to newlines FIRST
- **AND** XML placeholders are reassembled SECOND
- **AND** final output has proper newlines and inline elements

#### Scenario: Edge case prevention
- **WHEN** newline markers applied after XML placeholders (wrong order)
- **THEN** XML parsing may break on @@@ markers
- **AND** correct order prevents this edge case
- **AND** system enforces proper order automatically
