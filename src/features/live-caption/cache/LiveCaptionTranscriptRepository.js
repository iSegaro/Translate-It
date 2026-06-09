import { createLiveCaptionNotImplementedError } from '../core/contracts.js';

/**
 * Placeholder transcript repository contract.
 */
export class LiveCaptionTranscriptRepository {
  constructor() {
    throw createLiveCaptionNotImplementedError('LiveCaptionTranscriptRepository');
  }
}

export default LiveCaptionTranscriptRepository;
