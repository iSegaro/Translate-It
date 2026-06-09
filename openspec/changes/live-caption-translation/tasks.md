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
- [x] 4.4 Define active-video change handling and session handoff behavior
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

- [x] 8.1 Define the overlay component hierarchy inside the existing Shadow DOM host
- [x] 8.2 Define consent notice presentation and blocking behavior
- [x] 8.3 Define caption track and control UI responsibilities
- [x] 8.4 Define overlay update flow from session state to rendered captions
- [x] 8.5 Define the normalized caption display-mode contract for translated-only, transcript-only, and bilingual rendering

## 9. Cache and IndexedDB Implementation

- [x] 9.1 Define the in-memory session cache boundaries and invalidation rules
- [x] 9.2 Define the persistent IndexedDB schema for transcript records
- [x] 9.3 Define the persistent IndexedDB schema for translated caption records
- [x] 9.4 Define cache clearing and per-video reuse behavior

## 10. Consent and Privacy Flow

- [x] 10.1 Define the privacy notice content and acceptance gate before capture
- [x] 10.2 Define explicit user activation requirements for session start
- [x] 10.3 Define incognito session-only behavior and storage restrictions
- [x] 10.4 Define fail-closed recovery behavior when the session cannot be reconciled after wakeup

## 11. Cleanup and Error Handling

- [x] 11.1 Define deterministic teardown on stop, tab close, navigation, and video change
- [x] 11.2 Define cleanup ordering for capture, session state, cache flush, and overlay teardown
- [x] 11.3 Define retry handling and error recovery boundaries without provider fallback
- [x] 11.4 Define logging expectations for session lifecycle and failure states

## 12. Tests

- [x] 12.1 Define unit tests for session ownership and lifecycle transitions
- [x] 12.2 Define unit tests for active-video detection and fingerprint generation
- [x] 12.3 Define unit tests for deterministic active-video tie-break ordering
- [x] 12.4 Define unit tests for STT provider contracts and retry behavior
- [x] 12.5 Define integration tests for capture-to-translation request flow
- [x] 12.6 Define integration tests for cache persistence and incognito session-only behavior
- [x] 12.7 Define integration tests for offscreen finalized chunk delivery and metadata contract
- [x] 12.8 Define recovery tests for background wakeup reconciliation and fail-closed handling
- [x] 12.9 Define cleanup tests for stop, tab close, navigation, and video change
- [x] 12.10 Define startup tests for missing or invalid OpenAI credential handling
- [x] 12.11 Define unit tests for overlay shell rendering, consent gating, and control emissions
- [x] 12.12 Define unit tests for overlay positioning and cleanup behavior
- [x] 12.13 Define integration tests confirming the overlay shell does not invoke runtime capture, STT, translation, or cache layers
- [x] 12.14 Define unit tests for translated-only, transcript-only, and bilingual display-mode rendering

## 13. Documentation

- [x] 13.1 Update technical documentation for the new live-caption architecture
- [x] 13.2 Document permissions, consent expectations, and supported platforms
- [x] 13.3 Document logging scope usage and operational visibility expectations

## 14. Runtime Phase 1 - Content Runtime Wiring

- [x] 14.1 Create the content-side runtime controller for active-video monitoring and handoff application
- [x] 14.2 Wire the live-caption overlay and content app to runtime lifecycle hooks
- [x] 14.3 Track runtime status, active session state, and active video state in the store
- [x] 14.4 Apply active-video handoff plans to the page session and overlay store
- [x] 14.5 Add runtime tests for start, stop, pause, resume, destroy, handoff, and cleanup

## 15. Runtime Phase 2 - Background and Offscreen Routing Shell

- [x] 15.1 Register the live-caption background runtime controller and route runtime actions through the message handler
- [x] 15.2 Define runtime message contracts for start, stop, status, pause, and resume requests and responses
- [x] 15.3 Extend the offscreen bridge and capture coordinator with runtime shell state and deterministic not-implemented responses
- [x] 15.4 Connect the content runtime controller to background messaging for start, status, pause, resume, and stop requests
- [x] 15.5 Add runtime shell tests for routing, payload validation, unknown actions, offscreen-unavailable responses, and runtime state transitions

## 16. Runtime Phase 3 - Offscreen Document Runtime Shell

- [x] 16.1 Add the Live Caption offscreen runtime branch with shell-only state handling for start, stop, status, pause, and resume
- [x] 16.2 Route background offscreen requests through the offscreen bridge and reconcile shell responses back into capture/runtime state
- [x] 16.3 Add offscreen shell tests for deterministic responses, fail-closed handling, and inconsistent-session rejection
- [x] 16.4 Update runtime status documentation to reflect the offscreen document shell

## 17. Runtime Phase 4 - Tab Audio Capture and MediaRecorder Chunking (MVP)

- [x] 17.1 Implement offscreen tabCapture stream path and MediaRecorder chunking MVP
- [x] 17.2 Connect offscreen finalized audio chunk delivery to Background controller
- [x] 17.3 Add tests validating offscreen tabCapture, MediaRecorder creation, chunk generation, and stop release behavior

## 18. Runtime Phase 5 - STT Execution Pipeline (Whisper MVP)

- [x] 18.1 Implement sequential FIFO audio chunk queuing per session
- [x] 18.2 Implement queue limits and backpressure handling (max 5 chunks)
- [x] 18.3 Implement AbortController-based cancellation support for pause, stop, and handoff
- [x] 18.4 Integrate with OpenAI Whisper provider and normalize transcript segments
- [x] 18.5 Add unit and integration tests covering STT coordinator, FIFO queue, abort/cleanup behavior, and provider errors
- [x] 18.6 Update documentation and validation results

## 19. Runtime Phase 6 - Translation Execution Pipeline

- [x] 19.1 Implement Translation Coordinator and FIFO queueing per active session
- [x] 19.2 Integrate with LiveCaptionTranslationAdapter and UnifiedTranslationService
- [x] 19.3 Implement AbortController cancellation during stop, pause, cleanup, and handoff
- [x] 19.4 Enforce bounded translation queue length and fail-closed error transitions
- [x] 19.5 Wire STT segment completion to the Translation Coordinator
- [x] 19.6 Add unit and integration tests verifying order preservation, abort handling, and provider failure states
- [x] 19.7 Update design specs, architecture logs, and validation results

## 20. Runtime Phase 7 - Overlay Caption Rendering

- [x] 20.1 Render finalized translated captions from VideoCaptionSession state
- [x] 20.2 Render per-line timing (startMs, endMs) if available
- [x] 20.3 Render multiple lines per video session if available
- [x] 20.4 Respect overlay shell visibility controlled by store
- [x] 20.5 Do not modify overlay for non-active sessions
- [x] 20.6 Wire pause and resume buttons in controls
- [x] 20.7 Implement empty/incomplete segment filtering
- [x] 20.8 Add unit and integration tests for reactive overlay updates, timing displays, event forwarding, and filtering

## 21. Runtime Phase 8 - Cache Persistence and Hydration

- [x] 21.1 Implement persistent storage of transcripts to IndexedDB
- [x] 21.2 Implement persistent storage of translations to IndexedDB
- [x] 21.3 Implement per-video cache keys using tabId + videoFingerprint
- [x] 21.4 Implement cache hydration on session start/resume
- [x] 21.5 Implement incognito-only cache behavior (no persistence)
- [x] 21.6 Add unit and integration tests for cache persistence, hydration, and incognito behavior
- [x] 21.7 Update architecture documentation

## 22. Runtime Phase 9 - Runtime Recovery and Resilience

- [x] 22.1 Implement orphaned session reconciliation after service worker restart
- [x] 22.2 Implement offscreen health monitoring with 15s interval
- [x] 22.3 Implement 5s timeout for health checks
- [x] 22.4 Implement fail-closed cleanup on invalid state
- [x] 22.5 Add unit and integration tests for orphan reconciliation, health monitoring, and fail-closed behavior
- [x] 22.6 Update architecture documentation

## 23. Runtime Phase 10 - UI Integration and User Controls

- [x] 23.1 Add Live Caption menu item to DesktopFabMenu with platform detection (Chrome/Edge desktop only)
- [x] 23.2 Implement ContentApp handler for live-caption-start-request event from FAB
- [x] 23.3 Create LiveCaptionTab.vue options page with display mode selection
- [x] 23.4 Register LiveCaptionTab in options router and navigation
- [x] 23.5 Add cache clear button to options tab
- [x] 23.6 Add platform support badge and messaging
- [x] 23.7 Add i18n strings to messages.json for all Live Caption UI elements
- [x] 23.8 Update architecture documentation to reflect Phase 10 completion
- [x] 23.9 Run tests and validate UI integration

**Phase 10 Status**: ✅ COMPLETE (June 2026)

Live Caption is now fully integrated and accessible to users through:
- Desktop FAB menu entry (Chrome/Edge only)
- Options/Live Caption settings page
- Display mode configuration (translated_only, transcript_only, bilingual)
- Cache management controls
