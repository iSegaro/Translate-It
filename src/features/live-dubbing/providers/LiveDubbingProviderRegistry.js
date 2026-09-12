import { LIVE_DUBBING_PROVIDER_ID } from '../constants.js';
import { GeminiLiveProviderAdapter } from './GeminiLiveProviderAdapter.js';

const PROVIDER_CONSTRUCTORS = Object.freeze({
  [LIVE_DUBBING_PROVIDER_ID]: GeminiLiveProviderAdapter,
});

/**
 * Creates the feature-local provider adapter selected by the background
 * descriptor. Unknown providers fail closed and never reach a constructor.
 */
export class LiveDubbingProviderRegistry {
  create(providerId, options = {}) {
    const Provider = PROVIDER_CONSTRUCTORS[providerId];
    return Provider ? new Provider(options) : null;
  }
}

export const liveDubbingProviderRegistry = new LiveDubbingProviderRegistry();
