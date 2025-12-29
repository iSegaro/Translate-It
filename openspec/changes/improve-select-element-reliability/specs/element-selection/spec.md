## ADDED Requirements

### Requirement: Target-Language-Based Text Direction
The system SHALL determine text direction primarily based on the target language, applying direction at the wrapper level like Immersive Translate.

#### Scenario: RTL target language translation
- **WHEN** translating to an RTL language (Arabic, Persian, Hebrew)
- **THEN** translation container SHALL have `dir="rtl"` attribute
- **AND** technical terms in original `<em>` tags SHALL be preserved
- **AND** no complex span wrapping or mixed content processing SHALL be applied

#### Scenario: LTR terms within RTL translation
- **WHEN** RTL translation contains English technical terms
- **THEN** terms SHALL retain their original `<em>` formatting
- **AND** SHALL display correctly within RTL context using Unicode bidi algorithm
- **AND** container-level `dir="rtl"` SHALL handle overall direction

#### Scenario: LTR target language translation
- **WHEN** translating to an LTR language
- **THEN** translation container SHALL have `dir="ltr"` attribute (default)
- **AND** RTL words SHALL display correctly with Unicode isolation
- **AND** no special processing SHALL be needed for embedded RTL content

### Requirement: Unique Segment Identification
The system SHALL assign unique identifiers to text segments during extraction for reliable translation mapping.

#### Scenario: Segment ID assignment during extraction
- **WHEN** extracting text from DOM elements
- **THEN** each text segment SHALL be assigned a unique ID
- **AND** mapping SHALL be maintained between ID and original DOM element

#### Scenario: Translation application with segment IDs
- **WHEN** applying translations
- **THEN** system SHALL use segment IDs to locate correct DOM elements
- **AND** SHALL apply translations without relying on text content matching

#### Scenario: Segment preservation through processing
- **WHEN** text is segmented for provider limits
- **THEN** original segment IDs SHALL be preserved in sub-segments
- **AND** reassembly SHALL use IDs to reconstruct complete translation

### Requirement: Hybrid Provider Response Support
The system SHALL support both JSON and array provider responses with automatic detection.

#### Scenario: JSON response handling
- **WHEN** provider returns JSON with segment mapping
- **THEN** system SHALL parse JSON and extract segment-aware translations
- **AND** SHALL apply translations using provided segment IDs

#### Scenario: Array response fallback
- **WHEN** provider returns array format
- **THEN** system SHALL process array in order of segment extraction
- **AND** SHALL map results to segments using sequential ordering

#### Scenario: Provider capability detection
- **WHEN** sending translation request
- **THEN** system SHALL detect provider capabilities
- **AND** SHALL choose appropriate response format (JSON or array)

## MODIFIED Requirements

### Requirement: RTL/LTR Text Direction Handling
The system SHALL apply direction at the container level using target language, preserving inline formatting like Immersive Translate.

#### Scenario: Container-level direction application
- **WHEN** applying translation to DOM
- **THEN** translation wrapper SHALL receive `dir` attribute based on target language
- **AND** inline elements like `<em>`, `<strong>`, `<code>` SHALL be preserved unchanged
- **AND** Unicode bidirectional algorithm SHALL handle mixed content automatically

#### Scenario: HTML formatting preservation
- **WHEN** original text contains formatted terms (e.g., <em>API</em>, <em>Z.ai</em>)
- **THEN** formatting SHALL be preserved in translation
- **AND** no additional spans or classes SHALL be added
- **AND** container-level dir SHALL ensure correct overall direction

### Requirement: Text Extraction
The system SHALL extract text while assigning and maintaining unique segment identifiers.

#### Scenario: Text extraction with segment IDs
- **WHEN** collecting text nodes from DOM
- **THEN** each extracted segment SHALL receive unique ID
- **AND** original DOM element reference SHALL be preserved
- **AND** segment metadata SHALL include position and structure information

#### Scenario: Complex structure extraction
- **WHEN** extracting from nested elements
- **THEN** segment IDs SHALL maintain hierarchical information
- **AND** parent-child relationships SHALL be preserved
- **AND** reassembly SHALL restore original structure

### Requirement: Translation Application
The system SHALL apply translations using segment IDs for reliable element modification.

#### Scenario: ID-based translation application
- **WHEN** applying translation results
- **THEN** system SHALL locate DOM elements using segment IDs
- **AND** SHALL apply translations without text matching
- **AND** SHALL preserve original element structure and attributes

#### Scenario: Translation reassembly
- **WHEN** reconstructing segmented translations
- **THEN** segment IDs SHALL guide reassembly order
- **AND** SHALL handle missing or out-of-order segments gracefully
- **AND** SHALL maintain translation完整性

### Requirement: Text Processing and Segmentation
The system SHALL segment large texts while preserving segment ID mappings.

#### Scenario: Segmentation with ID preservation
- **WHEN** text exceeds provider limits
- **THEN** original segment IDs SHALL be preserved in sub-segments
- **AND** sub-segments SHALL reference parent segment ID
- **AND** recombination SHALL restore original segment structure

#### Scenario: Translation reassembly with IDs
- **WHEN** reassembling translated segments
- **THEN** system SHALL use segment IDs for correct ordering
- **AND** SHALL avoid content-based matching errors
- **AND** SHALL maintain mapping to original DOM elements

## REMOVED Requirements

### Requirement: Complex Mixed Content Processing
**Reason**: Removing over-engineered mixed content processing that wraps English terms in spans. Immersive Translate approach uses container-level `dir` attribute and preserves original HTML formatting, which is simpler and more reliable.

**Migration**:
- Remove `processMixedContentForDisplay` function
- Remove `.ltr-term` and `.aiwc-mixed-text` CSS classes
- Implement container-level `dir` attribute based on target language
- Preserve inline HTML formatting (`<em>`, `<strong>`, etc.) without modification
- Rely on standard Unicode bidirectional algorithm for mixed content

#### Scenario: Span wrapping for LTR terms (removed)
- ~~**WHEN** RTL text contains English words~~
- ~~**THEN** English words SHALL be wrapped in `<span dir="ltr">`~~
- ~~**AND** CSS classes SHALL be applied for styling~~

### Requirement: Threshold-Based Content Direction Detection
**Reason**: Current threshold-based detection (0.1 RTL characters) incorrectly classifies mixed content. Target-language-first approach following Immersive Translate pattern is more reliable - simply apply `dir="rtl"` to container for RTL target languages.

**Migration**:
- Remove threshold-based RTL detection logic
- Implement target language checking before any content analysis
- Apply container-level `dir` attribute based on target language
- Keep content analysis only as fallback for unknown target languages

#### Scenario: Content-based direction classification (removed)
- ~~**WHEN** text contains certain percentage of RTL characters~~
- ~~**THEN** text direction SHALL be determined by content analysis~~
- ~~**AND** complex word-ratio calculations SHALL be performed~~