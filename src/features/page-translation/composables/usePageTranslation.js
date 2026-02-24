// usePageTranslation - Vue composable for page translation UI
// Provides reactive state and actions for whole page translation

import { ref, computed, onMounted, onUnmounted } from 'vue';
import { sendRegularMessage } from '@/shared/messaging/core/UnifiedMessaging.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { pageEventBus } from '@/core/PageEventBus.js';

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
    } catch (err) {
      error.value = err.message || 'Translation failed';
      message.value = `Translation failed: ${err.message}`;
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
    } catch (err) {
      error.value = err.message || 'Restore failed';
      message.value = `Restore failed: ${err.message}`;
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

  // Setup event listeners
  onMounted(() => {
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
