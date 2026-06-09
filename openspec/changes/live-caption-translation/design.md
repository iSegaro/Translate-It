## Context

Live Caption Translation adds a new browser-extension capability that captures the active tab's audio, performs batch speech-to-text transcription, translates finalized text through the existing translation pipeline, and renders captions in a Shadow DOM overlay. The feature is privacy-sensitive, tab-scoped, and operationally different from the existing translation, TTS, subtitle translation, and screen-capture systems.

The current codebase already provides the major infrastructure this feature needs: structured logging, message routing, Shadow DOM UI hosting, ResourceTracker-based cleanup, storage utilities, IndexedDB precedents, and a mature translation provider stack. What is missing is a dedicated live-caption capture/session layer and a separate STT provider path.

The design must stay consistent with Translate-It's feature-based architecture and avoid collapsing the feature into translation, TTS, or subtitle systems.

## Goals / Non-Goals

**Goals:**
- Add a dedicated live-caption feature with clear ownership boundaries.
- Reuse the existing translation provider architecture for translation only.
- Introduce a separate STT provider system for transcription.
- Support a user-triggered, consent-gated, desktop-only MVP on Chrome and Edge.
- Persist original transcript segments and translated caption segments separately.
- Keep the overlay inside the existing UI Host and Shadow DOM isolation model.
- Make logging a first-class architectural concern through a dedicated `LiveCaption` logging component.
- Ensure cleanup is deterministic on stop, tab close, navigation, and video change.

**Non-Goals:**
- Firefox or mobile support.
- Auto-start or background-only captioning.
- Streaming or partial captions.
- Automatic provider fallback in MVP.
- Multiple simultaneous videos in one tab.
- Broad media cataloging, search, or media-library indexing.
- Replacing or redesigning the existing translation provider system.

## Decisions

### 1. Feature Isolation and Folder Structure

Live Caption Translation will live in `src/features/live-caption/` as a standalone feature tree. It will include separate subfolders for `core/`, `stt/`, `cache/`, `background/`, `content/`, `overlay/`, `stores/`, and `constants/`.

**Why this decision**
- The feature spans capture, transcription, translation, persistence, and UI.
- A single feature tree keeps ownership explicit and prevents coupling to unrelated systems.
- The structure matches the repository's feature-based architecture.

**Alternatives considered**
- Extending `translation/` or `screen-capture/`: rejected because live captioning has different lifecycle and privacy requirements.
- Adding feature code directly under `core/`: rejected because it would blur boundaries and reduce maintainability.

### 2. Session Model

The runtime model will use:
- `PageLiveCaptionSession` for tab-scoped ownership.
- `VideoCaptionSession` for per-video ownership.

`PageLiveCaptionSession` coordinates the tab-level lifecycle, consent state, active video selection, cleanup, and cache scope. `VideoCaptionSession` owns chunk sequencing, transcript accumulation, caption rendering state, and per-video persistence.

Active-video selection follows a deterministic MVP tie-break order:
1. currently playing
2. visible in viewport
3. audible/unmuted when detectable
4. largest visible area
5. most recent user interaction with the video
6. DOM order as final deterministic fallback

**Why this decision**
- The spec requires one active video session per tab.
- Page-level and video-level responsibilities are different and should not be mixed.
- The model supports tab navigation, source changes, and video switching without conflating identities.
- Long-lived media ownership must not live in the MV3 service worker.
- Session state must be designed so that service-worker-local state remains minimal, recoverable, and not the sole source of truth for long-running capture activity.

**Alternatives considered**
- A single session object for both page and video: rejected because it makes cleanup and per-video cache identity too ambiguous.
- Pure content-side ownership: rejected because audio capture and persistence require background and offscreen coordination.
- Pure content-side ownership for all session state: rejected because it would not satisfy offscreen/media constraints or background orchestration needs.

### 3. Capture and Offscreen Ownership

The offscreen document will own tab audio stream capture and chunk finalization. The background service worker will own orchestration, STT dispatch, translation dispatch, persistence, and cleanup coordination. The content script will own user interaction, active-video detection, and overlay updates.

**Why this decision**
- MV3 service workers are not suitable for owning long-lived audio capture state.
- Offscreen documents are the correct place to hold media stream and `MediaRecorder` state.
- Background orchestration keeps the capture pipeline separate from page DOM concerns.
- Background coordinates the session, but it does not become the long-lived owner of media streams.
- MV3 service-worker lifetime constraints remain an explicit design constraint, not an implementation detail.
- The offscreen document must expose a lightweight status/snapshot that the background can query after wakeup or restart.
- If reconciliation fails, the system must fail closed by stopping capture and notifying content.
- No raw audio is persisted for recovery.
- Background must receive finalized chunks only; raw stream data is never handed off to background.
- Finalized chunk messages must carry sessionId, videoFingerprint, chunkStartMs, chunkEndMs, MIME/type metadata, and a final payload or blob reference.

**Ownership split**
- Content owns video discovery, active-video tracking, overlay state, and user interaction state.
- Offscreen owns media stream capture, `MediaRecorder` lifecycle, audio chunk generation, the live-caption session snapshot/status, and finalized chunk payload delivery.
- Background owns orchestration, message routing, STT dispatch, translation dispatch, persistence coordination, and cleanup coordination.

**Alternatives considered**
- Capturing directly in the content script: rejected because it would mix page state with media lifetime and complicate permission handling.
- Capturing entirely in the background worker: rejected because service workers are not stable enough for long-running media ownership.

### 4. STT Provider Model

Live Caption Translation will introduce `BaseSTTProvider`, `STTProviderFactory`, and `STTProviderManifest` as a transcription-only provider hierarchy. OpenAI Whisper is the MVP provider.

OpenAI Whisper MVP authentication reuses the existing OpenAI API key/settings path. No separate STT credential UI is introduced for MVP, and missing or invalid OpenAI credentials surface as a live-caption startup/provider error.

**Why this decision**
- Speech transcription is not the same problem as text translation.
- A separate provider stack prevents accidental coupling to translation fallback and batching rules.
- The MVP requires only one STT provider, but the architecture should not hardwire the system to that provider forever.
- Reusing the existing OpenAI settings path avoids a second credential surface and keeps the MVP consistent with current provider configuration behavior.

**Alternatives considered**
- Reusing translation provider base classes: rejected because it would blur semantics and encourage incorrect fallback behavior.
- Hardcoding Whisper into the coordinator: rejected because it would not leave room for future STT expansion.

### 5. Translation Reuse Model

The feature will reuse `UnifiedTranslationService` and the existing translation provider resolution flow after STT returns finalized text. No new provider-selection UI will be introduced for MVP, and no live-caption-specific provider fallback behavior will be added.

**Why this decision**
- The project already has a mature translation provider system.
- Translation settings and provider behavior should remain centralized.
- The live-caption feature should not duplicate translation configuration or routing logic.

**Alternatives considered**
- A dedicated live-caption translation provider selector: rejected because it creates duplicate configuration and behavior divergence.
- Pinning a separate provider path per session with custom fallback rules: rejected because it fragments the translation architecture.

### 6. Cache Model

The feature will use a two-layer cache model:
- In-memory session cache for fast updates and seek support.
- IndexedDB persistent cache for per-video transcript and translation history.

Transcript records and translated caption records will be stored separately. Cache keys will be generated from tab identity plus video identity, not page URL alone.

**Why this decision**
- Final captions need fast replay and deterministic resume behavior.
- Transcript and translation data have different retrieval and invalidation needs.
- Page-level cache keys are too coarse for multi-video pages.

**Alternatives considered**
- Per-page cache only: rejected because it would conflate different videos in the same tab.
- Single combined transcript/translation store: rejected because it weakens data separation and makes invalidation harder.

### 7. UI / Overlay Model

The overlay will render through the existing UI Host and Shadow DOM infrastructure. The feature will introduce a dedicated live-caption overlay container, consent notice, caption track, and controls.

**Why this decision**
- The project already uses Shadow DOM isolation for in-page UI.
- Reusing the UI Host keeps styling and lifecycle consistent.
- The overlay must stay isolated from page CSS and page scripts.

**Alternatives considered**
- A floating DOM overlay outside the UI Host: rejected because it breaks consistency and increases style leakage risk.
- An iframe-based overlay: rejected because it adds unnecessary complexity for this MVP.

### 8. Messaging Model

Live captioning will use dedicated message actions for start, consent, audio chunk delivery, STT results, translation requests/results, video changes, status updates, errors, and cleanup.

**Why this decision**
- The feature spans content, background, and offscreen contexts.
- Explicit message actions make lifecycle boundaries visible and testable.
- The existing messaging architecture already supports event-driven cross-context coordination.

**Alternatives considered**
- Direct cross-context method calls: rejected because they would blur ownership boundaries.
- Reusing translation-specific messages only: rejected because the feature has distinct capture and session events.

### 9. Settings Model

The MVP will add only the settings needed to operate live captioning, while reusing the existing translation and API key settings where appropriate. The live-caption options surface will be exposed in the Options UI under a dedicated tab or equivalent navigation entry.

**Why this decision**
- The feature needs explicit control without overloading the options surface.
- Translation settings should remain shared where possible.
- Keeping the settings surface small reduces rollout and support risk.

**Alternatives considered**
- A large dedicated settings matrix: rejected as premature for the MVP.
- No settings UI at all: rejected because the feature needs clear user control and discoverability.

### 10. Logging Model

Live Caption Translation will register a dedicated `LiveCaption` component in the structured logging system. All feature modules will use scoped loggers rather than ad-hoc console logging.

**Why this decision**
- The feature is lifecycle-heavy and failure-prone without clear telemetry.
- The existing logging architecture is designed for component-based visibility.
- Logging must be part of the feature architecture from the beginning.

**Alternatives considered**
- Reusing generic `Background` or `Content` logging scopes only: rejected because it would hide live-caption-specific lifecycle traces.
- Adding logging later: rejected because the feature needs clear operational visibility during rollout and debugging.

### 11. Cleanup and Lifecycle Model

The feature will prioritize deterministic teardown. Stop, tab close, navigation, active-video change, and error conditions must all cancel capture, flush in-flight work where needed, persist completed data, and release listeners/resources.

**Why this decision**
- Media capture and long-lived sessions are resource-sensitive.
- MV3 service worker lifetime constraints make explicit cleanup essential.
- The feature must not leak streams, listeners, or stale overlay state.

**Alternatives considered**
- Best-effort cleanup only: rejected because it risks orphaned capture state and inconsistent user experience.

## Risks / Trade-offs

| Risk | Impact | Mitigation |
|---|---|---|
| MV3 service worker lifetime interrupts orchestration | Session state can be lost if too much is kept in-memory | Keep capture ownership in offscreen, persist only durable state in IndexedDB, and keep background state minimal and recoverable |
| Tab audio capture permission or gesture flow fails | Session cannot start | Gate start behind explicit user activation and validate permissions before capture begins |
| Multi-video pages create ambiguous active targets | Wrong video could be captioned | Use a deterministic active-video detector and enforce one active video per tab |
| Translation and STT batching semantics differ | Incorrect assumptions could break caption timing | Keep STT separate from translation and normalize results at the session layer only |
| Persistent cache grows too large | Storage bloat and stale resume data | Add bounded cache policies, per-video keys, and explicit clear behavior |
| Logging volume becomes noisy | Harder debugging and possible performance overhead | Use scoped logging levels and follow existing production-aware logging patterns |
| Overlay positioning drifts on fullscreen or layout changes | Caption display becomes unusable | Anchor overlay to the active video and recompute position on relevant DOM changes |

## Migration Plan

1. Add the live-caption proposal, design, and spec artifacts as the canonical reference.
2. Implement manifest and settings scaffolding behind the feature's normal activation path.
3. Register the dedicated `LiveCaption` logging component before feature wiring begins.
4. Implement the feature shell, session model, and message plumbing.
5. Add capture/offscreen, STT, translation reuse, overlay, and cache layers in small independently testable phases.
6. Validate cleanup behavior under stop, tab close, navigation, and video change before broad rollout.

Rollback strategy:
- Keep live-caption activation isolated from unrelated features.
- If a later implementation phase fails, disable the live-caption entry points and preserve the rest of the extension unchanged.
- Persistent cache data can be cleared independently without affecting other features.

## Open Questions

- None.
