# Firefox Desktop YouTube captureStream probe (DEV spike)

This is a local DEV-only page-world probe, not Firefox production support. It
does not use production messaging, providers, credentials, the production
Coordinator, or production manifest controls. Phase 2 transport attempts and
conditional Phase 3 extension-document transfer pass captured objects only
transiently for capability testing; media and samples are never returned,
logged, or persisted. The page API exposes scalar facts only.

## Firefox DevTools

1. Open YouTube in Firefox Desktop and play a video.
2. Press **F12** and open the page's **Console**.
3. Use the Firefox DEV build that includes `spikeDevIframe.html`, reload the
   add-on, reload YouTube, and play a video.
4. Run this exact normal Console sequence. `start()` performs capture, Phase 2
   transport attempts, and conditional Phase 3 transfer once; `restart()` is
   the explicit second capture/attempt cycle.

```js
const spike = window.__translateItFirefoxYouTubeCaptureStreamSpike
await spike.start()
spike.status()
await spike.restart()
spike.status()
await spike.stop()
spike.status()
```

The scalar result contains the existing capture fields (`state`, `reason`,
`mediaType`, `captureMethod`, `trackCount`, `audioTracks`, `rms`, `peak`),
plus:

- `transport`: `state`, `sourceAvailable`, `cloneState`, and one scalar
  `attempts` entry for each `send-message`/Port attempt of the captured stream,
  original audio track, and `track.clone()`. Each entry reports `outcome`,
  `accepted`, received type/kind, `readyState`, `muted`, analyser activity and
  peak when observable, ended/ownership state, and a closed `errorCategory`.
- `runtimeCapabilities`: scalar `audioGraph`, `webSocket`,
  `rtcPeerConnection`, and `fetch` results. WebSocket is constructor-only
  without a URL/connection; WebRTC only constructs a peer and basic data
  channel, without SDP; fetch is availability-only and never called.
- `iframeTransfer`: conditional Phase 3 result. It reports `supported`,
  `accepted`, receiver `MediaStream`/audio facts, receiver analyser activity
  and peak, sender clone ownership/readyState/muted/ended facts, and a closed
  `errorCategory`. It is `TRANSPORT_ACCEPTED`/untested when Phase 2 succeeds;
  it is `UNSUPPORTED` with the exact resource/CSP blocker when the extension
  iframe cannot load. There is no page-iframe fallback.

`untested` and `unsupported` are valid results. A mock or serialized object is
not accepted as evidence of a real transfer. Extension iframe transfer (B) is
attempted only after the WebExtension transport attempts in A are rejected.

If the hook is missing, inspect the closed installer marker:

```js
window.__translateItFirefoxYouTubeCaptureStreamSpikeInstallStatus
```

Its only possible values are `installed`, `bridge-unavailable`, `clone-failed`,
and `publish-failed`. A missing marker means the development or YouTube gate
did not run.

The actual YouTube capture/audio result requires user validation in Firefox
Desktop. The user must paste the final `spike.status()` result (including
`transport`, `iframeTransfer`, and `runtimeCapabilities`) for parent
validation; this repository does not claim a real result from unit tests.
