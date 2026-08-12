import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { unifiedTranslationService } from '@/core/services/translation/UnifiedTranslationService.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'handleParentAcceptanceAck');

export async function handleParentAcceptanceAck(message) {
  const data = message.data || {};
  const handle = unifiedTranslationService.conversationAcceptanceCoordinator.lookup(message.messageId);
  if (!handle) {
    logger.debug(`Ignoring parent acceptance ACK for unknown message: ${message.messageId}`);
    return { acknowledged: false, status: 'STALE' };
  }

  const status = data.accepted === false
    ? handle.rejectParent(data.parentId)
    : handle.acceptParent(data.parentId, data.cleanResult);
  return { acknowledged: status !== 'UNKNOWN_PARENT' && status !== 'STALE', status };
}
