import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { LIVE_CAPTION_SESSION_STATES } from '../constants/liveCaptionSessionStates.js';
import { LIVE_CAPTION_CLEANUP_REASONS, createVideoCaptionSessionSnapshot } from './contracts.js';

export const LIVE_CAPTION_CLEANUP_STEP_TYPES = Object.freeze({
  STOP_OFFSCREEN_CAPTURE: 'stop_offscreen_capture',
  CLEANUP_PAGE_SESSION: 'cleanup_page_session',
  CLEANUP_VIDEO_SESSION: 'cleanup_video_session',
  CLEAR_OVERLAY_STATE: 'clear_overlay_state',
  PRESERVE_OR_CLEAR_CAPTIONS: 'preserve_or_clear_captions',
  RELEASE_IN_MEMORY_STATE: 'release_in_memory_state',
  CLEAR_PER_VIDEO_CACHE: 'clear_per_video_cache',
  NOTIFY_CONTENT: 'notify_content'
});

export const LIVE_CAPTION_CLEANUP_RESULT_STATUSES = Object.freeze({
  PLANNED: 'planned',
  COMPLETED: 'completed',
  FAILED: 'failed',
  FAIL_CLOSED: 'fail_closed'
});

export const LIVE_CAPTION_CLEANUP_ERROR_CODES = Object.freeze({
  CLEANUP_FAILED: 'LIVE_CAPTION_CLEANUP_FAILED',
  RECOVERY_RECONCILIATION_FAILED: 'LIVE_CAPTION_RECOVERY_RECONCILIATION_FAILED',
  INVALID_CLEANUP_CONTEXT: 'LIVE_CAPTION_INVALID_CLEANUP_CONTEXT'
});

const logger = getScopedLogger(LOG_COMPONENTS.LIVE_CAPTION, 'LiveCaptionCleanupCoordinator');

function normalizeReason(reason) {
  const normalizedReason = reason ?? LIVE_CAPTION_CLEANUP_REASONS.STOP;

  if (Object.values(LIVE_CAPTION_CLEANUP_REASONS).includes(normalizedReason)) {
    return normalizedReason;
  }

  return LIVE_CAPTION_CLEANUP_REASONS.ERROR;
}

function describeCleanupSource(source) {
  if (!source) {
    return null;
  }

  if (typeof source === 'string') {
    return {
      name: 'Error',
      message: source,
      code: null,
      type: null,
      provider: null,
      stack: null
    };
  }

  return {
    name: source.name || 'Error',
    message: source.message || String(source),
    code: source.code ?? source.errorCode ?? null,
    type: source.type ?? source.kind ?? null,
    provider: source.provider ?? source.providerId ?? null,
    stack: source.stack || null
  };
}

function shouldPreserveCaptionsForReason(reason) {
  return reason === LIVE_CAPTION_CLEANUP_REASONS.STOP || reason === LIVE_CAPTION_CLEANUP_REASONS.PROVIDER_ERROR;
}

function getSessionStatusForReason(reason) {
  return reason === LIVE_CAPTION_CLEANUP_REASONS.PROVIDER_ERROR
    || reason === LIVE_CAPTION_CLEANUP_REASONS.RECOVERY_FAILURE
    || reason === LIVE_CAPTION_CLEANUP_REASONS.ERROR
    ? LIVE_CAPTION_SESSION_STATES.ERROR
    : LIVE_CAPTION_SESSION_STATES.IDLE;
}

function shouldClearCacheForReason(reason, explicitClearCache = false) {
  return explicitClearCache && reason !== LIVE_CAPTION_CLEANUP_REASONS.RECOVERY_FAILURE;
}

function normalizeCleanupResultStatus(status) {
  return Object.values(LIVE_CAPTION_CLEANUP_RESULT_STATUSES).includes(status) ? status : null;
}

function resolveCleanupResultStatus({ plan, status, error }) {
  const explicitStatus = normalizeCleanupResultStatus(status);

  if (error) {
    if (plan.reason === LIVE_CAPTION_CLEANUP_REASONS.RECOVERY_FAILURE || explicitStatus === LIVE_CAPTION_CLEANUP_RESULT_STATUSES.FAIL_CLOSED) {
      return LIVE_CAPTION_CLEANUP_RESULT_STATUSES.FAIL_CLOSED;
    }

    if (explicitStatus === LIVE_CAPTION_CLEANUP_RESULT_STATUSES.FAILED) {
      return LIVE_CAPTION_CLEANUP_RESULT_STATUSES.FAILED;
    }

    return LIVE_CAPTION_CLEANUP_RESULT_STATUSES.FAILED;
  }

  if (explicitStatus && explicitStatus !== LIVE_CAPTION_CLEANUP_RESULT_STATUSES.PLANNED) {
    return explicitStatus;
  }

  return plan.reason === LIVE_CAPTION_CLEANUP_REASONS.RECOVERY_FAILURE
    ? LIVE_CAPTION_CLEANUP_RESULT_STATUSES.FAIL_CLOSED
    : plan.reason === LIVE_CAPTION_CLEANUP_REASONS.PROVIDER_ERROR || plan.reason === LIVE_CAPTION_CLEANUP_REASONS.ERROR
      ? LIVE_CAPTION_CLEANUP_RESULT_STATUSES.FAILED
      : LIVE_CAPTION_CLEANUP_RESULT_STATUSES.COMPLETED;
}

function createCleanupStep(type, overrides = {}) {
  return Object.freeze({
    type,
    ...overrides
  });
}

function createCleanupSnapshot(sessionLike) {
  if (!sessionLike) {
    return null;
  }

  if (typeof sessionLike.toSnapshot === 'function') {
    return sessionLike.toSnapshot();
  }

  if (typeof sessionLike.getSnapshot === 'function') {
    return sessionLike.getSnapshot();
  }

  return { ...sessionLike };
}

export function normalizeLiveCaptionCleanupError(error, context = {}) {
  const source = describeCleanupSource(error);

  if (!source) {
    return null;
  }

  return Object.freeze({
    name: source.name,
    message: source.message,
    code: source.code ?? LIVE_CAPTION_CLEANUP_ERROR_CODES.CLEANUP_FAILED,
    type: source.type ?? null,
    provider: source.provider ?? null,
    stage: context.stage ?? error?.stage ?? null,
    reason: context.reason ?? error?.reason ?? null,
    cleanupReason: context.cleanupReason ?? context.reason ?? error?.cleanupReason ?? null,
    sessionId: context.sessionId ?? error?.sessionId ?? null,
    tabId: context.tabId ?? error?.tabId ?? null,
    videoFingerprint: context.videoFingerprint ?? error?.videoFingerprint ?? null,
    shouldStopCapture: Boolean(context.shouldStopCapture),
    notifyContent: context.notifyContent !== false,
    clearVolatileState: context.clearVolatileState !== false,
    stack: source.stack,
    at: Date.now()
  });
}

export function createLiveCaptionCleanupPlan({
  reason = LIVE_CAPTION_CLEANUP_REASONS.STOP,
  session = null,
  sessionSnapshot = null,
  tabId = null,
  videoFingerprint = null,
  clearCache = false,
  notifyContent = true
} = {}) {
  const normalizedReason = normalizeReason(reason);
  const resolvedSnapshot = createCleanupSnapshot(sessionSnapshot ?? session);
  const resolvedSessionId = resolvedSnapshot?.sessionId ?? session?.sessionId ?? null;
  const resolvedTabId = tabId ?? resolvedSnapshot?.tabId ?? session?.tabId ?? null;
  const resolvedVideoFingerprint =
    videoFingerprint ?? resolvedSnapshot?.activeVideoFingerprint ?? resolvedSnapshot?.videoFingerprint ?? null;
  const preserveCaptions = shouldPreserveCaptionsForReason(normalizedReason);
  const clearCacheRequested = shouldClearCacheForReason(normalizedReason, clearCache);
  const sessionStatus = getSessionStatusForReason(normalizedReason);

  const steps = [
    createCleanupStep(LIVE_CAPTION_CLEANUP_STEP_TYPES.STOP_OFFSCREEN_CAPTURE, {
      required: true,
      scope: 'offscreen',
      reason: normalizedReason
    }),
    createCleanupStep(LIVE_CAPTION_CLEANUP_STEP_TYPES.CLEANUP_PAGE_SESSION, {
      required: true,
      scope: 'page',
      reason: normalizedReason
    }),
    createCleanupStep(LIVE_CAPTION_CLEANUP_STEP_TYPES.CLEANUP_VIDEO_SESSION, {
      required: true,
      scope: 'video',
      reason: normalizedReason
    }),
    createCleanupStep(LIVE_CAPTION_CLEANUP_STEP_TYPES.CLEAR_OVERLAY_STATE, {
      required: true,
      scope: 'overlay',
      reason: normalizedReason
    }),
    createCleanupStep(LIVE_CAPTION_CLEANUP_STEP_TYPES.PRESERVE_OR_CLEAR_CAPTIONS, {
      required: true,
      scope: 'store',
      preserveCaptions,
      clearCaptions: !preserveCaptions,
      reason: normalizedReason
    }),
    createCleanupStep(LIVE_CAPTION_CLEANUP_STEP_TYPES.RELEASE_IN_MEMORY_STATE, {
      required: true,
      scope: 'runtime',
      reason: normalizedReason
    }),
    ...(clearCacheRequested
      ? [
          createCleanupStep(LIVE_CAPTION_CLEANUP_STEP_TYPES.CLEAR_PER_VIDEO_CACHE, {
            required: true,
            scope: 'cache',
            reason: normalizedReason
          })
        ]
      : []),
    ...(notifyContent
      ? [
          createCleanupStep(LIVE_CAPTION_CLEANUP_STEP_TYPES.NOTIFY_CONTENT, {
            required: true,
            scope: 'content',
            reason: normalizedReason
          })
        ]
      : [])
  ];

  return Object.freeze({
    reason: normalizedReason,
    status: LIVE_CAPTION_CLEANUP_RESULT_STATUSES.PLANNED,
    sessionId: resolvedSessionId,
    tabId: resolvedTabId,
    videoFingerprint: resolvedVideoFingerprint,
    preserveCaptions,
    clearCaptions: !preserveCaptions,
    clearCache: clearCacheRequested,
    notifyContent: Boolean(notifyContent),
    sessionStatus,
    steps,
    sessionSnapshot: resolvedSnapshot,
    createdAt: Date.now()
  });
}

export function createLiveCaptionCleanupResult({
  plan = null,
  reason = LIVE_CAPTION_CLEANUP_REASONS.STOP,
  status = null,
  session = null,
  sessionSnapshot = null,
  error = null,
  stage = 'cleanup',
  clearCache = false,
  notifyContent = true
} = {}) {
  const normalizedPlan = plan ?? createLiveCaptionCleanupPlan({
    reason,
    session,
    sessionSnapshot,
    clearCache,
    notifyContent
  });
  const resolvedStatus = resolveCleanupResultStatus({
    plan: normalizedPlan,
    status,
    error
  });
  const sessionStatus = getSessionStatusForReason(normalizedPlan.reason);
  const normalizedErrorSource = error ?? (resolvedStatus === LIVE_CAPTION_CLEANUP_RESULT_STATUSES.COMPLETED
    ? null
    : {
        code: LIVE_CAPTION_CLEANUP_ERROR_CODES.CLEANUP_FAILED,
        message: `Live-caption cleanup failed during ${normalizedPlan.reason}`,
        type: 'cleanup_failure'
      });
  const normalizedError = normalizedErrorSource ? normalizeLiveCaptionCleanupError(normalizedErrorSource, {
    stage,
    reason: normalizedPlan.reason,
    cleanupReason: normalizedPlan.reason,
    sessionId: normalizedPlan.sessionId,
    tabId: normalizedPlan.tabId,
    videoFingerprint: normalizedPlan.videoFingerprint,
    shouldStopCapture: true,
    notifyContent: normalizedPlan.notifyContent,
    clearVolatileState: true
  }) : null;

  return Object.freeze({
    reason: normalizedPlan.reason,
    status: resolvedStatus,
    sessionId: normalizedPlan.sessionId,
    tabId: normalizedPlan.tabId,
    videoFingerprint: normalizedPlan.videoFingerprint,
    preserveCaptions: normalizedPlan.preserveCaptions,
    clearCaptions: normalizedPlan.clearCaptions,
    clearCache: normalizedPlan.clearCache,
    notifyContent: normalizedPlan.notifyContent,
    sessionStatus,
    steps: normalizedPlan.steps,
    sessionSnapshot: normalizedPlan.sessionSnapshot,
    error: normalizedError,
    createdAt: Date.now()
  });
}

export function createLiveCaptionFailClosedCleanupResult({
  reason = LIVE_CAPTION_CLEANUP_REASONS.RECOVERY_FAILURE,
  session = null,
  sessionSnapshot = null,
  error = null,
  clearCache = false,
  notifyContent = true
} = {}) {
  const plan = createLiveCaptionCleanupPlan({
    reason,
    session,
    sessionSnapshot,
    clearCache,
    notifyContent
  });
  const normalizedErrorSource = error
    ? {
        ...error,
        code: error.code ?? LIVE_CAPTION_CLEANUP_ERROR_CODES.RECOVERY_RECONCILIATION_FAILED,
        type: error.type ?? 'recovery_failure'
      }
    : {
        code: LIVE_CAPTION_CLEANUP_ERROR_CODES.RECOVERY_RECONCILIATION_FAILED,
        message: 'Live-caption recovery reconciliation failed',
        type: 'recovery_failure'
      };
  const normalizedError = normalizeLiveCaptionCleanupError(normalizedErrorSource, {
    stage: 'recovery_reconciliation',
    reason,
    cleanupReason: reason,
    sessionId: plan.sessionId,
    tabId: plan.tabId,
    videoFingerprint: plan.videoFingerprint,
    shouldStopCapture: true,
    notifyContent: true,
    clearVolatileState: true
  });

  return Object.freeze({
    reason,
    status: LIVE_CAPTION_CLEANUP_RESULT_STATUSES.FAIL_CLOSED,
    sessionId: plan.sessionId,
    tabId: plan.tabId,
    videoFingerprint: plan.videoFingerprint,
    preserveCaptions: false,
    clearCaptions: true,
    clearCache: false,
    notifyContent: true,
    sessionStatus: LIVE_CAPTION_SESSION_STATES.ERROR,
    steps: plan.steps,
    sessionSnapshot: plan.sessionSnapshot,
    error: normalizedError,
    createdAt: Date.now()
  });
}

export class LiveCaptionCleanupCoordinator {
  constructor() {
    this.createdAt = Date.now();

    logger.info('Live-caption cleanup coordinator created', {
      createdAt: this.createdAt
    });
  }

  createCleanupPlan(context = {}) {
    const plan = createLiveCaptionCleanupPlan(context);

    logger.debug('Cleanup plan created', {
      reason: plan.reason,
      sessionId: plan.sessionId,
      tabId: plan.tabId,
      videoFingerprint: plan.videoFingerprint,
      clearCache: plan.clearCache,
      notifyContent: plan.notifyContent
    });

    return plan;
  }

  createCleanupResult(context = {}) {
    const result = createLiveCaptionCleanupResult(context);

    logger.debug('Cleanup result created', {
      reason: result.reason,
      status: result.status,
      sessionId: result.sessionId,
      tabId: result.tabId,
      videoFingerprint: result.videoFingerprint,
      clearCache: result.clearCache,
      notifyContent: result.notifyContent,
      hasError: Boolean(result.error)
    });

    return result;
  }

  createFailClosedCleanupResult(context = {}) {
    const result = createLiveCaptionFailClosedCleanupResult(context);

    logger.warn('Fail-closed cleanup result created', {
      reason: result.reason,
      status: result.status,
      sessionId: result.sessionId,
      tabId: result.tabId,
      videoFingerprint: result.videoFingerprint
    });

    return result;
  }

  normalizeError(error, context = {}) {
    return normalizeLiveCaptionCleanupError(error, context);
  }

  getSessionCleanupSnapshot(sessionLike) {
    return createCleanupSnapshot(sessionLike);
  }

  getVideoCleanupSnapshot(sessionLike) {
    return createVideoCaptionSessionSnapshot(sessionLike);
  }

  getCleanupSnapshot(sessionLike) {
    return createCleanupSnapshot(sessionLike);
  }
}

export {
  LIVE_CAPTION_CLEANUP_REASONS,
  createVideoCaptionSessionSnapshot,
  shouldPreserveCaptionsForReason
};

export default LiveCaptionCleanupCoordinator;
