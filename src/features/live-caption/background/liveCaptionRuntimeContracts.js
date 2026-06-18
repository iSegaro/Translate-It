import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { MessageContexts } from '@/shared/messaging/core/MessagingConstants.js';
import { MessageFormat } from '@/shared/messaging/core/MessagingCore.js';
import { LIVE_CAPTION_CLEANUP_REASONS, createLiveCaptionErrorState } from '../core/contracts.js';
import {
  LIVE_CAPTION_RUNTIME_STATES,
  normalizeLiveCaptionRuntimeState
} from '../constants/liveCaptionRuntimeStates.js';

export const LIVE_CAPTION_RUNTIME_ACTIONS = Object.freeze({
  START: MessageActions.LIVE_CAPTION_RUNTIME_START,
  STOP: MessageActions.LIVE_CAPTION_RUNTIME_STOP,
  STATUS: MessageActions.LIVE_CAPTION_RUNTIME_STATUS,
  PAUSE: MessageActions.LIVE_CAPTION_RUNTIME_PAUSE,
  RESUME: MessageActions.LIVE_CAPTION_RUNTIME_RESUME,
  VIDEO_CHANGED: MessageActions.LIVE_CAPTION_VIDEO_CHANGED
});

export const LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES = Object.freeze({
  OK: 'OK',
  START_NOT_IMPLEMENTED: 'START_NOT_IMPLEMENTED',
  STOP_NOT_IMPLEMENTED: 'STOP_NOT_IMPLEMENTED',
  STATUS_NOT_IMPLEMENTED: 'STATUS_NOT_IMPLEMENTED',
  PAUSE_NOT_IMPLEMENTED: 'PAUSE_NOT_IMPLEMENTED',
  RESUME_NOT_IMPLEMENTED: 'RESUME_NOT_IMPLEMENTED',
  OFFSCREEN_NOT_READY: 'OFFSCREEN_NOT_READY',
  CAPTURE_NOT_AVAILABLE: 'CAPTURE_NOT_AVAILABLE',
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  UNKNOWN_ACTION: 'UNKNOWN_ACTION',
  FAIL_CLOSED: 'FAIL_CLOSED',
  ERROR: 'ERROR'
});

export const LIVE_CAPTION_RUNTIME_ERROR_CODES = Object.freeze({
  INVALID_PAYLOAD: 'invalid_payload',
  UNKNOWN_ACTION: 'unknown_action',
  OFFSCREEN_NOT_READY: 'offscreen_not_ready',
  OFFSCREEN_UNAVAILABLE: 'offscreen_unavailable',
  CONTROLLER_UNAVAILABLE: 'controller_unavailable',
  INCONSISTENT_SESSION: 'inconsistent_session'
});

export const LIVE_CAPTION_RUNTIME_SHELL_STATES = Object.freeze({
  IDLE: 'idle',
  STARTING: 'starting',
  RUNNING_SHELL: 'running_shell',
  PAUSED_SHELL: 'paused_shell',
  STOPPING: 'stopping',
  ERROR: 'error'
});

const REQUEST_REQUIRED_FIELDS = Object.freeze({
  [LIVE_CAPTION_RUNTIME_ACTIONS.START]: ['tabId'],
  [LIVE_CAPTION_RUNTIME_ACTIONS.STOP]: ['tabId'],
  [LIVE_CAPTION_RUNTIME_ACTIONS.STATUS]: ['tabId'],
  [LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE]: ['tabId'],
  [LIVE_CAPTION_RUNTIME_ACTIONS.RESUME]: ['tabId'],
  [LIVE_CAPTION_RUNTIME_ACTIONS.VIDEO_CHANGED]: ['tabId', 'videoFingerprint']
});

function assertAction(action) {
  if (!Object.values(LIVE_CAPTION_RUNTIME_ACTIONS).includes(action)) {
    const error = new TypeError(`Unknown live-caption runtime action: ${action}`);
    error.code = LIVE_CAPTION_RUNTIME_ERROR_CODES.UNKNOWN_ACTION;
    throw error;
  }

  return action;
}

function assertRequiredFields(data, requiredFields, action) {
  for (const field of requiredFields) {
    if (data?.[field] === undefined || data?.[field] === null || data?.[field] === '') {
      const error = new TypeError(`Live-caption runtime ${action} requires ${field}`);
      error.code = LIVE_CAPTION_RUNTIME_ERROR_CODES.INVALID_PAYLOAD;
      error.field = field;
      throw error;
    }
  }
}

function normalizeRuntimeData(data = {}) {
  return {
    sessionId: data.sessionId ?? null,
    tabId: data.tabId ?? null,
    videoFingerprint: data.videoFingerprint ?? null,
    runtimeStatus: normalizeLiveCaptionRuntimeState(data.runtimeStatus ?? LIVE_CAPTION_RUNTIME_STATES.IDLE),
    activeSessionState: data.activeSessionState ?? null,
    activeVideoState: data.activeVideoState ? { ...data.activeVideoState } : null,
    reason: data.reason ?? null,
    notifyContent: data.notifyContent !== false,
    clearCache: Boolean(data.clearCache),
    requestSource: data.requestSource ?? 'content',
    metadata: data.metadata ? { ...data.metadata } : null,
    streamId: data.streamId ?? null,
    mediaAnchorMs: data.mediaAnchorMs ?? null
  };
}

export function normalizeLiveCaptionRuntimeRequest(message = {}, context = {}) {
  const action = assertAction(message?.action ?? context.action ?? null);
  const data = normalizeRuntimeData(message?.data ?? {});
  const senderTabId = context.senderTabId ?? message?.sender?.tab?.id ?? null;
  const normalizedTabId = data.tabId ?? senderTabId ?? null;
  const normalizedSessionId = data.sessionId ?? context.sessionId ?? null;

  assertRequiredFields(
    {
      tabId: normalizedTabId,
      sessionId: normalizedSessionId,
      videoFingerprint: data.videoFingerprint
    },
    REQUEST_REQUIRED_FIELDS[action],
    action
  );

  return Object.freeze({
    action,
    context: message?.context ?? MessageContexts.LIVE_CAPTION,
    messageId: message?.messageId ?? context.messageId ?? null,
    timestamp: message?.timestamp ?? context.timestamp ?? Date.now(),
    data: Object.freeze({
      ...data,
      tabId: normalizedTabId,
      sessionId: normalizedSessionId
    })
  });
}

function buildRuntimeResponse({
  action,
  status,
  sessionId = null,
  tabId = null,
  videoFingerprint = null,
  runtimeState = LIVE_CAPTION_RUNTIME_STATES.IDLE,
  offscreenStatus = LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.OFFSCREEN_NOT_READY,
  captureStatus = LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.CAPTURE_NOT_AVAILABLE,
  message = null,
  details = null,
  requestId = null,
  sessionSnapshot = null,
  captureSnapshot = null,
  offscreenSnapshot = null
} = {}) {
  return Object.freeze({
    success: true,
    ok: true,
    action,
    status,
    runtimeState: normalizeLiveCaptionRuntimeState(runtimeState),
    offscreenStatus,
    captureStatus,
    sessionId,
    tabId,
    videoFingerprint,
    requestId,
    message,
    details,
    sessionSnapshot: sessionSnapshot ? { ...sessionSnapshot } : null,
    captureSnapshot: captureSnapshot ? { ...captureSnapshot } : null,
    offscreenSnapshot: offscreenSnapshot ? { ...offscreenSnapshot } : null,
    timestamp: Date.now()
  });
}

function resolveRuntimeStateFromShellState(shellState) {
  switch (shellState) {
    case LIVE_CAPTION_RUNTIME_SHELL_STATES.STARTING:
      return LIVE_CAPTION_RUNTIME_STATES.STARTING;
    case LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL:
      return LIVE_CAPTION_RUNTIME_STATES.RUNNING;
    case LIVE_CAPTION_RUNTIME_SHELL_STATES.PAUSED_SHELL:
      return LIVE_CAPTION_RUNTIME_STATES.PAUSED;
    case LIVE_CAPTION_RUNTIME_SHELL_STATES.STOPPING:
      return LIVE_CAPTION_RUNTIME_STATES.STOPPING;
    case LIVE_CAPTION_RUNTIME_SHELL_STATES.ERROR:
      return LIVE_CAPTION_RUNTIME_STATES.ERROR;
    case LIVE_CAPTION_RUNTIME_SHELL_STATES.IDLE:
    default:
      return LIVE_CAPTION_RUNTIME_STATES.IDLE;
  }
}

export function createLiveCaptionRuntimeStartRequest(data = {}, messageId = null) {
  return MessageFormat.create(LIVE_CAPTION_RUNTIME_ACTIONS.START, data, MessageContexts.LIVE_CAPTION, messageId);
}

export function createLiveCaptionRuntimeStopRequest(data = {}, messageId = null) {
  return MessageFormat.create(LIVE_CAPTION_RUNTIME_ACTIONS.STOP, data, MessageContexts.LIVE_CAPTION, messageId);
}

export function createLiveCaptionRuntimeStatusRequest(data = {}, messageId = null) {
  return MessageFormat.create(LIVE_CAPTION_RUNTIME_ACTIONS.STATUS, data, MessageContexts.LIVE_CAPTION, messageId);
}

export function createLiveCaptionRuntimePauseRequest(data = {}, messageId = null) {
  return MessageFormat.create(LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE, data, MessageContexts.LIVE_CAPTION, messageId);
}

export function createLiveCaptionRuntimeResumeRequest(data = {}, messageId = null) {
  return MessageFormat.create(LIVE_CAPTION_RUNTIME_ACTIONS.RESUME, data, MessageContexts.LIVE_CAPTION, messageId);
}

export function createLiveCaptionRuntimeVideoChangedRequest(data = {}, messageId = null) {
  return MessageFormat.create(LIVE_CAPTION_RUNTIME_ACTIONS.VIDEO_CHANGED, data, MessageContexts.LIVE_CAPTION, messageId);
}

export function createLiveCaptionRuntimeSuccessResponse(options = {}) {
  return buildRuntimeResponse({
    ...options,
    status: options.status ?? LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.OK
  });
}

export function createLiveCaptionRuntimeShellResponse(action, options = {}) {
  const shellStatus = options.status ?? options.shellStatus ?? LIVE_CAPTION_RUNTIME_SHELL_STATES.IDLE;

  return buildRuntimeResponse({
    ...options,
    action,
    status: shellStatus,
    runtimeState: options.runtimeState ?? resolveRuntimeStateFromShellState(shellStatus),
    offscreenStatus: options.offscreenStatus ?? LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.OK,
    captureStatus: options.captureStatus ?? LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.CAPTURE_NOT_AVAILABLE
  });
}

export function createLiveCaptionRuntimeNotImplementedResponse(action, options = {}) {
  const actionStatus = {
    [LIVE_CAPTION_RUNTIME_ACTIONS.START]: LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.START_NOT_IMPLEMENTED,
    [LIVE_CAPTION_RUNTIME_ACTIONS.STOP]: LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.STOP_NOT_IMPLEMENTED,
    [LIVE_CAPTION_RUNTIME_ACTIONS.STATUS]: LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.STATUS_NOT_IMPLEMENTED,
    [LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE]: LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.PAUSE_NOT_IMPLEMENTED,
    [LIVE_CAPTION_RUNTIME_ACTIONS.RESUME]: LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.RESUME_NOT_IMPLEMENTED,
    [LIVE_CAPTION_RUNTIME_ACTIONS.VIDEO_CHANGED]: 'VIDEO_CHANGED_NOT_IMPLEMENTED'
  }[action] ?? LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.OK;

  return buildRuntimeResponse({
    ...options,
    action,
    status: actionStatus,
    message: options.message ?? 'Live-caption runtime shell only',
    offscreenStatus: options.offscreenStatus ?? LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.OFFSCREEN_NOT_READY,
    captureStatus: options.captureStatus ?? LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.CAPTURE_NOT_AVAILABLE
  });
}

export function createLiveCaptionRuntimeUnavailableResponse(action, options = {}) {
  return Object.freeze({
    success: false,
    ok: false,
    action,
    status: options.status ?? LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.OFFSCREEN_NOT_READY,
    error: {
      code: options.code ?? LIVE_CAPTION_RUNTIME_ERROR_CODES.OFFSCREEN_NOT_READY,
      message: options.message ?? 'Live-caption runtime offscreen bridge is not ready',
      reason: options.reason ?? LIVE_CAPTION_CLEANUP_REASONS.ERROR,
      sessionId: options.sessionId ?? null,
      tabId: options.tabId ?? null,
      videoFingerprint: options.videoFingerprint ?? null
    },
    runtimeState: normalizeLiveCaptionRuntimeState(options.runtimeState ?? LIVE_CAPTION_RUNTIME_STATES.ERROR),
    timestamp: Date.now()
  });
}

export function createLiveCaptionRuntimeFailClosedResponse(action, error, options = {}) {
  const normalizedError = createLiveCaptionErrorState(error || options.message || 'Live-caption runtime failed closed', options.reason ?? LIVE_CAPTION_CLEANUP_REASONS.ERROR);

  return Object.freeze({
    success: false,
    ok: false,
    action,
    status: options.status ?? LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.FAIL_CLOSED,
    runtimeState: normalizeLiveCaptionRuntimeState(options.runtimeState ?? LIVE_CAPTION_RUNTIME_STATES.ERROR),
    error: {
      ...normalizedError,
      code: normalizedError?.code ?? options.code ?? LIVE_CAPTION_RUNTIME_ERROR_CODES.INVALID_PAYLOAD,
      sessionId: options.sessionId ?? normalizedError?.sessionId ?? null,
      tabId: options.tabId ?? normalizedError?.tabId ?? null,
      videoFingerprint: options.videoFingerprint ?? normalizedError?.videoFingerprint ?? null
    },
    message: options.message ?? normalizedError?.message ?? 'Live-caption runtime failed closed',
    timestamp: Date.now()
  });
}

export function normalizeLiveCaptionRuntimeResponse(response, context = {}) {
  if (!response || typeof response !== 'object') {
    return createLiveCaptionRuntimeFailClosedResponse(context.action ?? null, new Error('Missing live-caption runtime response'), {
      code: LIVE_CAPTION_RUNTIME_ERROR_CODES.CONTROLLER_UNAVAILABLE,
      reason: LIVE_CAPTION_CLEANUP_REASONS.ERROR,
      sessionId: context.sessionId ?? null,
      tabId: context.tabId ?? null,
      videoFingerprint: context.videoFingerprint ?? null,
      status: LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.OFFSCREEN_NOT_READY,
      runtimeState: context.runtimeState ?? LIVE_CAPTION_RUNTIME_STATES.ERROR,
      message: 'Live-caption runtime response was not available'
    });
  }

  if (response.success === false || response.ok === false) {
    return createLiveCaptionRuntimeFailClosedResponse(context.action ?? response.action ?? null, response.error || response.message || 'Live-caption runtime failed', {
      code: response.error?.code ?? response.code ?? LIVE_CAPTION_RUNTIME_ERROR_CODES.INVALID_PAYLOAD,
      reason: response.error?.reason ?? response.reason ?? LIVE_CAPTION_CLEANUP_REASONS.ERROR,
      sessionId: response.sessionId ?? context.sessionId ?? null,
      tabId: response.tabId ?? context.tabId ?? null,
      videoFingerprint: response.videoFingerprint ?? context.videoFingerprint ?? null,
      status: response.status ?? LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.FAIL_CLOSED,
      runtimeState: response.runtimeState ?? context.runtimeState ?? LIVE_CAPTION_RUNTIME_STATES.ERROR,
      message: response.message ?? context.message ?? 'Live-caption runtime failed closed'
    });
  }

  return createLiveCaptionRuntimeSuccessResponse({
    action: response.action ?? context.action ?? null,
    status: response.status ?? LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.OK,
    runtimeState: response.runtimeState ?? context.runtimeState ?? LIVE_CAPTION_RUNTIME_STATES.IDLE,
    offscreenStatus: response.offscreenStatus ?? LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.OFFSCREEN_NOT_READY,
    captureStatus: response.captureStatus ?? LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.CAPTURE_NOT_AVAILABLE,
    sessionId: response.sessionId ?? context.sessionId ?? null,
    tabId: response.tabId ?? context.tabId ?? null,
    videoFingerprint: response.videoFingerprint ?? context.videoFingerprint ?? null,
    requestId: response.requestId ?? context.requestId ?? null,
    message: response.message ?? context.message ?? null,
    details: response.details ?? null,
    sessionSnapshot: response.sessionSnapshot ?? null,
    captureSnapshot: response.captureSnapshot ?? null,
    offscreenSnapshot: response.offscreenSnapshot ?? null
  });
}

export default {
  LIVE_CAPTION_RUNTIME_ACTIONS,
  LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES,
  LIVE_CAPTION_RUNTIME_ERROR_CODES,
  normalizeLiveCaptionRuntimeRequest,
  createLiveCaptionRuntimeStartRequest,
  createLiveCaptionRuntimeStopRequest,
  createLiveCaptionRuntimeStatusRequest,
  createLiveCaptionRuntimePauseRequest,
  createLiveCaptionRuntimeResumeRequest,
  createLiveCaptionRuntimeSuccessResponse,
  LIVE_CAPTION_RUNTIME_SHELL_STATES,
  createLiveCaptionRuntimeShellResponse,
  createLiveCaptionRuntimeNotImplementedResponse,
  createLiveCaptionRuntimeUnavailableResponse,
  createLiveCaptionRuntimeFailClosedResponse,
  normalizeLiveCaptionRuntimeResponse
};
