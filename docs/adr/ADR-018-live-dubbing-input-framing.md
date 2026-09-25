# ADR-018: Live Dubbing Input Framing

**Status:** Accepted

**Scope:** Live dubbing capture framing (`TabAudioPipeline`, capture
worklet framing, provider send path). No provider, playback, or session
semantics change.

---

## Context

Live dubbing captures tab audio at a fixed 16 kHz sample rate and forwards
PCM16 frames to the Gemini Live translation model over a single WebSocket,
with translated 24 kHz PCM rendered locally. Capture framing was selectable
at build time between 100 ms (1600 samples) and 40 ms (640 samples) to test
whether smaller frames reduce observable dubbing delay.

Framing interacts with three bounded mechanisms: the pre-setup drop policy
(frames arriving before `setupComplete` are counted and discarded), the
500 ms pending-input backlog bound (trimmed to 200 ms retained), and the
64 KiB WebSocket buffered-amount bound (backpressure counted, never thrown
into capture).

A time-boxed Stage 3 spike measured both framings under identical
conditions. The proxy metric throughout is **client-observed
first-input→playback-accepted latency**: the performance.now() delta from
the first sent input frame to the first translated chunk accepted by local
playback. This is explicitly **not** true end-to-end speech latency, which
would require acoustic alignment of source speech to rendered translated
speech and was never measured.

---

## Evidence

Client-observed first-input→playback-accepted medians: **3393 ms (100 ms
framing) vs 3524 ms (40 ms framing), a +131 ms regression** for the smaller
frames.

Buffered-amount peaks moved in the wrong direction: **4341 vs 7124**,
showing the 40 ms variant exerting more WebSocket buffering pressure.

Stability counters were zeros across both arms: input drops, send
failures, interruptions, and output safety drops all read zero, so neither
framing destabilized the session; the difference is purely
latency-plus-buffering.

No other metric favored 40 ms. 100 ms framing sends 10 input frames/sec
while 40 ms sends 25/sec, a 2.5x increase in per-message WebSocket/JSON
framing and dispatch overhead. PCM audio throughput is essentially
unchanged (base64 expansion stays proportional to payload size), so the
socket spends more time buffered and the first translated chunk arrives
later at playback.

---

## Decision

Fix capture framing to **100 ms (1600 samples at 16 kHz)** as the single
production configuration:

- `INPUT_SAMPLE_RATE = 16_000` and `INPUT_FRAME_SAMPLES = 1_600` are
  plain constants in `TabAudioPipeline`.
- The `__LIVE_DUBBING_FRAME_SAMPLES__` build define, its Vite wiring, the
  frame-size option list, and the define resolver are removed.
- The pipeline constructor accepts only 1600 and fails closed on any
  other frame size or sample rate.
- The Stage 3 benchmark scaffolding (measurement history storage,
  GET/CLEAR export actions, summary DTO/sanitizer, dispose-time summary
  transport, and routine benchmark logging) is removed. Internal
  observational telemetry (counts, drops, backpressure, peaks, underruns,
  interruptions, same-context milestones) is retained.

---

## Consequences

### Positive

- One framing path: no build matrix, no variant branching in capture,
  send, or cleanup code.
- Lower observed first-audio delay and lower socket buffering pressure
  than the 40 ms alternative.
- Smaller review and test surface: framing regressions reduce to the
  fixed-1600 constructor and worklet contract.

### Negative

- If a future model endpoint benefits from sub-100 ms chunking, framing
  becomes configurable again deliberately, with fresh evidence.
- The removed benchmark export means future comparisons need new
  temporary instrumentation rather than reusing a built-in path.

---

## Revisit Conditions

Reopen this decision only when **all** of the following hold:

1. A concrete provider endpoint documents a benefit from smaller input
   chunks.
2. A new time-boxed spike measures the same client-observed proxy
   (first-input→playback-accepted) plus buffered-amount peaks and the
   zero-stability counters, and shows a reproducible improvement.
3. True end-to-end speech latency is either measured or explicitly
   declared out of scope again; the proxy must never be relabeled as
   end-to-end latency.

---

## Notes on Provider Metadata

`speechState` is officially documented-but-deprecated and
`interactionStatus` is officially documented. Both are accepted as inert
metadata and never drive session, parsing, or framing decisions. Neither
is undocumented protocol.
