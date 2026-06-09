import { createLiveCaptionNotImplementedError } from '../core/contracts.js';

/**
 * Placeholder translation repository contract.
 */
export class LiveCaptionTranslationRepository {
  constructor() {
    throw createLiveCaptionNotImplementedError('LiveCaptionTranslationRepository');
  }
}

export default LiveCaptionTranslationRepository;
