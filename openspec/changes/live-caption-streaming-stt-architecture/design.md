## Context

Live Caption currently runs as a batch pipeline: offscreen capture finalizes audio chunks, background STT providers transcribe each chunk, translation consumes only finalized transcript segments, and the overlay renders canonical caption lines. That model is already stable and must remain unchanged for batch providers such as OpenAI Whisper and Local Whisper.

Future streaming STT providers such as Deepgram Streaming, WhisperLiveKit, and Faster-Whisper WebSocket require a different runtime model because they depend on long-lived sessions, partial hypotheses, and correction events. Under MV3, those concerns should not be moved into the service worker as an execution owner. The existing offscreen document is the correct place to host long-lived streaming provider execution and websocket/session ownership.

This change is intentionally architecture-only: it defines provider metadata, transcript-event contracts, background/offscreen ownership, and canonicalization rules before any implementation work begins.

## Goals / Non-Goals

**Goals:**
- Preserve current batch STT behavior unchanged.
- Define a future-safe streaming STT architecture that executes streaming providers in offscreen.
- Add explicit provider metadata for mode, execution location, and streaming capabilities.
- Define a revisioned transcript event contract for partial, final, correction, and error events.
- Introduce a background transcript-event convergence layer.
- Keep partial transcript state ephemeral and off the canonical persistence path.
- Keep translation final-only for the MVP.
- Keep recovery and fail-close policy owned by background, while reconnect and provider cleanup remain host-owned.

**Non-Goals:**
- Implement any runtime code.
- Modify batch provider behavior.
- Add a background partial-state manager.
- Persist partial transcript hypotheses.
- Change translation provider architecture.
- Move media ownership into the service worker.

## Decisions

### 1. Execution location: offscreen for streaming, background for batch

Streaming STT providers will execute in the offscreen document. Batch providers continue to execute in background.

**Why this decision**
- Streaming providers need long-lived transport and session ownership.
- MV3 service workers can suspend; offscreen documents are a better host for persistent media/session work.
- This preserves the current batch path and keeps execution ownership explicit.

**Alternatives considered**
- Background execution for streaming providers: rejected because service-worker suspension makes long-lived streaming sockets fragile.
- Hybrid execution without an explicit location flag: rejected because the runtime would not know where a provider must live.

### 2. Provider manifest must carry mode and execution location

`STTProviderManifest` will declare `mode`, `executionLocation`, and streaming capability flags such as `supportsPartialResults`, `supportsCorrections`, `supportsReconnect`, and `requiresPersistentConnection`.

**Why this decision**
- The factory needs a single source of truth for routing providers to the correct host.
- Capability flags let the coordinator know what kind of transcript events to expect.
- The existing manifest is already the provider registry; it is the right place for these decisions.

**Alternatives considered**
- Hardcoding execution routing in the factory: rejected because it would duplicate provider metadata and become harder to maintain.
- Inferring streaming behavior from provider class names: rejected because it is brittle and not explicit enough.

### 3. Introduce a transcript-event convergence layer

Add a background-owned `LiveCaptionTranscriptEventCoordinator` to normalize batch final transcript results and streaming transcript events into canonical transcript updates.

**Why this decision**
- Batch audio chunks and streaming transcript events are different input shapes, but they converge at the same downstream semantic boundary.
- A dedicated coordinator keeps `LiveCaptionSTTCoordinator` batch-only and avoids making it a mixed batch/event router.
- It keeps translation and canonical session updates isolated from provider transport details.

**Alternatives considered**
- Extending `LiveCaptionSTTCoordinator` to handle streaming events too: rejected because it would blur responsibilities and increase batch regression risk.
- Letting translation consume provider events directly: rejected because translation should only see normalized canonical transcript data.

### 4. No background partial-state manager

Do not introduce a background partial-state manager. Partial transcript hypotheses remain offscreen-owned and ephemeral.

**Why this decision**
- It avoids duplicated partial state across contexts.
- Partials are transport/runtime artifacts, not canonical session data.
- Recovery should restore canonical state, not speculative drafts.

**Alternatives considered**
- Duplicating partial state in background: rejected because it increases complexity, memory usage, and test burden without solving a core MVP problem.

### 5. Corrections are revision-based canonical replacements

Streaming corrections will use `segmentId` plus `revision` and will supersede prior revisions for the same logical segment.

**Why this decision**
- It provides a clear identity model for providers that revise hypotheses over time.
- It allows canonical persistence to store only the latest accepted revision.
- It gives the transcript-event coordinator a deterministic reconciliation rule.

**Alternatives considered**
- Treating corrections as separate unrelated transcript entries: rejected because it would break canonical ordering and translation invalidation logic.

### 6. Translation consumes final and corrected-final events only

Translation will remain final-segment oriented for the MVP.

**Why this decision**
- The current translation pipeline is optimized for canonical text, not speculative drafts.
- Partial translation increases cost and correction churn.
- Final-only translation keeps current cache and overlay behavior stable.

**Alternatives considered**
- Translating partials too: rejected for MVP due to cost, churn, and invalidation complexity.
- Making translation mode fully configurable now: rejected as premature for the architecture-only phase.

### 7. Recovery ownership stays split

Background will own orchestration, fail-close policy, canonical state, translation, and persistence. Offscreen will own reconnect, provider cleanup, and live session runtime.

**Why this decision**
- It aligns recovery behavior with actual ownership boundaries.
- Background can survive wakeups and make policy decisions.
- Offscreen can keep provider transport concerns local to the session runtime.

**Alternatives considered**
- Background-owned reconnect logic: rejected because it would pull long-lived transport concerns into the service worker.

## Risks / Trade-offs

- [Higher implementation surface] → Mitigate by keeping batch providers untouched and introducing a narrow transcript-event coordinator boundary.
- [Execution-location abstraction adds new metadata] → Mitigate by keeping the manifest shape explicit and routing logic centralized in the factory.
- [Correction handling may require future canonical upsert logic] → Mitigate by defining revision rules now and keeping persistent stores canonical-only.
- [Partial previews are not persisted] → Mitigate by treating partials as ephemeral UI/runtime hints only; canonical replay remains final-only.
- [Offscreen recovery can lose drafts during restart] → Mitigate by limiting recovery guarantees to canonical final state, which is acceptable for MVP.

## Migration Plan

1. Add transcript-event and provider capability contracts.
2. Add a background transcript-event convergence layer.
3. Update provider manifest/factory metadata to distinguish batch/background from streaming/offscreen providers.
4. Keep batch providers and current batch routing unchanged.
5. Introduce streaming provider implementations later, behind the new execution-location contract.
6. Add correction-aware canonical persistence only when a streaming provider needs it.
7. Add optional partial preview UI only if product requirements justify it.

Rollback strategy:
- Keep the batch provider path and current translation/caching behavior unchanged.
- If streaming work is paused, the new transcript-event contracts and metadata remain additive and do not affect existing batch providers.

## Open Questions

- Whether any future streaming provider will need partial captions visible in the overlay before finalization.
- Whether correction events should trigger immediate translation replacement or deferred canonical re-translation for specific providers.
- Whether a future provider requires a provider-specific resume token contract beyond the generic reconnect flag.
