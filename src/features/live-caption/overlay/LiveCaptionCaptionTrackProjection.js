const MAX_VISIBLE_CAPTION_SEGMENTS = 2;
const PROJECTED_TIMELINE_VISIBLE_LAG_MS = 1500;
const PROJECTED_TIMELINE_MIN_VISIBLE_MS = 2000;

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

function normalizeProjectionContext(context = null) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    return null;
  }

  return {
    sessionId: normalizeOptionalString(context.sessionId),
    videoFingerprint: normalizeOptionalString(context.videoFingerprint)
  };
}

function isFinalizedCaptionLine(line) {
  if (!line || typeof line !== 'object') {
    return false;
  }

  if (line.isFinal === false) {
    return false;
  }

  const text = line.translatedText || line.originalText || '';
  return text.trim().length > 0;
}

function isProjectedCaptionLineRenderable(line, currentTimeMs, context = null) {
  if (!line || typeof line !== 'object') {
    return false;
  }

  if (line.timelineProjectionStatus !== 'mapped') {
    return false;
  }

  const projectedMediaStartMs = toFiniteNumber(line.projectedMediaStartMs);
  const projectedMediaEndMs = toFiniteNumber(line.projectedMediaEndMs);
  const timelineProjectionAnchorId = normalizeOptionalString(line.timelineProjectionAnchorId);

  if (
    projectedMediaStartMs == null
    || projectedMediaEndMs == null
    || timelineProjectionAnchorId == null
    || projectedMediaEndMs < projectedMediaStartMs
  ) {
    return false;
  }

  const projectionContext = normalizeProjectionContext(context);
  if (projectionContext) {
    const lineSessionId = normalizeOptionalString(line.sessionId);
    const lineVideoFingerprint = normalizeOptionalString(line.videoFingerprint);

    if (!lineSessionId || !lineVideoFingerprint) {
      return false;
    }

    if (projectionContext.sessionId && lineSessionId !== projectionContext.sessionId) {
      return false;
    }

    if (projectionContext.videoFingerprint && lineVideoFingerprint !== projectionContext.videoFingerprint) {
      return false;
    }
  }

  return currentTimeMs >= projectedMediaStartMs
    && currentTimeMs <= Math.max(
      projectedMediaEndMs + PROJECTED_TIMELINE_VISIBLE_LAG_MS,
      projectedMediaStartMs + PROJECTED_TIMELINE_MIN_VISIBLE_MS
    );
}

export function selectFinalizedCaptionLines(captionLines, options = {}) {
  if (!Array.isArray(captionLines)) {
    return [];
  }

  const lines = captionLines.filter(isFinalizedCaptionLine);
  const maxVisibleCaptionSegments = Number.isFinite(Number(options.maxVisibleCaptionSegments))
    ? Number(options.maxVisibleCaptionSegments)
    : MAX_VISIBLE_CAPTION_SEGMENTS;

  return lines.slice(-maxVisibleCaptionSegments);
}

export function selectProjectedCaptionLines(captionLines, options = {}) {
  if (!Array.isArray(captionLines)) {
    return [];
  }

  if (options.enableProjectedTimelineRendering !== true) {
    return [];
  }

  if (options.mediaTimelineMappingStatus === 'invalid') {
    return [];
  }

  if (!options.videoElement) {
    return [];
  }

  const currentTimeMs = toFiniteNumber(options.currentTimeMs);
  if (currentTimeMs == null) {
    return [];
  }

  const maxVisibleCaptionSegments = Number.isFinite(Number(options.maxVisibleCaptionSegments))
    ? Number(options.maxVisibleCaptionSegments)
    : MAX_VISIBLE_CAPTION_SEGMENTS;

  const lines = captionLines.filter(isFinalizedCaptionLine);
  const renderedLines = lines.filter((line) => isProjectedCaptionLineRenderable(line, currentTimeMs, options.timelineProjectionContext));

  return renderedLines.slice(-maxVisibleCaptionSegments);
}

export default {
  selectFinalizedCaptionLines,
  selectProjectedCaptionLines
};
