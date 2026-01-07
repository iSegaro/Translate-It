# Element Selection Capability Specification Delta

## MODIFIED Requirements

### Requirement: Text Extraction
The system SHALL extract text content from selected DOM elements while preserving structure. For AI providers, the system SHALL use block-level extraction with placeholder markers for inline elements to maintain sentence context.

#### Scenario: Text extraction from simple element
- **WHEN** a simple text element is selected
- **THEN** all text content is extracted
- **AND** text nodes are collected in order

#### Scenario: Text extraction from complex element
- **WHEN** an element with nested structure is selected
- **THEN** text from all descendant nodes is extracted
- **AND** original structure mapping is preserved

#### Scenario: Contextual sentence extraction for AI providers
- **WHEN** an element with inline tags is selected for AI provider translation
- **THEN** the block-level container is identified
- **AND** inline elements (<em>, <strong>, <a>, <code>, etc.) are replaced with placeholder markers ([0], [1], [2])
- **AND** placeholder mappings to original DOM nodes are preserved
- **AND** complete sentences with grammatical context are sent to translation provider

#### Scenario: Placeholder-based extraction example
- **GIVEN** element: `<p>Agent <em>Zero</em> AI <strong>rocks</strong>!</p>`
- **WHEN** extracted for AI provider
- **THEN** extracted text is: `"Agent [0] AI [1]!"`
- **AND** mapping contains: `[0] → <em>Zero</em>`, `[1] → <strong>rocks</strong>`

#### Scenario: Atomic extraction for traditional providers
- **WHEN** an element is selected for traditional provider (Google, Yandex) translation
- **THEN** text nodes are extracted individually (existing behavior)
- **AND** no placeholder markers are used

### Requirement: Translation Request Processing
The system SHALL process extracted text through translation providers. For AI providers using placeholders, the system SHALL include placeholder preservation instructions and prevent splitting placeholder-containing texts across batches.

#### Scenario: Single provider translation
- **WHEN** text is extracted and a provider is selected
- **THEN** translation request is sent to the provider
- **AND** response is processed when received

#### Scenario: Streaming translation support
- **WHEN** provider supports streaming
- **THEN** translation results are displayed as they stream in
- **AND** UI updates in real-time

#### Scenario: Placeholder preservation in AI prompts
- **WHEN** text with placeholder markers is sent to AI provider
- **THEN** prompt includes explicit instructions to preserve placeholders
- **AND** examples demonstrate correct placeholder handling
- **AND** provider is instructed NOT to modify, remove, or renumber placeholders

#### Scenario: Batch protection for placeholder texts
- **WHEN** text containing placeholder markers is batched for translation
- **THEN** text is placed in single-item batch
- **AND** placeholder markers are not split across batch boundaries

### Requirement: Translation Application
The system SHALL apply translations back to the original DOM elements. For AI provider translations using placeholders, the system SHALL reassemble translated text by replacing placeholder markers with original inline elements.

#### Scenario: Translation application to wrapper
- **WHEN** translation is received
- **THEN** original element is wrapped in translation container
- **AND** translated text is displayed with proper styling

#### Scenario: Original text preservation
- **WHEN** translation is applied
- **THEN** original text is preserved for reference
- **AND** user can toggle between original and translated text

#### Scenario: Placeholder reassembly for AI providers
- **WHEN** translated text contains placeholder markers from extraction
- **THEN** placeholder markers are extracted using regex pattern: `/\[\s*(\d+)\s*\]/g`
- **AND** original DOM nodes are retrieved from placeholder registry
- **AND** placeholder markers are replaced with original inline elements
- **AND** translated text with reinserted elements is applied to DOM

#### Scenario: Placeholder reassembly example
- **GIVEN** extracted: `"Agent [0] AI [1]!"` with mappings to <em> and <strong>
- **WHEN** translated to Persian: `"عامل [0] هوش مصنوعی [1] عالی است!"`
- **THEN** reassembled DOM: `<p>عامل <em>Zero</em> هوش مصنوعی <strong>rocks</strong> عالی است!</p>`

#### Scenario: Fallback for missing placeholders
- **WHEN** AI provider removes or fails to preserve placeholder markers
- **THEN** system detects missing placeholders in translated text
- **AND** fallback to atomic extraction method is triggered
- **AND** translation is reattempted without placeholder system

#### Scenario: Robust placeholder format parsing
- **WHEN** AI provider modifies placeholder format (e.g., adds spaces: `[ 0 ]`)
- **THEN** fuzzy regex matching identifies placeholder IDs
- **AND** reassembly proceeds with modified format

## ADDED Requirements

### Requirement: Provider-Aware Extraction Routing
The system SHALL route text extraction requests to appropriate methods based on translation provider type.

#### Scenario: AI provider detection
- **WHEN** translation provider is Gemini, OpenAI, Claude, or DeepL
- **THEN** system routes to placeholder-based extraction
- **AND** block-level grouping with inline element replacement is used

#### Scenario: Traditional provider detection
- **WHEN** translation provider is Google, Yandex, or Bing
- **THEN** system routes to atomic extraction
- **AND** existing text node extraction behavior is maintained

#### Scenario: Provider type ambiguity
- **WHEN** provider type cannot be determined
- **THEN** system defaults to atomic extraction
- **AND** warning is logged for debugging

### Requirement: Placeholder Registry Management
The system SHALL maintain a registry of placeholder markers mapped to original DOM elements during extraction.

#### Scenario: Placeholder registration
- **WHEN** inline element is encountered during extraction
- **THEN** unique numeric placeholder ID is assigned
- **AND** placeholder ID to DOM element mapping is stored
- **AND** formatted placeholder marker `[ID]` is returned

#### Scenario: Placeholder retrieval
- **WHEN** placeholder ID is provided to registry
- **THEN** corresponding DOM element is returned
- **AND** element can be cloned for reassembly

#### Scenario: Registry cleanup
- **WHEN** translation is completed or cancelled
- **THEN** placeholder registry is cleared
- **AND** all DOM element references are released

### Requirement: Block-Level Container Detection
The system SHALL identify appropriate block-level containers for contextual text extraction.

#### Scenario: Standard block container identification
- **WHEN** element is nested within P, DIV, LI, H1-H6, TD, TH, BLOCKQUOTE, ARTICLE, or SECTION
- **THEN** closest block-level ancestor is selected as extraction container
- **AND** all descendant content is extracted as single translation unit

#### Scenario: Direct element selection
- **WHEN** selected element is itself block-level
- **THEN** element itself is used as extraction container
- **AND** all its content is extracted

#### Scenario: Fallback container selection
- **WHEN** no block-level ancestor is found
- **THEN** selected element is used as extraction container
- **AND** extraction proceeds with available content

### Requirement: Inline Element Placeholder Replacement
The system SHALL replace inline elements with placeholder markers during extraction while preserving element references.

#### Scenario: Standard inline element replacement
- **WHEN** inline element (EM, STRONG, A, CODE, SPAN, MARK, etc.) is encountered
- **THEN** element is registered with placeholder registry
- **AND** placeholder marker replaces element in extracted text
- **AND** original element styling and event listeners are preserved

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

### Requirement: Placeholder Extraction from Translations
The system SHALL extract and parse placeholder markers from translated text returned by AI providers.

#### Scenario: Standard placeholder extraction
- **WHEN** translated text contains placeholder markers in format [0], [1], [2]
- **THEN** all placeholder markers are extracted with positions
- **AND** placeholder IDs are parsed from marker text
- **AND** extraction order is preserved for reassembly

#### Scenario: Fuzzy placeholder format matching
- **WHEN** AI provider adds spaces around placeholder IDs ([ 0 ], [ 1 ])
- **THEN** regex pattern extracts placeholders despite whitespace
- **AND** correct IDs are parsed from modified format

#### Scenario: Missing placeholder detection
- **WHEN** translated text does not contain expected placeholders
- **THEN** missing placeholder condition is detected
- **AND** fallback to atomic extraction is triggered
- **AND** retry attempt is logged for monitoring

### Requirement: Fallback and Error Recovery
The system SHALL gracefully handle placeholder system failures by falling back to atomic extraction.

#### Scenario: Placeholder preservation failure
- **WHEN** AI provider removes all placeholders from translation
- **THEN** system detects missing placeholders
- **AND** translation is marked for retry with atomic extraction
- **AND** user is notified of fallback (optional, based on settings)

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
