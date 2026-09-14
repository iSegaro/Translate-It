# Azure Speech Translation Spike Result

Status: **REJECTED — ROLLBACK COMPLETE**  
Date: `2026-09-14`

## Findings

- Technical Chrome feasibility: **PASS**. Active-tab capture into Azure Speech and
  recognition/translation worked; first partial translation was approximately
  1.4–1.7 seconds.
- Synthesis output was PCM WAV, 16 kHz, 16-bit, mono. The 16 kHz → 24 kHz
  conversion and existing `PcmOutputPlayer` playback both passed; playback was
  not the latency bottleneck.
- In-place authorization-token refresh continuity: **FAIL** in real Chrome.
  Recreating Azure recognizer resources while preserving capture: **PASS**.
- `Speech_SegmentationSilenceTimeoutMs = 300` was confirmed active, but final
  recognition and synthesis still arrived approximately 25–30 seconds after
  first input. Translated Spanish audio was audible, but far too delayed.

## Decision

- Live Dubbing latency requirement: **FAIL**.
- Final decision: **REJECTED** for Translate It! Live Dubbing.
- Next candidate: **Azure GPT Realtime Translate**.

The Azure SDK, dev spike implementation, runtime hooks, and Azure-only lockfile
entries were removed. No credentials, tokens, stream IDs, transcripts, raw audio,
or sensitive URLs are retained here.
