import {
  LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES,
  normalizeLiveCaptionTranscriptEvent
} from './liveCaptionTranscriptContracts.js';

function createTranscriptEventResult(type, fields = {}) {
  return Object.freeze({
    handled: fields.handled ?? true,
    persisted: fields.persisted ?? false,
    status: fields.status ?? type,
    eventType: type,
    event: fields.event ?? null,
    normalizedEvent: fields.normalizedEvent ?? null,
    canonicalEvent: fields.canonicalEvent ?? null,
    reason: fields.reason ?? null,
    error: fields.error ?? null,
    metadata: fields.metadata ?? null
  });
}

export class LiveCaptionTranscriptEventCoordinator {
  handleTranscriptEvent(event) {
    return this._handleNormalizedTranscriptEvent(event);
  }

  handleStreamingTranscriptEvent(event) {
    return this._handleNormalizedTranscriptEvent(event);
  }

  _handleNormalizedTranscriptEvent(event) {
    const normalizedEvent = normalizeLiveCaptionTranscriptEvent(event);

    switch (normalizedEvent.eventType) {
      case LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.PARTIAL:
        return this.handlePartialTranscriptEvent(normalizedEvent);
      case LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.FINAL:
        return this.handleFinalTranscriptEvent(normalizedEvent);
      case LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.CORRECTION:
        return this.handleCorrectionTranscriptEvent(normalizedEvent);
      case LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.ERROR:
        return this.handleErrorTranscriptEvent(normalizedEvent);
      default:
        throw new TypeError(`Unsupported live-caption transcript event type: ${normalizedEvent.eventType}`);
    }
  }

  handlePartialTranscriptEvent(event) {
    const normalizedEvent = normalizeLiveCaptionTranscriptEvent(event);

    return createTranscriptEventResult(LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.PARTIAL, {
      handled: false,
      status: 'ignored',
      event: normalizedEvent,
      normalizedEvent,
      reason: 'partial_ephemeral',
      metadata: {
        eventId: normalizedEvent.eventId,
        segmentId: normalizedEvent.segmentId,
        revision: normalizedEvent.revision
      }
    });
  }

  handleFinalTranscriptEvent(event) {
    const normalizedEvent = normalizeLiveCaptionTranscriptEvent(event);

    return createTranscriptEventResult(LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.FINAL, {
      status: 'canonical_final',
      event: normalizedEvent,
      normalizedEvent,
      canonicalEvent: normalizedEvent,
      metadata: {
        eventId: normalizedEvent.eventId,
        segmentId: normalizedEvent.segmentId,
        revision: normalizedEvent.revision,
        isFinal: normalizedEvent.isFinal
      }
    });
  }

  handleCorrectionTranscriptEvent(event) {
    const normalizedEvent = normalizeLiveCaptionTranscriptEvent(event);

    return createTranscriptEventResult(LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.CORRECTION, {
      status: 'canonical_correction',
      event: normalizedEvent,
      normalizedEvent,
      canonicalEvent: normalizedEvent,
      metadata: {
        eventId: normalizedEvent.eventId,
        segmentId: normalizedEvent.segmentId,
        revision: normalizedEvent.revision,
        supersedesEventId: normalizedEvent.supersedesEventId,
        supersedesSegmentId: normalizedEvent.supersedesSegmentId,
        isFinal: normalizedEvent.isFinal
      }
    });
  }

  handleErrorTranscriptEvent(event) {
    const normalizedEvent = normalizeLiveCaptionTranscriptEvent(event);

    return createTranscriptEventResult(LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.ERROR, {
      status: 'error',
      event: normalizedEvent,
      normalizedEvent,
      error: normalizedEvent.error,
      metadata: {
        eventId: normalizedEvent.eventId,
        providerId: normalizedEvent.providerId,
        providerMode: normalizedEvent.providerMode,
        sessionId: normalizedEvent.sessionId,
        videoFingerprint: normalizedEvent.videoFingerprint
      }
    });
  }
}

export default LiveCaptionTranscriptEventCoordinator;
