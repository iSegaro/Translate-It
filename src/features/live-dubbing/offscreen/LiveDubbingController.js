import {
  LIVE_DUBBING_ACTIONS,
  LIVE_DUBBING_CAPTURE_STAGES,
  LIVE_DUBBING_OFFSCREEN_ACKS,
  LIVE_DUBBING_STATUS,
} from '../constants.js';
import { createLiveDubbingDiagnostic } from '../contracts.js';

const IDLE_STATUS = 'IDLE';

function isSessionId(value) {
  return typeof value === 'string' && Boolean(value.trim());
}

function isStreamId(value) {
  return typeof value === 'string' && Boolean(value);
}

function getMessageValue(message, key) {
  return message?.data?.[key] ?? message?.[key];
}

function createCaptureFailure(stage, code, error, fields = {}, sensitiveValues = []) {
  return {
    success: false,
    ...fields,
    error: code,
    diagnostic: createLiveDubbingDiagnostic(stage, error, { sensitiveValues }),
  };
}

function createCaptureConstraints(streamId) {
  return {
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
      },
    },
    video: false,
  };
}

function getTracks(stream) {
  return typeof stream?.getTracks === 'function' ? stream.getTracks() : [];
}

function stopTracks(stream) {
  const tracks = getTracks(stream);
  const audioTracks = tracks.length > 0 || typeof stream?.getAudioTracks !== 'function'
    ? tracks
    : stream.getAudioTracks();
  for (const track of audioTracks) {
    try {
      track.stop?.();
    } catch {
      // Track cleanup is best effort; remaining tracks still need stopping.
    }
  }
}

/**
 * Owns the offscreen document's Stage 1 capture lifecycle.
 *
 * The controller deliberately keeps capture local. It never creates an audio
 * source, connects a destination, stores a stream ID, or accesses settings.
 * Capture failures return stage-scoped, sanitized diagnostics to background.
 */
export class LiveDubbingController {
  constructor(options = {}) {
    this.mediaDevices = options.mediaDevices || globalThis.navigator?.mediaDevices;
    this.notify = options.notify || ((message) => globalThis.chrome?.runtime?.sendMessage?.(message));
    this.currentSession = null;
    this.disposedSessionId = null;
  }

  handles(action) {
    return action === LIVE_DUBBING_ACTIONS.PREPARE
      || action === LIVE_DUBBING_ACTIONS.CONSUME
      || action === LIVE_DUBBING_ACTIONS.STATUS
      || action === LIVE_DUBBING_ACTIONS.DISPOSE;
  }

  handle(message = {}) {
    switch (message.action) {
      case LIVE_DUBBING_ACTIONS.PREPARE:
        return this.prepare(getMessageValue(message, 'sessionId'));
      case LIVE_DUBBING_ACTIONS.CONSUME:
        return this.consume(
          getMessageValue(message, 'sessionId'),
          getMessageValue(message, 'streamId'),
        );
      case LIVE_DUBBING_ACTIONS.STATUS:
        return this.status(getMessageValue(message, 'sessionId'));
      case LIVE_DUBBING_ACTIONS.DISPOSE:
        return this.dispose(
          getMessageValue(message, 'sessionId'),
          getMessageValue(message, 'reason'),
        );
      default:
        return { success: false, error: 'LIVE_DUBBING_ACTION_UNSUPPORTED' };
    }
  }

  prepare(sessionId) {
    if (!isSessionId(sessionId)) {
      return createCaptureFailure(
        LIVE_DUBBING_CAPTURE_STAGES.OFFSCREEN_PREPARE,
        'INVALID_SESSION_ID',
        { name: 'TypeError', message: 'sessionId is required', code: 'INVALID_SESSION_ID' },
      );
    }

    if (this.disposedSessionId === sessionId) {
      return createCaptureFailure(
        LIVE_DUBBING_CAPTURE_STAGES.OFFSCREEN_PREPARE,
        'LIVE_DUBBING_SESSION_DISPOSED',
        { name: 'SessionDisposedError', message: 'Session was disposed', code: 'LIVE_DUBBING_SESSION_DISPOSED' },
        {
          ignored: true,
          sessionId,
          status: IDLE_STATUS,
        },
      );
    }

    if (this.currentSession && this.currentSession.sessionId !== sessionId) {
      return createCaptureFailure(
        LIVE_DUBBING_CAPTURE_STAGES.OFFSCREEN_PREPARE,
        'LIVE_DUBBING_SESSION_BUSY',
        { name: 'SessionBusyError', message: 'Another capture session is active', code: 'LIVE_DUBBING_SESSION_BUSY' },
        {
          active: true,
          sessionId,
          status: this.currentSession.status,
        },
      );
    }

    if (!this.currentSession) {
      this.currentSession = {
        sessionId,
        status: LIVE_DUBBING_STATUS.PREPARING_CAPTURE,
        lastError: null,
        stream: null,
        capturePromise: null,
        listeners: [],
        terminalSent: false,
      };
    }

    return {
      success: true,
      ack: LIVE_DUBBING_OFFSCREEN_ACKS.READY,
      ready: true,
      sessionId,
      status: this.currentSession.status,
    };
  }

  /**
   * Start getUserMedia before creating any promise that could await I/O.
   * Chrome tab-capture stream IDs stay inside this method and are never
   * returned, stored, or logged.
   */
  consume(sessionId, streamId) {
    const session = this.currentSession;
    if (!session || session.sessionId !== sessionId) {
      return {
        success: false,
        error: 'LIVE_DUBBING_SESSION_MISMATCH',
        ignored: true,
        sessionId: isSessionId(sessionId) ? sessionId : null,
        status: session?.status || IDLE_STATUS,
      };
    }

    if (session.status === LIVE_DUBBING_STATUS.CAPTURING && session.stream) {
      return this._mediaAcquiredResponse(session);
    }

    if (session.capturePromise) return session.capturePromise;

    if (session.status !== LIVE_DUBBING_STATUS.PREPARING_CAPTURE) {
      return createCaptureFailure(
        LIVE_DUBBING_CAPTURE_STAGES.OFFSCREEN_GET_USER_MEDIA,
        'LIVE_DUBBING_CAPTURE_UNAVAILABLE',
        { name: 'CaptureUnavailableError', message: 'Capture is not ready', code: 'LIVE_DUBBING_CAPTURE_UNAVAILABLE' },
        { sessionId, status: session.status },
      );
    }

    if (!isStreamId(streamId)) {
      return createCaptureFailure(
        LIVE_DUBBING_CAPTURE_STAGES.OFFSCREEN_GET_USER_MEDIA,
        'INVALID_STREAM_ID',
        { name: 'TypeError', message: 'streamId is required', code: 'INVALID_STREAM_ID' },
        { sessionId },
      );
    }

    const mediaDevices = this.mediaDevices || globalThis.navigator?.mediaDevices;
    const getUserMedia = mediaDevices?.getUserMedia;
    if (typeof getUserMedia !== 'function') {
      return this._captureFailed(session, 'LIVE_DUBBING_CAPTURE_UNAVAILABLE', {
        streamId,
      });
    }

    let capturePromise;
    try {
      capturePromise = getUserMedia.call(
        mediaDevices,
        createCaptureConstraints(streamId),
      );
    } catch (error) {
      return this._captureFailed(session, 'LIVE_DUBBING_CAPTURE_FAILED', {
        cause: error,
        streamId,
      });
    }

    session.capturePromise = Promise.resolve(capturePromise).then(
      stream => {
        try {
          return this._captureResolved(session, stream, streamId);
        } catch (error) {
          return this._captureFailed(session, 'LIVE_DUBBING_CAPTURE_FAILED', {
            cause: error,
            stream,
            streamId,
          });
        }
      },
      error => this._captureFailed(session, 'LIVE_DUBBING_CAPTURE_FAILED', {
        cause: error,
        streamId,
      }),
    );
    return session.capturePromise;
  }

  status(requestedSessionId = this.currentSession?.sessionId) {
    if (requestedSessionId === undefined && !this.currentSession) {
      return {
        success: true,
        active: false,
        sessionId: null,
        status: IDLE_STATUS,
      };
    }

    if (!isSessionId(requestedSessionId)) {
      return {
        success: false,
        error: 'INVALID_SESSION_ID',
        sessionId: requestedSessionId ?? null,
        status: IDLE_STATUS,
      };
    }

    const session = this.currentSession;
    if (!session) {
      return {
        success: true,
        active: false,
        sessionId: requestedSessionId,
        status: IDLE_STATUS,
      };
    }

    if (session.sessionId !== requestedSessionId) {
      return {
        success: false,
        error: 'LIVE_DUBBING_SESSION_MISMATCH',
        ignored: true,
        sessionId: requestedSessionId,
        requestedSessionId,
        actualSessionId: session.sessionId,
        status: session.status,
      };
    }

    return {
      success: true,
      active: session.status === LIVE_DUBBING_STATUS.PREPARING_CAPTURE
        || session.status === LIVE_DUBBING_STATUS.CAPTURING,
      sessionId: session.sessionId,
      status: session.status,
      ...(session.lastError ? { lastError: session.lastError } : {}),
    };
  }

  dispose(sessionId) {
    const session = this.currentSession;
    if (!session || session.sessionId !== sessionId) {
      return {
        success: true,
        ack: LIVE_DUBBING_OFFSCREEN_ACKS.DISPOSED,
        disposed: true,
        idempotent: !session,
        ignored: Boolean(session),
        sessionId: isSessionId(sessionId) ? sessionId : null,
        active: Boolean(session),
        status: session?.status || IDLE_STATUS,
      };
    }

    this._removeTrackListeners(session);
    stopTracks(session.stream);
    session.capturePromise = null;
    session.stream = null;
    this.disposedSessionId = sessionId;
    this.currentSession = null;

    return {
      success: true,
      ack: LIVE_DUBBING_OFFSCREEN_ACKS.DISPOSED,
      disposed: true,
      sessionId,
      active: false,
      status: IDLE_STATUS,
    };
  }

  _captureResolved(session, stream, streamId) {
    if (!this._isCurrentSession(session)) {
      stopTracks(stream);
      return {
        success: false,
        error: 'LIVE_DUBBING_SESSION_DISPOSED',
        ignored: true,
        sessionId: session.sessionId,
        status: IDLE_STATUS,
      };
    }

    const liveAudioTracks = this._getLiveAudioTracks(stream);
    if (liveAudioTracks.length === 0) {
      stopTracks(stream);
      return this._captureFailed(session, 'LIVE_DUBBING_NO_LIVE_AUDIO_TRACK', { streamId });
    }

    session.stream = stream;
    session.capturePromise = null;
    session.status = LIVE_DUBBING_STATUS.CAPTURING;
    session.lastError = null;
    this._addTrackListeners(session, liveAudioTracks);
    return this._mediaAcquiredResponse(session);
  }

  _captureFailed(session, error, options = {}) {
    const isCurrent = this._isCurrentSession(session);
    if (options.stream) stopTracks(options.stream);
    const diagnostic = createLiveDubbingDiagnostic(
      LIVE_DUBBING_CAPTURE_STAGES.OFFSCREEN_GET_USER_MEDIA,
      options.cause || {
        name: 'CaptureError',
        message: error,
        code: error,
      },
      { sensitiveValues: options.streamId ? [options.streamId] : [] },
    );
    if (isCurrent) {
      session.capturePromise = null;
      session.status = LIVE_DUBBING_STATUS.ERROR;
      session.lastError = error;
    }

    return {
      success: false,
      error,
      sessionId: session.sessionId,
      status: isCurrent ? session.status : IDLE_STATUS,
      diagnostic,
    };
  }

  _mediaAcquiredResponse(session) {
    return {
      success: true,
      ack: LIVE_DUBBING_OFFSCREEN_ACKS.MEDIA_ACQUIRED,
      mediaAcquired: true,
      sessionId: session.sessionId,
      active: true,
      status: LIVE_DUBBING_STATUS.CAPTURING,
    };
  }

  _getLiveAudioTracks(stream) {
    if (typeof stream?.getAudioTracks === 'function') {
      return stream.getAudioTracks().filter(track => track?.readyState === 'live');
    }

    return getTracks(stream).filter(track => track?.kind === 'audio'
      && track.readyState === 'live');
  }

  _addTrackListeners(session, tracks) {
    for (const track of tracks) {
      const handler = () => this._handleTrackEnded(session);
      if (typeof track.addEventListener === 'function') {
        track.addEventListener('ended', handler);
        session.listeners.push({ track, handler, mode: 'event' });
      } else if ('onended' in track) {
        const previous = track.onended;
        track.onended = handler;
        session.listeners.push({ track, handler, previous, mode: 'property' });
      }
    }
  }

  _removeTrackListeners(session) {
    for (const listener of session.listeners) {
      try {
        if (listener.mode === 'event') {
          listener.track.removeEventListener?.('ended', listener.handler);
        } else if (listener.track.onended === listener.handler) {
          listener.track.onended = listener.previous || null;
        }
      } catch {
        // Listener cleanup is best effort and must not block track stopping.
      }
    }
    session.listeners = [];
  }

  _handleTrackEnded(session) {
    if (!this._isCurrentSession(session)
      || session.status !== LIVE_DUBBING_STATUS.CAPTURING) {
      return;
    }

    if (this._getLiveAudioTracks(session.stream).length > 0) return;

    session.status = LIVE_DUBBING_STATUS.ERROR;
    session.lastError = 'LIVE_DUBBING_CAPTURE_TRACK_ENDED';
    this._notifyTerminal(session);
  }

  _notifyTerminal(session) {
    if (session.terminalSent) return;
    session.terminalSent = true;

    const notification = {
      action: LIVE_DUBBING_ACTIONS.TERMINAL,
      data: {
        sessionId: session.sessionId,
        status: session.status,
        event: 'TRACK_ENDED',
        error: session.lastError,
      },
    };

    try {
      Promise.resolve(this.notify(notification)).catch(() => {});
    } catch {
      // Terminal notification is best effort; capture state remains fenced.
    }
  }

  _isCurrentSession(session) {
    return this.currentSession === session
      && this.currentSession.sessionId === session.sessionId;
  }
}

export const liveDubbingController = new LiveDubbingController();
