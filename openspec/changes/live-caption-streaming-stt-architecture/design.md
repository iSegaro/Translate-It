## Context

Live Caption now runs as two coordinated paths:
- batch providers such as OpenAI Whisper and Local Whisper continue to execute in the background and preserve the existing finalized-chunk flow
- the first streaming provider, `FasterWhisperStreamingProvider`, executes in the offscreen document and owns its WebSocket transport there

Offscreen capture still finalizes audio chunks, but finalized blobs now bifurcate by provider mode:
- batch providers keep the existing finalized-chunk path into background STT
- streaming providers receive finalized blobs directly in the offscreen provider runtime

Background owns transcript convergence and translation handoff. Canonical streaming finals are persisted to the active session/cache flow and then routed to translation. Partial hypotheses remain ephemeral, and correction/reconnect behavior is intentionally deferred.

This change documents the implemented streaming architecture and the remaining deferred items without changing the established batch provider path.

## Goals / Non-Goals

**Goals:**
- Preserve current batch STT behavior unchanged.
- Keep the streaming STT execution model offscreen-hosted.
- Add explicit provider metadata for mode, execution location, and streaming capabilities.
- Define a revisioned transcript event contract for partial, final, correction, and error events.
- Keep the background transcript-event convergence layer as the canonical normalization boundary.
- Keep partial transcript state ephemeral and off the canonical persistence path.
- Keep translation final-only for the MVP.
- Keep recovery and fail-close policy owned by background, while provider transport cleanup remains host-owned.
- Reflect the current codebase accurately: `BaseStreamingSTTProvider` and `FasterWhisperStreamingProvider` exist, and `faster_whisper_streaming` is development-only.

**Non-Goals:**
- Implement any runtime code.
- Modify batch provider behavior.
- Add a background partial-state manager.
- Persist partial transcript hypotheses.
- Change translation provider architecture.
- Move media ownership into the service worker.

## Decisions

### 1. Execution location: offscreen for streaming, background for batch

Streaming STT providers execute in the offscreen document. Batch providers continue to execute in background. This is already implemented for `FasterWhisperStreamingProvider`.

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
- The implemented streaming path already routes canonical finals through this coordinator before translation.

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

Streaming corrections use `segmentId` plus `revision` as the canonical identity model. The current implementation tracks canonical revisions in memory, but persisted correction replacement and translation invalidation remain deferred.

**Why this decision**
- It provides a clear identity model for providers that revise hypotheses over time.
- It allows canonical persistence to store only the latest accepted revision.
- It gives the transcript-event coordinator a deterministic reconciliation rule.

**Alternatives considered**
- Treating corrections as separate unrelated transcript entries: rejected because it would break canonical ordering and translation invalidation logic.

**Canonical identity**
- The canonical identity for a transcript segment is:
  - `sessionId + tabId + videoFingerprint + segmentId`
- Revision comparison and canonical replacement must be keyed to that identity, not to timing alone.

**Current append-only limitation**
- The current session, cache, translation, and runtime hydration paths are append-only in practice.
- They can accumulate canonical-looking segments, but they do not yet provide a revision-aware replacement path for corrected finals.

**Correction persistence risk**
- If a correction-capable streaming provider is enabled without revision-aware persistence, corrected finals can be duplicated or misordered in session/cache state.
- Timing-keyed upserts are not sufficient when a correction changes timing or when a provider reuses the same logical utterance with a new revision.

**Translation invalidation risk**
- Translation currently assumes finalized transcript segments are one-way queue units.
- Without identity-based invalidation or replacement, a corrected final can leave stale translated text visible or persist duplicate translated segments.

### 6. Translation consumes final and corrected-final events only

Translation remains final-segment oriented for the current implementation and MVP.

**Why this decision**
- The current translation pipeline is optimized for canonical text, not speculative drafts.
- Partial translation increases cost and correction churn.
- Final-only translation keeps current cache and overlay behavior stable.
- The implemented streaming path sends canonical finals to the existing translation pipeline and keeps partials/corrections/error events out of translation.

**Alternatives considered**
- Translating partials too: rejected for MVP due to cost, churn, and invalidation complexity.
- Making translation mode fully configurable now: rejected as premature for the architecture-only phase.

### 7. Recovery ownership stays split

Background owns orchestration, fail-close policy, canonical state, translation, and persistence. Offscreen owns provider lifecycle and websocket transport cleanup. Reconnect is intentionally unsupported at this stage.

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
- [Development-only provider exposure] → Mitigate by keeping `faster_whisper_streaming` gated by the manifest's `developmentOnly` flag.

## Migration Plan

1. Add transcript-event and provider capability contracts.
2. Add a background transcript-event convergence layer.
3. Update provider manifest/factory metadata to distinguish batch/background from streaming/offscreen providers.
4. Keep batch providers and current batch routing unchanged.
5. Introduce streaming provider implementations behind the new execution-location contract.
6. Add correction-aware canonical persistence only when a correction-capable streaming provider is introduced.
7. Add optional partial preview UI only if product requirements justify it.

**Phase gating**
- Providers that emit final-only streaming events can proceed earlier because they do not require correction persistence or translation invalidation.
- Providers that emit corrections must wait until canonical persistence, revision-aware replacement, and translation invalidation are in place.
- Partial transcript hypotheses remain ephemeral and are not part of the canonical persistence model.
- A full correction history or audit log is explicitly deferred; only the latest canonical state is required for MVP support.
- `faster_whisper_streaming` is development-only in the manifest and is intentionally not a production-ready default provider.

Rollback strategy:
- Keep the batch provider path and current translation/caching behavior unchanged.
- If streaming work is paused, the new transcript-event contracts and metadata remain additive and do not affect existing batch providers.

## Open Questions

- Whether any future streaming provider will need partial captions visible in the overlay before finalization.
- Whether correction events should trigger immediate translation replacement or deferred canonical re-translation for specific providers.
- Whether a future provider requires a provider-specific resume token contract beyond the generic reconnect flag.
