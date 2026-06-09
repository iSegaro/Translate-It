import { createLiveCaptionNotImplementedError } from '../core/contracts.js';

/**
 * Placeholder facade for live-caption caching.
 * Implemented in a later phase.
 */
export class LiveCaptionCache {
  constructor() {
    throw createLiveCaptionNotImplementedError('LiveCaptionCache');
  }
}

export default LiveCaptionCache;
