# code-maintainability Specification

## Purpose
TBD - created by archiving change split-translation-ui-manager. Update Purpose after archive.
## Requirements
### Requirement: Service File Size Limits
Source code files SHALL NOT exceed 1,000 lines of code to maintain navigability and understandability.

#### Scenario: Large file detection
- **WHEN** a source file exceeds 1,000 lines
- **THEN** the file SHALL be refactored into smaller, focused modules
- **AND** each module SHALL have a single, clear responsibility

#### Scenario: Service composition pattern
- **WHEN** splitting a large file into multiple services
- **THEN** a coordinator pattern SHALL be used to maintain backward compatibility
- **AND** public APIs SHALL remain unchanged through delegation

### Requirement: Single Responsibility Services
Each service class SHALL have a single, well-defined responsibility.

#### Scenario: Service responsibility identification
- **WHEN** creating a new service
- **THEN** the service SHALL have a clear, documented purpose
- **AND** all methods SHALL relate to that single responsibility
- **AND** methods that belong to different concerns SHALL be extracted to separate services

#### Scenario: Service size guidelines
- **WHEN** creating services in the element-selection feature
- **THEN** services SHOULD be between 150-850 lines
- **AND** services SHALL follow the established composition pattern used by TranslationOrchestrator

### Requirement: Translation UI Service Architecture
The TranslationOrchestrator SHALL use specialized services for translation UI operations.

#### Scenario: Translation UI service composition
- **WHEN** TranslationOrchestrator coordinates translation UI operations
- **THEN** TranslationUIManager SHALL act as a coordinator
- **AND** TranslationUIManager SHALL delegate to specialized services:
  - `NotificationService` for status and toast notifications
  - `StreamingUpdateService` for real-time streaming updates
  - `StreamEndService` for stream completion handling
  - `DOMNodeMatcher` for node finding and text matching
  - `TranslationApplier` for core DOM application
  - `DirectionManager` for RTL/LTR direction handling

#### Scenario: Service initialization and cleanup
- **WHEN** TranslationUIManager is initialized
- **THEN** it SHALL initialize all composed services
- **AND** on cleanup, it SHALL clean up all composed services in reverse order
- **AND** each service SHALL follow ResourceTracker pattern for automatic resource management

### Requirement: Backward Compatibility During Refactoring
Internal refactoring SHALL NOT break existing public APIs or external consumers.

#### Scenario: Delegation pattern for compatibility
- **WHEN** refactoring a large class into multiple services
- **THEN** the original class SHALL act as a coordinator
- **AND** public methods SHALL delegate to appropriate services
- **AND** external consumers SHALL require no code changes

#### Scenario: Preserving method signatures
- **WHEN** extracting methods to new services
- **THEN** method signatures SHALL remain identical
- **AND** return values SHALL have the same structure
- **AND** error handling behavior SHALL be preserved

---

