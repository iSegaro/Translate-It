## 1. Manifest, Settings, and Logging Scaffolding

- [x] 1.1 Add the live-caption permissions and offscreen capture prerequisites to the manifest design surface
- [x] 1.2 Define live-caption settings keys and defaults for MVP behavior
- [x] 1.3 Register the dedicated `LiveCaption` logging component in the structured logging constants and component categories
- [x] 1.4 Define the live-caption logging scope usage pattern for feature modules and lifecycle events

## 2. Live-Caption Feature Shell

- [x] 2.1 Create the `src/features/live-caption/` feature structure and module boundaries
- [x] 2.2 Define the public feature entry surface and internal constants for live-caption actions and settings
- [x] 2.3 Establish the feature-level state container and session registry boundaries
- [x] 2.4 Add shell-only tests for exports, constants, store initialization, and placeholder contracts

## 3. Session Model

- [x] 3.1 Define the `PageLiveCaptionSession` responsibilities and lifecycle contract
- [x] 3.2 Define the `VideoCaptionSession` responsibilities and lifecycle contract
- [x] 3.3 Specify the ownership boundaries between page-scoped and video-scoped state
- [x] 3.4 Define session cleanup behavior for stop, tab close, navigation, and video changes

## 4. Active Video Detection and Fingerprinting

- [x] 4.1 Specify deterministic active-video detection rules for multi-video pages
- [x] 4.2 Define the video fingerprint strategy for per-video identity
- [x] 4.3 Define cache key generation rules from tab and video identity
- [ ] 4.4 Define active-video change handling and session handoff behavior
- [x] 4.5 Define and test the MVP active-video tie-break order

## 5. Offscreen Capture Bridge

- [x] 5.1 Define the offscreen document responsibilities for tab audio capture
- [x] 5.2 Define the capture start/stop request and response flow
- [x] 5.3 Define the audio chunk finalization and delivery contract to background orchestration
- [x] 5.4 Define offscreen cleanup and stream release behavior
- [x] 5.5 Define the offscreen session snapshot/status contract for MV3 recovery

## 6. STT Provider Infrastructure

- [x] 6.1 Define the `BaseSTTProvider` contract for batch transcription
- [x] 6.2 Define the `STTProviderFactory` and `STTProviderManifest` responsibilities
- [x] 6.3 Define the OpenAI Whisper provider contract and capability surface
- [x] 6.4 Define retry behavior for transient transcription failures
- [x] 6.5 Define OpenAI credential reuse and startup error behavior for missing or invalid keys
- [x] 6.6 Define the provider error surface when OpenAI credentials are missing or invalid

## 7. Translation Pipeline Integration

- [x] 7.1 Specify how finalized transcript text is handed off to the existing translation provider flow
- [x] 7.2 Specify how live-caption translation uses current translation settings without introducing a new selection UI
- [x] 7.3 Define how translation results are normalized for caption rendering and persistence

## 8. Overlay and UI Host Integration

- [ ] 8.1 Define the overlay component hierarchy inside the existing Shadow DOM host
- [ ] 8.2 Define consent notice presentation and blocking behavior
- [ ] 8.3 Define caption track and control UI responsibilities
- [ ] 8.4 Define overlay update flow from session state to rendered captions

## 9. Cache and IndexedDB Implementation

- [ ] 9.1 Define the in-memory session cache boundaries and invalidation rules
- [ ] 9.2 Define the persistent IndexedDB schema for transcript records
- [ ] 9.3 Define the persistent IndexedDB schema for translated caption records
- [ ] 9.4 Define cache clearing and per-video reuse behavior

## 10. Consent and Privacy Flow

- [ ] 10.1 Define the privacy notice content and acceptance gate before capture
- [ ] 10.2 Define explicit user activation requirements for session start
- [ ] 10.3 Define incognito session-only behavior and storage restrictions
- [ ] 10.4 Define fail-closed recovery behavior when the session cannot be reconciled after wakeup

## 11. Cleanup and Error Handling

- [ ] 11.1 Define deterministic teardown on stop, tab close, navigation, and video change
- [ ] 11.2 Define cleanup ordering for capture, session state, cache flush, and overlay teardown
- [ ] 11.3 Define retry handling and error recovery boundaries without provider fallback
- [ ] 11.4 Define logging expectations for session lifecycle and failure states

## 12. Tests

- [x] 12.1 Define unit tests for session ownership and lifecycle transitions
- [x] 12.2 Define unit tests for active-video detection and fingerprint generation
- [x] 12.3 Define unit tests for deterministic active-video tie-break ordering
- [x] 12.4 Define unit tests for STT provider contracts and retry behavior
- [x] 12.5 Define integration tests for capture-to-translation request flow
- [ ] 12.6 Define integration tests for cache persistence and incognito session-only behavior
- [x] 12.7 Define integration tests for offscreen finalized chunk delivery and metadata contract
- [x] 12.8 Define recovery tests for background wakeup reconciliation and fail-closed handling
- [x] 12.9 Define cleanup tests for stop, tab close, navigation, and video change
- [x] 12.10 Define startup tests for missing or invalid OpenAI credential handling

## 13. Documentation

- [x] 13.1 Update technical documentation for the new live-caption architecture
- [x] 13.2 Document permissions, consent expectations, and supported platforms
- [x] 13.3 Document logging scope usage and operational visibility expectations
