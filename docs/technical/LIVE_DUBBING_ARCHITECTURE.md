# Live Dubbing Architecture

Chrome-only real-time tab-audio translation. Captured tab audio is streamed
to the Gemini Live translation model as 16 kHz PCM and translated speech
returns as 24 kHz PCM for local playback.

## Scope

- **Chrome only.** Every background entry point returns
  `LIVE_DUBBING_UNSUPPORTED` outside Chrome runtimes, and handler
  registration is skipped on other browsers.
- **One active session.** `LiveDubbingCoordinator` owns a single
  tab-capture control-plane session at a time; a second start is rejected
  as busy.
- **No pre-recorded or microphone input.** The only audio source is the
  active tab's capture stream.

## Popup Start / Stop Flow

1. The Popup (`LiveDubbingControl.vue`) sends `START_LIVE_DUBBING`
   (target language), `STOP_LIVE_DUBBING` (session id), or
   `GET_LIVE_DUBBING_STATUS`. All three require a trusted extension-UI
   sender (see Security).
2. `LiveDubbingCoordinator.start()` creates a session id, persists a
   `PREPARING_CAPTURE` descriptor (including provider id `gemini`) to
   `storage.session`, acquires the
   offscreen lease (`USER_MEDIA` + `AUDIO_PLAYBACK`), and drives the
   offscreen stages `PREPARE` → `CONSUME` → `CONNECT_PROVIDER`, ending in
   `RUNNING`.
3. `stop()`, tab removal, top-level navigation, capture-track end, and
   provider terminal events all funnel into one idempotent terminal path:
   mark terminal → `DISPOSE` the offscreen session → release the exact
   lease → clear the descriptor. Duplicate, stale, and wrong-session
   terminal messages are ignored without side effects.
4. Operation timeouts: start 30 s, stop 10 s, status 5 s, setup stages
   10 s. Service-worker restarts reconcile via descriptor + lease snapshot
   (`reconcile()`), never trusting a stale session.

## Runtime Ownership

- `LiveDubbingCoordinator` (background) owns session identity, descriptor
  persistence, lease acquisition/release, and terminal fencing.
- `LiveDubbingController` (offscreen document) owns the only media,
  provider-socket, and audio-graph resources for the current session.
  A terminal callback re-fences the session first, so late worklet and
  socket events cannot affect a subsequent session.
- The offscreen document exists only while the lease is held; disposal
  always precedes lease release.

## Capture

`chrome.tabCapture.getMediaStreamId` (background, authoritative tab) hands
a one-time stream id to exactly one targeted `CONSUME` message. The
offscreen controller calls `getUserMedia` with that id; the id is never
returned, stored, or logged.

- `TabAudioPipeline` verifies a fixed 16 kHz `AudioContext` and fails
  closed on any other rate.
- The capture AudioWorklet emits fixed PCM16 mono frames of **1600
  samples (100 ms at 16 kHz)**.
- The source graph terminates in a **zero-gain sink**, so captured tab
  audio stays inaudible while capture runs.
- The pipeline never connects the raw stream to the destination.

## Provider Identity and Bootstrap

The public live-dubbing contract carries the exact provider identity
`LIVE_DUBBING_PROVIDER_ID = 'gemini'`. The Popup does not select or transmit a
provider; the Coordinator owns this value and includes it in every descriptor,
offscreen request, response, and terminal event. Persisted descriptors without
the provider id are invalid and are not adopted during reconciliation.

Provider language support is an explicit `LIVE_GEMINI_LANGUAGE_MAP` allowlist,
separate from the general translation catalog. Unknown provider or language
codes fail closed before descriptor creation or socket setup.

The one-time `LIVE_DUBBING_REQUEST_PROVIDER_BOOTSTRAP` request is authorized
only for the exact active `CONNECTING_PROVIDER` session, provider, target
language, and event sequence. Background resolves the key and returns the
small DTO `{ success, providerId, targetLanguage, bootstrap }`. The generic
Controller treats `bootstrap` as opaque; only the Gemini adapter reads
`bootstrap.apiKey`. No legacy credential action or helper remains.

The `LiveDubbingProviderRegistry` is the feature-local mapping from provider id
to adapter. It currently contains only Gemini and returns no adapter for an
unknown provider.

## Provider

The offscreen `LiveDubbingController` resolves the provider through
`LiveDubbingProviderRegistry`. The Gemini adapter owns Gemini-specific behavior
and the Gemini protocol over its WebSocket transport.

Transport path: `LiveDubbingController` → `LiveDubbingProviderRegistry` →
`GeminiLiveProviderAdapter` → Gemini protocol transport.

Model: `models/gemini-3.5-live-translate-preview` over WebSocket.

- **Bootstrap flow.** Background resolves the key (`ApiKeyManager` primary
  `GEMINI_API_KEY`, else stored key) only after authorizing the one-time
  offscreen bootstrap request against the persisted `CONNECTING_PROVIDER`
  fence. The key travels in one targeted response; the Controller clears its
  local wrapper before awaiting setup and never stores it. Background never
  places bootstrap data in descriptors.
- **Setup gate.** Input pipelines must be ready and the descriptor persisted at
  `CONNECTING_PROVIDER` before bootstrap is issued;
  `setupComplete` from the provider is required before `RUNNING`.
- **No pre-setup queue.** Frames arriving before setup are counted and
  dropped (`preSetupDroppedFrames`); nothing is buffered for later send.
- **Streaming.** `realtimeInput.audio` carries base64 PCM declared as
  16 kHz; the adapter's socket send path enforces a buffered-amount bound and
  reports `BACKPRESSURE` / `NOT_READY` / `SEND_FAILED` without throwing into
  the controller's audio path. Valid 24 kHz `inlineData` PCM is base64-decoded
  and validated by the adapter before byte buffers reach playback.
- **Parsing.** Strict top-level union parsing: `setupComplete`,
  `serverContent`, `toolCall`, `toolCallCancellation`, `goAway`,
  `sessionResumptionUpdate`, with optional accompanying `usageMetadata`.
  Empty `serverContent` (`{}`) is a no-op; unknown or malformed frames
  terminate the session with a typed `GEMINI_LIVE_MALFORMED_MESSAGE`
  diagnostic instead of guessing. A valid `sessionResumptionUpdate` is
  accepted and validated, but reconnect/session resumption remains
  unsupported (see below).
- **Interruptions.** `serverContent.interrupted` bumps the output epoch
  and resets playback ordering; counted, never treated as failure.
- **GoAway.** A valid `goAway` frame terminalizes the session with reason
  `PROVIDER_GO_AWAY`; later callbacks from the closed generation are
  ignored.
- **Tool calls.** The model must not call tools; any `toolCall` frame
  terminates the session (`GEMINI_LIVE_UNSUPPORTED_TOOL_CALL`).
- **No reconnect or resumption.** Terminal provider states (close, error,
  goAway) end the session. There is no automatic reconnect, session
  resumption, or cross-provider fallback.

`speechState` is officially documented-but-deprecated and
`interactionStatus` is officially documented; both are accepted as
metadata only and never drive session semantics.

## Playback

`PcmOutputPlayer` renders translated 24 kHz PCM16 through a dedicated
output graph. It enforces queue safety limits (over-limit chunks are
dropped and counted as `outputSafetyDrops`), tracks underruns and
underrun samples, and reports first-chunk acceptance back to the
controller. Queue clearing on teardown is best effort before graph stop.

## Lifecycle States

Public descriptor states: `PREPARING_CAPTURE` → `CONNECTING_PROVIDER` →
`RUNNING` → `STOPPING`, plus terminal `ERROR`. `CAPTURING` is an
offscreen-internal state and is never exposed as public `RUNNING`.
`STOPPING` blocks descriptor writes from any path except the owning
terminal operation.

## Security

- **Background-only key.** The provider key is resolved in background and
  is transient in offscreen memory.
- **Exact sender auth.** Offscreen messages require the exact offscreen
  document URL plus runtime id and no tab. Public commands require the
  exact allowlisted UI document path (`src/html/popup.html`,
  `src/html/sidepanel.html`, `src/html/options.html`) with runtime id and
  extension origin; tab-bound trusted pages are accepted by path, while
  extension origin alone never authorizes.
- **Sanitized diagnostics.** Cross-context diagnostic payloads are limited
  to three sanitized scalar DTOs: capture diagnostics (stage + redacted
  name/message/code), provider diagnostics (stage `CONNECT_PROVIDER` +
  token/code/close-code/flags), and cleanup diagnostics (counts +
  playback + terminal category).
  Session/tab identity, stream ids, credentials, URLs, PCM, transcripts,
  provider bodies, and errors never cross a context boundary and are
  never logged.

## Reliability Bounds

- Input backlog is bounded: 500 ms pending maximum, trimmed to a 200 ms
  retain window; drops are counted as duration, not frames.
- WebSocket buffered-amount bound is 64 KiB; backpressure is counted and
  surfaced as a send reason, never thrown into capture.
- Internal telemetry (input/output counts, drops, backpressure, send
  failures, buffered peaks, safety drops, underruns, interruptions, and
  same-context milestones) is observational only and never affects audio
  or session behavior.
- Logging is warn-only for provider terminals, no-playback endings, and
  real capture/startup/disposal failures. There are no routine telemetry
  logs.

## Stage 3 Note (Historical)

A time-boxed Stage 3 spike compared fixed 100 ms framing against a 40 ms
build variant. The 100 ms production framing was retained: the 40 ms
variant added WS buffering pressure without a latency gain. See
ADR-018. This section is history, not a benchmark report: no benchmark
persistence, export, or routine measurement logging exists in production.
