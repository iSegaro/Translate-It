/**
 * Generic media-source and capture constants.
 *
 * These values are feature-local and intentionally contain no browser,
 * provider, host, or page-specific meaning beyond the media primitives.
 */
export const MEDIA_SOURCE_ERRORS = Object.freeze({
  NOT_FOUND: 'LIVE_DUBBING_MEDIA_SOURCE_NOT_FOUND',
  AMBIGUOUS: 'LIVE_DUBBING_MEDIA_SOURCE_AMBIGUOUS',
});

export const MEDIA_CAPTURE_ERRORS = Object.freeze({
  UNSUPPORTED: 'LIVE_DUBBING_MEDIA_CAPTURE_UNSUPPORTED',
  EXCEPTION: 'LIVE_DUBBING_MEDIA_CAPTURE_EXCEPTION',
  INVALID_STREAM: 'LIVE_DUBBING_MEDIA_CAPTURE_INVALID_STREAM',
  NO_AUDIO: 'LIVE_DUBBING_MEDIA_CAPTURE_NO_AUDIO',
});

export const MEDIA_ELEMENT_SELECTORS = Object.freeze(['video', 'audio']);

export const MEDIA_READY_STATES = Object.freeze({
  HAVE_CURRENT_DATA: 2,
});
