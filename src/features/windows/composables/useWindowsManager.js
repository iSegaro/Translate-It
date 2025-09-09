/**
 * useWindowsManager.js - Composable for managing translation windows and icons
 * Handles state management, event listening, and component lifecycle
 */

import { ref } from 'vue';
import { WINDOWS_MANAGER_EVENTS } from '@/core/PageEventBus.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

export function useWindowsManager() {
  // State
  const translationWindows = ref([]);
  const translationIcons = ref([]);
  
  // Event bus reference
  const pageEventBus = window.pageEventBus;
  
  // Logger
  const logger = getScopedLogger(LOG_COMPONENTS.WINDOWS, 'useWindowsManager');

  /**
   * Event handlers
   */
  const handleShowWindow = (detail) => {
    logger.debug('Show window event received', detail);
    logger.debug('Show window ALL detail properties:', Object.keys(detail));
    logger.debug('Show window detail text properties:', {
      initialTranslatedText: detail.initialTranslatedText,
      translatedText: detail.translatedText,
      hasInitial: !!detail.initialTranslatedText,
      hasTranslated: !!detail.translatedText
    });
    
    // Check if we're updating an existing window
    const existingWindowIndex = translationWindows.value.findIndex(w => w.id === detail.id);
    
    const windowData = {
      id: detail.id,
      selectedText: detail.selectedText,
      translatedText: detail.initialTranslatedText || detail.translatedText, // Support both property names
      position: detail.position,
      theme: detail.theme || 'light',
      isError: detail.isError || false,
      isLoading: detail.isLoading || false,
      initialSize: detail.initialSize || (detail.isLoading ? 'small' : 'normal'),
      targetLanguage: detail.targetLanguage || detail.to || 'auto' // Add target language support
    };

    if (existingWindowIndex >= 0) {
      // Update existing window
      translationWindows.value[existingWindowIndex] = windowData;
      logger.debug('Updated existing window', detail.id);
    } else {
      // Remove other windows first (single window at a time)
      translationWindows.value = [];
      // Add new window
      translationWindows.value.push(windowData);
      logger.debug('Created new window', detail.id);
    }
  };

  const handleShowIcon = (detail) => {
    logger.debug('Show icon event received', detail);
    
    // Remove existing icons first (single icon at a time)
    translationIcons.value = [];
    
    // Add new icon
    translationIcons.value.push({
      id: detail.id,
      text: detail.text,
      position: detail.position
    });
  };

  const handleDismissWindow = (detail) => {
    logger.debug('Dismiss window event received', detail);
    translationWindows.value = translationWindows.value.filter(w => w.id !== detail.id);
  };

  const handleUpdateWindow = (detail) => {
    logger.debug('Update window event received', detail);
    
    const existingWindowIndex = translationWindows.value.findIndex(w => w.id === detail.id);
    if (existingWindowIndex >= 0) {
      const existingWindow = translationWindows.value[existingWindowIndex];
      // Update the window data
      translationWindows.value[existingWindowIndex] = {
        ...existingWindow,
        ...detail,
        translatedText: detail.initialTranslatedText || detail.translatedText || existingWindow.translatedText,
        initialSize: detail.initialSize || existingWindow.initialSize
      };
      logger.debug('Updated window with new data', detail.id);
    } else {
      // Window was closed before translation completed - this is normal behavior
      logger.debug('Window was closed before translation completed:', detail.id);
    }
  };

  const handleDismissIcon = (detail) => {
    logger.debug('Dismiss icon event received', detail);
    // Find the icon to get its ID
    const iconToRemove = translationIcons.value.find(icon => icon.id === detail.id);
    
    if (iconToRemove) {
      // Emit specific dismiss event for the icon component
      const eventName = `dismiss-icon-${iconToRemove.id}`;
      pageEventBus.emit(eventName, { id: iconToRemove.id });
      logger.debug('Emitted dismiss event for icon:', iconToRemove.id);
    }
    
    translationIcons.value = translationIcons.value.filter(icon => icon.id !== detail.id);
  };

  /**
   * Component event handlers
   */
  const onTranslationIconClick = (detail) => {
    logger.debug('onTranslationIconClick called with:', detail);
    logger.info('Translation icon clicked', detail);
    pageEventBus.emit(WINDOWS_MANAGER_EVENTS.ICON_CLICKED, detail);
  };

  const onTranslationWindowClose = (id) => {
    logger.debug('Translation window closed', id);
    translationWindows.value = translationWindows.value.filter(w => w.id !== id);
    
    // Emit dismiss event to WindowsManager
    pageEventBus.emit(WINDOWS_MANAGER_EVENTS.DISMISS_WINDOW, { id });
  };

  const onTranslationWindowSpeak = (detail) => {
    logger.info('Translation window speak request', detail);
    pageEventBus.emit('translation-window-speak', detail);
  };

  const onTranslationIconClose = (id) => {
    logger.debug('Translation icon closed', id);
    translationIcons.value = translationIcons.value.filter(icon => icon.id !== id);
    
    // Emit dismiss event to WindowsManager
    pageEventBus.emit(WINDOWS_MANAGER_EVENTS.DISMISS_ICON, { id });
  };

  /**
   * Setup and cleanup
   */
  const setupEventListeners = () => {
    if (!pageEventBus) {
      logger.error('PageEventBus not available');
      return;
    }

    // Listen for WindowsManager events
    pageEventBus.on(WINDOWS_MANAGER_EVENTS.SHOW_WINDOW, handleShowWindow);
    pageEventBus.on(WINDOWS_MANAGER_EVENTS.UPDATE_WINDOW, handleUpdateWindow);
    pageEventBus.on(WINDOWS_MANAGER_EVENTS.SHOW_ICON, handleShowIcon);
    pageEventBus.on(WINDOWS_MANAGER_EVENTS.DISMISS_WINDOW, handleDismissWindow);
    pageEventBus.on(WINDOWS_MANAGER_EVENTS.DISMISS_ICON, handleDismissIcon);

    logger.debug('WindowsManager event listeners setup complete');
  };

  const cleanupEventListeners = () => {
    if (!pageEventBus) return;

    // Remove event listeners
    pageEventBus.off(WINDOWS_MANAGER_EVENTS.SHOW_WINDOW, handleShowWindow);
    pageEventBus.off(WINDOWS_MANAGER_EVENTS.UPDATE_WINDOW, handleUpdateWindow);
    pageEventBus.off(WINDOWS_MANAGER_EVENTS.SHOW_ICON, handleShowIcon);
    pageEventBus.off(WINDOWS_MANAGER_EVENTS.DISMISS_WINDOW, handleDismissWindow);
    pageEventBus.off(WINDOWS_MANAGER_EVENTS.DISMISS_ICON, handleDismissIcon);

    logger.debug('WindowsManager event listeners cleaned up');
  };

  /**
   * Clear all windows and icons
   */
  const clearAll = () => {
    translationWindows.value = [];
    translationIcons.value = [];
  };

  return {
    // State
    translationWindows,
    translationIcons,
    
    // Event handlers
    onTranslationIconClick,
    onTranslationWindowClose,
    onTranslationWindowSpeak,
    onTranslationIconClose,
    
    // Lifecycle
    setupEventListeners,
    cleanupEventListeners,
    
    // Utilities
    clearAll
  };
}