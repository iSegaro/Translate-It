# Live Dubbing Architecture

Real-time audio translation. Chrome captures tab audio through the offscreen
tab-capture host; Firefox Desktop captures audio from an active HTML media
element through the content-runtime host. Captured audio is delivered to
Gemini as 16 kHz PCM or to OpenAI as a browser-neutral media stream with
WebRTC remote audio playback.

## Scope

- **Browser-specific hosts.** Chrome supports Gemini and OpenAI through the
  offscreen host. Firefox Desktop supports Gemini through the content-runtime
  host; OpenAI remains unsupported there.
- **One active session.** `LiveDubbingCoordinator` owns a single
  control-plane session at a time; a second start is rejected as busy.
- **No pre-recorded or microphone input.** Chrome uses the active tab's capture stream; Firefox Desktop uses the active supported HTML media element (`<video>` / `<audio>`). No microphone input and no pre-recorded/uploaded input is supported.

### Firefox Content-Runtime Registration (Phase 4, Delivery 1)

Firefox exposes the content-runtime readiness/discovery seam, closed
content-side Gemini provider control, and Background Coordinator lifecycle.
Firefox START is restricted to trusted extension UI and Gemini. The content registration installs the
closed Live Dubbing host listener before emitting readiness. Background keeps
an ephemeral per-frame registry containing only native `tabId`, `frameId`, and
`documentId`; URL, media, provider, and credential data never enter it.

A new document may replace a stale registration for the same frame, but the
registry is discovery-only and cannot rebind an active descriptor. When a
worker has an empty registry, a bounded `tabs.sendMessage` challenge carries a
random scalar nonce to the known top frame. Content answers separately through
`runtime.sendMessage`; Background accepts only the active matching nonce and
native extension sender identity. Stale/out-of-order nonces, missing document
identity, wrong-extension senders, and subframes fail closed. The registry is
in-memory and can be rebuilt by a later challenge after worker restart.

### Firefox Content-Side Provider Control (Phase 4, Delivery 2)

`CONNECT_PROVIDER` is accepted only by a prepared, active `liveDubbing` content
runtime. It is Gemini-only, does not activate or capture, and cannot switch a
session. The local Controller sequence is `0 → 1 → 2 → 3`; PREPARE reports the
post-adoption scalar sequence, while CONNECT echoes its request sequence and
returns the confirmed runtime sequence. Exact successful CONNECT retries are
idempotent; stale, foreign, newer, and not-prepared requests fail closed.

The content Handler delegates setup to the browser-neutral Controller through a
narrow FeatureManager seam. Firefox injects only `requestBootstrap` and
`notifyTerminal` messenger callbacks with exact scalar descriptor identity.
Bootstrap minting remains Background-only; terminal authentication dispatches
exact host cleanup, and OpenAI Firefox support remains deferred.

## Popup Start / Stop Flow

1. The Popup (`LiveDubbingControl.vue`) sends `START_LIVE_DUBBING`
   (target language and the persisted provider choice), `STOP_LIVE_DUBBING`
   (session id), or `GET_LIVE_DUBBING_STATUS`. All three require a trusted
   extension-UI sender (see Security).
2. `LiveDubbingCoordinator.start()` fixes the provider identity in the pending
   start and descriptor. On Chrome, an absent `providerId` defaults to `gemini`;
   the persisted choice may also select `openai`, and the Coordinator drives
   the offscreen stages `PREPARE` → `CONSUME` → `CONNECT_PROVIDER`. On Firefox,
   only Gemini is admitted: the Coordinator resolves the trusted active tab's
   exact content document, persists `PREPARING_CAPTURE` sequence 0, sends
   `PREPARE`, persists `CONNECTING_PROVIDER` sequence 2, sends
   `CONNECT_PROVIDER`, and persists `RUNNING` sequence 3. Firefox acquires no
   offscreen lease and never calls tabCapture.
3. `stop()`, tab removal, top-level navigation, capture-track end, and
   provider terminal events all funnel into one idempotent terminal path. Chrome
   disposes offscreen then releases its exact lease. Firefox sends exact
   content-host `DISPOSE` and never releases an offscreen lease. Descriptors
   clear only after confirmed terminal acknowledgement; duplicate, stale, and
   wrong-session/provider terminal messages are ignored.
4. Operation timeouts: start 30 s, stop 10 s, status 5 s, setup stages
   10 s. Service-worker restarts reconcile via the persisted descriptor and its
   owning host; Chrome additionally uses the lease snapshot, while Firefox
   rediscoveries must match the persisted document and never rebind a newer one.
5. `GET_LIVE_DUBBING_STATUS` is a read-only recovery read and is not queued
   behind START or STOP. A reopened Popup can reconstruct a persisted pending,
   connecting, stopping, or retained-error session. STOP can cancel an in-flight
   pending START; terminal fencing prevents a late response from reaching
   `RUNNING`. If cleanup cannot finish, the Coordinator retains the authoritative
   descriptor and exact lease ownership as `cleanupPending`; a later STOP retries
   disposal before release and descriptor clearing.

## Provider Setting

- `LIVE_DUBBING_PROVIDER` is the canonical persisted provider selection and is
  edited and persisted in Options. Its default is `gemini`; the valid persisted
  values are `gemini` and `openai`.
- For a valid persisted value, Popup forwards that value as `providerId` for a
  future session; the dedicated Live Dubbing control has no provider selector.
  A provider change applies only to a future session; the provider identity is
  immutable after an active descriptor is created.
- Settings migration normalizes an invalid persisted value to `gemini`. Popup
  also has a defensive `gemini` fallback when its in-memory setting is
  malformed; that UI guard is not provider negotiation. A direct START carrying
  an unknown provider is rejected by the Coordinator, with no runtime provider
  fallback.

## Runtime Ownership

- `LiveDubbingCoordinator` (background) owns session identity, descriptor
  persistence, host dispatch, and terminal fencing. Lease acquisition/release
  belongs only to Chrome's offscreen host.
- `LiveDubbingController` (offscreen document on Chrome, content-owned handler
  on Firefox) owns the media, provider-socket, and audio-graph resources for
  the current session.
  A terminal callback re-fences the session first, so late worklet and
  socket events cannot affect a subsequent session.
- The Chrome offscreen document exists only while its lease is held; disposal
  always precedes lease release. Firefox has no offscreen document or lease.
- Background handlers are the host control boundary for terminal and
  provider-bootstrap requests. Chrome requires the authorized offscreen sender;
  Firefox requires the native content sender and exact tab/frame/document
  identity. Firefox terminal authorization permits only the documented
  CONNECTING_PROVIDER sequence drift; stale or wrong-session/provider
  notifications fail closed and are ignored.

## Capture

On Chrome, `chrome.tabCapture.getMediaStreamId` (background, authoritative tab)
hands a one-time stream id to exactly one targeted `CONSUME` message. The
offscreen controller calls `getUserMedia` with that id; the id is never
returned, stored, or logged. On Firefox, the content-owned handler uses the
accepted local HTML source handle; no tabCapture, stream id, or media object
crosses the Background boundary.

- `TabAudioPipeline` verifies a fixed 16 kHz `AudioContext` and fails
  closed on any other rate.
- The capture AudioWorklet emits fixed PCM16 mono frames of **1600
  samples (100 ms at 16 kHz)**.
- The source graph terminates in a **zero-gain sink**, so captured
  audio stays inaudible while capture runs.
- The pipeline never connects the raw stream to the destination.

## Provider Identity and Bootstrap

The internal live-dubbing contract supports exactly two provider ids:
`gemini` (the default) and `openai`. The dedicated Live Dubbing control in the
Popup does not select a provider; it forwards the valid persisted Options
choice. An absent direct START `providerId` uses Gemini, while an empty or
unknown value is rejected. Once START creates a pending descriptor, the provider,
session id, tab id, canonical target language, and `startedAt` identity tuple
are fixed for the session and carried through every host request, response,
terminal event, status, stop, and recovery path. Firefox persists the exact
frame/document address alongside the runtime-host discriminator. Persisted
descriptors without a supported provider id are invalid and are not adopted.

Provider language support is provider-local and separate from the general
translation catalog. Gemini keeps the explicit `LIVE_GEMINI_LANGUAGE_MAP`
allowlist and its existing mappings. OpenAI uses its own explicit well-formed
language-tag normalization policy; it never falls back to Gemini's allowlist
or a general catalog. Unknown provider or language values fail closed before
descriptor creation or provider setup. The Coordinator performs this
provider-specific validation before descriptor persistence, lease acquisition,
capture, PREPARE, or bootstrap; bootstrap services and adapters revalidate at
their own boundaries.

The one-time `LIVE_DUBBING_REQUEST_PROVIDER_BOOTSTRAP` request is authorized
only for the exact active `CONNECTING_PROVIDER` session, provider, target
language, and event sequence. Firefox accepts the content runtime's provider
sequence 3 request while its persisted Background fence is CONNECTING sequence
2. Background selects the provider-specific bootstrap service and returns the provider-neutral DTO
`{ success, providerId, targetLanguage, bootstrap }`. The generic Controller
treats `bootstrap` as opaque; each adapter owns its local contract: Gemini
receives `{ accessToken }` and connects to the constrained endpoint with
`?access_token=`, while OpenAI receives `{ secret }` containing an ephemeral
client secret for its WebRTC SDP exchange. Long-lived API keys never leave
background. No legacy credential action or helper remains.

The `LiveDubbingProviderRegistry` is the feature-local mapping from provider id
to adapter. It contains Gemini (`pcm`) and the production OpenAI adapter
(`media-stream`); it returns no adapter for an unknown provider. Each entry
declares `{ create, audioMode }`; unknown providers and unsupported modes fail
closed at PREPARE — before getUserMedia, pipelines, provider creation, or
bootstrap. Factory exceptions propagate to the Controller error boundary
instead of masking as null. OpenAI is registered as a production adapter in
this registry, while its valid choice is persisted by Options and forwarded
by Popup without a dedicated Live Dubbing selector. See Audio Paths.

## Provider

The offscreen `LiveDubbingController` resolves the fixed provider through
`LiveDubbingProviderRegistry`. Gemini owns its protocol over WebSocket; the
OpenAI adapter owns its WebRTC SDP exchange, viable `oai-events` data channel,
and remote audio element playback. The provider registry is the activation
point; no provider id is inferred from client methods.

Transport paths:

- `LiveDubbingController` → `LiveDubbingProviderRegistry` →
  `GeminiLiveProviderAdapter` → Gemini protocol transport.
- `LiveDubbingController` → `LiveDubbingProviderRegistry` →
  `OpenAIRealtimeProviderAdapter` → OpenAI WebRTC translations endpoint.

Model: `models/gemini-3.5-live-translate-preview` over WebSocket.

- **Bootstrap flow.** Background mints a constrained single-use token
  (`POST .../v1beta/auth_tokens` with `uses: 1` and the Live Translation
  model/config constraints) only after authorizing the one-time offscreen
  bootstrap request against the persisted `CONNECTING_PROVIDER` fence. Minting
  advances to the next configured Gemini key only on key/project-plausible
  failures (invalid key, quota exhaustion, rate limiting, per
  `ApiKeyManager.shouldFailover`); network/proxy, serving (5xx), malformed
  payload, and request-shape failures stop with no next key (classified
  mint-time multi-key failover only); keys are read via the existing key
  facilities without reordering text-translation failover state. The token travels in one
  targeted response; the Controller clears its local wrapper before awaiting
  setup and never stores it. Background never places bootstrap data in
  descriptors. A token or connection failure ends the session: there is no
  running-session failover, reconnect, or resumption.
- **Setup gate.** The audio path must be ready (`audioPathReady` — the PCM
  input/output pipelines for Gemini, or the retained media stream for OpenAI)
  and the descriptor persisted at `CONNECTING_PROVIDER` before bootstrap is issued;
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

## Audio Paths (`pcm` | `media-stream`)

Providers declare exactly one audio path in `LiveDubbingProviderRegistry`
as `{ create, audioMode }`; Gemini declares `pcm` and OpenAI declares
`media-stream`. Unknown providers and
unsupported modes fail closed before any audio resource is built. The
controller resolves the mode only through `registry.getAudioMode()` —
never by inspecting client methods and never by provider id.

- **`pcm` (Gemini).** Unchanged behavior: capture frames are pumped
  through the local `TabAudioPipeline`/`PcmOutputPlayer` graphs and the
  provider's `sendAudio` contract, with the pre-setup drop counting,
  pending queue, and backpressure accounting above. The provider receives
  `{ bootstrap, targetLanguage }` at connect and owns no media.
- **`media-stream` (OpenAI).** The retained capture `MediaStream` is handed to the
  provider, which consumes audio and manages playback itself. No local PCM
  graphs are built, no frames are queued, and `sendAudio` is never called
  (it is a pcm-only contract, not a universal one). The connect input is
  `{ bootstrap, targetLanguage, sourceStream }` — the browser-neutral
  retained stream, never a chrome stream id or tabCapture handle.
  Provider-managed playback acceptance arrives through the generic
  `onPlaybackAccepted` callback with the same milestone semantics as
  player acceptance and no media objects in diagnostics or logs.

OpenAI setup uses the authorized `{ secret }` bootstrap contract as an opaque
ephemeral client secret. The adapter creates one `RTCPeerConnection`, adds only
source audio tracks, creates `oai-events`, and considers transport setup viable
only after that channel opens. It POSTs the raw local SDP to the
official translations calls endpoint with an ephemeral bearer, applies the raw
SDP answer, and plays the remote track through an offscreen audio element. The
adapter has no `sendAudio` method and never stops or removes Controller-owned
source tracks. OpenAI setup and playback failures use the existing generic
provider error lifecycle and generation fencing; transcript events are counted
as scalar telemetry and transcript text is not retained.

Ownership split: the controller owns the capture tracks in both modes
and stops them only in Controller cleanup; providers never own the
capture stream. Provider shutdown (`dispose()`, falling back to the sync
`close()`) is initiated before track stop and awaited inside the same
cleanup transaction, fenced by the generation bump. Readiness is reported
provider-neutrally as `audioPathReady`, which stays the `CONNECT_PROVIDER`
and bootstrap gate; in media-stream mode the PCM-specific ready flags
report false (no local pipelines exist) rather than following the generic
flag. `inputReady`/`outputReady` describe local PCM graph starts only, so
media-stream readiness is `audioPathReady` and playback is signaled solely
by `firstTranslatedAudioAcceptedByPlayback`, which a media-stream provider
reports through the generic `onPlaybackAccepted` callback (rejected on the
pcm path, where the player owns it). Status, telemetry, and cleanup
diagnostics expose scalars only — no provider, media, or stream objects.

Lease and bootstrap ownership are provider-specific but remain one control
plane: Gemini requires `USER_MEDIA` + `AUDIO_PLAYBACK`; OpenAI adds `WEB_RTC`.
Bootstrap authorization always uses the provider stored in the descriptor.
OpenAI is not routed through the Gemini minting service; no API key, client
secret, SDP, stream, media object, transcript text, or raw provider payload is
persisted or emitted in diagnostics.

## Playback (pcm path)

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

- **Background-only keys, ephemeral offscreen bootstrap.** Long-lived Gemini
  keys are resolved and used only in background to mint the token. Offscreen
  receives only `{ accessToken }`; the Gemini adapter rejects any `apiKey`
  bootstrap form and connects to `BidiGenerateContentConstrained` with
  `?access_token=` (never `?key=`). OpenAI receives only its authorized opaque
  ephemeral client secret and uses it in the short-lived SDP bearer request.
  Tokens/secrets are transient in offscreen memory and are never stored,
  logged, or included in diagnostics.
- **Exact sender auth.** Offscreen messages require the exact offscreen
  document URL plus runtime id and no tab. Public commands require the
  exact allowlisted UI document path (`src/html/popup.html`,
  `src/html/sidepanel.html`, `src/html/options.html`) with runtime id and
  extension origin; tab-bound trusted pages are accepted by path, while
  extension origin alone never authorizes.
- **Background-only Offscreen control.** Live Dubbing `PREPARE`, `CONSUME`,
  `CONNECT_PROVIDER`, `STATUS`, and `DISPOSE` actions accept only the
  authoritative Background/Service Worker sender. Popup, Options, Side Panel,
  content-script/tab contexts, arbitrary extension documents, and the
  Offscreen document itself cannot directly drive these actions. Authorization
  uses browser-generated sender metadata, never message contents or URL-path
  denylists.
- **Sanitized diagnostics.** Cross-context diagnostic payloads are limited
  to three sanitized scalar DTOs: capture diagnostics (stage + redacted
  name/message/code), provider diagnostics (stage `CONNECT_PROVIDER` +
  token/code/close-code/flags), and cleanup diagnostics (counts +
  playback + terminal category).
  Session/tab identity, stream ids, credentials, URLs, SDP, PCM, transcripts,
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
- Logging is scoped to `LOG_COMPONENTS.LIVE_DUBBING` (Features category):
  warn for provider terminals, the single background no-playback record, and
  real capture/startup/disposal failures; debug for lifecycle detail and mint
  failover; error reserved for unexpected failures only. The offscreen
  no-playback summary stays at debug so one session end is never logged twice.
  Keys, tokens, URLs, bootstrap data, PCM, stream ids, transcripts, and raw
  payloads never reach a logger. There are no routine telemetry logs.

## Runtime Integration

- **Canonical codes.** `LIVE_DUBBING_*`, `GEMINI_LIVE_*`, and
  `OPENAI_REALTIME_*` codes are the internal failure identity across
  background, offscreen, and the adapter. Phase E capture, readiness,
  terminal, cleanup, and provider-diagnostic categories remain unchanged.
- **ErrorTypes classification-only.** Shared `ErrorTypes` are reused only
  inside Gemini and OpenAI provider-bootstrap HTTP classification where an
  unambiguous generic semantic exists. Failover-relevant mappings cover invalid
  key (including explicit `PERMISSION_DENIED`), insufficient balance, quota
  exhaustion, and
  rate limiting, and feed the existing `ApiKeyManager.shouldFailover`
  predicate. HTTP 5xx may classify as `SERVER_ERROR` but does not trigger
  key failover; transport/proxy failures stop directly without shared-type
  normalization; unsupported language/configuration validation stays
  feature-local and stops before minting. Surfaced diagnostics keep the
  canonical codes. `ErrorHandler` and UI presentation (policies, adapters,
  display strategies, localization) are deferred: live dubbing reports
  failures through its own DTOs and never presents provider errors to UI.
- **Explicit async ownership.** Session timers (start timeout, setup
  timeout), track listeners, sockets, pipelines, and the provider client are
  created and cleared on the fenced session paths that own them
  (`clearTimeout` on setup/close, listener removal before track stop, fenced
  terminal disposal). No WebSocket, AudioContext, MediaStream, pipeline, or
  provider client is registered with `ResourceTracker`: group cleanup could
  clear or detach a live fenced resource and change ordering, so explicit
  ownership remains correct. `ResourceTracker` stays limited to simple
  synchronous local resources, of which this feature owns none.

## Stage 3 Note (Historical)

A time-boxed Stage 3 spike compared fixed 100 ms framing against a 40 ms
build variant. The 100 ms production framing was retained: the 40 ms
variant added WS buffering pressure without a latency gain. See
ADR-018. This section is history, not a benchmark report: no benchmark
persistence, export, or routine measurement logging exists in production.
