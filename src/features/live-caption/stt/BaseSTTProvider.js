import { createLiveCaptionNotImplementedError } from '../core/contracts.js';

/**
 * Abstract base contract for live-caption speech-to-text providers.
 * This shell defines the interface only and does not implement transcription.
 */
export class BaseSTTProvider {
  constructor() {
    if (new.target === BaseSTTProvider) {
      throw createLiveCaptionNotImplementedError('BaseSTTProvider');
    }
  }

  async transcribeChunk() {
    throw createLiveCaptionNotImplementedError(`${this.constructor.name}.transcribeChunk`);
  }

  async getStatus() {
    throw createLiveCaptionNotImplementedError(`${this.constructor.name}.getStatus`);
  }

  async dispose() {
    throw createLiveCaptionNotImplementedError(`${this.constructor.name}.dispose`);
  }
}

export default BaseSTTProvider;
