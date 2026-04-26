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
          sourceLang: detail.sourceLang || detail.sourceLanguage || 'auto',
          targetLang: detail.targetLang || detail.targetLanguage || 'en',
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
      logger.debug('PAGE_TRANSLATE_START received:', detail);
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
      logger.debug('PAGE_TRANSLATE_PROGRESS received:', detail);
      
      // If we are in a context with an aggregator (main frame), prioritize aggregated messages
      // to avoid UI "jumping" between iframe-specific and aggregated progress
      const isMainFrame = window.self === window.top;
      if (isMainFrame && !detail.isAggregated && mobileStore.pageTranslationData.status !== TRANSLATION_STATUS.IDLE) {
        return;
      }

      const translatedCount = detail.translatedCount || detail.translated || mobileStore.pageTranslationData.translatedCount;
      const totalCount = detail.totalCount || mobileStore.pageTranslationData.totalCount;

      // Use status from aggregator if available, otherwise calculate based on counts
      let finalStatus = detail.status || (translatedCount >= totalCount ? TRANSLATION_STATUS.COMPLETED : TRANSLATION_STATUS.TRANSLATING);

      // Map 'idle' status to COMPLETED for UI purposes (shows the badge/restore button)
      if (finalStatus === 'idle') {
        finalStatus = TRANSLATION_STATUS.COMPLETED;
      }

      mobileStore.setPageTranslation({
        translatedCount,
        totalCount,
        isTranslating: detail.isTranslating !== undefined ? detail.isTranslating : mobileStore.pageTranslationData.isTranslating,
        isAutoTranslating: detail.isAutoTranslating !== undefined ? detail.isAutoTranslating : mobileStore.pageTranslationData.isAutoTranslating,
        status: finalStatus
      });
    });

    tracker.addEventListener(pageEventBus, MessageActions.PAGE_TRANSLATE_IDLE, (detail) => {
      logger.debug('PAGE_TRANSLATE_IDLE received:', detail);

      const isMainFrame = window.self === window.top;
      if (isMainFrame && !detail.isAggregated) {
        return;
      }

      const translatedCount = detail.translatedCount || detail.translated || mobileStore.pageTranslationData.translatedCount;
      const totalCount = detail.totalCount || mobileStore.pageTranslationData.totalCount;

      // IDLE means visible content is done but more might be hidden - show as COMPLETED for UI
      mobileStore.setPageTranslation({
        translatedCount,
        totalCount,
        isTranslating: false,
        isAutoTranslating: detail.isAutoTranslating !== undefined ? detail.isAutoTranslating : mobileStore.pageTranslationData.isAutoTranslating,
        isTranslated: translatedCount > 0,
        status: TRANSLATION_STATUS.COMPLETED
      });
    });

    tracker.addEventListener(pageEventBus, MessageActions.PAGE_TRANSLATE_COMPLETE, (detail) => {
      // Skip empty/invalid completion messages - they might come from iframes or initialization
      // BUT: process if it is aggregated as it represents the whole page state
      if (!detail.isAggregated && (!detail || (detail.translatedCount === 0 && !detail.isTranslated && !mobileStore.pageTranslationData.isTranslating))) {
        logger.debug('Skipping empty PAGE_TRANSLATE_COMPLETE message:', detail);
        return;
      }

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
      logger.debug('PAGE_RESTORE_COMPLETE received, resetting page translation state');
      if (mobileStore.pageTranslationData.status !== TRANSLATION_STATUS.ERROR) {
        mobileStore.resetPageTranslation();
      }
    });

    tracker.addEventListener(pageEventBus, MessageActions.PAGE_AUTO_RESTORE_COMPLETE, (detail) => {
      const hasTranslations = detail.translatedCount > 0;
      const currentState = mobileStore.pageTranslationData;
      const isMainFrame = window.self === window.top;

      // Skip empty messages if we already have active/valid translation state
      // This prevents individual iframe messages from overwriting main frame translation data
      // BUT: Allow aggregated messages to pass through as they represent the whole page state
      // AND: Allow messages from the main frame as it is the authoritative source
      if (!detail.isAggregated && !isMainFrame && !hasTranslations && (currentState.isTranslated || currentState.isTranslating || currentState.isAutoTranslating)) {
        logger.debug('Skipping empty auto-restore message from iframe, keeping current state:', currentState);
        return;
      }

      const baseState = {
        isTranslating: false,
        isAutoTranslating: false,
        isTranslated: hasTranslations,
        status: hasTranslations ? TRANSLATION_STATUS.COMPLETED : TRANSLATION_STATUS.IDLE
      };

      if (hasTranslations) {
        mobileStore.setPageTranslation({
          ...baseState,
          translatedCount: detail.translatedCount,
          totalCount: detail.totalCount || detail.translatedCount
        });
      } else {
        mobileStore.setPageTranslation(baseState);
      }
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
