## Why

Translate-It already has a mature translation pipeline, Shadow DOM UI host, storage abstractions, and background orchestration, but it does not have a dedicated live audio captioning path. Live caption translation needs its own capture and session model because it is tab-scoped, audio-driven, privacy-sensitive, and operationally different from page translation, subtitle translation, or TTS.

This change introduces a new desktop MVP capability that can capture the active tab's video audio, transcribe it in batches, translate the finalized transcript, and render captions in a Shadow DOM overlay with explicit user consent.

## Scope

### In Scope

- Chrome and Edge desktop MVP only.
- User-triggered live caption start on the active tab.
- Tab audio capture using an offscreen document.
- Batch STT using OpenAI Whisper as the initial provider, reusing the existing OpenAI API key/settings path with no separate STT credential UI in MVP.
- Translation via the existing Translation Provider System.
- Final captions only, with no streaming or partial caption rendering.
- A normalized caption display model supporting translated-only, transcript-only, and bilingual rendering, with translated-only as the MVP default.
- One active video session per tab.
- Per-video identity and cache boundaries.
- In-memory session cache plus persistent IndexedDB cache.
- Separate persistence for original transcript segments and translated caption segments.
- Shadow DOM caption overlay integrated with the existing UI Host.
- Normalized caption display-mode support for translated-only, transcript-only, and bilingual presentation without changing runtime capture behavior.
- Privacy notice and explicit consent before any capture begins.
- Retry support for transient failures.

### Out of Scope

- Firefox support.
- Mobile support.
- Auto-start or background-only captioning.
- Streaming STT.
- Partial or interim captions.
- Automatic provider fallback.
- Multiple simultaneous videos in the same tab.
- Broad media library indexing or global caption search.

## What Changes

- Adds a new self-contained feature module at `src/features/live-caption/`.
- Introduces a separate STT provider layer that is not coupled to the translation provider hierarchy.
- Reuses the existing translation provider pipeline only after STT produces finalized text.
- Adds a tab-scoped `PageLiveCaptionSession` and a video-scoped `VideoCaptionSession`.
- Adds active-video detection and video fingerprinting so the cache is keyed per video, not per page.
- Adds an offscreen audio capture path for desktop browser audio capture.
- Adds a finalized audio chunk delivery contract from offscreen to background, with no raw stream handoff.
- Adds offscreen status/snapshot reconciliation for MV3 wakeup and restart recovery.
- Adds a Shadow DOM overlay for consent, controls, and rendered captions.
- Adds a live-caption options surface for MVP settings and storage controls.
- Adds a normalized caption display model that supports translated-only, transcript-only, and bilingual rendering, with translated-only as the MVP default and translation remaining optional for future phases.
- Adds new messaging actions and lifecycle cleanup paths for start, stop, chunk completion, translation completion, and tab teardown.
- Adds persistent cache storage for transcript segments and translated caption segments.
- Introduces a dedicated Live Caption logging scope/component that integrates with the existing structured logging system.
- Updates manifest permissions for active tab capture and tab audio capture on Chrome/Edge desktop.
- Reuses the existing OpenAI API key/settings path for Whisper MVP authentication without introducing a separate STT credential UI.

## Requirements

### Functional Requirements

- The feature must not start capturing audio until the user explicitly accepts the privacy notice.
- Live captioning must target the active tab and the active video within that tab.
- Only one live-caption session may be active per tab.
- STT must run in batch mode and return final transcript segments only.
- Translation must use the existing provider system and its translation settings.
- Transcript data and translated caption data must be stored separately.
- Cache lookups must be per-video, not per-page.
- The overlay must render inside the existing Shadow DOM UI host.
- The overlay must support a normalized caption display mode with translated-only as the MVP default and transcript-only/bilingual as architectural capabilities.
- Stop, retry, tab close, navigation, and video change must all cleanly tear down the session.

### Technical Requirements

- The STT system must remain separate from the translation provider system.
- The capture flow must be browser-extension compatible with MV3 service worker constraints.
- The offscreen document must own the audio stream lifecycle.
- The offscreen document must expose a lightweight live-caption session status/snapshot that the background layer can query after wakeup or restart.
- The offscreen document must emit finalized audio chunks only, with chunk metadata needed for downstream orchestration.
- The background layer must own session orchestration and persistence coordination.
- The content layer must own video detection and overlay updates.
- Incognito behavior must avoid persistent storage.
- Background service-worker state must remain minimal, recoverable, and not the sole source of truth for long-running capture activity.
- If recovery cannot be reconciled, the session must fail closed by stopping capture and notifying content.
- No raw audio may be persisted for recovery.
- OpenAI Whisper MVP authentication must reuse the existing OpenAI API key/settings path; missing or invalid credentials surface as a live-caption startup/provider error and no separate STT credential UI is introduced.
- All live-caption modules must use a dedicated logging scope/component rather than ad-hoc console logging.
- The live-caption logging scope must integrate with the existing logging constants, scoped logger utilities, and production-aware logging architecture.
- Logging must provide clear lifecycle visibility for session creation, capture start/stop, STT execution, translation execution, cache activity, cleanup, and error recovery.

## Architecture Decisions

### Feature Isolation

- Live captioning will live in a dedicated feature tree at `src/features/live-caption/`.
- The feature will not be folded into `translation/`, `tts/`, or `subtitle-translation/`.
- This keeps capture, transcription, caching, and overlay logic independently testable and easier to reason about.

### Session Model

- `PageLiveCaptionSession` is the tab-scoped coordinator and owns the lifetime of the live-caption experience for a page.
- `VideoCaptionSession` is the per-video runtime unit and owns chunk sequencing, transcript accumulation, translation requests, and overlay output.
- `LiveCaptionVideoHandoffCoordinator` will resolve active-video transitions deterministically so that a target change can be treated as a no-op, a replacement, or a cleanup-only transition without leaking ownership boundaries.
- Session boundaries are keyed by tab identity and video fingerprint so that switching videos within the same page does not corrupt cache state.

### STT Separation

- `BaseSTTProvider`, `STTProviderFactory`, and `STTProviderManifest` will form a new provider hierarchy for transcription only.
- OpenAI Whisper is the MVP provider.
- STT will not inherit translation fallback rules, rate-limit policies, or provider selection semantics from the translation provider stack.

### Logging Architecture

- Live Caption must follow the same structured logging conventions used by existing major systems such as Translation, TTS, Screen Capture, and Whole Page Translation.
- Logging is part of the feature architecture from the beginning, not a later operational add-on.
- The logging component identifier should follow existing project naming conventions and use `LiveCaption` within `LOG_COMPONENTS`.

### Translation Reuse

- Once STT produces finalized text, translation will be handed off to `UnifiedTranslationService` and its existing provider pipeline.
- Live captioning will use the existing translation provider resolution flow and current translation settings.
- Live captioning must reuse the existing translation provider architecture rather than introducing a separate translation selection mechanism.
- No additional provider-selection UI is introduced for MVP.
- No automatic provider fallback behavior is introduced specifically for live-caption MVP.

### Capture and Offscreen Ownership

- The offscreen document will own audio stream capture and chunk finalization.
- The background service worker will own session orchestration, STT dispatch, translation dispatch, persistence, and cleanup.
- The content script will own active-video discovery, consent UI entry points, and Shadow DOM overlay updates.

### Cache Model

- Session cache will remain in memory for fast UI updates and seek handling.
- IndexedDB will persist per-video caption data across stops and resumes.
- Original transcript segments and translated caption segments will be stored in separate stores.
- Cache keys will be generated from tab identity plus video identity, not page URL alone.

### UI Host Integration

- The overlay will mount through the existing UI Host and Shadow DOM infrastructure.
- This preserves the current isolation model and avoids duplicating host logic.
- Caption rendering must support translated-only, transcript-only, and bilingual display modes, while keeping transcript and translated stores separate.

## Acceptance Criteria

- A user can start live captioning only after accepting a privacy notice.
- Starting a session on a supported desktop browser captures the active tab's audio and renders final captions in the overlay.
- The feature produces transcript segments first and translation segments second, with no partial captions shown, while the overlay can render translated-only, transcript-only, or bilingual views from the same stored data.
- Only one active video is captioned per tab at any time.
- Switching to a different active video ends the current video session and starts a new one.
- Caption data is reused from cache when resuming the same video within the same tab scope.
- Original transcript records and translated caption records are persisted separately.
- Stopping the session releases the audio stream, clears active runtime state, and leaves no orphaned listeners.
- Closing the tab or navigating away fully tears down the session and cleanup state.
- Incognito sessions do not write persistent caption caches.
- The feature remains isolated from existing translation, TTS, and subtitle translation behavior.

## Rollout Strategy

### MVP Rollout

1. Keep the feature desktop-only and behind explicit user activation.
2. Expose only the minimum required settings needed to operate the MVP.
3. Validate the capture flow, cleanup behavior, and cache model before broadening the UI surface.
4. Dogfood internally on supported Chrome and Edge desktop builds first.
5. Expand usage only after the offscreen capture path, permission flow, and session cleanup have been verified under navigation, tab-close, and multi-video scenarios.

### Operational Guardrails

- Do not auto-start on page load.
- Do not enable provider fallback in MVP.
- Do not expose unsupported platforms in the UI.
- Keep the consent flow mandatory and explicit.

## Capabilities

### New Capabilities
- `live-caption-translation`: Live video caption capture, transcription, translation, overlay rendering, consent handling, and persistent per-video caption caching.

### Modified Capabilities

- None.

## Impact

- New feature tree under `src/features/live-caption/`.
- Background message routing and cleanup registration.
- Offscreen document responsibilities for audio capture.
- Manifest permissions for `activeTab` and `tabCapture`.
- Options UI settings surface for live-caption controls.
- IndexedDB storage model for transcript and translation caches.
- Logging infrastructure updates to register a dedicated live-caption logging scope/component.
- Reuse of the existing OpenAI API key/settings path for Whisper MVP authentication.
- Reuse of `UnifiedTranslationService` and existing translation providers for caption translation only.
- Reuse of existing Shadow DOM UI host, ResourceTracker patterns, toast/notice patterns, and logging infrastructure.
