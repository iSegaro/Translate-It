## Why

Live Caption is currently batch-oriented, with finalized audio chunks transcribed in background and translated only after each chunk completes. Future streaming STT providers need a first-class architecture so they can coexist with the existing batch providers without moving media ownership into the service worker or weakening the current batch path.

## What Changes

- Defines a streaming STT architecture for Live Caption that preserves the current batch STT behavior unchanged.
- Introduces a transcript event contract for partial, final, correction, and error events.
- Adds provider metadata for execution location and streaming capabilities so providers can be routed to background or offscreen explicitly.
- Defines a background transcript-event convergence layer for batch and streaming outputs.
- Keeps streaming provider execution in the offscreen document, where capture and websocket/session ownership already belong.
- Keeps partial transcript state ephemeral and out of persistent storage.
- Defines revision-based correction handling for future streaming providers.
- Defines an MVP translation policy that consumes final and corrected-final transcript events only.
- Explicitly avoids introducing a background partial-state manager.

## Capabilities

### New Capabilities
- `live-caption-streaming-stt`: Architecture and contracts for adding future streaming STT providers to Live Caption while preserving current batch providers and current ownership boundaries.

### Modified Capabilities
- None

## Impact

- Live Caption STT provider manifest and factory metadata.
- Background orchestration and transcript-event routing contracts.
- Offscreen session/runtime ownership boundaries.
- Canonical session and cache semantics for final and corrected transcript data.
- Translation handoff semantics for finalized transcript events.
- Future provider registration for Deepgram Streaming, WhisperLiveKit, Faster-Whisper Server WebSocket, and similar engines.
