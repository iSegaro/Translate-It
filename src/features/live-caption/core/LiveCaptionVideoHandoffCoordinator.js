import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { LIVE_CAPTION_CLEANUP_REASONS, createLiveCaptionCleanupPlan } from './LiveCaptionCleanupCoordinator.js';

const logger = getScopedLogger(LOG_COMPONENTS.LIVE_CAPTION, 'LiveCaptionVideoHandoffCoordinator');

export const LIVE_CAPTION_VIDEO_HANDOFF_ACTIONS = Object.freeze({
  NO_OP: 'no_op',
  CLEANUP_OLD_VIDEO_SESSION: 'cleanup_old_video_session',
  CREATE_NEW_VIDEO_SESSION: 'create_new_video_session',
  REPLACE_ACTIVE_VIDEO: 'replace_active_video'
});

export const LIVE_CAPTION_VIDEO_HANDOFF_RESULT_STATUSES = Object.freeze({
  PLANNED: 'planned',
  NO_OP: 'no_op'
});

export const LIVE_CAPTION_VIDEO_HANDOFF_STEP_TYPES = Object.freeze({
  NO_OP: 'no_op',
  CLEANUP_OLD_VIDEO_SESSION: 'cleanup_old_video_session',
  CLEAR_OVERLAY_STATE: 'clear_overlay_state',
  PRESERVE_CACHE_IDENTITY: 'preserve_cache_identity',
  RESET_CACHE_IDENTITY: 'reset_cache_identity',
  CREATE_NEW_VIDEO_SESSION: 'create_new_video_session'
});

function resolveVideoSnapshot(videoLike = null, snapshotLike = null) {
  if (!videoLike && !snapshotLike) {
    return null;
  }

  const snapshot =
    snapshotLike
    ?? (videoLike && typeof videoLike.getCleanupSnapshot === 'function'
      ? videoLike.getCleanupSnapshot()
      : videoLike && typeof videoLike.getSnapshot === 'function'
        ? videoLike.getSnapshot()
        : videoLike && typeof videoLike.toSnapshot === 'function'
          ? videoLike.toSnapshot()
          : null);

  if (!videoLike && snapshot) {
    return {
      ...snapshot,
      videoFingerprint: snapshot.videoFingerprint ?? snapshot.activeVideoFingerprint ?? null
    };
  }

  if (typeof videoLike === 'string') {
    return {
      sessionId: null,
      tabId: null,
      videoFingerprint: videoLike,
      lifecycleState: null,
      snapshot: snapshot ?? null
    };
  }

  return {
    sessionId: videoLike?.sessionId ?? snapshot?.sessionId ?? null,
    tabId: videoLike?.tabId ?? snapshot?.tabId ?? null,
    videoFingerprint: videoLike?.videoFingerprint ?? videoLike?.activeVideoFingerprint ?? snapshot?.videoFingerprint ?? snapshot?.activeVideoFingerprint ?? null,
    lifecycleState: videoLike?.lifecycleState ?? snapshot?.lifecycleState ?? null,
    snapshot: snapshot ? { ...snapshot } : (videoLike ? { ...videoLike } : null)
  };
}

function areSameVideoTarget(currentTarget, nextTarget) {
  if (!currentTarget && !nextTarget) {
    return true;
  }

  if (!currentTarget || !nextTarget) {
    return false;
  }

  if (currentTarget.videoFingerprint && nextTarget.videoFingerprint) {
    return currentTarget.videoFingerprint === nextTarget.videoFingerprint;
  }

  if (currentTarget.sessionId && nextTarget.sessionId) {
    return currentTarget.sessionId === nextTarget.sessionId;
  }

  return false;
}

function createHandoffStep(type, overrides = {}) {
  return Object.freeze({
    type,
    ...overrides
  });
}

function buildCleanupPlan(currentTarget, reason, notifyContent) {
  if (!currentTarget) {
    return null;
  }

  return createLiveCaptionCleanupPlan({
    reason,
    sessionSnapshot: currentTarget.snapshot,
    tabId: currentTarget.tabId,
    videoFingerprint: currentTarget.videoFingerprint,
    clearCache: false,
    notifyContent
  });
}

export function createLiveCaptionVideoHandoffPlan({
  currentVideoSession = null,
  currentVideoSnapshot = null,
  nextVideoSession = null,
  nextVideoSnapshot = null,
  reason = LIVE_CAPTION_CLEANUP_REASONS.VIDEO_CHANGED
} = {}) {
  const currentTarget = resolveVideoSnapshot(currentVideoSession, currentVideoSnapshot);
  const nextTarget = resolveVideoSnapshot(nextVideoSession, nextVideoSnapshot);
  const sameVideo = areSameVideoTarget(currentTarget, nextTarget);
  const hasCurrentVideo = Boolean(currentTarget);
  const hasNextVideo = Boolean(nextTarget);

  let action = LIVE_CAPTION_VIDEO_HANDOFF_ACTIONS.NO_OP;
  let cleanupCurrentVideoSession = false;
  let createNextVideoSession = false;
  let preserveCacheIdentity = true;
  let clearOverlayState = false;
  let cleanupPlan = null;
  const steps = [];

  if (!sameVideo && hasCurrentVideo && hasNextVideo) {
    action = LIVE_CAPTION_VIDEO_HANDOFF_ACTIONS.REPLACE_ACTIVE_VIDEO;
    cleanupCurrentVideoSession = true;
    createNextVideoSession = true;
    preserveCacheIdentity = false;
    clearOverlayState = true;
    cleanupPlan = buildCleanupPlan(currentTarget, reason, false);
    steps.push(
      createHandoffStep(LIVE_CAPTION_VIDEO_HANDOFF_STEP_TYPES.CLEANUP_OLD_VIDEO_SESSION, {
        required: true,
        cleanupPlan,
        reason
      }),
      createHandoffStep(LIVE_CAPTION_VIDEO_HANDOFF_STEP_TYPES.CLEAR_OVERLAY_STATE, {
        required: true,
        reason
      }),
      createHandoffStep(LIVE_CAPTION_VIDEO_HANDOFF_STEP_TYPES.RESET_CACHE_IDENTITY, {
        required: true,
        reason
      }),
      createHandoffStep(LIVE_CAPTION_VIDEO_HANDOFF_STEP_TYPES.CREATE_NEW_VIDEO_SESSION, {
        required: true,
        nextVideoFingerprint: nextTarget.videoFingerprint,
        reason
      })
    );
  } else if (!sameVideo && hasCurrentVideo && !hasNextVideo) {
    action = LIVE_CAPTION_VIDEO_HANDOFF_ACTIONS.CLEANUP_OLD_VIDEO_SESSION;
    cleanupCurrentVideoSession = true;
    createNextVideoSession = false;
    preserveCacheIdentity = false;
    clearOverlayState = true;
    cleanupPlan = buildCleanupPlan(currentTarget, reason, true);
    steps.push(
      createHandoffStep(LIVE_CAPTION_VIDEO_HANDOFF_STEP_TYPES.CLEANUP_OLD_VIDEO_SESSION, {
        required: true,
        cleanupPlan,
        reason
      }),
      createHandoffStep(LIVE_CAPTION_VIDEO_HANDOFF_STEP_TYPES.CLEAR_OVERLAY_STATE, {
        required: true,
        reason
      }),
      createHandoffStep(LIVE_CAPTION_VIDEO_HANDOFF_STEP_TYPES.RESET_CACHE_IDENTITY, {
        required: true,
        reason
      })
    );
  } else if (!sameVideo && !hasCurrentVideo && hasNextVideo) {
    action = LIVE_CAPTION_VIDEO_HANDOFF_ACTIONS.CREATE_NEW_VIDEO_SESSION;
    cleanupCurrentVideoSession = false;
    createNextVideoSession = true;
    preserveCacheIdentity = true;
    clearOverlayState = true;
    steps.push(
      createHandoffStep(LIVE_CAPTION_VIDEO_HANDOFF_STEP_TYPES.PRESERVE_CACHE_IDENTITY, {
        required: true,
        reason
      }),
      createHandoffStep(LIVE_CAPTION_VIDEO_HANDOFF_STEP_TYPES.CLEAR_OVERLAY_STATE, {
        required: true,
        reason
      }),
      createHandoffStep(LIVE_CAPTION_VIDEO_HANDOFF_STEP_TYPES.CREATE_NEW_VIDEO_SESSION, {
        required: true,
        nextVideoFingerprint: nextTarget.videoFingerprint,
        reason
      })
    );
  } else {
    action = LIVE_CAPTION_VIDEO_HANDOFF_ACTIONS.NO_OP;
    preserveCacheIdentity = true;
    clearOverlayState = false;
    steps.push(
      createHandoffStep(LIVE_CAPTION_VIDEO_HANDOFF_STEP_TYPES.NO_OP, {
        required: true,
        reason
      }),
      createHandoffStep(LIVE_CAPTION_VIDEO_HANDOFF_STEP_TYPES.PRESERVE_CACHE_IDENTITY, {
        required: true,
        reason
      })
    );
  }

  return Object.freeze({
    reason,
    status: action === LIVE_CAPTION_VIDEO_HANDOFF_ACTIONS.NO_OP
      ? LIVE_CAPTION_VIDEO_HANDOFF_RESULT_STATUSES.NO_OP
      : LIVE_CAPTION_VIDEO_HANDOFF_RESULT_STATUSES.PLANNED,
    action,
    currentVideoSessionId: currentTarget?.sessionId ?? null,
    currentVideoFingerprint: currentTarget?.videoFingerprint ?? null,
    nextVideoSessionId: nextTarget?.sessionId ?? null,
    nextVideoFingerprint: nextTarget?.videoFingerprint ?? null,
    hasCurrentVideo,
    hasNextVideo,
    sameVideo,
    cleanupCurrentVideoSession,
    createNextVideoSession,
    preserveCacheIdentity,
    clearOverlayState,
    cleanupPlan,
    currentVideoSnapshot: currentTarget?.snapshot ?? null,
    nextVideoSnapshot: nextTarget?.snapshot ?? null,
    steps,
    createdAt: Date.now()
  });
}

export function createLiveCaptionVideoHandoffResult(context = {}) {
  const plan = createLiveCaptionVideoHandoffPlan(context);

  return Object.freeze({
    ...plan,
    resultStatus: plan.status,
    createdAt: Date.now()
  });
}

export class LiveCaptionVideoHandoffCoordinator {
  constructor() {
    this.createdAt = Date.now();

    logger.info('Live-caption video handoff coordinator created', {
      createdAt: this.createdAt
    });
  }

  createHandoffPlan(context = {}) {
    const plan = createLiveCaptionVideoHandoffPlan(context);

    logger.debug('Video handoff plan created', {
      action: plan.action,
      status: plan.status,
      currentVideoFingerprint: plan.currentVideoFingerprint,
      nextVideoFingerprint: plan.nextVideoFingerprint,
      cleanupCurrentVideoSession: plan.cleanupCurrentVideoSession,
      createNextVideoSession: plan.createNextVideoSession,
      preserveCacheIdentity: plan.preserveCacheIdentity,
      clearOverlayState: plan.clearOverlayState
    });

    return plan;
  }

  createHandoffResult(context = {}) {
    const result = createLiveCaptionVideoHandoffResult(context);

    logger.debug('Video handoff result created', {
      action: result.action,
      status: result.status,
      currentVideoFingerprint: result.currentVideoFingerprint,
      nextVideoFingerprint: result.nextVideoFingerprint,
      cleanupCurrentVideoSession: result.cleanupCurrentVideoSession,
      createNextVideoSession: result.createNextVideoSession,
      preserveCacheIdentity: result.preserveCacheIdentity,
      clearOverlayState: result.clearOverlayState
    });

    return result;
  }
}

export default LiveCaptionVideoHandoffCoordinator;
