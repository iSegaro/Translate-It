function normalizeKeyPart(value) {
  if (value === null || value === undefined) {
    return 'null';
  }

  return encodeURIComponent(String(value));
}

export function createLiveCaptionVideoCacheKey(tabId, videoFingerprint) {
  return `live-caption|tab:${normalizeKeyPart(tabId)}|video:${normalizeKeyPart(videoFingerprint)}`;
}

export function createLiveCaptionSegmentCacheKey({ tabId, videoFingerprint, segmentStartMs, segmentEndMs }) {
  return `${createLiveCaptionVideoCacheKey(tabId, videoFingerprint)}|segment:${normalizeKeyPart(segmentStartMs)}-${normalizeKeyPart(segmentEndMs)}`;
}

export function createLiveCaptionTranslatedSegmentCacheKey({
  tabId,
  videoFingerprint,
  segmentStartMs,
  segmentEndMs,
  targetLanguage,
  providerId
}) {
  return `${createLiveCaptionSegmentCacheKey({
    tabId,
    videoFingerprint,
    segmentStartMs,
    segmentEndMs
  })}|target:${normalizeKeyPart(targetLanguage)}|provider:${normalizeKeyPart(providerId)}`;
}

export const LiveCaptionCacheKeys = Object.freeze({
  createVideoKey: createLiveCaptionVideoCacheKey,
  createSegmentKey: createLiveCaptionSegmentCacheKey,
  createTranslatedSegmentKey: createLiveCaptionTranslatedSegmentCacheKey
});

export default LiveCaptionCacheKeys;
