export const LIVE_CAPTION_CLEANUP_REASONS = Object.freeze({
  STOP: 'stop',
  TAB_CLOSED: 'tab_closed',
  NAVIGATION: 'navigation',
  VIDEO_CHANGED: 'video_changed',
  ERROR: 'error',
  PROVIDER_ERROR: 'provider_error',
  MANUAL: 'manual',
  RECOVERY_FAILURE: 'recovery_failure'
});

let liveCaptionSessionCounter = 0;

export function createLiveCaptionNotImplementedError(contractName) {
  const error = new Error(`${contractName} is not implemented yet`);
  error.code = 'LIVE_CAPTION_NOT_IMPLEMENTED';
  return error;
}

export function createLiveCaptionSessionId(scope = 'page', tabId = null) {
  liveCaptionSessionCounter += 1;

  const timestamp = Date.now().toString(36);
  const normalizedScope = String(scope || 'page');
  const normalizedTabId = tabId == null ? 'global' : String(tabId);
  const counter = liveCaptionSessionCounter.toString(36);

  return `live-caption:${normalizedScope}:${normalizedTabId}:${timestamp}:${counter}`;
}

export function createLiveCaptionErrorState(error, reason = LIVE_CAPTION_CLEANUP_REASONS.ERROR) {
  if (!error) {
    return null;
  }

  if (typeof error === 'string') {
    return {
      name: 'Error',
      message: error,
      code: null,
      reason,
      stack: null,
      at: Date.now()
    };
  }

  return {
    name: error.name || 'Error',
    message: error.message || String(error),
    code: error.code ?? null,
    reason,
    stack: error.stack || null,
    at: Date.now()
  };
}

export function createVideoCaptionSessionSnapshot(session) {
  if (!session) {
    return null;
  }

  return {
    sessionId: session.sessionId,
    tabId: session.tabId ?? null,
    videoFingerprint: session.videoFingerprint ?? null,
    lifecycleState: session.lifecycleState,
    chunkState: {
      activeChunkId: session.chunkState?.activeChunkId ?? null,
      chunkCount: session.chunkState?.chunks?.length ?? 0
    },
    transcriptSegments: Array.isArray(session.transcriptSegments)
      ? session.transcriptSegments.map((segment) => ({ ...segment }))
      : [],
    translatedCaptionSegments: Array.isArray(session.translatedCaptionSegments)
      ? session.translatedCaptionSegments.map((segment) => ({ ...segment }))
      : [],
    seekState: session.seekState ? { ...session.seekState } : null,
    lastError: session.lastError ? { ...session.lastError } : null,
    lastCleanupReason: session.lastCleanupReason ?? null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt
  };
}

export function createLiveCaptionSessionSnapshot(session) {
  if (!session) {
    return null;
  }

  const activeVideoSession = session.activeVideoSession || null;

  return {
    sessionId: session.sessionId,
    tabId: session.tabId,
    lifecycleState: session.lifecycleState,
    consentAccepted: session.consentAccepted,
    activeVideoSessionId: session.activeVideoSessionId ?? null,
    activeVideoFingerprint: session.activeVideoFingerprint ?? null,
    hasActiveVideoSession: Boolean(activeVideoSession),
    activeVideoSession: activeVideoSession ? createVideoCaptionSessionSnapshot(activeVideoSession) : null,
    lastError: session.lastError ? { ...session.lastError } : null,
    lastCleanupReason: session.lastCleanupReason ?? null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt
  };
}

export default {
  LIVE_CAPTION_CLEANUP_REASONS,
  createLiveCaptionNotImplementedError,
  createLiveCaptionSessionId,
  createLiveCaptionErrorState,
  createVideoCaptionSessionSnapshot,
  createLiveCaptionSessionSnapshot
};
