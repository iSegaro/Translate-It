import { LIVE_CAPTION_ACTIONS } from './constants/liveCaptionActions.js';
import { LIVE_CAPTION_SETTINGS_KEYS } from './constants/liveCaptionSettings.js';
import { LIVE_CAPTION_DEFAULTS } from './constants/liveCaptionDefaults.js';
import { LIVE_CAPTION_SESSION_STATES } from './constants/liveCaptionSessionStates.js';
import { useLiveCaptionStore } from './stores/liveCaption.js';
import {
  LIVE_CAPTION_CLEANUP_REASONS,
  createLiveCaptionErrorState,
  createLiveCaptionSessionId,
  createLiveCaptionSessionSnapshot,
  createVideoCaptionSessionSnapshot,
  ActiveVideoDetector,
  collectActiveVideoCandidates,
  rankActiveVideoCandidates,
  selectActiveVideoCandidate,
  VideoFingerprint,
  describeVideoFingerprint,
  createVideoFingerprint,
  LiveCaptionCacheKeys,
  createLiveCaptionVideoCacheKey,
  createLiveCaptionSegmentCacheKey,
  createLiveCaptionTranslatedSegmentCacheKey,
  PageLiveCaptionSession,
  VideoCaptionSession,
  LiveCaptionSessionManager
} from './core/index.js';
import { BaseSTTProvider } from './stt/BaseSTTProvider.js';
import { LiveCaptionCache } from './cache/LiveCaptionCache.js';
import { LiveCaptionTranscriptRepository } from './cache/LiveCaptionTranscriptRepository.js';
import { LiveCaptionTranslationRepository } from './cache/LiveCaptionTranslationRepository.js';
import {
  LiveCaptionBackgroundController,
  LiveCaptionOffscreenBridge,
  LIVE_CAPTION_CAPTURE_STATES,
  LIVE_CAPTION_OFFSCREEN_ERROR_CODES,
  LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES,
  LiveCaptionCaptureCoordinator,
  createLiveCaptionStartCaptureRequest,
  createLiveCaptionStopCaptureRequest,
  createLiveCaptionStatusRequest,
  createLiveCaptionFinalizedChunkMessage,
  createLiveCaptionCaptureErrorMessage,
  createLiveCaptionOffscreenSnapshotResponse,
  createLiveCaptionFailClosedResponse,
  normalizeLiveCaptionOffscreenResponse
} from './background/index.js';
import { LiveCaptionContentController } from './content/LiveCaptionContentController.js';

export { LIVE_CAPTION_ACTIONS } from './constants/liveCaptionActions.js';
export { LIVE_CAPTION_SETTINGS_KEYS } from './constants/liveCaptionSettings.js';
export { LIVE_CAPTION_DEFAULTS } from './constants/liveCaptionDefaults.js';
export { LIVE_CAPTION_SESSION_STATES } from './constants/liveCaptionSessionStates.js';
export { useLiveCaptionStore } from './stores/liveCaption.js';
export {
  LIVE_CAPTION_CLEANUP_REASONS,
  createLiveCaptionErrorState,
  createLiveCaptionSessionId,
  createLiveCaptionSessionSnapshot,
  createVideoCaptionSessionSnapshot,
  ActiveVideoDetector,
  collectActiveVideoCandidates,
  rankActiveVideoCandidates,
  selectActiveVideoCandidate,
  VideoFingerprint,
  describeVideoFingerprint,
  createVideoFingerprint,
  LiveCaptionCacheKeys,
  createLiveCaptionVideoCacheKey,
  createLiveCaptionSegmentCacheKey,
  createLiveCaptionTranslatedSegmentCacheKey,
  PageLiveCaptionSession,
  VideoCaptionSession,
  LiveCaptionSessionManager
} from './core/index.js';
export { BaseSTTProvider } from './stt/BaseSTTProvider.js';
export { LiveCaptionCache } from './cache/LiveCaptionCache.js';
export { LiveCaptionTranscriptRepository } from './cache/LiveCaptionTranscriptRepository.js';
export { LiveCaptionTranslationRepository } from './cache/LiveCaptionTranslationRepository.js';
export {
  LiveCaptionBackgroundController,
  LiveCaptionOffscreenBridge,
  LIVE_CAPTION_CAPTURE_STATES,
  LIVE_CAPTION_OFFSCREEN_ERROR_CODES,
  LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES,
  LiveCaptionCaptureCoordinator,
  createLiveCaptionStartCaptureRequest,
  createLiveCaptionStopCaptureRequest,
  createLiveCaptionStatusRequest,
  createLiveCaptionFinalizedChunkMessage,
  createLiveCaptionCaptureErrorMessage,
  createLiveCaptionOffscreenSnapshotResponse,
  createLiveCaptionFailClosedResponse,
  normalizeLiveCaptionOffscreenResponse
} from './background/index.js';
export { LiveCaptionContentController } from './content/LiveCaptionContentController.js';

export const LiveCaptionFeature = Object.freeze({
  actions: LIVE_CAPTION_ACTIONS,
  settings: LIVE_CAPTION_SETTINGS_KEYS,
  defaults: LIVE_CAPTION_DEFAULTS,
  states: LIVE_CAPTION_SESSION_STATES,
  cleanupReasons: LIVE_CAPTION_CLEANUP_REASONS,
  store: useLiveCaptionStore,
  contracts: {
    createLiveCaptionErrorState,
    createLiveCaptionSessionId,
    createLiveCaptionSessionSnapshot,
    createVideoCaptionSessionSnapshot,
    ActiveVideoDetector,
    collectActiveVideoCandidates,
    rankActiveVideoCandidates,
    selectActiveVideoCandidate,
    VideoFingerprint,
    describeVideoFingerprint,
    createVideoFingerprint,
    LiveCaptionCacheKeys,
    createLiveCaptionVideoCacheKey,
    createLiveCaptionSegmentCacheKey,
    createLiveCaptionTranslatedSegmentCacheKey,
    PageLiveCaptionSession,
    VideoCaptionSession,
    LiveCaptionSessionManager,
    BaseSTTProvider,
    LiveCaptionCache,
    LiveCaptionTranscriptRepository,
    LiveCaptionTranslationRepository,
    LiveCaptionBackgroundController,
    LiveCaptionOffscreenBridge,
    LIVE_CAPTION_CAPTURE_STATES,
    LIVE_CAPTION_OFFSCREEN_ERROR_CODES,
    LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES,
    LiveCaptionCaptureCoordinator,
    createLiveCaptionStartCaptureRequest,
    createLiveCaptionStopCaptureRequest,
    createLiveCaptionStatusRequest,
    createLiveCaptionFinalizedChunkMessage,
    createLiveCaptionCaptureErrorMessage,
    createLiveCaptionOffscreenSnapshotResponse,
    createLiveCaptionFailClosedResponse,
    normalizeLiveCaptionOffscreenResponse,
    LiveCaptionContentController
  }
});

export default LiveCaptionFeature;
