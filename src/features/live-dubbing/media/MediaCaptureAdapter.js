import { MEDIA_CAPTURE_ERRORS } from './mediaConstants.js';
import { createMediaCaptureFailure } from './mediaContracts.js';

/** Base capture contract for feature-local media source adapters. */
export class MediaCaptureAdapter {
  capture() {
    return createMediaCaptureFailure(MEDIA_CAPTURE_ERRORS.UNSUPPORTED);
  }
}
