# Phase D Spike: OpenAI Realtime Translation over WebRTC

Status: **SPIKE_VALIDATED** (real Chrome + real OpenAI key: translated Spanish speech heard; see §12).
Branch: `feat/live-dubbling`. Isolated Phase D spike; keep production wiring separate until the later roadmap phases.

## 1. Goal

Determine whether OpenAI Realtime Translations (`gpt-realtime-translate`)
can deliver usable live-dubbed audio over a WebRTC peer connection fed by the
extension's existing tab-capture output, without disturbing the production
Gemini live-dubbing path.

## 2. Non-goals / isolation contract

- No changes to the provider registry (`LiveDubbingProviderRegistry.js`), UI
  selection wiring, `LiveDubbingCoordinator`, `LiveDubbingController`,
  `TabAudioPipeline`, `PcmOutputPlayer`, or any Gemini adapter/behavior.
- No new storage keys or settings. No rotation/failover system.
- The only production file touched is
  `src/shared/runtime/OffscreenRuntimeLeaseManager.js` (added the generic
  `WEB_RTC` offscreen reason + justification wording), plus its test.
- Spike code lives under `src/features/live-dubbing/spikes/openai/` and is
  never imported by production code (verified by test: no spike import
  outside the spike tree).

## 3. Official API (followed verbatim)

Mint (Background-only):

```text
POST https://api.openai.com/v1/realtime/translations/client_secrets
Authorization: Bearer OPENAI_API_KEY
Content-Type: application/json

{
  "expires_after": { "anchor": "created_at", "seconds": 600 },
  "session": {
    "model": "gpt-realtime-translate",
    "audio": {
      "input": {
        "transcription": { "model": "gpt-realtime-whisper" },
        "noise_reduction": null
      },
      "output": { "language": "<target>" }
    }
  }
}
```

Response is JSON: `{ "value": "ek_...", "expires_at": <epoch>, "session": {...} }`.
Only `value` is extracted; the scalar `expires_at` may be reported as a
diagnostic (`expiresAt`, number or null). The secret is never persisted,
logged, thrown, or stored.

SDP exchange:

```text
POST https://api.openai.com/v1/realtime/translations/calls
Authorization: Bearer <client secret>
Content-Type: application/sdp

<body> = offer.sdp as raw text
```

The response body is raw SDP answer text (NOT JSON) and is applied via
`setRemoteDescription({ type: 'answer', sdp })`.

Data channel `oai-events`: transcript events are counted only. Transcript
text is never logged, persisted, or displayed — only the scalar counter and
the `firstTranscriptEvent` milestone leave the handler.

## 4. Local seams used (exact)

- Keys: `ApiKeyManager.getKeys('OPENAI_API_KEY')`
  (`src/features/translation/providers/ApiKeyManager.js:108`), setting
  `OPENAI_API_KEY` (`src/shared/config/config.js:187`), helper
  `getOpenAIApiKeysAsync` (`src/shared/config/config.js:1274-1277`). Spike
  default is `() => ApiKeyManager.getKeys('OPENAI_API_KEY')`.
- Key behavior: **single-key reuse**. Only the first eligible key is used;
  any mint failure resolves to `null` with no next-key attempt. There is no
  rotation, promotion, or legacy fallback. Reported here as specified.
- Proxy: identical pattern to `GeminiLiveBootstrapService._fetch`
  (lines 262–268) — injectable `fetchImpl` for tests, otherwise
  `resolveProxyConfig()` + `proxyManager.fetch(url, options, config)` on a
  single path with no silent direct-`fetch` retry. Applies to both the mint
  and the SDP POST.
- Offscreen: added `'WEB_RTC'` to `OFFSCREEN_DOCUMENT_REASONS`
  (`OffscreenRuntimeLeaseManager.js:7-11`) and extended the shared-document
  justification to name WebRTC peer connections. No provider coupling (no
  OpenAI/live-dubbing naming in the lease manager). Lease tests updated at
  `:84` (created-document reasons) and `:662` (`WEB_RTC` single/multi-reason
  support below Chromium 116).
- Capture reuse: `LiveDubbingCoordinator._startTransaction` lines 451–526
  are the manual-path reference only (lease acquire → PREPARE →
  `getMediaStreamId` → CONSUME → MEDIA_ACQUIRED). The transport input stays
  browser-neutral — `{ sourceStream|sourceAudioTrack, targetLanguage,
  bootstrap }` — and uses only `MediaStream`/`MediaStreamTrack`/
  `RTCPeerConnection`/`RTCDataChannel`/audio-element playback. It never
  imports browser capture APIs and never touches `TabAudioPipeline`/
  `PcmOutputPlayer` (asserted by test over the transport source).
- Logging: `LOG_COMPONENTS.LIVE_DUBBING` (`logConstants.js:41`) for all
  spike loggers; logs carry scalar codes only.

## 5. Files

| File | Role |
| --- | --- |
| `src/features/live-dubbing/spikes/openai/OpenAIRealtimeBootstrapService.js` | Background-only minter; secret-only bootstrap |
| `src/features/live-dubbing/spikes/openai/OpenAIRealtimeBootstrapService.test.js` | Mint contract tests |
| `src/features/live-dubbing/spikes/openai/OpenAIRealtimeTranslationTransport.js` | Browser-neutral WebRTC transport |
| `src/features/live-dubbing/spikes/openai/OpenAIRealtimeTranslationTransport.test.js` | Transport tests |
| `src/features/live-dubbing/spikes/openai/spikeDevContract.js` (+ test) | Dev-only START/STOP/STATUS contract with transaction identity |
| `src/features/live-dubbing/spikes/openai/spikeDevBackground.js` (+ test) | Background tester hook: tab → lease → mint → stream id → START dispatch |
| `src/features/live-dubbing/spikes/openai/spikeDevOffscreen.js` (+ test) | Offscreen internal dev listener: consume → transport → ack |

## 6. Bootstrap design

`mintClientSecret(targetLanguage)` validates the language tag
(`normalizeSpikeTargetLanguage`: trimmed, `^[A-Za-z]{2,8}(-…)*$`, ≤32
chars — binding only, no catalog), reads the first eligible key, POSTs the
verbatim mint body, and returns
`{ secret, targetLanguage, model, expiresAt }` or `null`. Every failure
(no keys, bad language, transport throw, non-ok, unreadable/malformed
payload, missing `value`) resolves to `null` and performs no further key
attempts. The returned object has exactly four keys — no API key, no
session object, no SDP.

## 7. Transport design

`start({ sourceStream|sourceAudioTrack, targetLanguage, bootstrap })`:

1. Reject a second start while a session is active or one is pending
   (`ALREADY_STARTED`, zero mutation — generation untouched).
2. Validate language, `bootstrap.secret`, and language binding
   (`bootstrap.targetLanguage` must equal the request when present).
3. Reserve the pending start synchronously (generation moves here, once per
   legitimate start), then resolve live audio tracks; fail `NO_AUDIO_TRACK`
   before creating any connection.
4. Create `RTCPeerConnection` (injected factory), create the `oai-events`
   data channel, wire transcript-only counting and `ontrack` → audio-element
   playback (`srcObject` + `play()`, best effort).
5. `addTrack` each source track, `createOffer` → `setLocalDescription`,
   POST `offer.sdp` as raw SDP, apply the raw-text answer via
   `setRemoteDescription({ type: 'answer', sdp })`.
6. The secret lives in one local during the POST and is never stored on the
   instance; telemetry/snapshots are scalar-only.

`dispose()` is idempotent and generation-fenced: it nulls channel/connection
handlers first, then closes channel, connection, and audio element, drops
track references, and records the `cleanup` milestone. `dispose()` during a
pending start invalidates the reservation, so a late factory resolution
cannot publish and its connection is closed (`START_CANCELLED`). Source
tracks are
never stopped — the transport owns none. Late `ontrack`/`onmessage` events
from a superseded generation are ignored. Setup failures run the same
close path (`_abandon`) so a failed start leaks no connection.

## 8. One-command validation flow (dev only)

The tester hook lives in Background as
`globalThis.__translateItOpenAIRealtimeSpike`, so a fresh load works
without a pre-existing Offscreen document. Offscreen keeps an internal
dev listener only (no hook there).

One command in the service-worker DevTools drives the whole transaction:

```js
hook = globalThis.__translateItOpenAIRealtimeSpike;
await hook.start({ targetLanguage: 'es' }); // → { success: true, targetLanguage: 'es' }
await hook.status();                        // scalar-only telemetry
await hook.stop();                          // idempotent teardown
```

Behind the command, in order: validate target → active tab → dev lease
(creates the Offscreen document when absent) → Background-only mint →
recheck transaction → `getMediaStreamId` LAST → immediately dispatch
`START` to Offscreen → Offscreen getUserMedia consume FIRST, then the
existing transport → audio-element playback. Nothing slow runs between
the stream-id mint and the dispatch, because tab stream ids must be
consumed promptly. A pre-stream-id failure releases the lease; a
post-stream-id failure releases the lease plus owned resources.

Ownership: Background owns tab/lease/key/mint/stream-id/lifecycle;
Offscreen owns consume/tracks/transport/playback/cleanup. Every dev
message carries the transaction identity, so stale responses can never
affect newer runs. A malformed or missing Offscreen ack still releases
the Background-owned lease — release uses the locally tracked identity
and never depends on an Offscreen echo.

Auth boundary: the Offscreen listener never imports `ApiKeyManager`,
never reads `OPENAI_API_KEY`, and never instantiates the mint service
(asserted by test over the Offscreen-side sources). Minting happens only
in Background. Traffic uses the dev-only actions `OPENAI_SPIKE_DEV_START`
/ `STOP` / `STATUS` on a dev-only target — namespaced to the spike,
absent from every production router, registry, UI, and settings surface
(the production offscreen router would synchronously answer
`OFFSCREEN_UNAUTHORIZED` to foreign actions, so the dev target keeps the
response race clean). Nothing sensitive is ever logged: no key, secret,
SDP, transcript, stream id, or raw body — `LOG_COMPONENTS.LIVE_DUBBING`,
scalar codes and scalar status only.

Lifecycle: a concurrent start returns `ALREADY_STARTED`; a stop during
lease/mint/post-stream-id abandons late work (`START_CANCELLED`); consume
failure releases the lease; transport failure stops owned tracks and
releases the lease; `stop()` runs Offscreen cleanup first, then the lease
release; stop is idempotent; restart works. Only hook-owned tracks are
ever stopped.

Exposure: DEV-gated installs only — `src/core/background/index.js`
installs the tester hook and `src/html/offscreen.js` installs the
internal listener, both behind `__IS_DEVELOPMENT__` (shaken out of
production builds; verified by grepping both bundles). A dev build
(`pnpm dev:chrome`) carries them; a production build does not.

Precise tester steps (requires a real `OPENAI_API_KEY` with Realtime access):

1. Build and load the dev extension (`pnpm dev:chrome`, load unpacked).
2. Open a tab playing English speech; keep it active.
3. Click the toolbar icon once (user invocation — grants tab capture).
4. Open the service-worker DevTools.
5. Run `await globalThis.__translateItOpenAIRealtimeSpike.start({ targetLanguage: 'es' })`
   — expect `{ success: true, targetLanguage: 'es' }` (safe error codes
   only on failure; capture denial surfaces as `CAPTURE_FAILED` with no
   raw errors).
5. Listen to the translated playback; run
   `await globalThis.__translateItOpenAIRealtimeSpike.status()` for scalar telemetry.
6. Run `await globalThis.__translateItOpenAIRealtimeSpike.stop()` — expect
   `{ success: true }`; repeat `stop()` for the idempotent shape, and
   re-run `start()` to confirm second-start works. The ephemeral secret is
   valid ~10 minutes (`expires_after` 600s); each `start()` re-mints.

What to observe before any production decision:

- **Latency**: mouth-to-translated-audio delay vs Gemini path.
- **Correctness**: language match, no source-language bleed-through.
- **Continuity**: no gaps/dropouts over ≥5 minutes of continuous speech.
- **Overlap**: source audio audibility under translated audio.
- **Stability**: `transcriptEvents`/`remoteTracks` growth, no silent stalls,
  no unhandled data-channel errors.
- **Second-start**: `stop()` then `start()` on the same page works with no
  stale audio, no leaked peer connection, and fresh counters.

## 9. Test matrix (spec §12 coverage, all mocked/deterministic)

Bootstrap: verbatim endpoint/method/headers/body; secret-only bootstrap
shape; language/model binding; scalar `expiresAt` incl. omit/corrupt;
single-key reuse with no rotation; null-without-network on no-keys and bad
language; transport-throw, non-ok, and malformed-payload nulls; no
key/secret leakage in logs; proxy path + no direct fetch on config failure;
no secret persistence (source assertion).

Transport: track add + offer/answer round-trip; lone-track input; no-track
rejection without network; invalid-language and secret-less rejection
without network; language-mismatch fail-closed; `oai-events` creation; raw
SDP POST with secret Bearer + SDP content type; `ontrack` → element
playback; transcript-only counting with text/secret/SDP absence; scalar
telemetry/snapshot; idempotent dispose with handler clearing and no source
`stop()`; late-event fencing; SDP-failure connection close; empty-answer
rejection; second-start rejection with zero mutation (live session keeps
processing transcript/track events); proxy SDP path; browser-neutral source
assertion.

Hook (Background, one-command): lease → mint → stream-id → immediate
START ordering; ephemeral-only dispatch shape; failure paths (no tab,
lease without mint/release side effects, mint failure with release,
capture denial as `CAPTURE_FAILED` without raw errors); concurrent-start
fencing; stop-during-lease/mint/post-stream-id abandonment with
exact-once lease release; malformed/missing-ack release without echo
dependence; Offscreen failure passthrough; scalar status with best-effort
telemetry merge and degradation; idempotent stop and fresh-transaction
restart; `globalThis` install; raw key material absent from the module
(source assertion).

Offscreen (internal listener): consume-before-transport with the consumed
stream handed over (never the id); auth/malformed/language/binding
rejections; busy fencing; consume and transport failure cleanup with
owned-track stops; transaction-matched STOP teardown with stale-id
immunity during session, pending consume, and pending transport start
(stale STOP is a true no-op; the newer run still completes); matching
STOP during pending transport.start disposes/fences the transport;
late-completion abandonment; STATUS scoping with sanitized telemetry;
restart; listener install that ignores production traffic and exposes
nothing on `globalThis`; Offscreen key/capture/hook-dependency absence
(source assertions over all Offscreen-side modules).

Contract: dev START/STOP/STATUS actions disjoint from production actions
on a dev-only target; dispatch builders; START/STOP/STATUS and ack
parsers with transaction matching and the shared telemetry sanitizer
(fresh DTO of safe scalars; malicious/nested/sensitive fields dropped);
production entries import spike code only behind `__IS_DEVELOPMENT__`,
with the tester hook in Background and no hook in Offscreen (source
assertion).

Lease: REAL-manager regression — TTS/OCR/live-dubbing leases unchanged,
one shared document created once with centralized reasons including
`WEB_RTC`, spike reasons accepted, genuinely-unsupported reasons still
rejected with no lifecycle mutation.

## 10. Validation (this spike)

- `vitest … src/features/live-dubbing/spikes/openai/`: 77 passed, 0 failed.
- Affected suites (`src/features/live-dubbing/`, lease manager,
  `src/html/offscreen.test.js`): 330 passed, 0 failed.
- Targeted ESLint on spike + touched entry files; `git diff --check`.
- `pnpm build:chrome` (production): succeeds; spike markers absent from the
  bundle (DEV-gated installs shaken out). Dev vite build: tester-hook
  installer present in the dev background bundle, `spikeDevOffscreen.js`
  chunk emitted and dynamically referenced from the dev offscreen bundle,
  and the hook global absent Offscreen-side.
- Live validation (real Chrome dev build, real OpenAI key, English → Spanish):
  `start({ targetLanguage: 'es' })` returned `{ success: true,
  targetLanguage: 'es' }`; ephemeral client-secret bootstrap, tab capture,
  and WebRTC offer/answer negotiation all succeeded; one remote translated
  audio track arrived and Spanish translated speech was audibly confirmed by
  the human tester. Running status showed `offerCreated: true`,
  `answerApplied: true`, `transcriptEvents: 139`, `remoteTracks: 1`, with
  `firstRemoteAudio` ≈ 1.96 s after `start` in this single run (one spike
  observation, not a benchmark or SLA). Transcripts were observed only as
  scalar event counts, never stored or logged as text. `stop()` returned
  `{ success: true }` and post-Stop status showed `active: false`,
  `captureReady: false`, `telemetry: null`.

## 11. Risks / open questions for a live run

Live run (English → Spanish, single session) answered part of this list:

- `output.language: 'es'` was accepted — tag format works at least for
  this pair; other languages untested.
- Transcript events arrived (`transcriptEvents: 139`) and were counted
  only; per-type taxonomy still unmapped.
- Playback was audible, so offscreen autoplay did not block this run.
- `noise_reduction: null` was sent as specified; null-vs-omitted server
  behavior remains unknown.
- Whether one peer connection per language switch is required remains
  unknown (no language switch was tested).

## 12. Verdict

**SPIKE_VALIDATED** — real Chrome validation with a real OpenAI key
succeeded: ephemeral bootstrap, tab capture, offer/answer negotiation, one
remote translated-audio track, audibly confirmed Spanish speech, and clean
Stop. Single-run first-audio latency was ≈ 1.96 s (observation only, not a
benchmark or production SLA). Next decision (Phase E and beyond): a
production adapter behind the provider registry, or deletion of the spike
tree. Phase E/F/G roadmap boundaries are unchanged.
