// usePageTranslation - Vue composable for page translation UI
// Provides reactive state and actions for whole page translation

import { ref, computed, onMounted, onUnmounted } from 'vue';
import { sendRegularMessage } from '@/shared/messaging/core/UnifiedMessaging.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import browser from 'webextension-polyfill';

/**
 * Composable for page translation UI
 * @returns {Object} Page translation state and actions
 */
export function usePageTranslation() {
  // State
  const isTranslating = ref(false);
  const isTranslated = ref(false);
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
  let cancelledListener = null;

  /**
   * Fetch current translation status from the active tab
   */
  async function refreshStatus() {
    try {
      const result = await sendRegularMessage({
        action: MessageActions.PAGE_TRANSLATE_GET_STATUS,
        context: 'page-translation-ui',
      });

      if (result && result.success) {
        isTranslated.value = result.isTranslated || false;
        isTranslating.value = result.isTranslating || false;
        
        // Update progress if available
        if (result.translatedCount !== undefined) {
          translatedCount.value = result.translatedCount;
        }
      } else {
        // Reset state if we can't get status (e.g. restricted page)
        isTranslated.value = false;
        isTranslating.value = false;
      }
    } catch {
      // Content script might not be injected or ready
      isTranslated.value = false;
      isTranslating.value = false;
    }
  }

  /**
   * Translate the current page
   */
  async function translatePage() {
    if (isTranslating.value) {
      return;
    }

    isTranslating.value = true;
    progress.value = 0;
    message.value = 'Starting translation...';
    error.value = null;

    try {
      const result = await sendRegularMessage({
        action: MessageActions.PAGE_TRANSLATE,
        context: 'page-translation-ui',
      });

      if (result.success) {
        isTranslated.value = true;
        message.value = `Translated ${result.translatedCount} elements`;
        translatedCount.value = result.translatedCount;
        totalNodes.value = result.totalNodes;
      } else {
        throw new Error(result.reason || 'Translation failed');
      }
    } catch {
      error.value = 'Translation failed';
      message.value = 'Translation failed';
      isTranslated.value = false;
    } finally {
      isTranslating.value = false;
    }
  }

  /**
   * Restore original page content
   */
  async function restorePage() {
    if (isTranslating.value) {
      return;
    }

    isTranslating.value = true;
    message.value = 'Restoring original content...';
    error.value = null;

    try {
      const result = await sendRegularMessage({
        action: MessageActions.PAGE_RESTORE,
        context: 'page-translation-ui',
      });

      if (result.success) {
        isTranslated.value = false;
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
    } finally {
      isTranslating.value = false;
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
        context: 'page-translation-ui',
      });
      isTranslating.value = false;
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
    progress.value = 100;
    translatedCount.value = data.translatedCount || 0;
    totalNodes.value = data.totalNodes || 0;
    message.value = `Translation complete! ${translatedCount.value} elements translated`;
  }

  /**
   * Handle translation error
   */
  function handleError(data) {
    isTranslating.value = false;
    error.value = data.error;
    message.value = `Error: ${data.error?.message || data.error}`;
  }

  /**
   * Handle restore complete
   */
  function handleRestoreComplete(data) {
    isTranslating.value = false;
    isTranslated.value = false;
    progress.value = 0;
    translatedCount.value = 0;
    totalNodes.value = 0;
    message.value = `Restore complete! ${data.restoredCount} elements restored`;
  }

  /**
   * Handle translation cancelled
   */
  function handleCancelled() {
    isTranslating.value = false;
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
    pageEventBus.off('page-translation-cancelled', cancelledListener);
  });

  return {
    // State
    isTranslating,
    isTranslated,
    progress,
    translatedCount,
    totalNodes,
    message,
    error,

    // Actions
    translatePage,
    restorePage,
    cancelTranslation,
    refreshStatus,

    // Computed
    canTranslate: computed(() => !isTranslating.value),
    canRestore: computed(() => isTranslated.value && !isTranslating.value),
    canCancel: computed(() => isTranslating.value),
    hasError: computed(() => error.value !== null),

    // Status
    status: computed(() => {
      if (error.value) return 'error';
      if (isTranslating.value) return 'translating';
      if (isTranslated.value) return 'translated';
      return 'idle';
    }),
  };
}

