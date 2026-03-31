// usePageTranslation - Vue composable for page translation UI
// Provides reactive state and actions for whole page translation

import { ref, computed, onMounted, onUnmounted } from 'vue';
import { sendRegularMessage } from '@/shared/messaging/core/UnifiedMessaging.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { MessageContexts } from '@/shared/messaging/core/MessagingCore.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import browser from 'webextension-polyfill';

import { useTranslationStore } from '@/features/translation/stores/translation.js';

/**
 * Composable for page translation UI
 * @returns {Object} Page translation state and actions
 */
export function usePageTranslation() {
  const translationStore = useTranslationStore();
  
  // State
  const isTranslating = ref(false);
  const isTranslated = ref(false);
  const isAutoTranslating = ref(false); // Persistent state (NEW)
  const progress = ref(0);
  const translatedCount = ref(0);
  const totalNodes = ref(0);
  const message = ref('');
  const error = ref(null);

  // Event listeners
  let progressListener = null;
  let completeListener = null;
  let errorListener = null;
  let restoreCompleteListener = null;
  let autoRestoreCompleteListener = null; // Auto-restore event (NEW)
  let cancelledListener = null;

  /**
   * Fetch current translation status from the active tab
   */
  async function refreshStatus() {
    try {
      const result = await sendRegularMessage({
        action: MessageActions.PAGE_TRANSLATE_GET_STATUS,
        context: MessageContexts.PAGE_TRANSLATION_UI,
      });

      if (result && result.success) {
        isTranslated.value = result.isTranslated || false;
        isTranslating.value = result.isTranslating || false;
        isAutoTranslating.value = result.isAutoTranslating || false;
        
        // Update progress if available
        if (result.translatedCount !== undefined) {
          translatedCount.value = result.translatedCount;
        }
      } else {
        // Reset state if we can't get status (e.g. restricted page)
        isTranslated.value = false;
        isTranslating.value = false;
        isAutoTranslating.value = false;
      }
    } catch {
      // Content script might not be injected or ready
      isTranslated.value = false;
      isTranslating.value = false;
      isAutoTranslating.value = false;
    }
  }

  /**
   * Translate the current page
   * @param {Object} data Optional data to pass to the translation message (e.g. { isAuto: true })
   */
  async function translatePage(data = {}) {
    if (isTranslating.value) {
      return;
    }

    isTranslating.value = true;
    // Don't set isAutoTranslating here based on data.isAuto
    // Wait for manager response to confirm persistence state
    progress.value = 0;
    message.value = 'Starting translation...';
    error.value = null;

    try {
      // Determine synced provider if any
      const syncedProvider = translationStore.ephemeralSync.page && translationStore.selectedProvider
        ? translationStore.selectedProvider
        : null;

      const result = await sendRegularMessage({
        action: MessageActions.PAGE_TRANSLATE,
        data: { 
          ...data,
          provider: syncedProvider // اضافه کردن پرووایدرِ همگام‌سازی شده
        },
        context: MessageContexts.PAGE_TRANSLATION_UI,
      });

      if (result.success) {
        isTranslated.value = true;
        translatedCount.value = result.translatedCount || 0;
        totalNodes.value = result.totalNodes;
        // Only update if the result explicitly tells us the state
        if (result.isAutoTranslating !== undefined) {
          isAutoTranslating.value = !!result.isAutoTranslating;
        }
      } else {
        throw new Error(result.reason || 'Translation failed');
      }
    } catch (e) {
      // Only reset if it's a real failure, not just a state transition
      if (e.message !== 'silent_error') {
        error.value = e.message || 'Translation failed';
        isTranslated.value = false;
        isAutoTranslating.value = false;
      }
    } finally {
      isTranslating.value = false;
    }
  }

  /**
   * Restore original page content
   */
  async function restorePage() {
    // We don't set isTranslating = true here to avoid showing the loading spinner 
    // during the fast restoration process.
    isAutoTranslating.value = false;
    message.value = 'Restoring original content...';
    error.value = null;

    try {
      const result = await sendRegularMessage({
        action: MessageActions.PAGE_RESTORE,
        context: MessageContexts.PAGE_TRANSLATION_UI,
      });

      if (result.success) {
        isTranslated.value = false;
        isAutoTranslating.value = false;
        message.value = `Restored ${result.restoredCount} elements`;
        translatedCount.value = 0;
        totalNodes.value = 0;
        progress.value = 0;
      } else {
        throw new Error(result.reason || 'Restore failed');
      }
    } catch {
      error.value = 'Restore failed';
      message.value = 'Restore failed';
    }
  }

  /**
   * Stop auto-translation (persistence)
   */
  async function stopAutoTranslation() {
    try {
      const result = await sendRegularMessage({
        action: MessageActions.PAGE_TRANSLATE_STOP_AUTO,
        context: MessageContexts.PAGE_TRANSLATION_UI,
      });

      if (result.success) {
        isAutoTranslating.value = false;
        message.value = 'Auto-translation stopped';
      }
    } catch {
      isAutoTranslating.value = false;
    }
  }

  /**
   * Cancel ongoing translation
   */
  function cancelTranslation() {
    if (isTranslating.value) {
      sendRegularMessage({
        action: MessageActions.PAGE_TRANSLATE,
        data: { cancel: true },
        context: MessageContexts.PAGE_TRANSLATION_UI,
      });
      isTranslating.value = false;
      isAutoTranslating.value = false;
      message.value = 'Translation cancelled';
    }
  }

  /**
   * Update progress
   */
  function updateProgress(data) {
    if (data.progress !== undefined) {
      progress.value = data.progress;
    }
    if (data.translated !== undefined) {
      translatedCount.value = data.translated;
    }
    if (data.total !== undefined) {
      totalNodes.value = data.total;
    }
    if (data.message !== undefined) {
      message.value = data.message;
    }
  }

  /**
   * Handle translation complete
   */
  function handleComplete(data) {
    isTranslating.value = false;
    isTranslated.value = true;
    
    // Only update isAutoTranslating if it's explicitly provided in the message
    if (data && data.isAutoTranslating !== undefined) {
      isAutoTranslating.value = !!data.isAutoTranslating;
    }
    
    progress.value = 100;
    if (data.translatedCount !== undefined) translatedCount.value = data.translatedCount;
    if (data.totalNodes !== undefined) totalNodes.value = data.totalNodes;
  }

  /**
   * Handle translation error
   */
  function handleError(data) {
    isTranslating.value = false;
    isAutoTranslating.value = false;
    error.value = data.error;
    message.value = `Error: ${data.error?.message || data.error}`;
  }

  /**
   * Handle restore complete
   */
  function handleRestoreComplete(data) {
    isTranslating.value = false;
    isTranslated.value = false;
    isAutoTranslating.value = false;
    progress.value = 0;
    translatedCount.value = 0;
    totalNodes.value = 0;
    message.value = `Restore complete! ${data.restoredCount} elements restored`;
  }

  /**
   * Handle auto-restore complete (just stopped auto-translation)
   */
  function handleAutoRestoreComplete(data) {
    isAutoTranslating.value = false;
    isTranslating.value = false;
    
    // Determine if the page remains translated
    if (data && data.isTranslated !== undefined) {
      isTranslated.value = !!data.isTranslated;
    } else if (data && data.translatedCount !== undefined) {
      isTranslated.value = data.translatedCount > 0;
    }
    
    message.value = 'Auto-translation stopped';
  }

  /**
   * Handle translation cancelled
   */
  function handleCancelled() {
    isTranslating.value = false;
    isAutoTranslating.value = false;
    isTranslated.value = false; // Cancel usually implies restore
    message.value = 'Translation cancelled';
  }

  // Tab change handlers for Sidepanel sync
  const handleTabChange = () => {
    refreshStatus();
  };

  const handleTabUpdate = (tabId, changeInfo) => {
    if (changeInfo.status === 'complete') {
      refreshStatus();
    }
  };

  /**
   * Handle incoming messages from other extension components (broadcasting)
   */
  const handleRuntimeMessage = (message) => {
    if (!message || !message.action) return;

    // We only care about page translation events
    switch (message.action) {
      case MessageActions.PAGE_TRANSLATE_START:
        isTranslating.value = true;
        isTranslated.value = false;
        if (message.data && message.data.isAutoTranslating !== undefined) {
          isAutoTranslating.value = message.data.isAutoTranslating;
        }
        progress.value = 0;
        break;
      case MessageActions.PAGE_TRANSLATE_PROGRESS:
        updateProgress(message.data || {});
        break;
      case MessageActions.PAGE_TRANSLATE_COMPLETE:
        handleComplete(message.data || {});
        break;
      case MessageActions.PAGE_TRANSLATE_ERROR:
        handleError(message.data || {});
        break;
      case MessageActions.PAGE_RESTORE_COMPLETE:
        handleRestoreComplete(message.data || {});
        break;
      case MessageActions.PAGE_AUTO_RESTORE_COMPLETE:
        handleAutoRestoreComplete(message.data || {});
        break;
      case MessageActions.PAGE_TRANSLATE_CANCELLED:
        handleCancelled();
        break;
    }
  };

  // Setup event listeners
  onMounted(() => {
    // Initial status fetch
    refreshStatus();

    // Tab awareness for sidepanel
    if (typeof browser !== 'undefined' && browser.tabs) {
      browser.tabs.onActivated.addListener(handleTabChange);
      browser.tabs.onUpdated.addListener(handleTabUpdate);
    }

    // Runtime message listener for cross-context broadcasting
    if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.onMessage) {
      browser.runtime.onMessage.addListener(handleRuntimeMessage);
    }

    // Progress updates
    progressListener = (data) => updateProgress(data);
    pageEventBus.on('page-translation-progress', progressListener);

    // Translation complete
    completeListener = (data) => handleComplete(data);
    pageEventBus.on('page-translation-complete', completeListener);

    // Translation error
    errorListener = (data) => handleError(data);
    pageEventBus.on('page-translation-error', errorListener);

    // Restore complete
    restoreCompleteListener = (data) => handleRestoreComplete(data);
    pageEventBus.on('page-restore-complete', restoreCompleteListener);

    // Auto restore complete
    autoRestoreCompleteListener = (data) => handleAutoRestoreComplete(data);
    pageEventBus.on(MessageActions.PAGE_AUTO_RESTORE_COMPLETE, autoRestoreCompleteListener);

    // Translation cancelled
    cancelledListener = () => handleCancelled();
    pageEventBus.on('page-translation-cancelled', cancelledListener);
  });

  // Cleanup event listeners
  onUnmounted(() => {
    if (typeof browser !== 'undefined' && browser.tabs) {
      browser.tabs.onActivated.removeListener(handleTabChange);
      browser.tabs.onUpdated.removeListener(handleTabUpdate);
    }

    if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.onMessage) {
      browser.runtime.onMessage.removeListener(handleRuntimeMessage);
    }

    pageEventBus.off('page-translation-progress', progressListener);
    pageEventBus.off('page-translation-complete', completeListener);
    pageEventBus.off('page-translation-error', errorListener);
    pageEventBus.off('page-restore-complete', restoreCompleteListener);
    pageEventBus.off(MessageActions.PAGE_AUTO_RESTORE_COMPLETE, autoRestoreCompleteListener);
    pageEventBus.off('page-translation-cancelled', cancelledListener);
  });

  return {
    // State
    isTranslating,
    isTranslated,
    isAutoTranslating,
    progress,
    translatedCount,
    totalNodes,
    message,
    error,

    // Actions
    translatePage,
    restorePage,
    stopAutoTranslation,
    cancelTranslation,
    refreshStatus,

    // Computed
    canTranslate: computed(() => !isTranslating.value && !isAutoTranslating.value),
    canRestore: computed(() => isTranslated.value && !isTranslating.value),
    canCancel: computed(() => isTranslating.value),
    canStopAuto: computed(() => isAutoTranslating.value),
    hasError: computed(() => error.value !== null),

    // Status
    status: computed(() => {
      if (error.value) return 'error';
      if (isTranslating.value || isAutoTranslating.value) return 'translating';
      if (isTranslated.value) return 'translated';
      return 'idle';
    }),
  };
}


