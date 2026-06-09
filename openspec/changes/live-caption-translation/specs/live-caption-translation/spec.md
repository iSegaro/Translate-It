## ADDED Requirements

### Requirement: User-triggered activation
The system SHALL require an explicit user action before a live-caption session can start.

#### Scenario: Start request from user action
- **WHEN** the user clicks the live-caption start control
- **THEN** the system SHALL begin the activation flow

#### Scenario: No auto-start on page load
- **WHEN** a supported page loads
- **THEN** the system SHALL NOT start live-caption capture automatically

### Requirement: Consent before capture
The system SHALL present a privacy notice and obtain explicit consent before capturing any audio.

#### Scenario: Consent gate before capture
- **WHEN** the user initiates live captioning
- **THEN** the system SHALL show a privacy notice before any audio capture begins

#### Scenario: Capture blocked until acceptance
- **WHEN** the user has not accepted the privacy notice
- **THEN** the system SHALL NOT start audio capture

### Requirement: Chrome and Edge desktop MVP only
The system SHALL support live-caption translation only on Chrome and Edge desktop browsers for the MVP.

#### Scenario: Supported desktop browser
- **WHEN** the user uses Chrome or Edge on desktop
- **THEN** the system SHALL allow live-caption activation if required permissions are available

#### Scenario: Unsupported platform
- **WHEN** the user uses Firefox or a mobile browser
- **THEN** the system SHALL NOT expose the live-caption MVP as supported

### Requirement: One active video per tab
The system SHALL allow only one active live-caption video session per tab at a time.

#### Scenario: Second video becomes active
- **WHEN** a different video in the same tab becomes the active target
- **THEN** the system SHALL end the current video session before starting the new one

#### Scenario: Existing session already active
- **WHEN** a tab already has an active live-caption session
- **THEN** the system SHALL NOT create a second concurrent video session for that tab

### Requirement: Active-video detection
The system SHALL detect the active video element in the current tab and use it as the caption target.

#### Scenario: Detect the visible playing video
- **WHEN** the page contains multiple videos
- **THEN** the system SHALL select the active video using deterministic detection rules

#### Scenario: Active target changes
- **WHEN** the detected active video changes
- **THEN** the system SHALL update the caption session to follow the new video target

### Requirement: Deterministic active-video tie-break
The system SHALL resolve multiple candidate videos using a deterministic MVP tie-break order.

#### Scenario: Multiple candidate videos
- **WHEN** more than one video could be selected as the active target
- **THEN** the system SHALL choose candidates in this order: currently playing, visible in viewport, audible or unmuted when detectable, largest visible area, most recent user interaction, DOM order

#### Scenario: Final deterministic fallback
- **WHEN** all higher-priority candidate attributes are tied or unavailable
- **THEN** the system SHALL use DOM order as the final deterministic fallback

### Requirement: Offscreen tab audio capture
The system SHALL capture tab audio through an offscreen document for the live-caption session.

#### Scenario: Start capture path
- **WHEN** live-caption capture starts
- **THEN** the system SHALL route audio capture through the offscreen document

#### Scenario: Stop capture path
- **WHEN** the live-caption session stops
- **THEN** the system SHALL stop the offscreen audio capture and release the stream

### Requirement: Offscreen session snapshot for recovery
The system SHALL expose a lightweight live-caption session snapshot from the offscreen document for MV3 recovery.

#### Scenario: Snapshot query after wakeup
- **WHEN** the background service worker wakes up or restarts
- **THEN** the system SHALL allow the background to query offscreen session status and snapshot metadata

#### Scenario: No raw audio in recovery
- **WHEN** the background reconciles recovery state
- **THEN** the system SHALL NOT require or persist raw audio for recovery

### Requirement: Background wakeup reconciliation
The system SHALL reconcile background session state from offscreen status and persisted session metadata after wakeup or restart.

#### Scenario: Successful reconciliation
- **WHEN** the background service worker wakes up and offscreen status plus persisted metadata are consistent
- **THEN** the system SHALL rebuild the session registry from those sources

#### Scenario: Reconciliation failure
- **WHEN** the background service worker cannot reconcile the live-caption session state
- **THEN** the system SHALL fail closed by stopping capture and notifying content

### Requirement: Batch STT
The system SHALL perform speech-to-text in batch mode and SHALL return final transcript segments only.

#### Scenario: Finalized chunk transcription
- **WHEN** an audio chunk is finalized
- **THEN** the system SHALL transcribe the chunk as a batch result

#### Scenario: No partial captions
- **WHEN** the system is transcribing audio
- **THEN** the system SHALL NOT expose partial or streaming caption output in the MVP

### Requirement: Separate STT provider system
The system SHALL use a dedicated STT provider architecture that is separate from the translation provider system.

#### Scenario: STT provider resolution
- **WHEN** the live-caption session needs transcription
- **THEN** the system SHALL resolve the STT provider through the STT provider factory and manifest

#### Scenario: Translation provider isolation
- **WHEN** the system performs transcription
- **THEN** the system SHALL NOT route STT through the translation provider hierarchy

### Requirement: Existing translation provider reuse
The system SHALL reuse the existing translation provider resolution flow and current translation settings for translated captions.

#### Scenario: Translate finalized transcript
- **WHEN** STT produces finalized transcript text
- **THEN** the system SHALL hand that text to the existing translation provider pipeline

#### Scenario: No new provider selection UI
- **WHEN** the live-caption MVP is configured
- **THEN** the system SHALL NOT introduce a separate provider-selection UI for live captioning

### Requirement: OpenAI API key reuse for Whisper MVP
The system SHALL reuse the existing OpenAI API key and settings path for the OpenAI Whisper MVP provider.

#### Scenario: Missing or invalid credentials
- **WHEN** the OpenAI API key is missing or invalid
- **THEN** the system SHALL surface a live-caption startup or provider error

#### Scenario: No separate STT credential UI
- **WHEN** the user configures live captioning for the MVP
- **THEN** the system SHALL NOT introduce a separate STT credential UI

### Requirement: Final captions only
The system SHALL render only finalized captions and SHALL NOT render partial or streaming caption text in the MVP.

#### Scenario: Caption rendering after finalization
- **WHEN** translation completes for a finalized transcript segment
- **THEN** the system SHALL render the resulting caption as a final caption line

#### Scenario: Incomplete segment
- **WHEN** a transcript segment is still in progress
- **THEN** the system SHALL NOT render it as a live partial caption

### Requirement: Shadow DOM overlay
The system SHALL render live-caption UI inside the existing Shadow DOM UI Host.

#### Scenario: Overlay mount
- **WHEN** live captioning starts
- **THEN** the system SHALL mount the overlay through the existing UI Host infrastructure

#### Scenario: Page style isolation
- **WHEN** the overlay is rendered
- **THEN** the system SHALL keep the UI isolated from page CSS through Shadow DOM

### Requirement: Per-video cache
The system SHALL key live-caption cache data per video, not per page.

#### Scenario: Different video sources
- **WHEN** two videos in the same tab have different identities
- **THEN** the system SHALL store and retrieve cache entries separately for each video

#### Scenario: Resume same video
- **WHEN** the same video is resumed in the same tab scope
- **THEN** the system SHALL reuse cache entries for that video identity

### Requirement: Separate transcript and translation stores
The system SHALL store original transcript data and translated caption data in separate persistent stores.

#### Scenario: Persist transcript segment
- **WHEN** a transcript segment is finalized
- **THEN** the system SHALL persist the original transcript text in the transcript store

#### Scenario: Persist translated caption segment
- **WHEN** a caption translation is finalized
- **THEN** the system SHALL persist the translated text in the translation store

### Requirement: Incognito session-only behavior
The system SHALL avoid persistent live-caption cache storage in incognito mode.

#### Scenario: Incognito start
- **WHEN** the user starts live captioning in an incognito context
- **THEN** the system SHALL keep the session state in memory only

#### Scenario: Incognito stop
- **WHEN** an incognito live-caption session ends
- **THEN** the system SHALL NOT write persistent caption cache entries

### Requirement: Retry without provider fallback
The system SHALL support retry for transient live-caption failures and SHALL NOT introduce automatic provider fallback for the live-caption MVP.

#### Scenario: Transient transcription failure
- **WHEN** a transcription request fails transiently
- **THEN** the system SHALL retry the request according to the live-caption retry policy

#### Scenario: No automatic fallback
- **WHEN** the primary STT or translation provider fails
- **THEN** the system SHALL NOT automatically switch to a different provider for live-caption MVP processing

### Requirement: Cleanup on stop, tab close, navigation, and video change
The system SHALL deterministically clean up capture, session, UI, and cache state on stop, tab close, navigation, and active video change.

#### Scenario: User stops the session
- **WHEN** the user stops live captioning
- **THEN** the system SHALL stop capture, release resources, and end the active session

#### Scenario: Tab closes or navigates away
- **WHEN** the tab is closed or navigates to a new page
- **THEN** the system SHALL tear down the live-caption session and clear runtime state

#### Scenario: Active video changes
- **WHEN** the active video target changes
- **THEN** the system SHALL cleanly close the current video session before starting the next one

### Requirement: Finalized chunk delivery contract
The system SHALL deliver only finalized audio chunks from the offscreen document to the background service worker.

#### Scenario: Finalized chunk message
- **WHEN** the offscreen document finalizes an audio chunk
- **THEN** the system SHALL send a message containing sessionId, videoFingerprint, chunkStartMs, chunkEndMs, MIME or type metadata, and a final chunk payload or blob reference

#### Scenario: No raw stream handoff
- **WHEN** audio capture is active
- **THEN** the system SHALL NOT hand raw stream data to the background service worker

### Requirement: Dedicated Live Caption logging scope/component
The system SHALL register and use a dedicated Live Caption logging scope/component in the structured logging system.

#### Scenario: Feature module logging
- **WHEN** a live-caption module logs runtime activity
- **THEN** the system SHALL use the dedicated Live Caption scoped logger rather than ad-hoc console logging

#### Scenario: Lifecycle visibility
- **WHEN** live-caption session, capture, STT, translation, cache, cleanup, or error recovery events occur
- **THEN** the system SHALL emit structured logs through the Live Caption logging scope/component
