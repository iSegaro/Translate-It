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

    if (!Array.isArray(translatedResults)) {
      logger.error('Invalid translatedResults format: expected array', translatedResults);
      return { validatedCues: originalCues, errors: [{ type: 'INVALID_FORMAT', message: 'Translation engine returned invalid data format.' }] };
    }

    if (originalCues.length !== translatedResults.length) {
      errors.push({
        type: 'COUNT_MISMATCH',
        message: `Expected ${originalCues.length} results, but got ${translatedResults.length}.`
      });
      // Fallback: we'll have to mark some as failed or try to align
    }

    originalCues.forEach((cue, idx) => {
      let rawTranslation = translatedResults[idx];

      // The pipeline attaches `isSkipped` to object results it could not resolve
      // (batch under-return). Detection is status-driven, never text-based, so
      // legitimate source-equal translations (e.g. "URL" -> "URL") stay valid.
      const isSkipped = !!(rawTranslation && typeof rawTranslation === 'object' && rawTranslation.isSkipped === true);

      // Handle both raw string results and object results { id, text }
      if (rawTranslation && typeof rawTranslation === 'object' && rawTranslation.text !== undefined) {
        rawTranslation = rawTranslation.text;
      }

      if (isSkipped || !rawTranslation || !String(rawTranslation).trim()) {
        cue.status = 'failed';
        cue.warnings.push(isSkipped
          ? 'Provider did not return a translation for this cue.'
          : 'No translation returned for this cue.');
        validatedCues.push(cue);
        return;
      }

      const cueTokens = tokenRegistry.get(cue.id);

      // 1. Check for missing tokens
      let candidate;
      if (cueTokens && cueTokens.size > 0) {
        const missing = subtitleTextProtector.getMissingTokens(rawTranslation, cueTokens);
        if (missing.length > 0) {
          cue.warnings.push(`Missing formatting tokens: ${missing.join(', ')}`);
          logger.warn(`Cue ${cue.id} is missing tokens:`, missing);

          cue.status = 'failed';
          cue.translatedText = '';
          validatedCues.push(cue);
          return;
        }

        // 2. Restore tokens
        candidate = subtitleTextProtector.restore(rawTranslation, cueTokens);
      } else {
        candidate = rawTranslation;
      }

      cue.translatedText = candidate;
      cue.status = 'translated';
      validatedCues.push(cue);
    });

    return { validatedCues, errors };
  }
}
