import { describe, expect, it } from 'vitest';
import { LiveCaptionTranscriptEventCoordinator } from './LiveCaptionTranscriptEventCoordinator.js';
import {
  LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES
} from './liveCaptionTranscriptContracts.js';
import { STT_PROVIDER_MODES } from '../stt/liveCaptionSTTProviderContracts.js';

function createBaseEvent(overrides = {}) {
  return {
    eventId: 'event-1',
    eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.PARTIAL,
    providerId: 'provider-1',
    providerMode: STT_PROVIDER_MODES.STREAMING,
    sessionId: 'session-1',
    tabId: 7,
    videoFingerprint: 'video-1',
    segmentId: 'segment-1',
    revision: 1,
    text: 'Hello world',
    createdAt: 123,
    ...overrides
  };
}

describe('LiveCaptionTranscriptEventCoordinator', () => {
  it('accepts valid partial events as ephemeral and non-persisted', () => {
    const coordinator = new LiveCaptionTranscriptEventCoordinator();
    const result = coordinator.handlePartialTranscriptEvent(createBaseEvent());

    expect(result).toMatchObject({
      handled: false,
      persisted: false,
      status: 'ignored',
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.PARTIAL,
      reason: 'partial_ephemeral',
      canonicalEvent: null,
      error: null,
      metadata: {
        eventId: 'event-1',
        segmentId: 'segment-1',
        revision: 1
      }
    });
    expect(result.event).toMatchObject({
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.PARTIAL,
      isFinal: false
    });
    expect(coordinator.handleTranscriptEvent(createBaseEvent({
      eventId: 'event-2'
    }))).toMatchObject({
      handled: false,
      persisted: false,
      status: 'ignored',
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.PARTIAL,
      reason: 'partial_ephemeral',
      canonicalEvent: null,
      error: null,
      metadata: {
        eventId: 'event-2',
        segmentId: 'segment-1',
        revision: 1
      }
    });
  });

  it('does not accumulate partial transcript state across repeated events', () => {
    const coordinator = new LiveCaptionTranscriptEventCoordinator();
    const first = coordinator.handleTranscriptEvent(createBaseEvent({
      eventId: 'event-1',
      revision: 1,
      text: 'First hypothesis'
    }));
    const second = coordinator.handleTranscriptEvent(createBaseEvent({
      eventId: 'event-2',
      revision: 2,
      text: 'Second hypothesis'
    }));

    expect(first).toMatchObject({
      handled: false,
      persisted: false,
      status: 'ignored',
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.PARTIAL,
      canonicalEvent: null,
      reason: 'partial_ephemeral',
      metadata: {
        eventId: 'event-1',
        segmentId: 'segment-1',
        revision: 1
      }
    });
    expect(second).toMatchObject({
      handled: false,
      persisted: false,
      status: 'ignored',
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.PARTIAL,
      canonicalEvent: null,
      reason: 'partial_ephemeral',
      metadata: {
        eventId: 'event-2',
        segmentId: 'segment-1',
        revision: 2
      }
    });
    expect(second.metadata.revision).toBe(2);
    expect(first.metadata.revision).toBe(1);
  });

  it('accepts valid final events as canonical final results', () => {
    const coordinator = new LiveCaptionTranscriptEventCoordinator();
    const result = coordinator.handleFinalTranscriptEvent(createBaseEvent({
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.FINAL,
      segmentStartMs: 100,
      segmentEndMs: 250
    }));

    expect(result).toMatchObject({
      handled: true,
      persisted: false,
      status: 'canonical_final',
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.FINAL,
      canonicalEvent: {
        eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.FINAL,
        isFinal: true
      },
      error: null,
      metadata: {
        eventId: 'event-1',
        segmentId: 'segment-1',
        revision: 1,
        isFinal: true
      }
    });
    expect(result.event).toMatchObject({
      segmentStartMs: 100,
      segmentEndMs: 250,
      isFinal: true
    });
  });

  it('accepts correction events and preserves revision metadata', () => {
    const coordinator = new LiveCaptionTranscriptEventCoordinator();
    const result = coordinator.handleCorrectionTranscriptEvent(createBaseEvent({
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.CORRECTION,
      revision: 2,
      segmentStartMs: 100,
      segmentEndMs: 260,
      supersedesSegmentId: 'segment-0',
      supersedesEventId: 'event-0',
      text: 'Corrected text'
    }));

    expect(result).toMatchObject({
      handled: true,
      persisted: false,
      status: 'canonical_correction',
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.CORRECTION,
      canonicalEvent: {
        eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.CORRECTION,
        isFinal: true
      },
      metadata: {
        eventId: 'event-1',
        segmentId: 'segment-1',
        revision: 2,
        supersedesEventId: 'event-0',
        supersedesSegmentId: 'segment-0',
        isFinal: true
      }
    });
    expect(result.event).toMatchObject({
      revision: 2,
      supersedesEventId: 'event-0',
      supersedesSegmentId: 'segment-0',
      isFinal: true
    });
  });

  it('accepts error events as normalized error results', () => {
    const coordinator = new LiveCaptionTranscriptEventCoordinator();
    const result = coordinator.handleErrorTranscriptEvent(createBaseEvent({
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.ERROR,
      segmentId: null,
      revision: null,
      text: null,
      error: {
        code: 'provider_error',
        message: 'Failed'
      }
    }));

    expect(result).toMatchObject({
      handled: true,
      persisted: false,
      status: 'error',
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.ERROR,
      canonicalEvent: null,
      error: {
        code: 'provider_error',
        message: 'Failed'
      },
      metadata: {
        eventId: 'event-1',
        providerId: 'provider-1',
        providerMode: STT_PROVIDER_MODES.STREAMING,
        sessionId: 'session-1',
        videoFingerprint: 'video-1'
      }
    });
    expect(result.event).toMatchObject({
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.ERROR,
      isFinal: false,
      error: {
        code: 'provider_error',
        message: 'Failed'
      }
    });
  });

  it('rejects invalid transcript events', () => {
    const coordinator = new LiveCaptionTranscriptEventCoordinator();

    expect(() => coordinator.handleTranscriptEvent({})).toThrow(/eventType/i);
    expect(() => coordinator.handleFinalTranscriptEvent({
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.FINAL,
      providerId: 'provider-1',
      providerMode: STT_PROVIDER_MODES.STREAMING,
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-1',
      segmentId: 'segment-1',
      revision: 1,
      text: 'Missing timing'
    })).toThrow(/segment timing/i);
  });
});
