/**
 * Firefox Live Dubbing content-runtime host (production, Phase 2).
 *
 * Per-document control host owned by the content compartment. It accepts
 * only the closed scalar PREPARE/STATUS/DISPOSE vocabulary with exact
 * session/provider/tab/frame/document/event identity and performs no
 * capture, provider execution, site handling, media transport, or page-world
 * exposure. This instance is deliberately independent of the production
 * offscreen control owner: lifecycle state lives here, per document, and
 * navigation invalidates it.
 */

import {
  LIVE_DUBBING_ACTIONS,
} from '../constants.js';
import {
  normalizeProviderTargetLanguage,
} from '../contracts.js';
import {
  FIREFOX_CONTENT_ACKS,
  FIREFOX_CONTENT_STATUS,
  isAuthorizedFirefoxContentControlSender,
  parseFirefoxContentMessage,
  sanitizeFirefoxContentResponse,
} from './firefoxContentContract.js';

const TERMINAL_STATUS = FIREFOX_CONTENT_STATUS.IDLE;
const PREPARED_STATUS = FIREFOX_CONTENT_STATUS.PREPARING_CAPTURE;

function readBestEffortSessionId(message) {
  const sessionId = message?.data?.sessionId ?? message?.sessionId;
  return typeof sessionId === 'string' && sessionId.trim() ? sessionId : null;
}

function readBestEffortProviderId(message) {
  const providerId = message?.data?.providerId ?? message?.providerId;
  return typeof providerId === 'string' ? providerId : null;
}

function isSameDocument(identity, data) {
  return Boolean(identity
    && data
    && identity.frameId === data.frameId
    && typeof identity.documentId === 'string'
    && typeof data.documentId === 'string'
    && identity.documentId.trim() === data.documentId.trim()
    && (identity.tabId === undefined || identity.tabId === data.tabId));
}

/**
 * Owns one document's Live Dubbing control session.
 * The document binding is learned from the first valid PREPARE and every
 * later message must match it; a document mismatch fails closed so a stale
 * document can never observe or disturb another document's session.
 */
export class FirefoxLiveDubbingContentHost {
  constructor(options = {}) {
    this.browserAPI = options.browserAPI || null;
    this.session = null;
    this.documentIdentity = null;
    this.disposedSession = null;
  }

  /**
   * Whether an action belongs to this host. Closed vocabulary only.
   * @param {unknown} action
   * @returns {boolean}
   */
  handles(action) {
    return action === LIVE_DUBBING_ACTIONS.PREPARE
      || action === LIVE_DUBBING_ACTIONS.STATUS
      || action === LIVE_DUBBING_ACTIONS.DISPOSE;
  }

  /**
   * Handle one Background control message. Always returns a fresh
   * scalar-only response; never throws and never exposes media, payloads,
   * or exception objects.
   * @param {object} message closed control message
   * @param {object|null} sender Background sender metadata
   * @returns {object} sanitized scalar response
   */
  handle(message = {}, sender = null) {
    if (!isAuthorizedFirefoxContentControlSender(sender, this.browserAPI)) {
      return this._respond({
        success: false,
        error: 'LIVE_DUBBING_UNAUTHORIZED',
        ignored: true,
        sessionId: readBestEffortSessionId(message),
        providerId: readBestEffortProviderId(message),
        status: this.session?.status || TERMINAL_STATUS,
      });
    }

    const parsed = parseFirefoxContentMessage(message);
    if (!parsed) {
      return this._respond({
        success: false,
        error: 'LIVE_DUBBING_ACTION_UNSUPPORTED',
        ignored: true,
        sessionId: readBestEffortSessionId(message),
        providerId: readBestEffortProviderId(message),
        status: this.session?.status || TERMINAL_STATUS,
      });
    }

    if (this.documentIdentity && !isSameDocument(this.documentIdentity, parsed.data)) {
      return this._respond({
        success: false,
        error: 'LIVE_DUBBING_STALE_DOCUMENT',
        ignored: true,
        sessionId: parsed.data.sessionId,
        providerId: parsed.data.providerId,
        tabId: parsed.data.tabId,
        frameId: parsed.data.frameId,
        documentId: parsed.data.documentId,
        eventSequence: parsed.data.eventSequence,
        status: this.session?.status || TERMINAL_STATUS,
      });
    }

    switch (parsed.action) {
      case LIVE_DUBBING_ACTIONS.PREPARE:
        return this._prepare(parsed.data);
      case LIVE_DUBBING_ACTIONS.STATUS:
        return this._status(parsed.data);
      case LIVE_DUBBING_ACTIONS.DISPOSE:
        return this._dispose(parsed.data);
      default:
        return this._respond({
          success: false,
          error: 'LIVE_DUBBING_ACTION_UNSUPPORTED',
          ignored: true,
          sessionId: parsed.data.sessionId,
          providerId: parsed.data.providerId,
          status: this.session?.status || TERMINAL_STATUS,
        });
    }
  }

  /**
   * Invalidate the document binding (navigation). The active session, when
   * any, is terminalized into the tombstone so its identity cannot resurrect
   * on this document; a fresh session id may still prepare afterwards.
   * @param {string|null} reason scalar reason, unused beyond logging fences
   */
  invalidate(reason = null) {
    void reason;
    if (this.session) {
      this.disposedSession = {
        sessionId: this.session.sessionId,
        providerId: this.session.providerId,
      };
      this.session = null;
    }
  }

  _prepare(data) {
    if (this.disposedSession
      && this.disposedSession.sessionId === data.sessionId
      && this.disposedSession.providerId === data.providerId) {
      return this._respond({
        success: false,
        error: 'LIVE_DUBBING_SESSION_DISPOSED',
        ignored: true,
        sessionId: data.sessionId,
        providerId: data.providerId,
        tabId: data.tabId,
        frameId: data.frameId,
        documentId: data.documentId,
        eventSequence: this.session?.eventSequence ?? data.eventSequence,
        status: TERMINAL_STATUS,
      });
    }

    const session = this.session;
    if (session) {
      if (session.sessionId !== data.sessionId) {
        return this._sessionBusy(data);
      }
      if (session.providerId !== data.providerId || session.tabId !== data.tabId) {
        return this._sessionMismatch(data);
      }
      if (session.eventSequence !== data.eventSequence) {
        return this._sequenceMismatch(data);
      }
      let normalizedLanguage = null;
      try {
        normalizedLanguage = data.targetLanguage === undefined || data.targetLanguage === null
          ? session.targetLanguage
          : normalizeProviderTargetLanguage(data.providerId, data.targetLanguage);
      } catch {
        return this._respond({
          success: false,
          error: 'INVALID_TARGET_LANGUAGE',
          ignored: true,
          sessionId: data.sessionId,
          providerId: data.providerId,
          tabId: data.tabId,
          frameId: data.frameId,
          documentId: data.documentId,
          eventSequence: session.eventSequence,
          status: session.status,
        });
      }
      if (normalizedLanguage !== session.targetLanguage) {
        return this._respond({
          success: false,
          error: 'LIVE_DUBBING_TARGET_LANGUAGE_MISMATCH',
          ignored: true,
          sessionId: data.sessionId,
          providerId: data.providerId,
          tabId: data.tabId,
          frameId: data.frameId,
          documentId: data.documentId,
          eventSequence: session.eventSequence,
          status: session.status,
        });
      }
      return this._respond({
        success: true,
        ack: FIREFOX_CONTENT_ACKS.READY,
        sessionId: session.sessionId,
        providerId: session.providerId,
        tabId: session.tabId,
        frameId: session.frameId,
        documentId: session.documentId,
        targetLanguage: session.targetLanguage,
        eventSequence: session.eventSequence,
        active: true,
        prepared: true,
        idempotent: true,
        status: session.status,
      });
    }

    if (data.eventSequence !== 0) {
      return this._sequenceMismatch(data);
    }

    let targetLanguage;
    try {
      targetLanguage = normalizeProviderTargetLanguage(data.providerId, data.targetLanguage);
    } catch {
      return this._respond({
        success: false,
        error: 'INVALID_TARGET_LANGUAGE',
        ignored: true,
        sessionId: data.sessionId,
        providerId: data.providerId,
        tabId: data.tabId,
        frameId: data.frameId,
        documentId: data.documentId,
        eventSequence: data.eventSequence,
        status: TERMINAL_STATUS,
      });
    }

    this.session = {
      sessionId: data.sessionId,
      providerId: data.providerId,
      tabId: data.tabId,
      frameId: data.frameId,
      documentId: data.documentId,
      targetLanguage,
      eventSequence: data.eventSequence,
      status: PREPARED_STATUS,
    };
    this.documentIdentity = {
      tabId: data.tabId,
      frameId: data.frameId,
      documentId: data.documentId,
    };

    return this._respond({
      success: true,
      ack: FIREFOX_CONTENT_ACKS.READY,
      sessionId: this.session.sessionId,
      providerId: this.session.providerId,
      tabId: this.session.tabId,
      frameId: this.session.frameId,
      documentId: this.session.documentId,
      targetLanguage: this.session.targetLanguage,
      eventSequence: this.session.eventSequence,
      active: true,
      prepared: true,
      status: this.session.status,
    });
  }

  _status(data) {
    const session = this.session;
    if (!session) {
      return this._respond({
        success: true,
        sessionId: data.sessionId,
        providerId: data.providerId,
        tabId: data.tabId,
        frameId: data.frameId,
        documentId: data.documentId,
        eventSequence: data.eventSequence,
        active: false,
        prepared: false,
        status: TERMINAL_STATUS,
      });
    }
    if (session.sessionId !== data.sessionId
      || session.providerId !== data.providerId
      || session.tabId !== data.tabId) {
      return this._sessionMismatch(data);
    }
    if (session.eventSequence !== data.eventSequence) {
      return this._sequenceMismatch(data);
    }

    return this._respond({
      success: true,
      sessionId: session.sessionId,
      providerId: session.providerId,
      tabId: session.tabId,
      frameId: session.frameId,
      documentId: session.documentId,
      targetLanguage: session.targetLanguage,
      eventSequence: session.eventSequence,
      active: true,
      prepared: true,
      status: session.status,
    });
  }

  _dispose(data) {
    if (this.disposedSession
      && this.disposedSession.sessionId === data.sessionId
      && this.disposedSession.providerId === data.providerId) {
      return this._respond({
        success: true,
        ack: FIREFOX_CONTENT_ACKS.DISPOSED,
        disposed: true,
        idempotent: true,
        sessionId: data.sessionId,
        providerId: data.providerId,
        tabId: data.tabId,
        frameId: data.frameId,
        documentId: data.documentId,
        eventSequence: data.eventSequence,
        active: false,
        status: TERMINAL_STATUS,
      });
    }

    const session = this.session;
    if (!session || session.sessionId !== data.sessionId) {
      return this._respond({
        success: true,
        ack: FIREFOX_CONTENT_ACKS.DISPOSED,
        disposed: true,
        idempotent: !session,
        ignored: Boolean(session),
        sessionId: data.sessionId,
        providerId: data.providerId,
        tabId: data.tabId,
        frameId: data.frameId,
        documentId: data.documentId,
        eventSequence: data.eventSequence,
        active: Boolean(session),
        status: session?.status || TERMINAL_STATUS,
      });
    }
    // Exact session identity is the terminal fence; sequence drift on a
    // retried DISPOSE is expected and must not block terminal cleanup.
    if (session.providerId !== data.providerId || session.tabId !== data.tabId) {
      return this._sessionMismatch(data);
    }

    this.disposedSession = { sessionId: session.sessionId, providerId: session.providerId };
    this.session = null;
    return this._respond({
      success: true,
      ack: FIREFOX_CONTENT_ACKS.DISPOSED,
      disposed: true,
      sessionId: data.sessionId,
      providerId: data.providerId,
      tabId: data.tabId,
      frameId: data.frameId,
      documentId: data.documentId,
      eventSequence: data.eventSequence,
      active: false,
      status: TERMINAL_STATUS,
    });
  }

  _sessionBusy(data) {
    return this._respond({
      success: false,
      error: 'LIVE_DUBBING_SESSION_BUSY',
      ignored: true,
      sessionId: data.sessionId,
      providerId: data.providerId,
      tabId: data.tabId,
      frameId: data.frameId,
      documentId: data.documentId,
      eventSequence: data.eventSequence,
      status: this.session?.status || TERMINAL_STATUS,
    });
  }

  _sessionMismatch(data) {
    return this._respond({
      success: false,
      error: 'LIVE_DUBBING_SESSION_MISMATCH',
      ignored: true,
      sessionId: data.sessionId,
      providerId: data.providerId,
      tabId: data.tabId,
      frameId: data.frameId,
      documentId: data.documentId,
      eventSequence: data.eventSequence,
      status: this.session?.status || TERMINAL_STATUS,
    });
  }

  _sequenceMismatch(data) {
    return this._respond({
      success: false,
      error: 'LIVE_DUBBING_EVENT_SEQUENCE_MISMATCH',
      ignored: true,
      sessionId: data.sessionId,
      providerId: data.providerId,
      tabId: data.tabId,
      frameId: data.frameId,
      documentId: data.documentId,
      eventSequence: this.session?.eventSequence ?? 0,
      status: this.session?.status || TERMINAL_STATUS,
    });
  }

  _respond(response) {
    return sanitizeFirefoxContentResponse(response) || {
      success: false,
      error: 'LIVE_DUBBING_ACTION_UNSUPPORTED',
      sessionId: null,
      providerId: null,
      status: TERMINAL_STATUS,
    };
  }
}
