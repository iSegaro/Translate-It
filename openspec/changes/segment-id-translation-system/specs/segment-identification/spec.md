# Segment Identification Specification

## Purpose
Ensure reliable mapping between extracted text segments and their original DOM positions during translation processing.

## ADDED Requirements

### Requirement: Unique Segment ID Generation
The system SHALL generate unique identifiers for each extracted text segment to enable reliable mapping during translation application.

#### Scenario: Unique ID assignment during text extraction
- **WHEN** text nodes are collected from a DOM element for translation
- **THEN** each text segment SHALL be assigned a unique identifier in format "seg-{timestamp}-{index}"
- **AND** the ID SHALL be stored with the segment metadata for later reference

#### Scenario: ID collision prevention
- **WHEN** multiple translation operations occur simultaneously
- **THEN** segment IDs SHALL remain unique across operations
- **AND** no ID collisions SHALL occur even with rapid successive extractions

### Requirement: DOM Element Reference Maintenance
The system SHALL maintain references to original DOM elements for each identified segment.

#### Scenario: Element mapping preservation
- **WHEN** segments are extracted for translation
- **THEN** each segment SHALL store a reference to its originating DOM element
- **AND** the reference SHALL remain valid throughout the translation process

#### Scenario: Dynamic content handling
- **WHEN** DOM elements are modified during translation
- **THEN** the system SHALL detect element removal and handle gracefully
- **AND** translation SHALL not be applied to removed elements

### Requirement: Segment Metadata Collection
The system SHALL collect relevant metadata for each segment to support intelligent processing.

#### Scenario: Technical term detection
- **WHEN** processing segments for RTL languages
- **THEN** the system SHALL detect and mark technical terms (API, Z.ai, etc.)
- **AND** store this information in segment metadata

#### Scenario: Content type classification
- **WHEN** extracting text segments
- **THEN** the system SHALL classify content type (text, number, mixed)
- **AND** store classification in segment metadata for processing decisions

### Requirement: Segment Structure Preservation
The system SHALL preserve the structural relationship between segments for accurate reconstruction.

#### Scenario: Sequential ordering maintenance
- **WHEN** multiple segments are extracted from a single element
- **THEN** their sequential order SHALL be preserved in the segment collection
- **AND** index information SHALL be stored for reconstruction

#### Scenario: Hierarchical relationship tracking
- **WHEN** segments are extracted from nested elements
- **THEN** parent-child relationships SHALL be tracked in metadata
- **AND** used for proper translation application

## Implementation Notes

### ID Generation Algorithm
```javascript
function generateSegmentId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 5);
  const index = this.segmentCounter++;
  return `seg-${timestamp}-${random}-${index}`;
}
```

### Segment Data Structure
```javascript
interface Segment {
  id: string;
  text: string;
  element: HTMLElement;
  index: number;
  metadata: {
    isTechnicalTerm: boolean;
    contentType: 'text' | 'number' | 'mixed';
    parentId?: string;
    extractionTime: number;
  };
}
```