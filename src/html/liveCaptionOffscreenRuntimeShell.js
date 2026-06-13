import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import {
  LIVE_CAPTION_RUNTIME_ACTIONS,
  LIVE_CAPTION_RUNTIME_ERROR_CODES,
  LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES,
  LIVE_CAPTION_RUNTIME_SHELL_STATES,
  createLiveCaptionRuntimeFailClosedResponse,
  createLiveCaptionRuntimeShellResponse,
  normalizeLiveCaptionRuntimeRequest
} from '@/features/live-caption/background/liveCaptionRuntimeContracts.js';
import {
  LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES,
  createLiveCaptionStreamingSttErrorMessage,
  createLiveCaptionStreamingSttStatusMessage,
  createLiveCaptionStreamingSttTranscriptEventMessage
} from '@/features/live-caption/background/liveCaptionOffscreenContracts.js';
import { LIVE_CAPTION_RUNTIME_STATES } from '@/features/live-caption/constants/liveCaptionRuntimeStates.js';
import {
  STT_PROVIDER_EXECUTION_LOCATIONS,
  STT_PROVIDER_MODES
} from '@/features/live-caption/stt/liveCaptionSTTProviderContracts.js';
import {
  FasterWhisperStreamingProvider
} from '@/features/live-caption/stt/providers/FasterWhisperStreamingProvider.js';

const logger = getScopedLogger(LOG_COMPONENTS.LIVE_CAPTION, 'LiveCaptionOffscreenRuntimeShell');
const MIN_FINALIZED_SEGMENT_BYTES = 1024;

function normalizeStreamingIdentityValue(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeStreamingTabId(value) {
  const tabId = Number(value);
  return Number.isFinite(tabId) ? tabId : null;
}

function createDefaultStreamingProviderFactory() {
  return ({ providerId, eventSink, logger: providerLogger }) => new FasterWhisperStreamingProvider({
    providerId,
    eventSink,
    logger: providerLogger
  });
}

function cloneSessionContext(context = {}) {
  return {
    sessionId: context.sessionId ?? null,
    tabId: context.tabId ?? null,
    videoFingerprint: context.videoFingerprint ?? null
  };
}

function createInconsistentSessionError(request, state, action) {
  return new Error(
    `Live-caption offscreen shell rejected ${action} for inconsistent session: ${request.data.sessionId} != ${state.sessionId}`
  );
}

export class LiveCaptionOffscreenRuntimeShell {
  constructor({ streamingProviderFactory = null } = {}) {
    this.status = LIVE_CAPTION_RUNTIME_SHELL_STATES.IDLE;
    this.runtimeState = LIVE_CAPTION_RUNTIME_STATES.IDLE;
    this.sessionId = null;
    this.tabId = null;
    this.videoFingerprint = null;
    this.lastRequest = null;
    this.lastResponse = null;
    this.lastUpdatedAt = Date.now();

    // Media capture state properties
    this.mediaStream = null;
    this.mediaRecorder = null;
    this.audioCtx = null;
    this.audioSource = null;
    this.captureState = 'idle'; // idle | starting | capturing | paused | stopping | error
    this.chunkTimeslice = 3000;
    this.chunkStartMs = 0;
    this.segmentChunks = [];
    this.segmentBoundaryTimer = null;
    this.segmentRotationPending = false;
    this.activeRecorderMimeType = 'audio/webm';
    this.streamingProviderFactory = typeof streamingProviderFactory === 'function'
      ? streamingProviderFactory
      : createDefaultStreamingProviderFactory();
    this.streamingProvider = null;
    this.streamingSessionContext = null;
  }

  touch() {
    this.lastUpdatedAt = Date.now();
  }

  _setState({ status = this.status, runtimeState = this.runtimeState } = {}, details = {}) {
    this.status = status;
    this.runtimeState = runtimeState;
    this.touch();

    logger.debug('Live-caption offscreen shell state updated', {
      status,
      runtimeState,
      ...details
    });
  }

  _setSessionContext({ sessionId, tabId, videoFingerprint } = {}) {
    this.sessionId = sessionId ?? this.sessionId;
    this.tabId = tabId ?? this.tabId;
    this.videoFingerprint = videoFingerprint ?? this.videoFingerprint;
    this.touch();
  }

  _clearSessionContext() {
    this.sessionId = null;
    this.tabId = null;
    this.videoFingerprint = null;
    this.touch();
  }

  _ensureConsistency(request, action) {
    if (this.sessionId == null) {
      return null;
    }

    if (request.data.sessionId !== this.sessionId) {
      return createInconsistentSessionError(request, this, action);
    }

    return null;
  }

  _buildFailClosed(action, error, context = {}) {
    const response = createLiveCaptionRuntimeFailClosedResponse(action, error, {
      ...cloneSessionContext(context),
      code: context.code ?? LIVE_CAPTION_RUNTIME_ERROR_CODES.INCONSISTENT_SESSION,
      reason: context.reason ?? 'inconsistent_session',
      runtimeState: context.runtimeState ?? LIVE_CAPTION_RUNTIME_STATES.ERROR,
      status: context.status ?? LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.FAIL_CLOSED,
      message: context.message ?? error?.message ?? 'Live-caption offscreen shell failed closed'
    });

    this.lastResponse = response;
    this._setState({
      status: LIVE_CAPTION_RUNTIME_SHELL_STATES.ERROR,
      runtimeState: LIVE_CAPTION_RUNTIME_STATES.ERROR
    }, {
      action,
      reason: response.error?.reason ?? context.reason ?? 'offscreen_failure'
    });

    logger.warn('Live-caption offscreen shell failed closed', {
      action,
      code: response.error?.code ?? null,
      reason: response.error?.reason ?? null,
      sessionId: response.error?.sessionId ?? null,
      tabId: response.error?.tabId ?? null,
      videoFingerprint: response.error?.videoFingerprint ?? null
    });

    return response;
  }

  _buildStreamingResponse(action, message, {
    status = LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.OK,
    runtimeState = this.runtimeState,
    responseMessage = 'streaming_stt_no_op'
  } = {}) {
    const response = createLiveCaptionRuntimeShellResponse(action, {
      sessionId: message?.sessionId ?? this.sessionId ?? null,
      tabId: message?.tabId ?? this.tabId ?? null,
      videoFingerprint: message?.videoFingerprint ?? this.videoFingerprint ?? null,
      requestId: message?.requestId ?? null,
      status,
      runtimeState,
      message: responseMessage
    });

    this.lastResponse = response;
    this.touch();
    return response;
  }

  _buildStreamingStaleResponse(action, message) {
    return this._buildStreamingResponse(action, message, {
      status: LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.OK,
      runtimeState: this.runtimeState,
      responseMessage: 'streaming_stale_session'
    });
  }

  _normalizeStreamingSessionRequest(message, { requireProviderId = true } = {}) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      throw new TypeError('Live-caption offscreen shell requires a streaming session request object');
    }

    const sessionId = normalizeStreamingIdentityValue(message.sessionId);
    const tabId = normalizeStreamingTabId(message.tabId);
    const videoFingerprint = normalizeStreamingIdentityValue(message.videoFingerprint);
    const providerId = normalizeStreamingIdentityValue(message.providerId);
    const providerMode = normalizeStreamingIdentityValue(message.providerMode);
    const executionLocation = normalizeStreamingIdentityValue(message.executionLocation);

    if (!sessionId) {
      throw new TypeError('Live-caption offscreen shell requires sessionId for streaming session requests');
    }

    if (tabId == null) {
      throw new TypeError('Live-caption offscreen shell requires tabId for streaming session requests');
    }

    if (!videoFingerprint) {
      throw new TypeError('Live-caption offscreen shell requires videoFingerprint for streaming session requests');
    }

    if (requireProviderId && !providerId) {
      throw new TypeError('Live-caption offscreen shell requires providerId for streaming session requests');
    }

    if (providerMode !== STT_PROVIDER_MODES.STREAMING) {
      throw new TypeError('Live-caption offscreen shell requires providerMode to be streaming');
    }

    if (executionLocation !== STT_PROVIDER_EXECUTION_LOCATIONS.OFFSCREEN) {
      throw new TypeError('Live-caption offscreen shell requires executionLocation to be offscreen');
    }

    return {
      requestId: normalizeStreamingIdentityValue(message.requestId),
      sessionId,
      tabId,
      videoFingerprint,
      providerId,
      providerMode,
      executionLocation,
      sourceLanguage: normalizeStreamingIdentityValue(message.sourceLanguage),
      targetLanguage: normalizeStreamingIdentityValue(message.targetLanguage),
      providerOptions: message.providerOptions && typeof message.providerOptions === 'object' && !Array.isArray(message.providerOptions)
        ? { ...message.providerOptions }
        : {},
      metadata: message.metadata && typeof message.metadata === 'object' && !Array.isArray(message.metadata)
        ? { ...message.metadata }
        : {}
    };
  }

  _matchesStreamingSession(message) {
    if (!this.streamingSessionContext) {
      return false;
    }

    return this.streamingSessionContext.sessionId === normalizeStreamingIdentityValue(message?.sessionId)
      && this.streamingSessionContext.tabId === normalizeStreamingTabId(message?.tabId)
      && this.streamingSessionContext.videoFingerprint === normalizeStreamingIdentityValue(message?.videoFingerprint);
  }

  _clearStreamingSessionContext() {
    this.streamingProvider = null;
    this.streamingSessionContext = null;
  }

  _forwardStreamingMessageToBackground(message) {
    if (!chrome?.runtime?.sendMessage) {
      return false;
    }

    const forwardedMessage = {
      ...message,
      source: 'offscreen',
      target: 'background'
    };

    try {
      void Promise.resolve(chrome.runtime.sendMessage(forwardedMessage)).catch((error) => {
        logger.error('Failed to forward streaming live-caption message to background:', error);
      });
    } catch (error) {
      logger.error('Failed to forward streaming live-caption message to background:', error);
    }

    return true;
  }

  _handleStreamingProviderEvent(provider, event) {
    if (!provider || this.streamingProvider !== provider) {
      return;
    }

    if (!this._matchesStreamingSession(event)) {
      logger.debug('Ignoring stale streaming provider event in offscreen shell', {
        providerId: event?.providerId ?? provider?.providerId ?? null,
        sessionId: event?.sessionId ?? null,
        tabId: event?.tabId ?? null,
        videoFingerprint: event?.videoFingerprint ?? null
      });
      return;
    }

    switch (event?.type) {
      case 'status':
        this._forwardStreamingMessageToBackground(
          createLiveCaptionStreamingSttStatusMessage({
            sessionId: event.sessionId ?? this.streamingSessionContext.sessionId,
            tabId: event.tabId ?? this.streamingSessionContext.tabId,
            videoFingerprint: event.videoFingerprint ?? this.streamingSessionContext.videoFingerprint,
            providerId: event.providerId ?? provider.providerId,
            status: event.state ?? event.status ?? 'idle',
            details: event.details ?? null
          })
        );
        break;
      case 'transcript':
        this._forwardStreamingMessageToBackground(
          createLiveCaptionStreamingSttTranscriptEventMessage({
            sessionId: event.sessionId ?? this.streamingSessionContext.sessionId,
            tabId: event.tabId ?? this.streamingSessionContext.tabId,
            videoFingerprint: event.videoFingerprint ?? this.streamingSessionContext.videoFingerprint,
            event: event.event ?? event
          })
        );
        break;
      case 'error':
        this._forwardStreamingMessageToBackground(
          createLiveCaptionStreamingSttErrorMessage({
            sessionId: event.sessionId ?? this.streamingSessionContext.sessionId,
            tabId: event.tabId ?? this.streamingSessionContext.tabId,
            videoFingerprint: event.videoFingerprint ?? this.streamingSessionContext.videoFingerprint,
            providerId: event.providerId ?? provider.providerId,
            error: event.error ?? event
          })
        );
        this._clearStreamingSessionContext();
        break;
      case 'closed':
        this._forwardStreamingMessageToBackground(
          createLiveCaptionStreamingSttStatusMessage({
            sessionId: event.sessionId ?? this.streamingSessionContext.sessionId,
            tabId: event.tabId ?? this.streamingSessionContext.tabId,
            videoFingerprint: event.videoFingerprint ?? this.streamingSessionContext.videoFingerprint,
            providerId: event.providerId ?? provider.providerId,
            status: 'closed',
            details: {
              reason: event.reason ?? null
            }
          })
        );
        this._clearStreamingSessionContext();
        break;
      default:
        logger.debug('Ignoring unsupported streaming provider event in offscreen shell', {
          type: event?.type ?? null,
          providerId: event?.providerId ?? provider?.providerId ?? null
        });
        break;
    }
  }

  _createStreamingProvider(request) {
    let provider = null;
    const eventSink = {
      emit: (event) => {
        this._handleStreamingProviderEvent(provider, event);
      }
    };

    provider = this.streamingProviderFactory({
      providerId: request.providerId,
      eventSink,
      logger
    });

    if (!provider || typeof provider.startSession !== 'function' || typeof provider.stopSession !== 'function') {
      throw new TypeError('Live-caption offscreen shell requires a valid streaming provider implementation');
    }

    return provider;
  }

  _normalizeRequest(message, sender, action) {
    const request = normalizeLiveCaptionRuntimeRequest(message, {
      action,
      senderTabId: sender?.tab?.id ?? null,
      messageId: message?.messageId ?? null,
      timestamp: message?.timestamp ?? null
    });

    this.lastRequest = request;
    this.touch();

    logger.debug('Live-caption offscreen shell request normalized', {
      action,
      sessionId: request.data.sessionId,
      tabId: request.data.tabId,
      videoFingerprint: request.data.videoFingerprint
    });

    return request;
  }

  getSnapshot() {
    return {
      status: this.status,
      runtimeState: this.runtimeState,
      sessionId: this.sessionId,
      tabId: this.tabId,
      videoFingerprint: this.videoFingerprint,
      lastRequest: this.lastRequest ? { ...this.lastRequest } : null,
      lastResponse: this.lastResponse ? { ...this.lastResponse } : null,
      lastUpdatedAt: this.lastUpdatedAt,
      captureState: this.captureState
    };
  }

  _stopCapture() {
    this._clearSegmentTimer();
    this.segmentRotationPending = false;
    this.captureState = 'stopping';
    if (this.mediaRecorder) {
      try {
        if (this.mediaRecorder.state !== 'inactive') {
          this.mediaRecorder.stop();
        }
      } catch (e) {
        logger.warn('Error stopping MediaRecorder:', e);
      }
      this.mediaRecorder = null;
    }

    if (this.mediaStream) {
      try {
        this.mediaStream.getTracks().forEach((track) => track.stop());
      } catch (e) {
        logger.warn('Error stopping MediaStream tracks:', e);
      }
      this.mediaStream = null;
    }

    if (this.audioCtx) {
      try {
        this.audioCtx.close();
      } catch (e) {
        logger.warn('Error closing AudioContext:', e);
      }
      this.audioCtx = null;
    }

    if (this.audioSource) {
      try {
        this.audioSource.disconnect();
      } catch (e) {
        logger.warn('Error disconnecting AudioSource:', e);
      }
      this.audioSource = null;
    }

    this.captureState = 'idle';
  }

  _clearSegmentTimer() {
    if (this.segmentBoundaryTimer) {
      clearTimeout(this.segmentBoundaryTimer);
      this.segmentBoundaryTimer = null;
    }
  }

  _scheduleSegmentBoundary() {
    this._clearSegmentTimer();

    if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording' || !Number.isFinite(this.chunkTimeslice) || this.chunkTimeslice <= 0) {
      return;
    }

    this.segmentBoundaryTimer = setTimeout(() => {
      this.segmentBoundaryTimer = null;

      if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording') {
        return;
      }

      this.segmentRotationPending = true;
      try {
        this.mediaRecorder.stop();
      } catch (error) {
        logger.warn('Error rotating MediaRecorder segment:', error);
        this.segmentRotationPending = false;
      }
    }, this.chunkTimeslice);
  }

  _emitFinalizedChunk(chunkPayload, { sessionId, tabId, videoFingerprint, chunkStartMs, chunkEndMs, mimeType }) {
    if (!chunkPayload || chunkPayload.size <= 0) {
      logger.debug('Skipping finalized chunk emission: empty payload', {
        sessionId,
        tabId,
        videoFingerprint,
        chunkStartMs,
        chunkEndMs
      });
      return;
    }

    if (!sessionId || !tabId || !videoFingerprint) {
      logger.debug('Skipping finalized chunk emission: session metadata is incomplete', {
        sessionId,
        tabId,
        videoFingerprint,
        chunkStartMs,
        chunkEndMs,
        sizeBytes: chunkPayload.size,
        mimeType
      });
      return;
    }

    if (chunkPayload.size < MIN_FINALIZED_SEGMENT_BYTES) {
      logger.debug('Skipping finalized chunk emission: payload below minimum size', {
        sessionId,
        tabId,
        videoFingerprint,
        chunkStartMs,
        chunkEndMs,
        sizeBytes: chunkPayload.size,
        mimeType
      });
      return;
    }

    logger.info('MediaRecorder finalized segment ready', {
      sessionId,
      tabId,
      videoFingerprint,
      chunkStartMs,
      chunkEndMs,
      sizeBytes: chunkPayload.size,
      mimeType
    });

    if (!chrome?.runtime?.sendMessage) {
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Payload = reader.result;
      chrome.runtime.sendMessage({
        action: 'live-caption/offscreen/finalized-chunk',
        target: 'background',
        source: 'offscreen',
        sessionId,
        tabId,
        videoFingerprint,
        chunkStartMs,
        chunkEndMs,
        mimeType: chunkPayload.type || mimeType,
        sizeBytes: chunkPayload.size,
        payloadKind: 'base64',
        chunkPayload: base64Payload
      }).catch((err) => {
        logger.error('Failed to send finalized chunk to background:', err);
      });
    };
    reader.onerror = () => {
      logger.error('Failed to serialize finalized chunk payload', {
        sessionId,
        tabId,
        videoFingerprint,
        chunkStartMs,
        chunkEndMs,
        sizeBytes: chunkPayload.size,
        mimeType
      });
    };
    reader.readAsDataURL(chunkPayload);
  }

  _handleMediaRecorderStop() {
    const sessionId = this.sessionId;
    const tabId = this.tabId;
    const videoFingerprint = this.videoFingerprint;
    const chunkStartMs = this.chunkStartMs;
    const chunkEndMs = chunkStartMs + this.chunkTimeslice;
    const mimeType = this.activeRecorderMimeType || this.mediaRecorder?.mimeType || 'audio/webm';
    const bufferedChunks = Array.isArray(this.segmentChunks) ? this.segmentChunks.slice() : [];
    const shouldRestart = this.segmentRotationPending && this.captureState === 'capturing' && Boolean(this.mediaStream);
    const shouldEmit = this.segmentRotationPending && this.captureState === 'capturing';

    this.segmentRotationPending = false;
    this.segmentChunks = [];
    this.mediaRecorder = null;

    if (!shouldEmit) {
      logger.debug('Skipping finalized MediaRecorder stop flush: not a segment rotation', {
        sessionId,
        tabId,
        videoFingerprint,
        chunkStartMs,
        chunkEndMs,
        captureState: this.captureState
      });
      if (shouldRestart && this.mediaStream && this.sessionId && this.tabId && this.videoFingerprint) {
        this._startMediaRecorder(this.mediaStream, mimeType);
      }
      return;
    }

    if (bufferedChunks.length > 0) {
      const finalizedBlob = new Blob(bufferedChunks, { type: mimeType });
      this._emitFinalizedChunk(finalizedBlob, {
        sessionId,
        tabId,
        videoFingerprint,
        chunkStartMs,
        chunkEndMs,
        mimeType: finalizedBlob.type || mimeType
      });
      this.chunkStartMs = chunkEndMs;
    } else {
      logger.debug('Empty finalized MediaRecorder segment ignored', {
        sessionId,
        tabId,
        videoFingerprint,
        chunkStartMs,
        chunkEndMs
      });
    }

    if (shouldRestart && this.mediaStream && this.sessionId && this.tabId && this.videoFingerprint) {
      this._startMediaRecorder(this.mediaStream, mimeType);
    }
  }

  _startMediaRecorder(stream, selectedMime) {
    const recorder = new MediaRecorder(stream, selectedMime ? { mimeType: selectedMime } : {});
    this.mediaRecorder = recorder;
    this.activeRecorderMimeType = recorder.mimeType || selectedMime || 'audio/webm';
    this.segmentChunks = [];

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.segmentChunks.push(event.data);
      }
    };

    recorder.onstop = () => {
      this._handleMediaRecorderStop();
    };

    recorder.onerror = (event) => {
      logger.error('MediaRecorder runtime error:', event.error);
      this._handleCaptureError(event.error || new Error('MediaRecorder runtime error'));
    };

    recorder.start();
    this._scheduleSegmentBoundary();
    this.captureState = 'capturing';
  }

  _handleCaptureError(error) {
    this._stopCapture();
    this.captureState = 'error';
    this._setState({
      status: LIVE_CAPTION_RUNTIME_SHELL_STATES.ERROR,
      runtimeState: LIVE_CAPTION_RUNTIME_STATES.ERROR
    });

    if (chrome?.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        action: 'live-caption/offscreen/capture-error',
        target: 'background',
        source: 'offscreen',
        sessionId: this.sessionId,
        tabId: this.tabId,
        videoFingerprint: this.videoFingerprint,
        error: {
          code: 'capture_runtime_error',
          message: error?.message || 'Capture runtime error',
          reason: 'error',
          details: error?.stack || null
        }
      }).catch((err) => {
        logger.error('Failed to send capture error to background:', err);
      });
    }
  }

  async handleRuntimeStart(message, sender) {
    try {
      const request = this._normalizeRequest(message, sender, LIVE_CAPTION_RUNTIME_ACTIONS.START);
      const sessionError = this._ensureConsistency(request, LIVE_CAPTION_RUNTIME_ACTIONS.START);
      if (sessionError) {
        return this._buildFailClosed(LIVE_CAPTION_RUNTIME_ACTIONS.START, sessionError, {
          sessionId: request.data.sessionId,
          tabId: request.data.tabId,
          videoFingerprint: request.data.videoFingerprint,
          reason: 'inconsistent_session'
        });
      }

      this._setSessionContext(request.data);
      this._setState({
        status: LIVE_CAPTION_RUNTIME_SHELL_STATES.STARTING,
        runtimeState: LIVE_CAPTION_RUNTIME_STATES.STARTING
      }, {
        action: LIVE_CAPTION_RUNTIME_ACTIONS.START,
        sessionId: request.data.sessionId,
        tabId: request.data.tabId
      });

      // Stop any existing capture/recorder
      this._stopCapture();

      // Configure timeslice
      this.chunkTimeslice = request.data.metadata?.chunkTimeslice ?? 3000;

      // Start actual capture
      const streamId = request.data.streamId;
      if (!streamId) {
        throw new Error('Capture stream ID is required to start live captioning');
      }

      this.captureState = 'starting';

      let stream;
      try {
        if (!navigator?.mediaDevices?.getUserMedia) {
          throw new Error('navigator.mediaDevices.getUserMedia is not available');
        }
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            mandatory: {
              chromeMediaSource: 'tab',
              chromeMediaSourceId: streamId
            }
          }
        });
      } catch (err) {
        logger.error('Failed to get media stream in offscreen:', err);
        throw new Error(`getUserMedia failed: ${err.message}`);
      }

      this.mediaStream = stream;

      // Route the captured stream to system speaker to unmute the tab for the user
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(audioCtx.destination);
        this.audioCtx = audioCtx;
        this.audioSource = source;
      } catch (err) {
        logger.warn('Failed to setup AudioContext loopback (tab may remain muted):', err);
      }

      // Initialize MediaRecorder
      try {
        const options = { mimeType: 'audio/webm;codecs=opus' };
        let selectedMime = options.mimeType;
        if (typeof MediaRecorder !== 'undefined') {
          if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            selectedMime = 'audio/webm';
          }
          if (!MediaRecorder.isTypeSupported(selectedMime)) {
            selectedMime = ''; // Let browser decide
          }

          this._startMediaRecorder(stream, selectedMime);
        } else {
          throw new Error('MediaRecorder is not supported in this environment');
        }
      } catch (err) {
        logger.error('Failed to setup MediaRecorder in offscreen:', err);
        throw new Error(`MediaRecorder setup failed: ${err.message}`);
      }

      this._setState({
        status: LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL,
        runtimeState: LIVE_CAPTION_RUNTIME_STATES.RUNNING
      }, {
        action: LIVE_CAPTION_RUNTIME_ACTIONS.START,
        sessionId: request.data.sessionId,
        tabId: request.data.tabId,
        videoFingerprint: request.data.videoFingerprint
      });

      const response = createLiveCaptionRuntimeShellResponse(LIVE_CAPTION_RUNTIME_ACTIONS.START, {
        sessionId: this.sessionId,
        tabId: this.tabId,
        videoFingerprint: this.videoFingerprint,
        requestId: request.messageId,
        status: LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL,
        runtimeState: LIVE_CAPTION_RUNTIME_STATES.RUNNING,
        message: 'Live-caption offscreen shell running'
      });

      this.lastResponse = response;
      logger.info('Live-caption offscreen shell start handled', {
        sessionId: this.sessionId,
        tabId: this.tabId,
        videoFingerprint: this.videoFingerprint,
        status: response.status
      });
      return response;
    } catch (error) {
      this._stopCapture();
      return this._buildFailClosed(LIVE_CAPTION_RUNTIME_ACTIONS.START, error, {
        sessionId: message?.data?.sessionId ?? null,
        tabId: message?.data?.tabId ?? null,
        videoFingerprint: message?.data?.videoFingerprint ?? null,
        code: LIVE_CAPTION_RUNTIME_ERROR_CODES.INVALID_PAYLOAD,
        reason: 'invalid_payload',
        runtimeState: LIVE_CAPTION_RUNTIME_STATES.ERROR,
        status: LIVE_CAPTION_RUNTIME_SHELL_STATES.ERROR
      });
    }
  }

  async handleStreamingStart(message) {
    try {
      const request = this._normalizeStreamingSessionRequest(message);
      const requestMatchesActive = this._matchesStreamingSession(request);

      if (this.streamingProvider && !requestMatchesActive) {
        const response = this._buildStreamingStaleResponse(
          LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.START_STREAMING_STT_SESSION,
          request
        );
        logger.debug('Ignoring stale streaming start request in offscreen shell', {
          sessionId: request.sessionId,
          tabId: request.tabId,
          videoFingerprint: request.videoFingerprint
        });
        return response;
      }

      if (this.streamingProvider && requestMatchesActive) {
        const response = createLiveCaptionRuntimeShellResponse(
          LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.START_STREAMING_STT_SESSION,
          {
            sessionId: request.sessionId,
            tabId: request.tabId,
            videoFingerprint: request.videoFingerprint,
            requestId: request.requestId,
            status: LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.OK,
            runtimeState: this.runtimeState,
            message: 'streaming_stt_active'
          }
        );

        this.lastResponse = response;
        this.touch();
        return response;
      }

      const provider = this._createStreamingProvider(request);
      this.streamingProvider = provider;
      this.streamingSessionContext = {
        ...request,
        state: 'starting',
        readyPayload: null,
        startedAt: null,
        stoppedAt: null
      };

      const startResult = await provider.startSession({
        sessionId: request.sessionId,
        tabId: request.tabId,
        videoFingerprint: request.videoFingerprint,
        sourceLanguage: request.sourceLanguage,
        targetLanguage: request.targetLanguage,
        providerOptions: request.providerOptions,
        metadata: request.metadata,
        requestId: request.requestId
      }, {
        providerOptions: request.providerOptions,
        metadata: request.metadata
      });

      this.streamingSessionContext = {
        ...this.streamingSessionContext,
        state: 'active',
        readyPayload: startResult?.readyPayload ?? null,
        startedAt: Date.now()
      };

      const response = createLiveCaptionRuntimeShellResponse(
        LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.START_STREAMING_STT_SESSION,
        {
          sessionId: request.sessionId,
          tabId: request.tabId,
          videoFingerprint: request.videoFingerprint,
          requestId: request.requestId,
          status: LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.OK,
          runtimeState: this.runtimeState,
          message: 'streaming_stt_active',
          details: {
            readyPayload: startResult?.readyPayload ?? null
          }
        }
      );

      this.lastResponse = response;
      this.touch();
      logger.info('Live-caption offscreen shell started streaming provider', {
        sessionId: request.sessionId,
        tabId: request.tabId,
        videoFingerprint: request.videoFingerprint,
        providerId: request.providerId
      });
      return response;
    } catch (error) {
      this._clearStreamingSessionContext();
      const normalizedCode = error?.code ?? 'streaming_provider_start_failed';
      return this._buildFailClosed(
        LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.START_STREAMING_STT_SESSION,
        error,
        {
          sessionId: message?.sessionId ?? null,
          tabId: message?.tabId ?? null,
          videoFingerprint: message?.videoFingerprint ?? null,
          code: normalizedCode,
          reason: normalizedCode === LIVE_CAPTION_RUNTIME_ERROR_CODES.INVALID_PAYLOAD
            ? 'invalid_payload'
            : 'provider_error',
          runtimeState: this.runtimeState,
          status: LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.FAIL_CLOSED
        }
      );
    }
  }

  async handleStreamingStop(message) {
    try {
      if (!this.streamingProvider) {
        this._clearStreamingSessionContext();
        const response = this._buildStreamingResponse(
          LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STOP_STREAMING_STT_SESSION,
          message,
          {
            status: LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.OK,
            runtimeState: this.runtimeState,
            responseMessage: 'streaming_stt_no_op'
          }
        );
        this.lastResponse = response;
        this.touch();
        return response;
      }

      const request = this._normalizeStreamingSessionRequest({
        ...message,
        providerMode: message?.providerMode ?? STT_PROVIDER_MODES.STREAMING,
        executionLocation: message?.executionLocation ?? STT_PROVIDER_EXECUTION_LOCATIONS.OFFSCREEN,
        providerId: message?.providerId ?? this.streamingSessionContext?.providerId ?? null
      });

      if (!this._matchesStreamingSession(request)) {
        const response = this._buildStreamingStaleResponse(
          LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STOP_STREAMING_STT_SESSION,
          request
        );
        logger.debug('Ignoring stale streaming stop request in offscreen shell', {
          sessionId: request.sessionId,
          tabId: request.tabId,
          videoFingerprint: request.videoFingerprint
        });
        return response;
      }

      const provider = this.streamingProvider;
      const stopResult = await provider.stopSession({
        reason: message?.reason ?? 'stop'
      });
      this.streamingSessionContext = {
        ...this.streamingSessionContext,
        state: 'closed',
        stoppedAt: Date.now()
      };
      this._clearStreamingSessionContext();

      const response = createLiveCaptionRuntimeShellResponse(
        LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STOP_STREAMING_STT_SESSION,
        {
          sessionId: request.sessionId,
          tabId: request.tabId,
          videoFingerprint: request.videoFingerprint,
          requestId: request.requestId,
          status: LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.OK,
          runtimeState: this.runtimeState,
          message: 'streaming_stt_closed',
          details: stopResult
        }
      );

      this.lastResponse = response;
      this.touch();
      logger.debug('Live-caption offscreen shell stopped streaming provider', {
        sessionId: request.sessionId,
        tabId: request.tabId,
        videoFingerprint: request.videoFingerprint
      });
      return response;
    } catch (error) {
      this._clearStreamingSessionContext();
      return this._buildFailClosed(
        LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STOP_STREAMING_STT_SESSION,
        error,
        {
          sessionId: message?.sessionId ?? null,
          tabId: message?.tabId ?? null,
          videoFingerprint: message?.videoFingerprint ?? null,
          code: LIVE_CAPTION_RUNTIME_ERROR_CODES.INVALID_PAYLOAD,
          reason: 'invalid_payload',
          runtimeState: this.runtimeState,
          status: LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.FAIL_CLOSED
        }
      );
    }
  }

  handleStreamingTranscriptEvent(message) {
    if (!this._matchesStreamingSession(message)) {
      const response = this._buildStreamingStaleResponse(
        LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_TRANSCRIPT_EVENT,
        message
      );
      logger.debug('Ignoring stale streaming transcript event request in offscreen shell', {
        sessionId: response.sessionId,
        tabId: response.tabId,
        videoFingerprint: response.videoFingerprint
      });
      return response;
    }

    const response = this._buildStreamingResponse(
      LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_TRANSCRIPT_EVENT,
      message,
      {
        status: LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.OK,
        runtimeState: this.runtimeState,
        responseMessage: 'streaming_stt_no_op'
      }
    );

    logger.debug('Live-caption offscreen shell ignored streaming transcript event', {
      sessionId: response.sessionId,
      tabId: response.tabId,
      videoFingerprint: response.videoFingerprint
    });
    return response;
  }

  handleStreamingStatus(message) {
    if (!this._matchesStreamingSession(message)) {
      const response = this._buildStreamingStaleResponse(
        LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_STATUS,
        message
      );
      logger.debug('Ignoring stale streaming status request in offscreen shell', {
        sessionId: response.sessionId,
        tabId: response.tabId,
        videoFingerprint: response.videoFingerprint
      });
      return response;
    }

    const response = this._buildStreamingResponse(
      LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_STATUS,
      message,
      {
        status: LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.OK,
        runtimeState: this.runtimeState,
        responseMessage: 'streaming_stt_no_op'
      }
    );

    logger.debug('Live-caption offscreen shell acknowledged streaming status request', {
      sessionId: response.sessionId,
      tabId: response.tabId,
      videoFingerprint: response.videoFingerprint,
      status: response.status
    });
    return response;
  }

  handleStreamingError(message) {
    if (!this._matchesStreamingSession(message)) {
      const response = this._buildStreamingStaleResponse(
        LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_ERROR,
        message
      );
      logger.debug('Ignoring stale streaming error request in offscreen shell', {
        sessionId: response.sessionId,
        tabId: response.tabId,
        videoFingerprint: response.videoFingerprint
      });
      return response;
    }

    const response = this._buildStreamingResponse(
      LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_ERROR,
      message,
      {
        status: LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.OK,
        runtimeState: this.runtimeState,
        responseMessage: 'streaming_stt_no_op'
      }
    );

    logger.debug('Live-caption offscreen shell acknowledged streaming error request', {
      sessionId: response.sessionId,
      tabId: response.tabId,
      videoFingerprint: response.videoFingerprint,
      status: response.status
    });
    return response;
  }

  handleRuntimeStatus(message, sender) {
    try {
      const request = this._normalizeRequest(message, sender, LIVE_CAPTION_RUNTIME_ACTIONS.STATUS);
      const sessionError = this._ensureConsistency(request, LIVE_CAPTION_RUNTIME_ACTIONS.STATUS);
      if (sessionError) {
        return this._buildFailClosed(LIVE_CAPTION_RUNTIME_ACTIONS.STATUS, sessionError, {
          sessionId: request.data.sessionId,
          tabId: request.data.tabId,
          videoFingerprint: request.data.videoFingerprint,
          reason: 'inconsistent_session'
        });
      }

      const response = createLiveCaptionRuntimeShellResponse(LIVE_CAPTION_RUNTIME_ACTIONS.STATUS, {
        sessionId: this.sessionId ?? request.data.sessionId,
        tabId: this.tabId ?? request.data.tabId,
        videoFingerprint: this.videoFingerprint ?? request.data.videoFingerprint,
        requestId: request.messageId,
        status: this.status,
        runtimeState: this.runtimeState,
        message: 'Live-caption offscreen shell status'
      });

      this.lastResponse = response;
      this._setState({
        status: this.status,
        runtimeState: this.runtimeState
      }, {
        action: LIVE_CAPTION_RUNTIME_ACTIONS.STATUS,
        sessionId: response.sessionId,
        tabId: response.tabId
      });

      logger.debug('Live-caption offscreen shell status handled', {
        sessionId: response.sessionId,
        tabId: response.tabId,
        status: response.status,
        runtimeState: response.runtimeState
      });

      return response;
    } catch (error) {
      return this._buildFailClosed(LIVE_CAPTION_RUNTIME_ACTIONS.STATUS, error, {
        sessionId: message?.data?.sessionId ?? null,
        tabId: message?.data?.tabId ?? null,
        videoFingerprint: message?.data?.videoFingerprint ?? null,
        code: LIVE_CAPTION_RUNTIME_ERROR_CODES.INVALID_PAYLOAD,
        reason: 'invalid_payload'
      });
    }
  }

  handleRuntimePause(message, sender) {
    try {
      const request = this._normalizeRequest(message, sender, LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE);
      const sessionError = this._ensureConsistency(request, LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE);
      if (sessionError) {
        return this._buildFailClosed(LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE, sessionError, {
          sessionId: request.data.sessionId,
          tabId: request.data.tabId,
          videoFingerprint: request.data.videoFingerprint,
          reason: 'inconsistent_session'
        });
      }

      if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
        try {
          this._clearSegmentTimer();
          this.segmentRotationPending = false;
          this.mediaRecorder.pause();
          this.captureState = 'paused';
        } catch (e) {
          logger.warn('Error pausing MediaRecorder:', e);
        }
      }

      this._setState({
        status: LIVE_CAPTION_RUNTIME_SHELL_STATES.PAUSED_SHELL,
        runtimeState: LIVE_CAPTION_RUNTIME_STATES.PAUSED
      }, {
        action: LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE,
        sessionId: request.data.sessionId,
        tabId: request.data.tabId
      });

      const response = createLiveCaptionRuntimeShellResponse(LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE, {
        sessionId: this.sessionId,
        tabId: this.tabId,
        videoFingerprint: this.videoFingerprint,
        requestId: request.messageId,
        status: LIVE_CAPTION_RUNTIME_SHELL_STATES.PAUSED_SHELL,
        runtimeState: LIVE_CAPTION_RUNTIME_STATES.PAUSED,
        message: 'Live-caption offscreen shell paused'
      });

      this.lastResponse = response;
      logger.info('Live-caption offscreen shell pause handled', {
        sessionId: this.sessionId,
        tabId: this.tabId,
        videoFingerprint: this.videoFingerprint,
        status: response.status
      });
      return response;
    } catch (error) {
      return this._buildFailClosed(LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE, error, {
        sessionId: message?.data?.sessionId ?? null,
        tabId: message?.data?.tabId ?? null,
        videoFingerprint: message?.data?.videoFingerprint ?? null,
        code: LIVE_CAPTION_RUNTIME_ERROR_CODES.INVALID_PAYLOAD,
        reason: 'invalid_payload'
      });
    }
  }

  handleRuntimeResume(message, sender) {
    try {
      const request = this._normalizeRequest(message, sender, LIVE_CAPTION_RUNTIME_ACTIONS.RESUME);
      const sessionError = this._ensureConsistency(request, LIVE_CAPTION_RUNTIME_ACTIONS.RESUME);
      if (sessionError) {
        return this._buildFailClosed(LIVE_CAPTION_RUNTIME_ACTIONS.RESUME, sessionError, {
          sessionId: request.data.sessionId,
          tabId: request.data.tabId,
          videoFingerprint: request.data.videoFingerprint,
          reason: 'inconsistent_session'
        });
      }

      if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
        try {
          this.mediaRecorder.resume();
          this._scheduleSegmentBoundary();
          this.captureState = 'capturing';
        } catch (e) {
          logger.warn('Error resuming MediaRecorder:', e);
        }
      }

      this._setState({
        status: LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL,
        runtimeState: LIVE_CAPTION_RUNTIME_STATES.RUNNING
      }, {
        action: LIVE_CAPTION_RUNTIME_ACTIONS.RESUME,
        sessionId: request.data.sessionId,
        tabId: request.data.tabId
      });

      const response = createLiveCaptionRuntimeShellResponse(LIVE_CAPTION_RUNTIME_ACTIONS.RESUME, {
        sessionId: this.sessionId,
        tabId: this.tabId,
        videoFingerprint: this.videoFingerprint,
        requestId: request.messageId,
        status: LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL,
        runtimeState: LIVE_CAPTION_RUNTIME_STATES.RUNNING,
        message: 'Live-caption offscreen shell resumed'
      });

      this.lastResponse = response;
      logger.info('Live-caption offscreen shell resume handled', {
        sessionId: this.sessionId,
        tabId: this.tabId,
        videoFingerprint: this.videoFingerprint,
        status: response.status
      });
      return response;
    } catch (error) {
      return this._buildFailClosed(LIVE_CAPTION_RUNTIME_ACTIONS.RESUME, error, {
        sessionId: message?.data?.sessionId ?? null,
        tabId: message?.data?.tabId ?? null,
        videoFingerprint: message?.data?.videoFingerprint ?? null,
        code: LIVE_CAPTION_RUNTIME_ERROR_CODES.INVALID_PAYLOAD,
        reason: 'invalid_payload'
      });
    }
  }

  handleRuntimeStop(message, sender) {
    try {
      const request = this._normalizeRequest(message, sender, LIVE_CAPTION_RUNTIME_ACTIONS.STOP);
      const sessionError = this._ensureConsistency(request, LIVE_CAPTION_RUNTIME_ACTIONS.STOP);
      if (sessionError) {
        return this._buildFailClosed(LIVE_CAPTION_RUNTIME_ACTIONS.STOP, sessionError, {
          sessionId: request.data.sessionId,
          tabId: request.data.tabId,
          videoFingerprint: request.data.videoFingerprint,
          reason: 'inconsistent_session'
        });
      }

      this._setState({
        status: LIVE_CAPTION_RUNTIME_SHELL_STATES.STOPPING,
        runtimeState: LIVE_CAPTION_RUNTIME_STATES.STOPPING
      }, {
        action: LIVE_CAPTION_RUNTIME_ACTIONS.STOP,
        sessionId: request.data.sessionId,
        tabId: request.data.tabId
      });

      this._stopCapture();
      this._clearSessionContext();
      this._setState({
        status: LIVE_CAPTION_RUNTIME_SHELL_STATES.IDLE,
        runtimeState: LIVE_CAPTION_RUNTIME_STATES.IDLE
      }, {
        action: LIVE_CAPTION_RUNTIME_ACTIONS.STOP
      });

      const response = createLiveCaptionRuntimeShellResponse(LIVE_CAPTION_RUNTIME_ACTIONS.STOP, {
        sessionId: request.data.sessionId,
        tabId: request.data.tabId,
        videoFingerprint: request.data.videoFingerprint,
        requestId: request.messageId,
        status: LIVE_CAPTION_RUNTIME_SHELL_STATES.IDLE,
        runtimeState: LIVE_CAPTION_RUNTIME_STATES.IDLE,
        message: 'Live-caption offscreen shell stopped'
      });

      this.lastResponse = response;
      logger.info('Live-caption offscreen shell stop handled', {
        sessionId: request.data.sessionId,
        tabId: request.data.tabId,
        videoFingerprint: request.data.videoFingerprint,
        status: response.status
      });
      return response;
    } catch (error) {
      this._stopCapture();
      return this._buildFailClosed(LIVE_CAPTION_RUNTIME_ACTIONS.STOP, error, {
        sessionId: message?.data?.sessionId ?? null,
        tabId: message?.data?.tabId ?? null,
        videoFingerprint: message?.data?.videoFingerprint ?? null,
        code: LIVE_CAPTION_RUNTIME_ERROR_CODES.INVALID_PAYLOAD,
        reason: 'invalid_payload'
      });
    }
  }

  async handleVideoChanged(message, sender) {
    try {
      const request = this._normalizeRequest(message, sender, LIVE_CAPTION_RUNTIME_ACTIONS.VIDEO_CHANGED);
      const sessionError = this._ensureConsistency(request, LIVE_CAPTION_RUNTIME_ACTIONS.VIDEO_CHANGED);
      if (sessionError) {
        return this._buildFailClosed(LIVE_CAPTION_RUNTIME_ACTIONS.VIDEO_CHANGED, sessionError, {
          sessionId: request.data.sessionId,
          tabId: request.data.tabId,
          videoFingerprint: request.data.videoFingerprint,
          reason: 'inconsistent_session'
        });
      }

      const oldFingerprint = this.videoFingerprint;
      const newFingerprint = request.data.videoFingerprint;

      logger.info('Offscreen shell retargeting video fingerprint', {
        sessionId: this.sessionId,
        tabId: this.tabId,
        oldFingerprint,
        newFingerprint
      });

      this._setSessionContext(request.data);

      const response = createLiveCaptionRuntimeShellResponse(LIVE_CAPTION_RUNTIME_ACTIONS.VIDEO_CHANGED, {
        status: this.status,
        runtimeState: this.runtimeState,
        sessionId: this.sessionId,
        tabId: this.tabId,
        videoFingerprint: this.videoFingerprint
      });

      this.lastResponse = response;
      this.touch();
      return response;
    } catch (error) {
      return this._buildFailClosed(LIVE_CAPTION_RUNTIME_ACTIONS.VIDEO_CHANGED, error, {
        sessionId: message?.data?.sessionId ?? this.sessionId,
        tabId: message?.data?.tabId ?? this.tabId,
        videoFingerprint: message?.data?.videoFingerprint ?? this.videoFingerprint,
        code: 'handoff_failed',
        reason: 'error'
      });
    }
  }

  handleMessage(message, sender) {
    const action = message?.action ?? message?.type ?? null;

    switch (action) {
      case LIVE_CAPTION_RUNTIME_ACTIONS.START:
        return this.handleRuntimeStart(message, sender);
      case LIVE_CAPTION_RUNTIME_ACTIONS.STATUS:
        return this.handleRuntimeStatus(message, sender);
      case LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE:
        return this.handleRuntimePause(message, sender);
      case LIVE_CAPTION_RUNTIME_ACTIONS.RESUME:
        return this.handleRuntimeResume(message, sender);
      case LIVE_CAPTION_RUNTIME_ACTIONS.STOP:
        return this.handleRuntimeStop(message, sender);
      case LIVE_CAPTION_RUNTIME_ACTIONS.VIDEO_CHANGED:
        return this.handleVideoChanged(message, sender);
      case LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.START_STREAMING_STT_SESSION:
        return this.handleStreamingStart(message, sender);
      case LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STOP_STREAMING_STT_SESSION:
        return this.handleStreamingStop(message, sender);
      case LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_TRANSCRIPT_EVENT:
        return this.handleStreamingTranscriptEvent(message, sender);
      case LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_STATUS:
        return this.handleStreamingStatus(message, sender);
      case LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_ERROR:
        return this.handleStreamingError(message, sender);
      default:
        return this._buildFailClosed(action, new TypeError(`Unknown live-caption offscreen runtime action: ${String(action)}`), {
          code: LIVE_CAPTION_RUNTIME_ERROR_CODES.UNKNOWN_ACTION,
          reason: 'unknown_action',
          status: LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.FAIL_CLOSED
        });
    }
  }
}

export {
  LIVE_CAPTION_RUNTIME_ACTIONS,
  LIVE_CAPTION_RUNTIME_ERROR_CODES,
  LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES,
  LIVE_CAPTION_RUNTIME_SHELL_STATES,
  createLiveCaptionRuntimeFailClosedResponse,
  createLiveCaptionRuntimeShellResponse,
  normalizeLiveCaptionRuntimeRequest
} from '@/features/live-caption/background/liveCaptionRuntimeContracts.js';

export { LIVE_CAPTION_RUNTIME_STATES } from '@/features/live-caption/constants/liveCaptionRuntimeStates.js';

export default LiveCaptionOffscreenRuntimeShell;
