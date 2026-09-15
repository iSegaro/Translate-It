import { MEDIA_CAPTURE_ERRORS, MEDIA_SOURCE_ERRORS } from './mediaConstants.js';

const sourceErrors = new Set(Object.values(MEDIA_SOURCE_ERRORS));
const captureErrors = new Set(Object.values(MEDIA_CAPTURE_ERRORS));

/** Create a scalar-only source failure with a canonical error code. */
export function createMediaSourceFailure(error) {
  return {
    success: false,
    error: sourceErrors.has(error) ? error : MEDIA_SOURCE_ERRORS.NOT_FOUND,
  };
}

/** Create a scalar-only capture failure with a canonical error code. */
export function createMediaCaptureFailure(error) {
  return {
    success: false,
    error: captureErrors.has(error) ? error : MEDIA_CAPTURE_ERRORS.EXCEPTION,
  };
}

export function isMediaSourceFailure(value) {
  return value?.success === false && sourceErrors.has(value.error);
}

export function isMediaCaptureFailure(value) {
  return value?.success === false && captureErrors.has(value.error);
}
