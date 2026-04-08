import { onMounted } from 'vue';
import { useErrorHandler } from '@/composables/shared/useErrorHandler.js';
import { deviceDetector } from '@/utils/browser/compatibility.js';
import { MOBILE_CONSTANTS, TRANSLATION_STATUS } from '@/shared/config/constants.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { WINDOWS_MANAGER_EVENTS } from '@/core/PageEventBus.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT_APP, 'useContentAppPageTranslation');

/**
 * Composable for managing page translation states and events in the ContentApp.
 * Synchronizes translation progress with the mobile store and UI components.
 * 
 * @param {Object} mobileStore - The mobile store instance
 * @param {Object} tracker - Resource tracker for event listeners
 * @returns {void}
 */
export function useContentAppPageTranslation(mobileStore, tracker) {
  const { getErrorForDisplay } = useErrorHandler();

  onMounted(() => {
    const pageEventBus = window.pageEventBus;
    if (!pageEventBus) return;

    // Mobile Sheet Visibility & Data Events
    tracker.addEventListener(pageEventBus, WINDOWS_MANAGER_EVENTS.SHOW_MOBILE_SHEET, (detail) => {
      logger.info('Received SHOW_MOBILE_SHEET event:', detail);
      
      if (detail.isOpen === false) {
        mobileStore.closeSheet();
        return;
      }

      if (detail.text !== undefined) {
        mobileStore.updateSelectionData({
          text: detail.text,
          translation: detail.translation || '',
          sourceLang: detail.sourceLang || 'auto',
          targetLang: detail.targetLang || 'en',
          isLoading: detail.isLoading || false,
          isError: detail.isError || false,
          error: detail.error || null
        });
      }

      mobileStore.openSheet(
        detail.view || MOBILE_CONSTANTS.VIEWS.SELECTION, 
        detail.state || MOBILE_CONSTANTS.SHEET_STATE.PEEK
      );
    });

    // Page Translation Life-cycle Events
    tracker.addEventListener(pageEventBus, MessageActions.PAGE_TRANSLATE_START, (detail) => {
      mobileStore.setPageTranslation({ 
        isTranslating: true, 
        isTranslated: false,
        isAutoTranslating: detail.isAutoTranslating || false,
        status: TRANSLATION_STATUS.TRANSLATING, 
        translatedCount: 0,
        totalCount: 0,
        errorMessage: null
      });

      if (deviceDetector.isMobile()) {
        logger.info('Mobile: Page translation started, switching view');
        mobileStore.setView(MOBILE_CONSTANTS.VIEWS.PAGE_TRANSLATION);
        mobileStore.setSheetState(MOBILE_CONSTANTS.SHEET_STATE.PEEK);
      }
    });

    tracker.addEventListener(pageEventBus, MessageActions.PAGE_TRANSLATE_PROGRESS, (detail) => {
      const translatedCount = detail.translatedCount || detail.translated || mobileStore.pageTranslationData.translatedCount;
      const totalCount = detail.totalCount || mobileStore.pageTranslationData.totalCount;
      const isDone = totalCount > 0 && translatedCount >= totalCount;

      mobileStore.setPageTranslation({
        translatedCount,
        totalCount,
        status: isDone ? TRANSLATION_STATUS.COMPLETED : TRANSLATION_STATUS.TRANSLATING
      });
    });

    tracker.addEventListener(pageEventBus, MessageActions.PAGE_TRANSLATE_COMPLETE, (detail) => {
      mobileStore.setPageTranslation({ 
        isTranslating: false, 
        isTranslated: true,
        isAutoTranslating: detail.isAutoTranslating !== undefined ? detail.isAutoTranslating : mobileStore.pageTranslationData.isAutoTranslating,
        status: TRANSLATION_STATUS.COMPLETED, 
        translatedCount: detail.translatedCount || mobileStore.pageTranslationData.translatedCount,
        totalCount: detail.totalCount || mobileStore.pageTranslationData.totalCount || detail.translatedCount
      });
    });

    tracker.addEventListener(pageEventBus, MessageActions.PAGE_TRANSLATE_ERROR, async (detail) => {
      const errorInfo = await getErrorForDisplay(detail.error || 'Translation failed', 'page-translation-content');
      mobileStore.setPageTranslation({ 
        isTranslating: false, 
        isTranslated: false, 
        isAutoTranslating: false, 
        status: TRANSLATION_STATUS.ERROR,
        errorMessage: errorInfo.message
      });
    });

    tracker.addEventListener(pageEventBus, MessageActions.PAGE_TRANSLATE_RESET_ERROR, () => {
      mobileStore.resetPageTranslation();
    });

    tracker.addEventListener(pageEventBus, MessageActions.PAGE_RESTORE_COMPLETE, () => {
      if (mobileStore.pageTranslationData.status !== TRANSLATION_STATUS.ERROR) {
        mobileStore.resetPageTranslation();
      }
    });

    tracker.addEventListener(pageEventBus, MessageActions.PAGE_AUTO_RESTORE_COMPLETE, (detail) => {
      const hasTranslations = detail.translatedCount > 0;
      mobileStore.setPageTranslation({ 
        isTranslating: false,
        isAutoTranslating: false,
        isTranslated: hasTranslations,
        status: hasTranslations ? TRANSLATION_STATUS.COMPLETED : TRANSLATION_STATUS.IDLE
      });
    });

    // Element Translation Sync
    tracker.addEventListener(pageEventBus, WINDOWS_MANAGER_EVENTS.ELEMENT_TRANSLATIONS_AVAILABLE, () => {
      logger.debug('Received ELEMENT_TRANSLATIONS_AVAILABLE event');
      mobileStore.setHasElementTranslations(true);
    });

    tracker.addEventListener(pageEventBus, WINDOWS_MANAGER_EVENTS.ELEMENT_TRANSLATIONS_CLEARED, () => {
      logger.debug('Received ELEMENT_TRANSLATIONS_CLEARED event');
      mobileStore.setHasElementTranslations(false);
    });
  });
}
