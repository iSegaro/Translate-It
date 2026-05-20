import { subtitleTextProtector } from '../formatting/SubtitleTextProtector.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.SUBTITLE, 'SubtitleValidationService');

/**
 * Subtitle Validation Service - Validates translation results and handles token restoration.
 */
export class SubtitleValidationService {
  /**
   * Validates a translated batch and restores tokens.
   * @param {Array} originalCues - Cues sent to the provider
   * @param {Array} translatedResults - Raw text results from the provider
   * @param {Map} tokenRegistry - Map of tokens for all cues in the batch
   * @returns {Object} { validatedCues, errors }
   */
  static validateAndRestore(originalCues, translatedResults, tokenRegistry) {
    const validatedCues = [];
    const errors = [];

    if (originalCues.length !== translatedResults.length) {
      errors.push({
        type: 'COUNT_MISMATCH',
        message: `Expected ${originalCues.length} results, but got ${translatedResults.length}.`
      });
      // Fallback: we'll have to mark some as failed or try to align
    }

    originalCues.forEach((cue, idx) => {
      const rawTranslation = translatedResults[idx];
      
      if (!rawTranslation) {
        cue.status = 'failed';
        cue.warnings.push('No translation returned for this cue.');
        validatedCues.push(cue);
        return;
      }

      const cueTokens = tokenRegistry.get(cue.id);
      
      // 1. Check for missing tokens
      if (cueTokens && cueTokens.size > 0) {
        const missing = subtitleTextProtector.getMissingTokens(rawTranslation, cueTokens);
        if (missing.length > 0) {
          cue.warnings.push(`Missing formatting tokens: ${missing.join(', ')}`);
          logger.warn(`Cue ${cue.id} is missing tokens:`, missing);
        }

        // 2. Restore tokens
        cue.translatedText = subtitleTextProtector.restore(rawTranslation, cueTokens);
      } else {
        cue.translatedText = rawTranslation;
      }

      cue.status = 'translated';
      validatedCues.push(cue);
    });

    return { validatedCues, errors };
  }
}
