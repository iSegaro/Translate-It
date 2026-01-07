# Element Selection Capability Specification

## Purpose
Provide users with the ability to select and translate DOM elements on web pages, enabling seamless translation of content without requiring manual text selection. This capability handles complex DOM structures, preserves content organization, and applies translations back to the original elements while maintaining proper bidirectional text display.

**Contextual Sentence Translation**: For AI providers, this capability includes a placeholder-based extraction system that preserves sentence context by replacing inline elements with markers ([[AIWC-0]], [[AIWC-1]], etc.) during extraction, then reinserts them after translation. This maintains grammatical context across 100+ languages while preserving inline element structure.

**Change Source**: These requirements were enhanced by the `add-contextual-sentence-translation` change proposal.

## Requirements

### Requirement: Element Selection Activation
The system SHALL provide a mechanism to activate element selection mode.

#### Scenario: User activates element selection
- **WHEN** user triggers element selection (via shortcut, icon, or menu)
- **THEN** element selection mode is activated
- **AND** UI feedback indicates selection mode is active

#### Scenario: Element selection deactivation
- **WHEN** user presses Escape or clicks outside
- **THEN** element selection mode is deactivated
- **AND** UI feedback indicates selection mode is inactive

### Requirement: DOM Element Detection
The system SHALL detect and highlight DOM elements when the user hovers over them.

#### Scenario: Element highlighting on hover
- **WHEN** user hovers over a translatable element
- **THEN** the element is highlighted with visual feedback
- **AND** the element's boundaries are clearly indicated

#### Scenario: Element selection on click
- **WHEN** user clicks on a highlighted element
- **THEN** the element is selected for translation
- **AND** translation process is initiated

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
- **AND** inline elements (<em>, <strong>, <a>, <code>, etc.) are replaced with placeholder markers ([[AIWC-0]], [[AIWC-1]], [[AIWC-2]])
- **AND** placeholder mappings to original DOM nodes are preserved
- **AND** complete sentences with grammatical context are sent to translation provider

#### Scenario: Placeholder-based extraction example
- **GIVEN** element: `<p>Agent <em>Zero</em> AI <strong>rocks</strong>!</p>`
- **WHEN** extracted for AI provider
- **THEN** extracted text is: `"Agent [[AIWC-0]] AI [[AIWC-1]]!"`
- **AND** mapping contains: `[[AIWC-0]] → <em>Zero</em>`, `[[AIWC-1]] → <strong>rocks</strong>`

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
- **THEN** placeholder markers are extracted using regex pattern: `/\[\[\s*AIWC-(\d+)\s*\]\]/g`
- **AND** original DOM nodes are retrieved from placeholder registry
- **AND** placeholder markers are replaced with original inline elements
- **AND** translated text with reinserted elements is applied to DOM

#### Scenario: Placeholder reassembly example
- **GIVEN** extracted: `"Agent [[AIWC-0]] AI [[AIWC-1]]!"` with mappings to <em> and <strong>
- **WHEN** translated to Persian: `"عامل [[AIWC-0]] هوش مصنوعی [[AIWC-1]] عالی است!"`
- **THEN** reassembled DOM: `<p>عامل <em>Zero</em> هوش مصنوعی <strong>rocks</strong> عالی است!</p>`

#### Scenario: Fallback for missing placeholders
- **WHEN** AI provider removes or fails to preserve placeholder markers
- **THEN** system detects missing placeholders in translated text
- **AND** fallback to atomic extraction method is triggered
- **AND** translation is reattempted without placeholder system

#### Scenario: Robust placeholder format parsing
- **WHEN** AI provider modifies placeholder format (e.g., adds spaces: `[[ AIWC-0 ]]`)
- **THEN** fuzzy regex matching identifies placeholder IDs
- **AND** reassembly proceeds with modified format

### Requirement: RTL/LTR Text Direction Handling
The system SHALL handle bidirectional text display for translations.

#### Scenario: RTL text detection
- **WHEN** translated text contains RTL characters
- **THEN** RTL direction is applied to the translation
- **AND** text is displayed with proper RTL layout

#### Scenario: Mixed content processing
- **WHEN** RTL text contains LTR technical terms
- **THEN** LTR terms are wrapped with appropriate markup
- **AND** Unicode control characters are inserted for proper display

#### Scenario: Target language awareness
- **WHEN** target language is specified as RTL
- **THEN** translation direction defaults to RTL regardless of content analysis
- **AND** proper RTL styling is applied

### Requirement: Text Processing and Segmentation
The system SHALL handle large text content through intelligent segmentation.

#### Scenario: Large content segmentation
- **WHEN** extracted text exceeds provider limits
- **THEN** text is segmented at appropriate boundaries
- **AND** segments are translated individually

#### Scenario: Translation reassembly
- **WHEN** all segments are translated
- **THEN** translated segments are reassembled in original order
- **AND** reassembled translation is applied to DOM

### Requirement: Error Handling and Recovery
The system SHALL handle errors gracefully and provide user feedback.

#### Scenario: Translation provider error
- **WHEN** translation request fails
- **THEN** error message is displayed to user
- **AND** original element remains unchanged

#### Scenario: Network timeout
- **WHEN** translation request times out
- **THEN** timeout notification is shown
- **AND** user can retry translation

### Requirement: Performance and Memory Management
The system SHALL optimize performance and manage memory efficiently.

#### Scenario: Memory cleanup
- **WHEN** element selection is deactivated
- **THEN** temporary data and event listeners are cleaned up
- **AND** memory usage is released

#### Scenario: Efficient DOM queries
- **WHEN** detecting elements
- **THEN** DOM queries are optimized and cached
- **AND** performance impact is minimized

### Requirement: Cross-Browser Compatibility
The system SHALL work consistently across supported browsers.

#### Scenario: Chrome compatibility
- **WHEN** running in Chrome browser
- **THEN** all element selection features work as expected
- **AND** no browser-specific issues occur

#### Scenario: Firefox compatibility
- **WHEN** running in Firefox browser
- **THEN** all element selection features work as expected
- **AND** no browser-specific issues occur

### Requirement: Shadow DOM Support
The system SHALL support elements within Shadow DOM boundaries.

#### Scenario: Shadow DOM element detection
- **WHEN** element exists inside Shadow DOM
- **THEN** element can be selected and translated
- **AND** proper isolation is maintained

#### Scenario: Cross-shadow translation
- **WHEN** multiple shadow boundaries exist
- **THEN** translation works across boundaries seamlessly
- **AND** styling isolation is preserved

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
- **AND** `data-aiwc-original-id` attribute is set on element with unique identifier
- **AND** placeholder ID to DOM element mapping is stored
- **AND** formatted placeholder marker `[[AIWC-ID]]` is returned

#### Scenario: Placeholder retrieval
- **WHEN** placeholder ID is provided to registry
- **THEN** corresponding DOM element is returned
- **AND** element can be cloned for reassembly

#### Scenario: Registry cleanup
- **WHEN** translation is completed or cancelled
- **THEN** placeholder registry is cleared
- **AND** all `data-aiwc-original-id` attributes are removed from DOM elements
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
- **WHEN** translated text contains placeholder markers in format [[AIWC-0]], [[AIWC-1]], [[AIWC-2]]
- **THEN** all placeholder markers are extracted with positions
- **AND** placeholder IDs are parsed from marker text
- **AND** extraction order is preserved for reassembly

#### Scenario: Fuzzy placeholder format matching
- **WHEN** AI provider adds spaces around placeholder IDs ([[ AIWC-0 ]], [[ AIWC-1 ]])
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

### Requirement: Multi-Language Smart Chunking with Intl.Segmenter
The system SHALL use browser-standard `Intl.Segmenter` API for intelligent sentence boundary detection across 100+ languages when chunking long texts with placeholders.

#### Scenario: Hierarchical chunking strategy
- **WHEN** text with placeholders exceeds character limit and must be chunked
- **THEN** system applies hierarchical chunking in order:
  - Layer 1: Never split inside or adjacent to placeholder markers `[[AIWC-0]]`
  - Layer 2: Break at paragraph boundaries (double newlines `\n\n`)
  - Layer 3: Use `Intl.Segmenter` with `granularity: 'sentence'` for language-aware boundaries
  - Layer 4: Character limit fallback (last resort, warn in logs)

#### Scenario: Intl.Segmenter English abbreviation handling
- **WHEN** chunking English text: "Dr. Smith lives in the U.S.A. He is happy."
- **THEN** sentence boundaries are detected at: `["Dr. Smith lives in the U.S.A. ", "He is happy."]`
- **AND** abbreviations like "Dr." and "U.S.A." are NOT treated as sentence endings

#### Scenario: Intl.Segmenter Chinese punctuation handling
- **WHEN** chunking Chinese text: "你好。世界！你好吗？"
- **THEN** sentence boundaries are detected at: `["你好。", "世界！", "你好吗？"]`
- **AND** Chinese punctuation `。`, `！`, `？` are correctly identified as sentence endings

#### Scenario: Placeholder boundary validation
- **WHEN** chunking would split a placeholder marker
- **THEN** chunking is aborted and text is sent as single batch
- **AND** warning is logged indicating placeholder protection prevented chunking

#### Scenario: Multi-language chunking accuracy
- **WHEN** chunking text in any of 100+ supported languages
- **THEN** `Intl.Segmenter` correctly identifies sentence boundaries for that language
- **AND** placeholder markers are never split across chunks
- **AND** chunking accuracy exceeds 95% across all tested languages

### Requirement: Extension Attribute Cleanup
The system SHALL remove all extension-added attributes from DOM elements after translation completion to prevent addon trace pollution.

#### Scenario: Cleanup after successful translation
- **WHEN** placeholder translation is successfully applied to DOM
- **THEN** `cleanupPlaceholderIds(blockContainer)` is called
- **AND** all `data-aiwc-original-id` attributes are removed from elements
- **AND** no extension traces remain in website DOM

#### Scenario: Cleanup after timeout or failure
- **WHEN** translation times out or fails and reverts to original HTML
- **THEN** `cleanupPlaceholderIds(blockContainer)` is called before revert
- **AND** all `data-aiwc-original-id` attributes are removed
- **AND** DOM is clean even after failed translation

#### Scenario: Cleanup on registry clear
- **WHEN** `PlaceholderRegistry.clear()` is called
- **THEN** cleanup is triggered for all tracked elements
- **AND** all `data-aiwc-original-id` attributes are removed
- **AND** memory is freed from element references

#### Scenario: Multiple block container cleanup
- **WHEN** multiple blocks have been translated independently
- **THEN** each block's attributes are cleaned independently
- **AND** no cross-block contamination occurs
- **AND** cleanup success rate is 100%