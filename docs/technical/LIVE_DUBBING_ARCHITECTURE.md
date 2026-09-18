# Live Dubbing Architecture

Chrome-only real-time tab-audio translation. Captured tab audio is delivered
to one of two internal providers: Gemini as 16 kHz PCM with local 24 kHz PCM
playback, or OpenAI as a browser-neutral media stream with WebRTC remote audio
playback.

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
   (target language and the persisted provider choice), `STOP_LIVE_DUBBING`
   (session id), or `GET_LIVE_DUBBING_STATUS`. All three require a trusted
   extension-UI sender (see Security).
2. `LiveDubbingCoordinator.start()` fixes the provider identity in the pending
   start and descriptor. An absent `providerId` defaults to `gemini`; the
   only other supported internal id is `openai`. The dedicated Live Dubbing
   control in the Popup has no provider selector: it forwards the persisted
   Options choice to a new session. The Coordinator persists a
   `PREPARING_CAPTURE` descriptor to `storage.session`, acquires the
   provider-specific offscreen lease (`USER_MEDIA` + `AUDIO_PLAYBACK` for
   Gemini; OpenAI additionally requires `WEB_RTC`), and drives the
   offscreen stages `PREPARE` → `CONSUME` → `CONNECT_PROVIDER`, ending in
   `RUNNING`.
3. `stop()`, tab removal, top-level navigation, capture-track end, and
   provider terminal events all funnel into one idempotent terminal path:
   mark terminal → exact `DISPOSE` acknowledgement → release the exact lease
   → clear the descriptor. When the Coordinator positively proves the
   offscreen runtime absent, it uses the dedicated exact-release path without
   `DISPOSE`. Duplicate, stale, and wrong-session terminal messages are
   ignored without side effects.
4. Operation timeouts: start 30 s, stop 10 s, status 5 s, setup stages
   10 s. Service-worker restarts reconcile via descriptor + lease snapshot
   (`reconcile()`), never trusting a stale session.
5. `GET_LIVE_DUBBING_STATUS` is a read-only recovery read and is not queued
   behind START or STOP. A reopened Popup can reconstruct a persisted pending,
   connecting, stopping, or retained-error session. STOP can cancel an in-flight
   pending START; terminal fencing prevents a late response from reaching
   `RUNNING`. If cleanup cannot finish, the Coordinator retains the authoritative
   descriptor and exact lease ownership as `cleanupPending`; a later STOP retries
   disposal before release and descriptor clearing.

### START preflight and side-effect boundary

The Coordinator's serialized START transaction performs its checks in this
order:

1. Validate the provider id and normalize the provider-specific target language.
2. Read and validate the persisted descriptor, reject unreadable/invalid storage,
   and reject an existing descriptor as busy.
3. Await pending terminal-outcome mutations, read the descriptor again, and
   repeat the storage and busy checks. This barrier keeps an old outcome write
   ahead of a later lifecycle.
4. Await `hasConfiguredCredentials(providerId)` for the selected provider. The
   production implementation dynamically uses the exported Gemini or OpenAI
   bootstrap-service singleton. The service method is read-only: it reuses the
   service's `_eligibleKeys()` policy, performs no network request, does not mint
   a token/secret, log, or provider/key-state mutation, and does not expose a
   key. Gemini retains its primary-list then legacy-key fallback; both services
   trim and deduplicate eligible keys.
   `false`, rejection, or any result other than literal `true` returns
   `LIVE_DUBBING_PROVIDER_BOOTSTRAP_UNAVAILABLE`.
5. Recheck pending START cancellation. If the configured offscreen lease manager
   exposes synchronous `supportsOffscreenDocument()`, call it next; `false` or
   an exception returns `LIVE_DUBBING_UNSUPPORTED`. If the method is absent, the
   prior behavior is preserved.
6. Resolve the authoritative tab, recheck pending cancellation, and verify tab
   capture support. Only then create and persist the descriptor, acquire the
   exact lease, send `PREPARE`, obtain the one-time stream id, send `CONSUME`,
   wait for capture/audio-path readiness, persist `CONNECTING_PROVIDER`, and
   send `CONNECT_PROVIDER` for provider bootstrap and setup before the final
   `RUNNING` commit.

The early rejection paths through provider, language, storage, busy,
outcome-barrier, credential, cancellation, and offscreen-capability checks
occur before the descriptor write, lease acquisition, tab stream id, offscreen
stage message, or media resource creation. Cancellation is also rechecked after
descriptor persistence and between setup stages. A cancellation after
resources are acquired enters the fenced terminal cleanup path and clears only
after exact cleanup/lease settlement (or the proven-absence release path);
before resource acquisition, it uses the fenced descriptor-clear path.
Credential preflight only proves that a configured key is present; a later
mint-time failure remains
`LIVE_DUBBING_PROVIDER_BOOTSTRAP_UNAVAILABLE` and does not introduce automatic
cross-provider fallback or reconnect.

### Status availability

`LiveDubbingCoordinator.getStatus()` computes `available` synchronously as
successful tab-capture support **and**, when the lease manager exposes
`supportsOffscreenDocument()`, successful offscreen-document support. A false
result or thrown capability check makes `available` false. When that offscreen
capability method is absent, offscreen support defaults to true to preserve the
previous behavior. The method then reads the StateStore snapshot only: it does
not acquire/create a lease, create/reconcile an offscreen document, or join the
START/STOP mutation queue.

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

- `LiveDubbingCoordinator` (background) owns lifecycle policy: provider and
  language validation, busy/preflight ordering, descriptor transitions, stage
  sequencing, terminal decisions, identity fences, stop races, and recovery
  policy. It delegates persistence mechanics, physical cleanup, raw platform
  calls, and identity collections to the components below.
- `LiveDubbingStateStore` owns `storage.session` mechanics for the active
  descriptor and the separate terminal-outcome record. It sanitizes records,
  tracks read/write state, serializes outcome mutations, and applies persistence
  fences for expected session/provider/descriptor identity and stale
  `eventSequence`. The Coordinator decides lifecycle policy such as when
  `STOPPING` is allowed and when a successful `RUNNING` commit may clear an
  outcome; the Store performs the atomic descriptor plus null-outcome write in
  one `storage.set` after the Coordinator's outcome barrier and final fence
  re-read.
- `LiveDubbingCleanupManager` owns physical cleanup facts and exact resource
  settlement. `disposeAndRelease()` is single-flight per session/state/provider,
  requires the exact session/provider `DISPOSED` acknowledgement, settles a
  pending lease before deciding release, and releases only the exact
  `{ owner: 'live-dubbing', leaseId }`. Its stale-state fence prevents an old
  cleanup generation from releasing or completing a replacement. The separate
  `releaseAfterProvenAbsence()` path skips `DISPOSE` only after the Coordinator
  has positively proved that the offscreen runtime is absent.
- `LiveDubbingRuntimeGateway` is a thin platform boundary that normalizes
  browser/runtime/tab/capture probes. It exposes tab resolution, tab-capture
  support and stream-id calls, captured-tab/current capture probes, runtime
  messaging, sender-origin mechanics, and tab presence probes. It does not
  choose lifecycle error codes, create descriptors, decide cleanup, or
  reconcile sessions.
- `LiveDubbingSessionRegistry` is a synchronous identity/reference collection,
  not a policy owner. It stores session-state references, pending-start records
  and tab-event markers, terminal-operation records, and one-time bootstrap
  reservations. Expected-object deletion plus the Coordinator's exact
  session/provider checks keep old records from deleting or joining a
  replacement; lifecycle decisions stay in the Coordinator.
- `OffscreenRuntimeLeaseManager` owns shared offscreen-document capability and
  existence detection, document creation/close, lease metadata, supported
  reasons, and named lease transitions. The Coordinator supplies the provider's
  exact required reasons and decides when a lease is appropriate.
- `LiveDubbingController` (offscreen document) owns the only media,
  provider-socket, and audio-graph resources for the current session.
  A terminal callback re-fences the session first, so late worklet and
  socket events cannot affect a subsequent session.
- Live Dubbing acquires its named lease before using the offscreen capture and
  provider resources; ordinary disposal precedes release. The offscreen
  document is shared infrastructure and may also serve other lease owners.
- Background handlers are the offscreen control boundary for terminal and
  provider-bootstrap requests. Terminal notifications require the authorized
  offscreen sender and an exact authoritative `sessionId` + `providerId` match.
  They intentionally tolerate event-sequence drift so lifecycle races do not
  discard a legitimate terminal signal; target language and event sequence are
  not terminal-authorization requirements. Stale or wrong-session/provider
  terminal notifications still fail closed and are ignored.

### Controller terminal delivery

Provider failures and capture-track loss mark the current Controller session
terminal and start local physical cleanup independently of terminal-message
delivery. `_notifyTerminal()` creates one immutable sanitized payload for that
session: scalar session/provider identity and event-sequence/status/error fields
plus optional freshly sanitized, frozen provider and cleanup diagnostic objects.
`terminalSent` and the
`terminalDelivery` record permit one notification workflow per session.

The first send is immediate. A rejected or synchronously thrown send is retried
after 25 ms and then 50 ms, for at most three sends total. A successful send
stops retry scheduling; exhaustion only records debug delivery detail and is a
lifecycle no-op because local cleanup does not wait for notification success.
`DISPOSE` cancels pending notification timers before cleanup and clears the
active-session fence; `currentSession`, delivery identity, and replacement
checks prevent a late send from an old session reaching a new one. Background
still authorizes each terminal message by the exact authoritative session and
provider identity; event-sequence drift alone is intentionally not a terminal
authorization failure.

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

### Capture and runtime loss

`handleCaptureStatusChanged()` accepts only `stopped` or `error` capture
statuses. It first requires a persisted `RUNNING` descriptor for the reported
tab, then re-reads the descriptor and checks the current session state and
terminal-operation record. It probes tab presence, re-reads the descriptor
again, queries current tab-capture state, and repeats the descriptor/session
fence before terminal work. A missing tab selects `TAB_REMOVED`; an active
capture is ignored. A stopped/error event whose revalidated capture state is
not active enters the capture-loss terminal path.

A capture-loss event is terminal proof of capture loss, **not proof that the
offscreen document is absent**. Runtime absence is probed separately through
lease-manager reconciliation/snapshot state or an exact offscreen `STATUS`
response. The Coordinator queues the sanitized terminal outcome
`LIVE_DUBBING_OFFSCREEN_LOST` for persistence before cleanup on this terminal
path; a storage failure leaves the outcome write unsuccessful but does not
block the cleanup decision. A positively absent runtime can use exact lease
release without `DISPOSE`; otherwise normal exact `DISPOSE` cleanup is used.
Even when the absence probe is unavailable, capture loss is not silently
ignored.

These sources do not share one initial fence:

- Capture status has no session identity, so it uses the persisted `RUNNING`
  descriptor/tab, repeated descriptor and session-state reads, tab presence,
  and current capture-state probes before terminalization.
- Tab removal/navigation matches the current descriptor's `tabId` and marks
  matching pending starts through the registry's tab-event markers.
- Explicit STOP requires the requested `sessionId` to match the current
  descriptor; a pending START is cancelled separately, and terminal ownership
  is then established from the current session state.
- Authorized offscreen terminal messages require the authorized offscreen
  sender and exact current `sessionId` + `providerId`; event-sequence drift is
  tolerated, then the authorized descriptor and current session state are passed
  into terminal handling.

After their respective checks, all converge on the Coordinator's terminal
operation and the CleanupManager's per-session single-flight record, so
concurrent races join one cleanup workflow rather than duplicate disposal or
lease release.

## Provider Identity and Bootstrap

The internal live-dubbing contract supports exactly two provider ids:
`gemini` (the default) and `openai`. The dedicated Live Dubbing control in the
Popup does not select a provider; it forwards the valid persisted Options
choice. An absent direct START `providerId` uses Gemini, while an empty or
unknown value is rejected. Once START creates a pending descriptor, the provider,
session id, tab id, canonical target language, and `startedAt` identity tuple
are fixed for the session and carried through every offscreen request,
response, terminal event, status, stop, and recovery path. Persisted
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
language, and event sequence. Background selects the provider-specific
bootstrap service and returns the provider-neutral DTO
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

## Terminal Outcomes and UI Reopening

The active descriptor and latest terminal outcome are separate records:
`LIVE_DUBBING_STORAGE_KEY` stores the sanitized lifecycle descriptor, while
`LIVE_DUBBING_OUTCOME_STORAGE_KEY` stores a sanitized internal outcome with its
`sourceSessionId`, provider, safe error, timestamp, and optional sanitized
provider diagnostic. The public DTO removes `sourceSessionId`; the Popup uses
the Coordinator's authoritative `GET_LIVE_DUBBING_STATUS` response rather than
trusting a terminal notification's data.
`LiveDubbingControl.vue` keeps an authoritative retained session available for
cleanup after structured START/STOP failures, disables START while unavailable
or cleanup is pending, and treats a terminal-outcome notification only as a
reason to refresh status; it does not render notification payloads directly.

Terminal handling queues outcome mutations through the StateStore's serialized
outcome chain. A candidate terminal notification is chained after that write
attempt settles, never sent while the outcome write is still pending. A failed
write does not make the candidate authoritative in `GET_LIVE_DUBBING_STATUS`;
the read sees the last valid compatible persisted outcome or a safe null, while
cleanup remains independent. The notification may trigger a Popup status
refresh, but its payload is not rendered directly, and a reopened Popup can
reconstruct the active descriptor or retained cleanup state from storage.

The final successful `RUNNING` descriptor commit is special: the Coordinator
awaits earlier outcome mutations, re-reads the descriptor, and rechecks the
session/state fences before asking the StateStore to write the descriptor and
`LIVE_DUBBING_OUTCOME_STORAGE_KEY: null` atomically. StateStore identity,
event-sequence, and `STOPPING` fencing reject stale writes, so a late terminal
outcome cannot overwrite a newer session or race the atomic outcome clear.

## Stop and Cleanup Reliability

Explicit STOP, tab removal/navigation, capture loss, and authorized offscreen
terminal events converge on one Coordinator terminal operation for the exact
session/provider/state. Concurrent requests join that operation; the
CleanupManager separately single-flights the physical cleanup facts. Ordinary
cleanup sends `LIVE_DUBBING_DISPOSE` and accepts completion only for the exact
`DISPOSED` acknowledgement, then settles and releases the exact lease. A
pending lease acquisition is awaited before release; failed or timed-out
disposal retains the descriptor as `STOPPING` or `ERROR` with `cleanupPending`,
blocks a new START as busy, and is retried by a later STOP.
Before cleanup begins, a session, state, or expected-descriptor fence mismatch
is an ignored no-op; explicit STOP with a different session id is likewise
ignored. Once terminalization has begun, a readable persistence-fence rejection
of the `STOPPING` write returns `LIVE_DUBBING_STORAGE_UNWRITABLE`; it is not
treated as a pre-terminal cleanup rejection. A descriptor-clear failure returns
`LIVE_DUBBING_STORAGE_CLEAR_FAILED` and retains cleanup as retryable.
The offscreen Controller reports an unsettled physical teardown as
`LIVE_DUBBING_CLEANUP_PENDING`; a Coordinator wait can likewise return
`LIVE_DUBBING_STOP_TIMEOUT` while the canonical cleanup continues in the
background.

The Coordinator continues exact cleanup when a real `STOPPING` storage write
failure makes storage unreadable; descriptor clearing remains a retryable
operation until storage confirms it. Conversely, a readable expected-descriptor
or session fence mismatch rejects stale cleanup before `DISPOSE` or lease
release (`LIVE_DUBBING_STORAGE_UNWRITABLE`); a failed descriptor clear is
reported as `LIVE_DUBBING_STORAGE_CLEAR_FAILED`. This preserves exact ownership
across delayed sends, duplicate STOPs, late terminal callbacks, and
service-worker timing races.

## Reconciliation

`reconcile()` reads and sanitizes the descriptor, asks the lease manager to
reconcile shared offscreen presence/metadata without creating a document, then
reads the lease snapshot first. It uses exact offscreen `STATUS` probes where
the snapshot and descriptor require proof of session ownership, absence, or
recovery. Session/provider mismatches fail closed: no `DISPOSE`, lease release,
or descriptor adoption is performed for an uncertain owner.

- A `RUNNING` descriptor whose offscreen runtime/session is provably absent is
  terminalized through the `LIVE_DUBBING_OFFSCREEN_LOST` outcome path, not
  silently cleared. An uncertain `RUNNING` descriptor remains retained and
  retryable rather than being guessed away. If a running descriptor has an
  exact active offscreen status but no matching lease, reconciliation reacquires
  the provider-specific lease; failure records
  `LIVE_DUBBING_LEASE_ACQUIRE_FAILED` and retains an error descriptor for retry.
- A non-running descriptor is directly cleared only when an exact status/snapshot
  proof shows the session absent and no matching lease exists. Otherwise normal
  cleanup sends `DISPOSE`, requires the exact `DISPOSED` acknowledgement, settles
  and releases the exact lease, and clears the descriptor only after cleanup
  succeeds. A descriptor that is not exact or cannot be proven absent remains
  retained and retryable rather than being guessed away.
- Descriptor-less live leases are resolved by exact status probes for the
  supported providers. They are cleaned only when ownership is unambiguous;
  otherwise reconciliation returns a provider-identity-required failure and
  leaves the lease isolated. Unmatched stale leases are similarly resolved and
  cleaned after a valid active descriptor is recovered.
- Running recovery adopts exact status only when it reports `active === true`,
  `captureReady === true`, `audioPathReady === true`, and
  `setupComplete === true`; it then persists `RUNNING` under the descriptor
  identity/event-sequence fence. Cleanup failures remain
  `cleanupPending`/retryable and do not release an uncertain lease.

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
  background, offscreen, and the adapter. Capture, readiness,
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
  canonical codes. Live dubbing reports failures through its own DTOs and does
  not present raw provider errors to the UI.
- **Explicit async ownership.** Session timers (start timeout, setup
  timeout), track listeners, sockets, pipelines, and the provider client are
  created and cleared on the fenced session paths that own them
  (`clearTimeout` on setup/close, listener removal before track stop, fenced
  terminal disposal). No WebSocket, AudioContext, MediaStream, pipeline, or
  provider client is registered with `ResourceTracker`: group cleanup could
  clear or detach a live fenced resource and change ordering, so explicit
  ownership remains correct. `ResourceTracker` stays limited to simple
  synchronous local resources, of which this feature owns none.
