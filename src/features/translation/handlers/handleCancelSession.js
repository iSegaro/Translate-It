import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { translationSessionManager } from '@/features/translation/core/TranslationSessionManager.js';
import { unifiedTranslationService } from '@/core/services/translation/UnifiedTranslationService.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'handleCancelSession');

/**
 * Handle session cancellation/cleanup
 */
export async function handleCancelSession(message) {
  const { sessionId } = message.data || {};
  
  if (sessionId) {
    logger.debug(`Cleaning up session: ${sessionId}`);
    translationSessionManager.clearSession(sessionId);
    unifiedTranslationService.clearPageSourceSession(sessionId);
    return { success: true };
  }
  
  return { success: false, error: 'No sessionId provided' };
}
