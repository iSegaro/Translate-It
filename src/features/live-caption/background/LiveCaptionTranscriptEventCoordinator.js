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
  constructor() {
    this.canonicalRevisionByIdentity = new Map();
  }

  clearCanonicalRevisions(filter = null) {
    if (typeof filter === 'function') {
      for (const [identityKey, revision] of this.canonicalRevisionByIdentity.entries()) {
        if (filter(identityKey, revision)) {
          this.canonicalRevisionByIdentity.delete(identityKey);
        }
      }
      return;
    }

    if (filter && typeof filter === 'object') {
      if (filter.sessionId) {
        this.clearSession(filter.sessionId);
        return;
      }

      if (filter.tabId != null || filter.videoFingerprint || filter.segmentId) {
        this.clearVideoSession(filter);
        return;
      }
    }

    this.canonicalRevisionByIdentity.clear();
  }

  clearSession(sessionId) {
    if (!sessionId) {
      return;
    }

    this.clearCanonicalRevisions((identityKey) => identityKey.startsWith(`${sessionId}::`));
  }

  clearVideoSession({ sessionId, tabId, videoFingerprint, segmentId } = {}) {
    if (!sessionId || tabId == null || !videoFingerprint) {
      return;
    }

    const identityPrefix = `${sessionId}::${String(tabId)}::${videoFingerprint}::`;
    if (segmentId) {
      this.canonicalRevisionByIdentity.delete(`${identityPrefix}${segmentId}`);
      return;
    }

    this.clearCanonicalRevisions((identityKey) => identityKey.startsWith(identityPrefix));
  }

  destroy() {
    this.canonicalRevisionByIdentity.clear();
  }

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

  _getCanonicalIdentityKey(event) {
    if (!event || !event.sessionId || event.tabId == null || !event.videoFingerprint || !event.segmentId) {
      return null;
    }

    return [
      event.sessionId,
      String(event.tabId),
      event.videoFingerprint,
      event.segmentId
    ].join('::');
  }

  _getCanonicalRevision(event) {
    const identityKey = this._getCanonicalIdentityKey(event);

    if (!identityKey) {
      return null;
    }

    return this.canonicalRevisionByIdentity.get(identityKey) ?? null;
  }

  _setCanonicalRevision(event) {
    const identityKey = this._getCanonicalIdentityKey(event);

    if (!identityKey) {
      return null;
    }

    this.canonicalRevisionByIdentity.set(identityKey, event.revision);
    return identityKey;
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
    this._setCanonicalRevision(normalizedEvent);

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
    const currentCanonicalRevision = this._getCanonicalRevision(normalizedEvent);

    if (currentCanonicalRevision != null && normalizedEvent.revision <= currentCanonicalRevision) {
      return createTranscriptEventResult(LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.CORRECTION, {
        handled: false,
        status: 'stale_correction',
        event: normalizedEvent,
        normalizedEvent,
        canonicalEvent: null,
        reason: 'stale_revision',
        metadata: {
          eventId: normalizedEvent.eventId,
          segmentId: normalizedEvent.segmentId,
          revision: normalizedEvent.revision,
          currentCanonicalRevision,
          supersedesEventId: normalizedEvent.supersedesEventId,
          supersedesSegmentId: normalizedEvent.supersedesSegmentId,
          isFinal: normalizedEvent.isFinal
        }
      });
    }

    this._setCanonicalRevision(normalizedEvent);

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
