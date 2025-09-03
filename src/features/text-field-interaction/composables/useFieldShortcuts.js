/**
 * useFieldShortcuts - Vue composable for text field keyboard shortcuts
 * Provides reactive state and methods for handling field shortcuts like Ctrl+/
 */

import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useTextFieldInteractionStore } from '../stores/textFieldInteraction.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { useResourceTracker } from '@/composables/core/useResourceTracker.js';

export function useFieldShortcuts() {
  // Use the new Vue composable for automatic cleanup
  const tracker = useResourceTracker('field-shortcuts-composable')
  const store = useTextFieldInteractionStore();
  const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'useFieldShortcuts');  // Local reactive state
  const isInitialized = ref(false);
  const isProcessing = ref(false);
  const lastShortcutTime = ref(0);
  const shortcutManager = ref(null);
  
  // Computed properties
  const canExecuteShortcuts = computed(() => 
    isInitialized.value && !isProcessing.value && shortcutManager.value
  );
  
  const shortcutStats = computed(() => store.shortcutStats);
  
  /**
   * Initialize the field shortcuts system
   * @param {Object} manager - FieldShortcutManager instance
   */
  const initialize = (manager) => {
    if (isInitialized.value) {
      logger.debug('Already initialized');
      return;
    }
    
    if (!manager) {
      logger.error('No shortcut manager provided');
      return;
    }
    
    shortcutManager.value = manager;
    setupKeyboardListeners();
    isInitialized.value = true;
    
    logger.debug('Field shortcuts system initialized');
  };
  
  /**
   * Setup keyboard event listeners
   */
  const setupKeyboardListeners = () => {
    // Use ResourceTracker for automatic cleanup
    tracker.addEventListener(document, 'keydown', handleKeyDown, { capture: true });
    logger.debug('Keyboard listeners setup completed');
  };
  
  /**
   * Handle keyboard events
   * @param {KeyboardEvent} event - Keyboard event
   */
  const handleKeyDown = async (event) => {
    if (!canExecuteShortcuts.value) {
      return;
    }
    
    // Check if this is a Ctrl+/ event
    if (!isCtrlSlashEvent(event)) {
      return;
    }
    
    // Prevent rapid-fire executions
    const now = Date.now();
    if (now - lastShortcutTime.value < 500) {
      logger.debug('Ignoring rapid shortcut execution');
      return;
    }
    
    lastShortcutTime.value = now;
    
    try {
      // Set processing state
      isProcessing.value = true;
      store.incrementShortcutAttempt();
      
      logger.debug('Processing Ctrl+/ shortcut');
      
      // Check if shortcut should be executed
      const shouldExecute = await shortcutManager.value.shouldExecute(event);
      
      if (!shouldExecute) {
        logger.debug('Shortcut execution conditions not met');
        return;
      }
      
      // Prevent default browser behavior
      event.preventDefault();
      event.stopPropagation();
      
      // Execute the shortcut
      const result = await shortcutManager.value.execute(event);
      
      if (result.success) {
        logger.debug('Shortcut executed successfully');
        store.incrementShortcutSuccess();
        store.updateLastShortcutResult({
          success: true,
          type: result.type,
          timestamp: Date.now(),
          textLength: result.textLength,
          target: result.target
        });
      } else {
        logger.error('Shortcut execution failed:', result.error);
        store.incrementShortcutError();
        store.updateLastShortcutResult({
          success: false,
          error: result.error,
          timestamp: Date.now(),
          type: result.type
        });
      }
      
    } catch (error) {
      logger.error('Error processing shortcut:', error);
      store.incrementShortcutError();
      store.updateLastShortcutResult({
        success: false,
        error: error.message,
        timestamp: Date.now(),
        type: 'error'
      });
    } finally {
      // Reset processing state
      isProcessing.value = false;
    }
  };
  
  /**
   * Check if event is Ctrl+/ combination
   * @param {KeyboardEvent} event - Keyboard event
   * @returns {boolean} Whether event is Ctrl+/
   */
  const isCtrlSlashEvent = (event) => {
    return (
      (event.ctrlKey || event.metaKey) && 
      event.key === '/' && 
      !event.repeat
    );
  };
  
  /**
   * Manually trigger shortcut (for testing or programmatic use)
   * @param {Element} targetElement - Target element (optional)
   * @returns {Promise<Object>} Execution result
   */
  const triggerShortcut = async (targetElement = null) => {
    if (!canExecuteShortcuts.value) {
      throw new Error('Shortcuts system not ready');
    }
    
    logger.debug('Manually triggering shortcut');
    
    try {
      isProcessing.value = true;
      store.incrementShortcutAttempt();
      
      // Create a mock event if needed
      const mockEvent = new KeyboardEvent('keydown', {
        key: '/',
        ctrlKey: true,
        bubbles: true,
        cancelable: true
      });
      
      const result = await shortcutManager.value.execute(mockEvent);
      
      if (result.success) {
        store.incrementShortcutSuccess();
      } else {
        store.incrementShortcutError();
      }
      
      return result;
      
    } finally {
      isProcessing.value = false;
    }
  };
  
  /**
   * Get shortcut system information
   * @returns {Object} System information
   */
  const getShortcutInfo = () => {
    return {
      initialized: isInitialized.value,
      processing: isProcessing.value,
      canExecute: canExecuteShortcuts.value,
      lastExecution: lastShortcutTime.value,
      stats: shortcutStats.value,
      manager: shortcutManager.value ? {
        key: shortcutManager.value.key,
        description: shortcutManager.value.description,
        initialized: shortcutManager.value.initialized
      } : null
    };
  };
  
  /**
   * Reset shortcut statistics
   */
  const resetStats = () => {
    store.resetShortcutStats();
    lastShortcutTime.value = 0;
    logger.debug('Shortcut statistics reset');
  };
  
  // Lifecycle hooks
  onMounted(() => {
    logger.debug('Field shortcuts composable mounted');
  });

  // Note: cleanup is now automatic via useResourceTracker

  return {
    // State
    isInitialized,
    isProcessing,
    canExecuteShortcuts,
    shortcutStats,

    // Methods
    initialize,
    triggerShortcut,
    getShortcutInfo,
    resetStats
    // cleanup removed - now automatic
  };
}