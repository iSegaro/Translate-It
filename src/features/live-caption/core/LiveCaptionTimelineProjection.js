function toFiniteNumber(value) {
  if (value == null || value === '') {
    return null;
  }

  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function normalizeOptionalString(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeOptionalSourceResetId(value) {
  if (value == null || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  return null;
}

function normalizeOptionalSourceTimelineType(value) {
  if (value == null || value === '') {
    return null;
  }

  const normalized = typeof value === 'string'
    ? value.trim().toLowerCase()
    : String(value).trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  return ['capture', 'provider', 'media', 'unknown'].includes(normalized) ? normalized : 'unknown';
}

function normalizeSequence(value) {
  const normalized = toFiniteNumber(value);
  return normalized == null ? null : normalized;
}

function normalizeOptionalPlaybackRate(value) {
  if (value == null || value === '') {
    return null;
  }

  const normalized = toFiniteNumber(value);
  if (normalized == null || normalized <= 0) {
    return null;
  }

  return normalized;
}

export function normalizeLiveCaptionTimelineAnchor(anchor) {
  if (!anchor || typeof anchor !== 'object' || Array.isArray(anchor)) {
    return null;
  }

  const anchorId = normalizeOptionalString(anchor.anchorId);
  const sourceMs = toFiniteNumber(anchor.sourceMs);
  const mediaMs = toFiniteNumber(anchor.mediaMs);
  const playbackRate = normalizeOptionalPlaybackRate(anchor.playbackRate);

  if (!anchorId || sourceMs == null || mediaMs == null || (anchor.playbackRate != null && playbackRate == null)) {
    return null;
  }

  return Object.freeze({
    anchorId,
    sessionId: normalizeOptionalString(anchor.sessionId),
    videoFingerprint: normalizeOptionalString(anchor.videoFingerprint),
    sourceClockId: normalizeOptionalString(anchor.sourceClockId),
    sourceResetId: normalizeOptionalSourceResetId(anchor.sourceResetId),
    sourceTimelineType: normalizeOptionalSourceTimelineType(anchor.sourceTimelineType),
    sourceMs,
    mediaMs,
    wallClockMs: toFiniteNumber(anchor.wallClockMs),
    playbackRate,
    reason: normalizeOptionalString(anchor.reason),
    sequence: normalizeSequence(anchor.sequence)
  });
}

function compareAnchorsByRecency(left, right) {
  if (left.sourceMs !== right.sourceMs) {
    return left.sourceMs - right.sourceMs;
  }

  const leftSequence = left.sequence ?? Number.NEGATIVE_INFINITY;
  const rightSequence = right.sequence ?? Number.NEGATIVE_INFINITY;
  if (leftSequence !== rightSequence) {
    return leftSequence - rightSequence;
  }

  const leftWallClockMs = left.wallClockMs ?? Number.NEGATIVE_INFINITY;
  const rightWallClockMs = right.wallClockMs ?? Number.NEGATIVE_INFINITY;
  if (leftWallClockMs !== rightWallClockMs) {
    return leftWallClockMs - rightWallClockMs;
  }

  return 0;
}

function isLiveCaptionTimelineAnchorMetadataCompatible(segment, anchor) {
  const normalizedSegment = segment && typeof segment === 'object' ? segment : null;
  const normalizedAnchor = normalizeLiveCaptionTimelineAnchor(anchor);

  if (!normalizedSegment || !normalizedAnchor) {
    return false;
  }

  const segmentSessionId = normalizeOptionalString(normalizedSegment.sessionId);
  if (segmentSessionId != null && normalizedAnchor.sessionId != null && segmentSessionId !== normalizedAnchor.sessionId) {
    return false;
  }

  const segmentVideoFingerprint = normalizeOptionalString(normalizedSegment.videoFingerprint);
  if (segmentVideoFingerprint != null && normalizedAnchor.videoFingerprint != null && segmentVideoFingerprint !== normalizedAnchor.videoFingerprint) {
    return false;
  }

  const segmentClockId = normalizeOptionalString(normalizedSegment.sourceClockId);
  if (segmentClockId != null && normalizedAnchor.sourceClockId != null && segmentClockId !== normalizedAnchor.sourceClockId) {
    return false;
  }

  const segmentResetId = normalizeOptionalSourceResetId(normalizedSegment.sourceResetId);
  if (segmentResetId != null && normalizedAnchor.sourceResetId != null && segmentResetId !== normalizedAnchor.sourceResetId) {
    return false;
  }

  const segmentTimelineType = normalizeOptionalSourceTimelineType(normalizedSegment.sourceTimelineType);
  if (segmentTimelineType != null && normalizedAnchor.sourceTimelineType != null && segmentTimelineType !== normalizedAnchor.sourceTimelineType) {
    return false;
  }

  return true;
}

export function isLiveCaptionTimelineAnchorCompatible(segment, anchor, options = {}) {
  const normalizedSegment = segment && typeof segment === 'object' ? segment : null;
  const normalizedAnchor = normalizeLiveCaptionTimelineAnchor(anchor);

  if (!normalizedSegment || !normalizedAnchor) {
    return false;
  }

  const segmentStartMs = toFiniteNumber(normalizedSegment.sourceStartMs);
  if (segmentStartMs == null) {
    return false;
  }

  if (normalizedAnchor.sourceMs > segmentStartMs) {
    return false;
  }

  if (!isLiveCaptionTimelineAnchorMetadataCompatible(normalizedSegment, normalizedAnchor)) {
    return false;
  }

  const playbackRate = normalizedAnchor.playbackRate ?? options.defaultPlaybackRate ?? 1;
  return Number.isFinite(playbackRate) && playbackRate > 0;
}

export function projectLiveCaptionSegmentToMediaTime(segment, anchors = [], options = {}) {
  const segmentStartMs = toFiniteNumber(segment?.sourceStartMs);
  const segmentEndMs = toFiniteNumber(segment?.sourceEndMs);

  if (segmentStartMs == null || segmentEndMs == null || segmentEndMs < segmentStartMs) {
    return Object.freeze({
      status: 'invalid',
      mediaStartMs: null,
      mediaEndMs: null,
      anchorId: null,
      reason: 'invalid_source_timestamps'
    });
  }

  const normalizedAnchors = Array.isArray(anchors)
    ? anchors
        .map((candidate) => normalizeLiveCaptionTimelineAnchor(candidate))
        .filter((candidate) => candidate != null)
        .sort(compareAnchorsByRecency)
    : [];

  const compatibleAnchors = normalizedAnchors.filter((anchor) => isLiveCaptionTimelineAnchorCompatible(segment, anchor, options));

  if (compatibleAnchors.length === 0) {
    return Object.freeze({
      status: 'unmapped',
      mediaStartMs: null,
      mediaEndMs: null,
      anchorId: null,
      reason: 'no_compatible_anchor'
    });
  }

  const selectedAnchor = compatibleAnchors[compatibleAnchors.length - 1];
  const newerCompatibleAnchor = normalizedAnchors.find((anchor) => (
    isLiveCaptionTimelineAnchorMetadataCompatible(segment, anchor) &&
    anchor.sourceMs > segmentStartMs &&
    anchor.sourceMs < segmentEndMs
  ));

  if (newerCompatibleAnchor) {
    return Object.freeze({
      status: 'boundary_crossing',
      mediaStartMs: null,
      mediaEndMs: null,
      anchorId: selectedAnchor.anchorId,
      reason: 'segment_crosses_anchor_boundary'
    });
  }

  const playbackRate = selectedAnchor.playbackRate ?? options.defaultPlaybackRate ?? 1;
  if (playbackRate <= 0) {
    return Object.freeze({
      status: 'invalid',
      mediaStartMs: null,
      mediaEndMs: null,
      anchorId: null,
      reason: 'invalid_playback_rate'
    });
  }

  const mediaStartMs = selectedAnchor.mediaMs + ((segmentStartMs - selectedAnchor.sourceMs) * playbackRate);
  const mediaEndMs = selectedAnchor.mediaMs + ((segmentEndMs - selectedAnchor.sourceMs) * playbackRate);

  return Object.freeze({
    status: 'mapped',
    mediaStartMs,
    mediaEndMs,
    anchorId: selectedAnchor.anchorId,
    reason: null
  });
}

export default {
  projectLiveCaptionSegmentToMediaTime,
  normalizeLiveCaptionTimelineAnchor,
  isLiveCaptionTimelineAnchorCompatible
};
