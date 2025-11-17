import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'handleTranslationLazy');

export async function handleTranslateLazy(message, sender, sendResponse) {
    try {
        logger.info('Loading Translate handler');
        const { handleTranslate } = await import('@/features/translation/handlers/handleTranslate.js');
        logger.debug('Translate handler loaded successfully');
        return handleTranslate(message, sender, sendResponse);
    } catch (error) {
        logger.error('Failed to load Translate handler:', error);
        return { success: false, error: 'Failed to load translation functionality' };
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
        return { success: false, error: 'Failed to load text translation functionality' };
    }
}

export async function handleTranslationResultLazy(message, sender, sendResponse) {
    try {
        logger.debug('Loading TranslationResult handler');
        const { handleTranslationResult } = await import('../translation/handleTranslationResult.js');
        logger.debug('TranslationResult handler loaded successfully');
        return handleTranslationResult(message, sender, sendResponse);
    } catch (error) {
        logger.error('Failed to load TranslationResult handler:', error);
        return { success: false, error: 'Failed to load translation result functionality' };
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
        return { success: false, error: 'Failed to load revert translation functionality' };
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
        return { success: false, error: 'Failed to load cancel translation functionality' };
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
        return { success: false, error: 'Failed to load translation status check functionality' };
    }
}
