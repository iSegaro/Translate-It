# Live Caption Architecture

## Overview

Live Caption is a dedicated browser extension feature for capturing the active tab's audio, converting it to finalized transcripts through a separate STT provider layer, translating the transcript through the existing translation provider system, and rendering the results as captions in the extension UI.

The current implementation uses two STT execution paths:

- **Batch STT**: background-hosted providers such as `OpenAIWhisperProvider`, `LocalWhisperSTTProvider`, and `MockSTTProvider` continue to process finalized audio chunks in the background.
- **Streaming STT**: `FasterWhisperStreamingProvider` runs in the offscreen document, owns its WebSocket transport there, and receives finalized `MediaRecorder` blobs directly from offscreen capture.

It exists as a separate feature because its execution model differs from text selection, page translation, subtitle translation, and TTS:

- it is video-centric rather than text-centric
- it is session-based rather than request-based
- it requires offscreen media ownership under MV3
- it must separate transcription from translation
- it needs per-video identity, cache, and cleanup rules
- it must fail closed when recovery or ownership reconciliation is uncertain

## Relationship to Existing Systems

- **Translation System**: Live Caption reuses `UnifiedTranslationService` for translation only. It does not introduce a new translation provider system.
- **Subtitle Translator**: Subtitle translation is file-driven and offline from the live media pipeline. Live Caption shares the existing translation infrastructure but not the subtitle job model.
- **TTS**: Live Caption does not reuse TTS playback logic. Both features use structured logging, lifecycle management, and UI isolation, but they solve different problems.
- **Whole Page Translation**: Whole page translation is DOM batch translation. Live Caption is audio-to-text-to-translation with per-video session ownership and offscreen capture requirements.

## Architectural Principles

- **Feature isolation**: Live Caption is implemented under `src/features/live-caption/` and remains decoupled from translation, subtitle translation, TTS, and page translation execution paths.
- **MV3 constraints**: Long-lived media work is not owned by the service worker. Background logic coordinates and reconciles, but the offscreen document owns stream capture and chunk finalization.
- **Offscreen ownership**: The offscreen document owns the tab audio stream, the `MediaRecorder` lifecycle, and the streaming provider runtime host.
- **Session ownership**: `PageLiveCaptionSession` is the tab-scoped owner; `VideoCaptionSession` is the per-video owner.
- **STT/translation separation**: `BaseSTTProvider` remains the batch provider base, `BaseStreamingSTTProvider` is the streaming provider base, and `STTProviderManifest` controls execution location and capabilities. Translation reuses `UnifiedTranslationService`.
- **Per-video cache ownership**: Cache keys are based on tab identity plus video fingerprint. Transcript and translated caption data remain separate.
- **User-triggered start flow**: Live Caption starts directly from user action in popup/FAB/options-enabled UI. Browser tab-capture permission, extension permissions, and browser user-gesture requirements remain the capture boundary. The extension does not maintain a separate consent state. Incognito sessions remain session-only.
- **Fail-closed lifecycle behavior**: If recovery or ownership reconciliation cannot be trusted, the feature stops capture, clears volatile state, and notifies content rather than guessing.

## High-Level Architecture

```text
Content
  ↓
Background Orchestration
  ├── SessionManager
  ├── TranscriptEventCoordinator
  ├── TranslationCoordinator
  ├── VideoHandoffCoordinator
  ├── CleanupCoordinator
  └── Offscreen Bridge
           ↓
    Offscreen Capture
       ├── Batch finalized chunks → background STT
       └── Streaming finalized blobs → FasterWhisperStreamingProvider
                                    ↓
                       STREAMING_STT_* messages
                                    ↓
                     Background Transcript Convergence
                                    ↓
                    Canonical session/cache + translation
  ↓
Overlay Rendering
```

### Ownership Boundaries

- **Content** consumes active-video selection results, renders the overlay, and holds UI-local state. It supplies UI-side handoff inputs but does not own active-video selection policy, platform support policy, or runtime permission policy.
- **Background Orchestration** owns the session manager, runtime message routing, handoff coordinator, cleanup coordinator, transcript-event convergence, translation handoff, and the offscreen bridge.
- **SessionManager** is background-owned and keeps one tab-scoped session registry while providing snapshots for recovery and cleanup.
- **Offscreen Capture** owns the media stream and finalized audio chunks. It also hosts the streaming STT provider runtime.
- **STT Layer** is split:
  - batch providers stay in background via `BaseSTTProvider`
  - streaming providers use `BaseStreamingSTTProvider` and execute offscreen
- **TranscriptEventCoordinator** normalizes batch final results and streaming transcript events into canonical transcript events.
- **Translation Coordinator** consumes canonical transcript segments and dispatches to the existing translation provider flow.
- **Overlay Rendering** presents finalized caption lines inside the Shadow DOM host.

## Batch vs Streaming Routing

The current implementation routes transcript work based on provider metadata:

- `mode: batch` + `executionLocation: background`
  - finalized blobs are sent as background finalized-chunk messages
  - `LiveCaptionSTTCoordinator` handles transcription
  - batch transcript results are normalized, accumulated, and translated through the existing path
- `mode: streaming` + `executionLocation: offscreen`
  - finalized blobs are routed directly to `FasterWhisperStreamingProvider.handleAudioChunk(blob)`
  - the provider owns the WebSocket transport and emits `ready`, `final`, `error`, and `closed` style events
  - background receives `STREAMING_STT_*` messages with both `type` and `action` so `MessageHandler` dispatch works, then routes transcript events through `LiveCaptionTranscriptEventCoordinator`
  - canonical finals are persisted to `VideoCaptionSession` and transcript cache, then routed to translation

## Runtime Ownership Model

### Content

Owns:

- active-video discovery and UI-side handoff inputs
- the content-side `LiveCaptionRuntimeController` that observes videos and applies handoff plans
- overlay rendering, position metadata, and display mode selection
- page-local UI state in Pinia

Does not own:

- media stream capture
- `MediaRecorder`
- STT execution
- translation execution
- persistent cache writes
- service-worker lifecycle or reconciliation

### Background

Owns:

- session orchestration and registry access
- runtime message routing and shell response normalization
- handoff planning and cleanup coordination
- batch STT dispatch
- streaming transcript event convergence
- translation dispatch
- cache coordination
- recovery reconciliation

Does not own:

- raw stream data
- overlay rendering
- active-video detection
- direct DOM access
- browser permission prompting

### Offscreen

Owns:

- tab audio stream capture
- `MediaRecorder` lifecycle
- audio chunk finalization
- streaming provider lifecycle hosting
- streaming provider WebSocket transport
- snapshot/status exposure for MV3 recovery

Does not own:

- batch STT dispatch
- translation
- overlay rendering
- persistent cache management
- active-video detection

### PageLiveCaptionSession

Owns:

- tab-scoped session identity
- active video session reference
- page-level lifecycle state
- cleanup snapshot generation

Does not own:

- audio capture
- STT
- translation
- DOM scanning
- persistent cache writes

### VideoCaptionSession

Owns:

- video fingerprint identity
- chunk state
- transcript accumulation
- translated caption accumulation
- seek/replay metadata
- video-scoped lifecycle state
- canonical transcript identity/revision tracking for streaming finals and corrections

Does not own:

- video detection
- capture ownership
- translation provider selection
- overlay mounting
- cache persistence orchestration

### BaseSTTProvider

Owns:

- batch STT lifecycle and provider validation
- final-result normalization for background execution
- batch provider support helpers

Does not own:

- offscreen capture
- streaming transport
- transcript-event convergence
- translation orchestration

### BaseStreamingSTTProvider

Owns:

- streaming session lifecycle state
- provider event emission
- WebSocket transport scaffolding for streaming providers
- provider identity and session validation

Does not own:

- offscreen capture
- translation
- cache persistence
- transcript convergence
- reconnect policy

### FasterWhisperStreamingProvider

Owns:

- the concrete local WebSocket protocol for the Faster-Whisper streaming server
- start/ready/final/error lifecycle handling
- binary audio chunk sending
- intentional stop/destroy cleanup

Does not own:

- background orchestration
- session persistence
- translation
- correction persistence
- reconnect/resume

### STT Provider Manifest

The provider manifest is the source of truth for provider routing and capabilities.

Current metadata includes:

- `mode`
- `executionLocation`
- `supportsPartialResults`
- `supportsCorrections`
- `supportsReconnect`
- `requiresPersistentConnection`
- `supported`
- `developmentOnly`

Current runtime routing uses this metadata to:

- keep batch providers in background
- host streaming providers in offscreen
- hide development-only providers unless debug/development provider discovery is enabled

### LiveCaptionSessionManager

Owns:

- one page session per tab
- create/get/remove semantics
- fail-closed removal path
- snapshot accessors for recovery

Does not own:

- browser event listeners
- runtime startup
- offscreen ownership
- message routing
- capture execution

### ActiveVideoDetector

Owns:

- candidate collection for `<video>` elements
- deterministic ranking and selection
- MVP tie-break order metadata

Does not own:

- session creation
- handoff execution
- DOM mutation
- capture
- messaging

Content consumes the selected active video and supplies UI-side handoff inputs, but it does not own active-video selection policy.

### LiveCaptionVideoHandoffCoordinator

Owns:

- pure active-video transition planning
- same-video no-op detection
- replacement planning
- cleanup-only planning
- cache-identity preservation rules
- overlay-clear requirements

Does not own:

- active-video discovery
- cleanup execution
- capture
- STT
- translation

### LiveCaptionCleanupCoordinator

Owns:

- deterministic cleanup plans
- cleanup result generation
- fail-closed result normalization
- cleanup error normalization
- cleanup ownership metadata

Does not own:

- browser listeners
- runtime side effects
- offscreen capture
- STT
- translation

### Transcript Event Architecture

Transcript output now converges through `LiveCaptionTranscriptEventCoordinator`.

Supported event types:

- `partial`
- `final`
- `correction`
- `error`

Current behavior:

- partial events remain ephemeral and are not persisted or translated
- canonical finals are the only streaming events that continue into session/cache persistence and translation
- correction events are recognized by contract and revision bookkeeping, but persisted replacement and translation invalidation are deferred
- error events are routed through fail-close cleanup, not translation

Revision tracking and cleanup:

- canonical revisions are tracked by `sessionId + tabId + videoFingerprint + segmentId`
- canonical revision state is cleared on runtime stop, fail-close, video handoff, and controller destroy
- this prevents stale revision leakage across repeated batch/streaming sessions

### Session Lifecycle Summary

| Component | Idle | Active | Error | Cleanup |
| --- | --- | --- | --- | --- |
| `PageLiveCaptionSession` | session idle | page session active | page error state | clears page-scoped state |
| `VideoCaptionSession` | per-video idle | video session active | video error state | clears video-scoped state |
| `LiveCaptionVideoHandoffCoordinator` | no plan | replace/no-op plan | does not execute runtime state | emits cleanup-only or replacement plan |
| `LiveCaptionCleanupCoordinator` | no cleanup work | cleanup planned | fail-closed normalization | generates cleanup result |

## Session Model

The runtime model uses:

- `PageLiveCaptionSession` for tab-scoped ownership
- `VideoCaptionSession` for per-video ownership
- `LiveCaptionVideoHandoffCoordinator` for deterministic active-video transition planning

`PageLiveCaptionSession` coordinates the tab-level lifecycle, active-video ownership, and cache scope. `VideoCaptionSession` owns chunk sequencing, transcript accumulation, caption rendering state, and per-video persistence metadata. `LiveCaptionCleanupCoordinator` owns cleanup plan and result generation, while `LiveCaptionSessionManager` remains the tab-scoped registry and snapshot source.

Streaming finals participate in the same transcript accumulation and translation handoff after canonicalization. The streaming path does not bypass `VideoCaptionSession` or transcript cache for canonical finals.

Active-video selection follows a deterministic MVP tie-break order:

1. currently playing
2. visible in viewport
3. audible/unmuted when detectable
4. largest visible area
5. most recent user interaction with the video
6. DOM order as final deterministic fallback

### Session Lifecycle

- The page session is created from a user-triggered start action after supported-platform gating.
- The page session owns one active video session at a time.

## Translation, Cache, and Persistence

The translation and persistence path is shared by:

- batch final transcript segments
- canonical streaming final transcript segments

Current implementation details:

- batch finalized chunks are transcribed in background, normalized, accumulated into `VideoCaptionSession`, persisted to transcript cache, and then routed to translation
- streaming canonical finals are normalized by `LiveCaptionTranscriptEventCoordinator`, accumulated into `VideoCaptionSession`, persisted to transcript cache, and then routed to translation
- partial, correction, and error events do not persist or translate in the MVP

The cache and session layers remain append-only for canonical finals today. Revision-aware correction persistence and runtime rehydration are still deferred.

## Cleanup and Recovery

Cleanup responsibilities remain background-owned.

Current cleanup behavior includes:

- stopping active streaming provider ownership on runtime stop
- sending `STOP_STREAMING_STT_SESSION` to offscreen when a streaming provider is active
- clearing `activeStreamingSession` on stop/fail-close/destroy
- clearing transcript revision state on stop/fail-close/video handoff/destroy
- unwinding capture coordinator runtime state on fail-close

Recovery limitations:

- reconnect/resume is unsupported
- true persisted canonical rehydration is deferred
- local streaming provider cleanup is best-effort and fail-closed from the background side

## Current Limitations

- No partial transcript UI
- No correction persistence or correction-driven replacement
- No reconnect or resume support
- `faster_whisper_streaming` is development-only
- Local WebSocket smoke testing against `ws://127.0.0.1:8765/v1/audio/transcriptions/stream` is still required in a new environment before treating the streaming path as operational
- When the active video changes, the handoff coordinator produces a pure plan that either no-ops, replaces the current video session, or tears down the current target.
- Recovery reconciliation uses session snapshots and offscreen status snapshots rather than trusting service-worker memory as the source of truth.

### Recovery Model

- The service worker may suspend.
- On wakeup, background logic reconciles the registry using offscreen status plus persisted/session metadata.
- Recovery authority comes from offscreen status plus persisted/session metadata. `LiveCaptionSessionManager` state is recoverable runtime state only and is not the authoritative recovery source.
- If reconciliation fails, the feature fails closed: stop capture, clear volatile state, and notify content.
- Raw audio is never used for recovery.

## STT Architecture

Live Caption uses a separate transcription layer with explicit batch and streaming branches:

- `BaseSTTProvider` for background batch providers
- `BaseStreamingSTTProvider` for offscreen streaming providers
- `STTProviderFactory`
- `STTProviderManifest`
- `OpenAIWhisperProvider`
- `LocalWhisperSTTProvider`
- `MockSTTProvider`
- `FasterWhisperStreamingProvider`

This STT layer is intentionally separate from the translation provider stack because its contract is different:

- it is batch transcription, not language translation
- it returns normalized transcript result objects
- it does not participate in translation provider fallback or selection
- it has different retry and credential behavior
- it routes streaming providers by execution location metadata
- it keeps the streaming provider transport in offscreen rather than background

### Components

- **BaseSTTProvider**: defines the batch transcription contract and normalized STT result/error helpers.
- **BaseStreamingSTTProvider**: defines streaming session state, event emission, and shared lifecycle scaffolding for streaming providers.
- **STTProviderManifest**: defines the provider metadata surface for batch/streaming routing, capability flags, and development-only gating.
- **STTProviderFactory**: resolves a provider by id and instantiates the selected provider based on manifest metadata.
- **OpenAIWhisperProvider**: MVP batch transcription provider that reuses the existing OpenAI API key path and surfaces credential/startup errors deterministically.
- **FasterWhisperStreamingProvider**: offscreen-hosted streaming provider that owns its WebSocket transport, emits `ready/final/error` events, and is currently development-only.

## Translation Integration

Live Caption translates finalized transcript text through the existing translation provider architecture:

- `LiveCaptionTranslationAdapter` accepts finalized transcript segments
- it builds a request compatible with the current translation flow
- it delegates to `UnifiedTranslationService`
- it normalizes translated output into caption segment objects
- canonical streaming finals use the same translation handoff after session/cache persistence
- partial, correction, and error events do not enter translation in the current MVP

### Provider Selection Behavior

- Live Caption uses current translation settings and the existing provider resolution flow.
- It does not introduce a separate provider selector.
- It does not introduce a custom live-caption provider system.
- It does not introduce live-caption-specific provider fallback.
- provider selection is governed by manifest metadata and the existing live-caption provider setting
- `faster_whisper_streaming` remains development-only in the current manifest

## Overlay System

The overlay is rendered inside the existing Shadow DOM UI host and is intentionally presentation-only.

### Components

- `LiveCaptionOverlay.vue`
- `LiveCaptionCaptionTrack.vue`
- `LiveCaptionCaptionLine.vue`
- `LiveCaptionControls.vue`
- `useLiveCaptionOverlay.js`

### Start Flow

- Live Caption starts from explicit user action in the extension UI.
- No custom extension-level consent overlay is rendered.
- Browser permission prompts and user-gesture constraints remain the capture boundary.

### Caption Rendering

The overlay supports a normalized display-mode contract:

- `translated_only`
- `transcript_only`
- `bilingual`

`translated_only` is the MVP default. Transcript and translated data remain stored separately and are composed only at render time.

## Cache Architecture

The cache model uses two layers:

- **Session cache**: in-memory, per-video, fast for live updates and seek/replay handling
- **IndexedDB persistence**: durable storage for transcript and translated caption records

Both batch final transcript segments and canonical streaming final transcript segments flow through the same session-cache and persistence model. Partial, correction, and error events do not enter canonical cache persistence in the current implementation.

### Stores

- `session_index`
- `transcripts`
- `translations`

### Per-Video Keying

Cache keys are based on:

- tab identity
- video fingerprint
- segment timing
- target language and provider for translated caption records

This avoids page-URL-only identity, which is too coarse for media sessions.

### Do Not Violate

- `LiveCaptionCache` is a facade.
- Cache state is never the source of truth for session liveness.
- Content must not directly manipulate persistent transcript or translation stores.
- Transcript and translation stores must remain separate.

### Incognito Behavior

- Incognito sessions remain session-only.
- Persistent writes are skipped.
- Persistent reads are disabled or return empty for incognito sessions.
- In-memory session cache remains available during the current session.

## Privacy and Data Handling

Live Caption captures tab audio for STT processing after the user starts the feature. Raw audio is not persisted. Transcript and translated caption data may be cached outside incognito, while incognito sessions remain session-only. Unsupported platform/browser combinations are denied deterministically. Recovery reconciliation failure instructs the system to stop capture and notify content.

## Cleanup and Recovery

### CleanupCoordinator

`LiveCaptionCleanupCoordinator` owns:

- cleanup plan generation
- cleanup result generation
- fail-closed recovery cleanup results
- cleanup error normalization

### Cleanup Reasons

The architecture supports deterministic teardown for:

- user stop
- tab close
- navigation
- active-video change
- provider error
- recovery failure

### Ownership Rules

- SessionManager exposes snapshots.
- CleanupCoordinator owns cleanup metadata and result generation.
- Cleanup plans may preserve captions for stop or provider error, but navigation and recovery failure clear volatile state.

Current Live Caption cleanup behavior also clears:

- `activeStreamingSession` on stop, fail-close, and destroy
- transcript revision state on stop, fail-close, video handoff, and destroy
- capture coordinator runtime state on streaming fail-close paths

## Logging

Live Caption uses `LOG_COMPONENTS.LIVE_CAPTION`.

### Expectations

- Use scoped structured loggers for lifecycle boundaries.
- Log session creation, handoff planning, cleanup planning, recovery boundaries, STT provider lifecycle, translation lifecycle, and cache operations at the appropriate level.
- Keep logs concise and structured.

### Sensitive-Data Restrictions

- Do not log raw audio.
- Do not log full transcript or translated text by default.
- Do not log API keys.
- Use metadata such as ids, statuses, timings, counts, provider ids, and language codes.

## Runtime Implementation Status

### Implemented

- architecture contracts
- session model
- content-side runtime controller
- cache model
- overlay shell and display-mode contract
- privacy and data-handling model
- cleanup and recovery contracts
- STT infrastructure
- `BaseStreamingSTTProvider`
- `FasterWhisperStreamingProvider`
- STT provider manifest metadata for mode, execution location, and streaming capability flags
- translation adapter
- active-video detector
- active-video handoff coordinator
- offscreen document runtime shell
- background runtime controller and routing shell
- runtime message contracts
- structured logging scope
- `chrome.tabCapture` runtime and offscreen capture ownership
- `MediaRecorder` chunking runtime and offscreen runtime capture
- finalized audio chunks delivery to background controller
- STT execution pipeline
- offscreen-hosted streaming provider lifecycle
- provider-owned WebSocket transport for `FasterWhisperStreamingProvider`
- streaming transcript-event convergence
- canonical streaming final persistence and translation handoff
- translation execution pipeline
- overlay caption rendering and controls
- cache persistence writes (Phase 8)
- session hydration and recovery (Phase 9)
- UI integration and user controls (Phase 10)

## Phase 10: UI Integration (June 2026)

Phase 10 completed the user-facing layer:
- Desktop FAB menu entry for Live Caption
- Options/LiveCaptionTab settings surface
- Display mode configuration (translated_only, transcript_only, bilingual)
- Cache clear controls
- Platform detection and messaging
- i18n strings for all UI elements
- Development-only provider discovery for `faster_whisper_streaming`

## Future Runtime Phases

The remaining runtime work is limited to deferred canonical-state behavior and recovery enhancements:

1. canonical correction persistence and revision-aware replacement
2. persisted canonical rehydration for revision-aware state
3. reconnect/resume or other provider recovery enhancements if product requirements change

## Maintenance Notes

- Keep `PageLiveCaptionSession`, `VideoCaptionSession`, `LiveCaptionSessionManager`, `LiveCaptionVideoHandoffCoordinator`, and `LiveCaptionCleanupCoordinator` aligned with the OpenSpec change before changing runtime code.
- Keep `LiveCaptionRuntimeController` aligned with the content-side ownership model and avoid moving detection or handoff policy into the overlay.
- Do not move capture ownership into the service worker.
- Do not merge STT into the translation provider stack.
- Do not store transcript and translation records in the same cache store.
- Do not add provider fallback semantics that are unique to Live Caption.
- Do not reintroduce a custom extension-level consent overlay.
- Keep overlay code presentation-only; business logic should stay in core/session modules.
- Treat `faster_whisper_streaming` as development-only unless the manifest and runtime policy are intentionally changed.

## Do Not Violate

- No raw stream handoff to background.
- No service-worker-local long-lived media ownership.
- No custom extension-level consent overlay.
- No page-URL-only cache identity.
- No implicit provider fallback for Live Caption.
- No runtime execution in this document’s model beyond the architecture already implemented.

**Last Updated**: June 2026 (Phase 10 UI Integration complete)
