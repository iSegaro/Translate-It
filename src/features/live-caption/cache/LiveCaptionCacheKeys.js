import {
  LiveCaptionCacheKeys as CoreLiveCaptionCacheKeys,
  createLiveCaptionVideoCacheKey,
  createLiveCaptionSegmentCacheKey,
  createLiveCaptionTranslatedSegmentCacheKey
} from '../core/LiveCaptionCacheKeys.js';

export function createLiveCaptionSessionCacheKey(tabId, videoFingerprint) {
  return createLiveCaptionVideoCacheKey(tabId, videoFingerprint);
}

export const LiveCaptionCacheKeys = Object.freeze({
  ...CoreLiveCaptionCacheKeys,
  createSessionKey: createLiveCaptionSessionCacheKey
});

export {
  createLiveCaptionVideoCacheKey,
  createLiveCaptionSegmentCacheKey,
  createLiveCaptionTranslatedSegmentCacheKey
};

export default LiveCaptionCacheKeys;
