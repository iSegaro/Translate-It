import { subtitleTranslationCoordinator } from '@/features/subtitle-translation/core/SubtitleTranslationCoordinator.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'handleSubtitleTranslation');

/**
 * Handler for subtitle translation messages.
 */
export async function handleSubtitleTranslation(message) {
  const { action, data } = message;

  switch (action) {
    case MessageActions.SUBTITLE_TRANSLATE:
      // coordinator.startJob is async but we don't await the whole job here
      // as it's a long running process that communicates via broadcasts.
      subtitleTranslationCoordinator.startJob(data);
      return { success: true, message: 'Subtitle job started' };

    case MessageActions.SUBTITLE_TRANSLATE_CANCEL:
      subtitleTranslationCoordinator.cancelJob(data.jobId);
      return { success: true, message: 'Subtitle job cancellation requested' };

    default:
      logger.warn(`Unknown action for subtitle handler: ${action}`);
      return { success: false, error: `Unknown action: ${action}` };
  }
}
