## ADDED Requirements

### Requirement: Batch STT remains supported
The system SHALL keep existing batch STT providers working in the background without changing their current chunk-to-final-result behavior.

#### Scenario: Batch provider receives finalized chunk
- **WHEN** the live-caption session uses a batch STT provider
- **THEN** the system SHALL continue to transcribe finalized audio chunks in the background and produce final transcript results

#### Scenario: Batch provider behavior unchanged
- **WHEN** no streaming provider is selected
- **THEN** the system SHALL NOT require any streaming-session state, partial transcript handling, or streaming transport behavior

### Requirement: Streaming STT executes in offscreen
The system SHALL execute future streaming STT providers in the offscreen document and SHALL NOT require the service worker to own the long-lived provider session or websocket transport.

#### Scenario: Streaming session start
- **WHEN** a streaming STT provider is selected for an active live-caption session
- **THEN** the system SHALL start the provider runtime in the offscreen document

#### Scenario: Service worker restart
- **WHEN** the background service worker restarts during an active streaming session
- **THEN** the system SHALL recover orchestration state without requiring the service worker to own the live websocket or media stream

### Requirement: Provider manifest declares execution location and capabilities
The system SHALL describe each STT provider with explicit mode and execution-location metadata so the runtime can route batch providers and streaming providers to the correct execution host.

#### Scenario: Batch provider metadata
- **WHEN** a provider is registered as batch
- **THEN** the provider manifest SHALL mark it as background-executed and SHALL NOT declare streaming-only capabilities

#### Scenario: Streaming provider metadata
- **WHEN** a provider is registered as streaming
- **THEN** the provider manifest SHALL mark it as offscreen-executed and SHALL declare whether it supports partial results, corrections, reconnect, and a persistent connection

### Requirement: Transcript events use a revisioned identity model
The system SHALL represent transcript output as revisioned transcript events with stable segment identity so that batch final results and streaming partial/final/correction/error events can converge on a common contract.

#### Scenario: Partial transcript event
- **WHEN** a streaming provider emits a partial hypothesis
- **THEN** the system SHALL emit a transcript event with a stable segment identity and revision number

#### Scenario: Final transcript event
- **WHEN** a batch provider or streaming provider produces a final transcript
- **THEN** the system SHALL emit a final transcript event with the same identity model and finality flag

#### Scenario: Correction transcript event
- **WHEN** a streaming provider revises a previously emitted transcript
- **THEN** the system SHALL emit a correction event that references the superseded segment or event and increments revision

#### Scenario: Provider error event
- **WHEN** transcription fails in a batch or streaming provider
- **THEN** the system SHALL emit an error event that identifies the provider, session, and failure details

### Requirement: Transcript events converge through a dedicated coordinator
The system SHALL route batch final transcript results and streaming transcript events through a dedicated transcript-event convergence layer before canonical session updates and translation.

#### Scenario: Batch result routing
- **WHEN** a batch STT provider returns a final transcript result
- **THEN** the system SHALL normalize that result through the transcript-event convergence layer before translation and persistence

#### Scenario: Streaming event routing
- **WHEN** a streaming STT provider emits a partial, final, correction, or error event
- **THEN** the system SHALL normalize that event through the transcript-event convergence layer before canonical session updates

### Requirement: Partial transcripts remain ephemeral
The system SHALL keep partial transcript state ephemeral and SHALL NOT persist partial hypotheses in the canonical session cache or IndexedDB stores.

#### Scenario: Partial transcript handling
- **WHEN** a streaming provider emits a partial transcript
- **THEN** the system SHALL retain it only in transient runtime state for immediate display or reconciliation

#### Scenario: Session end cleanup
- **WHEN** a live-caption session stops, pauses, fails closed, or restarts
- **THEN** the system SHALL discard partial transcript state

### Requirement: No background partial-state manager
The system SHALL NOT require a dedicated background-owned partial transcript state manager that duplicates the offscreen provider's live partial hypotheses.

#### Scenario: Partial state ownership
- **WHEN** the offscreen provider owns live partial hypotheses
- **THEN** the background layer SHALL process transcript events without maintaining a duplicate background partial cache

#### Scenario: Recovery without partial duplication
- **WHEN** the service worker or offscreen runtime restarts
- **THEN** the system SHALL recover canonical session state without restoring discarded partial hypotheses

### Requirement: Corrections are revision-based
The system SHALL treat transcript corrections as revisioned replacements of an existing logical segment identified by segmentId and revision.

#### Scenario: Higher revision replaces lower revision
- **WHEN** a correction event arrives with a higher revision for the same segment identity
- **THEN** the system SHALL treat the newer revision as the canonical transcript value

#### Scenario: Canonical persistence of corrections
- **WHEN** a correction becomes the canonical transcript value
- **THEN** the system SHALL persist only the latest canonical revision rather than preserving transient draft history in the main transcript cache

### Requirement: Translation consumes final transcript events only for MVP
The system SHALL send only final or corrected-final transcript events to translation for the MVP and SHALL NOT translate partial transcript events.

#### Scenario: Final transcript translation
- **WHEN** a final or corrected-final transcript event is produced
- **THEN** the system SHALL forward it to the existing translation pipeline

#### Scenario: Partial transcript translation blocked
- **WHEN** a partial transcript event is produced
- **THEN** the system SHALL NOT send it to translation in the MVP

### Requirement: Streaming recovery stays host-owned
The system SHALL keep websocket reconnect, streaming session recovery, and provider cleanup owned by the provider execution host while the background layer owns orchestration and fail-close policy.

#### Scenario: Provider disconnect
- **WHEN** a streaming provider disconnects
- **THEN** the provider execution host SHALL handle reconnect or cleanup according to its capability flags and SHALL notify the background layer of the failure state

#### Scenario: Offscreen restart
- **WHEN** the offscreen document restarts
- **THEN** the background layer SHALL re-establish orchestration state and MAY restart the streaming session only if the live-caption session remains valid
