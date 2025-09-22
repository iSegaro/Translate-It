import { ref, onMounted, onUnmounted } from 'vue';
import { SimpleTextSelectionHandler } from '../handlers/SimpleTextSelectionHandler.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'useTextSelection');

/**
 * Vue Composable for Text Selection
 *
 * Provides a simple interface for Vue components to work with text selection.
 * Much simpler than the old complex system.
 */
export function useTextSelection(options = {}) {
  // Reactive state
  const isActive = ref(false);
  const currentSelection = ref('');
  const hasSelection = ref(false);

  // Handler instance
  let selectionHandler = null;

  /**
   * Initialize text selection handler
   */
  const initialize = async (featureManager) => {
    try {
      logger.debug('Initializing text selection handler');

      selectionHandler = SimpleTextSelectionHandler.getInstance({
        featureManager,
        ...options
      });

      const success = await selectionHandler.activate();
      isActive.value = success;

      if (success) {
        // Setup reactive updates
        setupSelectionTracking();
        logger.info('Text selection handler initialized successfully');
      } else {
        logger.error('Failed to initialize text selection handler');
      }

      return success;

    } catch (error) {
      logger.error('Error initializing text selection:', error);
      return false;
    }
  };

  /**
   * Cleanup text selection handler
   */
  const cleanup = async () => {
    if (selectionHandler) {
      logger.debug('Cleaning up text selection handler');
      await selectionHandler.deactivate();
      selectionHandler = null;
    }

    isActive.value = false;
    currentSelection.value = '';
    hasSelection.value = false;
  };

  /**
   * Setup reactive tracking of selection changes
   */
  const setupSelectionTracking = () => {
    const updateSelection = () => {
      if (!selectionHandler) return;

      const selection = selectionHandler.getCurrentSelection();
      currentSelection.value = selection || '';
      hasSelection.value = !!selection;
    };

    // Update selection state periodically
    const selectionInterval = setInterval(updateSelection, 500);

    // Cleanup interval on unmount
    onUnmounted(() => {
      clearInterval(selectionInterval);
    });

    // Initial update
    updateSelection();
  };

  /**
   * Force refresh selection state
   */
  const refreshSelection = () => {
    if (selectionHandler) {
      const selection = selectionHandler.getCurrentSelection();
      currentSelection.value = selection || '';
      hasSelection.value = !!selection;
    }
  };

  /**
   * Get current selection status
   */
  const getStatus = () => {
    return selectionHandler ? selectionHandler.getStatus() : null;
  };

  /**
   * Check if text selection is supported
   */
  const isSupported = () => {
    return typeof window !== 'undefined' &&
           typeof document !== 'undefined' &&
           typeof window.getSelection === 'function';
  };

  // Auto-cleanup on unmount
  onUnmounted(() => {
    cleanup();
  });

  return {
    // Reactive state
    isActive,
    currentSelection,
    hasSelection,

    // Methods
    initialize,
    cleanup,
    refreshSelection,
    getStatus,
    isSupported,

    // Internal access (for advanced use)
    getHandler: () => selectionHandler
  };
}

export default useTextSelection;