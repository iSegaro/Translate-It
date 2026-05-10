// src/core/background/handlers/vue-integration/handleSyncOCRLanguages.js
// Handler for syncing OCR downloaded languages to content scripts

import { ocrCache } from '@/features/screen-capture/utils/ocrCache.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'SyncOCRLanguages');

/**
 * Handler for SYNC_OCR_DOWNLOADABLE_LANGUAGES message
 * Returns the list of downloaded OCR languages from IndexedDB
 * This allows content scripts to access the list without direct IndexedDB access
 */
export const handleSyncOCRLanguages = async () => {
  logger.debug('SYNC_OCR_DOWNLOADABLE_LANGUAGES received');

  try {
    // Get languages from IndexedDB cache
    const languages = await ocrCache.listCachedLanguages();

    return {
      success: true,
      languages
    };
  } catch (error) {
    logger.error('Failed to sync OCR languages:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

export default handleSyncOCRLanguages;
