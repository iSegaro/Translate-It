# Live Caption Architecture

## Overview

Live Caption is a dedicated browser extension feature for capturing the active tab's audio, converting it to finalized transcripts through a separate STT provider layer, translating the transcript through the existing translation provider system, and rendering the results as captions in the extension UI.

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
- **Offscreen ownership**: The offscreen document owns the tab audio stream and the `MediaRecorder` lifecycle when runtime capture is implemented.
- **Session ownership**: `PageLiveCaptionSession` is the tab-scoped owner; `VideoCaptionSession` is the per-video owner.
- **STT/translation separation**: `BaseSTTProvider` and the STT factory/manifest are separate from the translation provider stack. Translation reuses `UnifiedTranslationService`.
- **Per-video cache ownership**: Cache keys are based on tab identity plus video fingerprint. Transcript and translated caption data remain separate.
- **Privacy-first design**: Consent is explicit, session-scoped, and required before capture begins. Incognito sessions remain session-only.
- **Fail-closed lifecycle behavior**: If recovery or ownership reconciliation cannot be trusted, the feature stops capture, clears volatile state, and notifies content rather than guessing.

## High-Level Architecture

```text
Content
  ↓
Background Orchestration
  ├── SessionManager
  ├── VideoHandoffCoordinator
  ├── CleanupCoordinator
  └── Offscreen Bridge
           ↓
    Offscreen Capture
  ↓
STT Layer
  ↓
LiveCaptionTranslationAdapter
  ↓
Overlay Rendering
```

### Ownership Boundaries

- **Content** consumes active-video selection results, renders the overlay, exposes consent UI, and holds UI-local state. It supplies UI-side handoff inputs but does not own active-video selection policy.
- **Background Orchestration** owns the session manager, runtime message routing, handoff coordinator, cleanup coordinator, and the offscreen bridge.
- **SessionManager** is background-owned and keeps one tab-scoped session registry while providing snapshots for recovery and cleanup.
- **Offscreen Capture** owns the media stream and finalized audio chunks.
- **STT Layer** owns transcription only.
- **Translation Adapter** hands finalized transcript text to the existing translation provider flow and normalizes the result for caption rendering.
- **Overlay Rendering** presents finalized caption lines and consent state inside the Shadow DOM host.

## Runtime Ownership Model

### Content

Owns:

- active-video discovery and UI-side handoff inputs
- the content-side `LiveCaptionRuntimeController` that observes videos and applies handoff plans
- consent notice display and user interaction state
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
- STT dispatch
- translation dispatch
- cache coordination
- recovery reconciliation

Does not own:

- raw stream data
- overlay rendering
- active-video detection
- direct DOM access
- permanent consent storage

### Offscreen

Owns:

- tab audio stream capture
- `MediaRecorder` lifecycle
- audio chunk finalization
- snapshot/status exposure for MV3 recovery

Does not own:

- STT
- translation
- overlay rendering
- persistent cache management
- active-video detection

### PageLiveCaptionSession

Owns:

- tab-scoped session identity
- consent state
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

Does not own:

- video detection
- capture ownership
- translation provider selection
- overlay mounting
- cache persistence orchestration

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

### Session Lifecycle Summary

| Component | Idle | Active | Error | Cleanup |
| --- | --- | --- | --- | --- |
| `PageLiveCaptionSession` | consent/session idle | page session active | page error state | clears page-scoped state |
| `VideoCaptionSession` | per-video idle | video session active | video error state | clears video-scoped state |
| `LiveCaptionVideoHandoffCoordinator` | no plan | replace/no-op plan | does not execute runtime state | emits cleanup-only or replacement plan |
| `LiveCaptionCleanupCoordinator` | no cleanup work | cleanup planned | fail-closed normalization | generates cleanup result |

## Session Model

The runtime model uses:

- `PageLiveCaptionSession` for tab-scoped ownership
- `VideoCaptionSession` for per-video ownership
- `LiveCaptionVideoHandoffCoordinator` for deterministic active-video transition planning

`PageLiveCaptionSession` coordinates the tab-level lifecycle, consent state, active-video ownership, and cache scope. `VideoCaptionSession` owns chunk sequencing, transcript accumulation, caption rendering state, and per-video persistence metadata. `LiveCaptionCleanupCoordinator` owns cleanup plan and result generation, while `LiveCaptionSessionManager` remains the tab-scoped registry and snapshot source.

Active-video selection follows a deterministic MVP tie-break order:

1. currently playing
2. visible in viewport
3. audible/unmuted when detectable
4. largest visible area
5. most recent user interaction with the video
6. DOM order as final deterministic fallback

### Session Lifecycle

- The page session is created only after explicit consent and supported-platform gating.
- The page session owns one active video session at a time.
- When the active video changes, the handoff coordinator produces a pure plan that either no-ops, replaces the current video session, or tears down the current target.
- Recovery reconciliation uses session snapshots and offscreen status snapshots rather than trusting service-worker memory as the source of truth.

### Recovery Model

- The service worker may suspend.
- On wakeup, background logic reconciles the registry using offscreen status plus persisted/session metadata.
- Recovery authority comes from offscreen status plus persisted/session metadata. `LiveCaptionSessionManager` state is recoverable runtime state only and is not the authoritative recovery source.
- If reconciliation fails, the feature fails closed: stop capture, clear volatile state, and notify content.
- Raw audio is never used for recovery.

## STT Architecture

Live Caption uses a separate transcription layer:

- `BaseSTTProvider`
- `STTProviderFactory`
- `STTProviderManifest`
- `OpenAIWhisperProvider`

This STT layer is intentionally separate from the translation provider stack because its contract is different:

- it is batch transcription, not language translation
- it returns normalized transcript result objects
- it does not participate in translation provider fallback or selection
- it has different retry and credential behavior

### Components

- **BaseSTTProvider**: defines the transcription contract and normalized STT result/error helpers.
- **STTProviderManifest**: defines the provider metadata surface for MVP and future provider expansion.
- **STTProviderFactory**: resolves a provider by id and instantiates the MVP provider without translation fallback.
- **OpenAIWhisperProvider**: MVP transcription provider that reuses the existing OpenAI API key path and surfaces credential/startup errors deterministically.

## Translation Integration

Live Caption translates finalized transcript text through the existing translation provider architecture:

- `LiveCaptionTranslationAdapter` accepts finalized transcript segments
- it builds a request compatible with the current translation flow
- it delegates to `UnifiedTranslationService`
- it normalizes translated output into caption segment objects

### Provider Selection Behavior

- Live Caption uses current translation settings and the existing provider resolution flow.
- It does not introduce a separate provider selector.
- It does not introduce a custom live-caption provider system.
- It does not introduce live-caption-specific provider fallback.

## Overlay System

The overlay is rendered inside the existing Shadow DOM UI host and is intentionally presentation-only.

### Components

- `LiveCaptionOverlay.vue`
- `LiveCaptionConsentNotice.vue`
- `LiveCaptionCaptionTrack.vue`
- `LiveCaptionCaptionLine.vue`
- `LiveCaptionControls.vue`
- `useLiveCaptionOverlay.js`

### Consent Flow

- Consent is blocking.
- Consent is session-scoped and required before capture starts.
- The notice explains tab audio capture and the cache implications for normal mode and incognito mode.

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

## Consent and Privacy

Live Caption uses session-scoped consent.

### Privacy Notice

The notice states:

- tab audio will be captured
- raw audio is not persisted
- captions/transcripts may be cached outside incognito
- incognito sessions remain session-only

### Fail-Closed Rules

- No capture begins without explicit acceptance.
- Unsupported platform/browser combinations are denied deterministically.
- Recovery reconciliation failure instructs the system to stop capture and notify content.
- Consent is not treated as permanent state.

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
- consent and privacy policy
- cleanup and recovery contracts
- STT infrastructure
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

### Not Yet Implemented

- STT execution pipeline
- translation execution pipeline
- end-to-end caption execution
- cache persistence writes
- transcript/overlay caption updates

## Future Runtime Phases

The remaining runtime phases are media and execution only:

1. wire offscreen capture ownership to the actual tab-audio pipeline
2. run finalized chunks through STT, translation, and overlay updates
3. verify cleanup and recovery paths under real browser lifecycle events

## Maintenance Notes

- Keep `PageLiveCaptionSession`, `VideoCaptionSession`, `LiveCaptionSessionManager`, `LiveCaptionVideoHandoffCoordinator`, and `LiveCaptionCleanupCoordinator` aligned with the OpenSpec change before changing runtime code.
- Keep `LiveCaptionRuntimeController` aligned with the content-side ownership model and avoid moving detection or handoff policy into the overlay.
- Do not move capture ownership into the service worker.
- Do not merge STT into the translation provider stack.
- Do not store transcript and translation records in the same cache store.
- Do not add provider fallback semantics that are unique to Live Caption.
- Keep overlay code presentation-only; business logic should stay in core/session modules.

## Do Not Violate

- No raw stream handoff to background.
- No service-worker-local long-lived media ownership.
- No permanent consent storage.
- No page-URL-only cache identity.
- No implicit provider fallback for Live Caption.
- No runtime execution in this document’s model beyond the architecture already implemented.

**Last Updated**: June 2026
