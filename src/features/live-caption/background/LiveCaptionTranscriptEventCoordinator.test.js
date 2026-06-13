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
  it('clears canonical revision state for a specific session and video identity', () => {
    const coordinator = new LiveCaptionTranscriptEventCoordinator();
    coordinator.handleStreamingTranscriptEvent(createBaseEvent({
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.FINAL,
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-1',
      segmentId: 'segment-a',
      revision: 1,
      segmentStartMs: 100,
      segmentEndMs: 200
    }));
    coordinator.handleStreamingTranscriptEvent(createBaseEvent({
      eventId: 'event-2',
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.FINAL,
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-1',
      segmentId: 'segment-b',
      revision: 2,
      segmentStartMs: 200,
      segmentEndMs: 300
    }));
    coordinator.handleStreamingTranscriptEvent(createBaseEvent({
      eventId: 'event-3',
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.FINAL,
      sessionId: 'session-2',
      tabId: 8,
      videoFingerprint: 'video-2',
      segmentId: 'segment-c',
      revision: 3,
      segmentStartMs: 300,
      segmentEndMs: 400
    }));

    coordinator.clearVideoSession({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-1'
    });

    const staleCorrection = coordinator.handleStreamingTranscriptEvent(createBaseEvent({
      eventId: 'event-4',
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.CORRECTION,
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-1',
      segmentId: 'segment-a',
      revision: 1,
      segmentStartMs: 100,
      segmentEndMs: 210,
      supersedesSegmentId: 'segment-a',
      supersedesEventId: 'event-1',
      text: 'Updated after cleanup'
    }));

    const otherSessionCorrection = coordinator.handleStreamingTranscriptEvent(createBaseEvent({
      eventId: 'event-5',
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.CORRECTION,
      sessionId: 'session-2',
      tabId: 8,
      videoFingerprint: 'video-2',
      segmentId: 'segment-c',
      revision: 4,
      segmentStartMs: 300,
      segmentEndMs: 420,
      supersedesSegmentId: 'segment-c',
      supersedesEventId: 'event-3',
      text: 'Still tracked'
    }));

    expect(staleCorrection).toMatchObject({
      handled: true,
      status: 'canonical_correction'
    });
    expect(otherSessionCorrection).toMatchObject({
      handled: true,
      status: 'canonical_correction'
    });
  });

  it('destroy clears canonical revision state for all tracked identities', () => {
    const coordinator = new LiveCaptionTranscriptEventCoordinator();
    coordinator.handleStreamingTranscriptEvent(createBaseEvent({
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.FINAL,
      revision: 1,
      segmentStartMs: 100,
      segmentEndMs: 250
    }));

    coordinator.destroy();

    const correctionAfterDestroy = coordinator.handleStreamingTranscriptEvent(createBaseEvent({
      eventId: 'event-2',
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.CORRECTION,
      revision: 1,
      segmentStartMs: 100,
      segmentEndMs: 260,
      supersedesSegmentId: 'segment-1',
      supersedesEventId: 'event-1',
      text: 'After destroy'
    }));

    expect(correctionAfterDestroy).toMatchObject({
      handled: true,
      persisted: false,
      status: 'canonical_correction',
      canonicalEvent: {
        eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.CORRECTION
      }
    });
  });
  it('routes streaming events through the same normalization path as transcript events', () => {
    const coordinator = new LiveCaptionTranscriptEventCoordinator();
    const event = createBaseEvent({
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.FINAL,
      segmentStartMs: 100,
      segmentEndMs: 250
    });

    expect(coordinator.handleStreamingTranscriptEvent(event)).toEqual(
      coordinator.handleTranscriptEvent(event)
    );
  });

  it('accepts valid partial events as ephemeral and non-persisted', () => {
    const coordinator = new LiveCaptionTranscriptEventCoordinator();
    const result = coordinator.handleStreamingTranscriptEvent(createBaseEvent());

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
    expect(coordinator.handleStreamingTranscriptEvent(createBaseEvent({
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
    const first = coordinator.handleStreamingTranscriptEvent(createBaseEvent({
      eventId: 'event-1',
      revision: 1,
      text: 'First hypothesis'
    }));
    const second = coordinator.handleStreamingTranscriptEvent(createBaseEvent({
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

  it('final events establish canonical revision and newer corrections replace it', () => {
    const coordinator = new LiveCaptionTranscriptEventCoordinator();
    const finalResult = coordinator.handleStreamingTranscriptEvent(createBaseEvent({
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.FINAL,
      segmentStartMs: 100,
      segmentEndMs: 250
    }));
    const correctionResult = coordinator.handleStreamingTranscriptEvent(createBaseEvent({
      eventId: 'event-2',
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.CORRECTION,
      revision: 2,
      segmentStartMs: 100,
      segmentEndMs: 260,
      supersedesSegmentId: 'segment-1',
      supersedesEventId: 'event-1',
      text: 'Updated text'
    }));

    expect(finalResult).toMatchObject({
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
    expect(finalResult.event).toMatchObject({
      segmentStartMs: 100,
      segmentEndMs: 250,
      isFinal: true
    });
    expect(correctionResult).toMatchObject({
      handled: true,
      persisted: false,
      status: 'canonical_correction',
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.CORRECTION,
      canonicalEvent: {
        eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.CORRECTION,
        isFinal: true
      },
      metadata: {
        eventId: 'event-2',
        segmentId: 'segment-1',
        revision: 2,
        supersedesEventId: 'event-1',
        supersedesSegmentId: 'segment-1',
        isFinal: true
      }
    });
    expect(correctionResult.event).toMatchObject({
      revision: 2,
      supersedesEventId: 'event-1',
      supersedesSegmentId: 'segment-1',
      isFinal: true
    });
  });

  it('ignores stale corrections once a newer canonical revision exists', () => {
    const coordinator = new LiveCaptionTranscriptEventCoordinator();
    coordinator.handleStreamingTranscriptEvent(createBaseEvent({
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.FINAL,
      revision: 2,
      segmentStartMs: 100,
      segmentEndMs: 250
    }));

    const staleCorrection = coordinator.handleStreamingTranscriptEvent(createBaseEvent({
      eventId: 'event-3',
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.CORRECTION,
      revision: 2,
      segmentStartMs: 100,
      segmentEndMs: 260,
      supersedesSegmentId: 'segment-1',
      supersedesEventId: 'event-2',
      text: 'Stale correction'
    }));

    expect(staleCorrection).toMatchObject({
      handled: false,
      persisted: false,
      status: 'stale_correction',
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.CORRECTION,
      canonicalEvent: null,
      reason: 'stale_revision',
      metadata: {
        eventId: 'event-3',
        segmentId: 'segment-1',
        revision: 2,
        currentCanonicalRevision: 2,
        supersedesEventId: 'event-2',
        supersedesSegmentId: 'segment-1',
        isFinal: true
      }
    });
  });

  it('clearSession removes only that session canonical revisions', () => {
    const coordinator = new LiveCaptionTranscriptEventCoordinator();
    coordinator.handleStreamingTranscriptEvent(createBaseEvent({
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.FINAL,
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-1',
      segmentId: 'segment-a',
      revision: 1,
      segmentStartMs: 100,
      segmentEndMs: 200
    }));
    coordinator.handleStreamingTranscriptEvent(createBaseEvent({
      eventId: 'event-2',
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.FINAL,
      sessionId: 'session-2',
      tabId: 8,
      videoFingerprint: 'video-2',
      segmentId: 'segment-b',
      revision: 2,
      segmentStartMs: 200,
      segmentEndMs: 300
    }));

    coordinator.clearSession('session-1');

    const session1Correction = coordinator.handleStreamingTranscriptEvent(createBaseEvent({
      eventId: 'event-3',
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.CORRECTION,
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-1',
      segmentId: 'segment-a',
      revision: 1,
      segmentStartMs: 100,
      segmentEndMs: 210,
      supersedesSegmentId: 'segment-a',
      supersedesEventId: 'event-1',
      text: 'Reopened'
    }));
    const session2StaleCorrection = coordinator.handleStreamingTranscriptEvent(createBaseEvent({
      eventId: 'event-4',
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.CORRECTION,
      sessionId: 'session-2',
      tabId: 8,
      videoFingerprint: 'video-2',
      segmentId: 'segment-b',
      revision: 2,
      segmentStartMs: 200,
      segmentEndMs: 320,
      supersedesSegmentId: 'segment-b',
      supersedesEventId: 'event-2',
      text: 'Still stale'
    }));

    expect(session1Correction).toMatchObject({
      handled: true,
      status: 'canonical_correction',
      persisted: false
    });
    expect(session2StaleCorrection).toMatchObject({
      handled: false,
      status: 'stale_correction',
      persisted: false
    });
  });

  it('partial and error events do not establish canonical revision state', () => {
    const coordinator = new LiveCaptionTranscriptEventCoordinator();

    const partialResult = coordinator.handleStreamingTranscriptEvent(createBaseEvent({
      eventId: 'event-1',
      revision: 10,
      text: 'Partial hypothesis'
    }));
    const errorResult = coordinator.handleStreamingTranscriptEvent(createBaseEvent({
      eventId: 'event-2',
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.ERROR,
      segmentId: null,
      revision: null,
      text: null,
      error: {
        code: 'provider_error',
        message: 'Failed'
      }
    }));
    const correctionResult = coordinator.handleStreamingTranscriptEvent(createBaseEvent({
      eventId: 'event-3',
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.CORRECTION,
      revision: 1,
      segmentStartMs: 100,
      segmentEndMs: 260,
      supersedesSegmentId: 'segment-1',
      supersedesEventId: 'event-1',
      text: 'Canonical after partial/error'
    }));

    expect(partialResult).toMatchObject({
      handled: false,
      persisted: false,
      status: 'ignored',
      canonicalEvent: null,
      reason: 'partial_ephemeral'
    });
    expect(errorResult).toMatchObject({
      handled: true,
      persisted: false,
      status: 'error',
      canonicalEvent: null
    });
    expect(correctionResult).toMatchObject({
      handled: true,
      persisted: false,
      status: 'canonical_correction',
      canonicalEvent: {
        eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.CORRECTION,
        isFinal: true
      },
      metadata: {
        revision: 1
      }
    });
  });

  it('accepts error events as normalized error results', () => {
    const coordinator = new LiveCaptionTranscriptEventCoordinator();
    const result = coordinator.handleStreamingTranscriptEvent(createBaseEvent({
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

    expect(() => coordinator.handleStreamingTranscriptEvent({})).toThrow(/eventType/i);
    expect(() => coordinator.handleStreamingTranscriptEvent({
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
