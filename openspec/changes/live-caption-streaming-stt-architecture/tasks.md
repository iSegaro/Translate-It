## 1. Contracts and Manifest Metadata

- [x] 1.1 Add a transcript-event contract module for partial, final, correction, and error events
- [x] 1.2 Extend the STT provider manifest schema with mode, executionLocation, and streaming capability flags
- [x] 1.3 Add validation/tests proving existing batch providers declare batch/background metadata
- [ ] 1.4 Defer actual provider factory execution-location routing to the offscreen streaming execution phase

## 2. Background Transcript Event Convergence

- [x] 2.1 Add a background transcript-event convergence layer
- [x] 2.2 Normalize batch final transcript results through the new convergence layer without changing batch semantics
- [x] 2.3 Normalize streaming partial, final, correction, and error events through the same convergence layer
- [ ] 2.4 Add tests for event normalization, revision ordering, and correction reconciliation

## 3. Offscreen Streaming Execution

- [ ] 3.1 Define offscreen-owned streaming provider session routing and websocket/session lifecycle contracts
- [ ] 3.2 Add offscreen bridge messages for starting, stopping, and reporting streaming transcript events
- [ ] 3.3 Keep offscreen capture ownership unchanged while enabling streaming provider runtime execution
- [ ] 3.4 Add/update provider factory or host-resolution logic for offscreen-executed streaming providers
- [ ] 3.5 Add tests for offscreen streaming session lifecycle, event delivery, and host-resolution routing

## 4. Canonical Session, Translation, and Persistence

- [ ] 4.1 Define canonical revision handling for corrected transcript segments
- [ ] 4.2 Keep partial transcript hypotheses ephemeral and out of session/cache persistence
- [ ] 4.3 Ensure translation consumes final and corrected-final transcript events only for MVP
- [ ] 4.4 Add tests for final-only translation routing, canonical persistence, and partial discard behavior

## 5. Recovery, Cleanup, and Documentation

- [ ] 5.1 Define recovery responsibilities for background restart, offscreen restart, disconnect, reconnect, and cleanup
- [ ] 5.2 Keep fail-close policy in background while provider reconnect remains host-owned
- [ ] 5.3 Update architecture documentation to describe batch vs streaming routing and ownership boundaries
- [ ] 5.4 Add recovery and cleanup tests for streaming provider loss, session restart, and canonical state rehydration
