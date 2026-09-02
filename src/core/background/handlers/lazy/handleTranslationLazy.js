import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { MessageFormat } from '@/shared/messaging/core/MessagingCore.js';

const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'handleTranslationLazy');

function importFailureResponse(safeMessage, error) {
  return {
    success: false,
    error: safeMessage,
    errorDetails: MessageFormat.serializeTranslationError(error, {
      message: safeMessage
    })
  };
}

export async function handleTranslateLazy(message, sender, sendResponse) {
    try {
        logger.info('Loading Translate handler');
        const { handleTranslate } = await import('@/features/translation/handlers/handleTranslate.js');
        logger.debug('Translate handler loaded successfully');
        return handleTranslate(message, sender, sendResponse);
    } catch (error) {
        logger.error('Failed to load Translate handler:', error);
        return importFailureResponse('Failed to load translation functionality', error);
    }
}

export async function handleTranslateTextLazy(message, sender, sendResponse) {
    try {
        logger.debug('Loading TranslateText handler');
        const { handleTranslateText } = await import('@/features/translation/handlers/handleTranslateText.js');
        logger.debug('TranslateText handler loaded successfully');
        return handleTranslateText(message, sender, sendResponse);
    } catch (error) {
        logger.error('Failed to load TranslateText handler:', error);
        const errorMessage = 'Failed to load text translation functionality';
        return importFailureResponse(errorMessage, error);
    }
}

export async function handleRevertTranslationLazy(message, sender, sendResponse) {
    try {
        logger.debug('Loading RevertTranslation handler');
        const { handleRevertTranslation } = await import('@/features/translation/handlers/handleRevertTranslation.js');
        logger.debug('RevertTranslation handler loaded successfully');
        return handleRevertTranslation(message, sender, sendResponse);
    } catch (error) {
        logger.error('Failed to load RevertTranslation handler:', error);
        return importFailureResponse('Failed to load revert translation functionality', error);
    }
}

export async function handleCancelTranslationLazy(message, sender, sendResponse) {
    try {
        logger.debug('Loading CancelTranslation handler');
        const { handleCancelTranslation } = await import('@/features/translation/handlers/handleCancelTranslation.js');
        logger.debug('CancelTranslation handler loaded successfully');
        return handleCancelTranslation(message, sender, sendResponse);
    } catch (error) {
        logger.error('Failed to load CancelTranslation handler:', error);
        return importFailureResponse('Failed to load cancel translation functionality', error);
    }
}

export async function handleCancelSessionLazy(message, sender, sendResponse) {
    try {
        logger.debug('Loading CancelSession handler');
        const { handleCancelSession } = await import('@/features/translation/handlers/handleCancelSession.js');
        logger.debug('CancelSession handler loaded successfully');
        return handleCancelSession(message, sender, sendResponse);
    } catch (error) {
        logger.error('Failed to load CancelSession handler:', error);
        return importFailureResponse('Failed to load cancel session functionality', error);
    }
}

export async function handleParentAcceptanceAckLazy(message, sender, sendResponse) {
    try {
        const { handleParentAcceptanceAck } = await import('@/features/translation/handlers/handleParentAcceptanceAck.js');
        return handleParentAcceptanceAck(message, sender, sendResponse);
    } catch (error) {
        logger.error('Failed to load parent acceptance ACK handler:', error);
        return { acknowledged: false, status: 'STALE' };
    }
}

export async function handleCheckTranslationStatusLazy(message, sender, sendResponse) {
    try {
        logger.debug('Loading CheckTranslationStatus handler');
        const { handleCheckTranslationStatus } = await import('@/features/translation/handlers/handleCheckTranslationStatus.js');
        logger.debug('CheckTranslationStatus handler loaded successfully');
        return handleCheckTranslationStatus(message, sender, sendResponse);
    } catch (error) {
        logger.error('Failed to load CheckTranslationStatus handler:', error);
        return importFailureResponse('Failed to load translation status check functionality', error);
    }
}

export async function handleBatchTranslateLazy(message, sender, sendResponse) {
    try {
        logger.info('Loading BatchTranslate handler');
        const { handleBatchTranslate } = await import('@/features/translation/handlers/handleBatchTranslate.js');
        logger.debug('BatchTranslate handler loaded successfully');
        return handleBatchTranslate(message, sender, sendResponse);
    } catch (error) {
        logger.error('Failed to load BatchTranslate handler:', error);
        return importFailureResponse('Failed to load batch translation functionality', error);
    }
}
