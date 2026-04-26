/**
 * useWindowsManager.js - Composable for managing translation windows and icons
 * Handles state management, event listening, and component lifecycle
 */

import { ref } from 'vue';
import { WINDOWS_MANAGER_EVENTS } from '@/core/PageEventBus.js';
import { SELECTION_EVENTS } from '@/features/text-selection/events/SelectionEvents.js';
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
   * Handle global selection change (Coordinator Pattern)
   */
  const handleGlobalSelectionChange = async (detail) => {
    // If there is no WindowsManager instance (the heavy class), 
    // the composable can handle basic mobile UI orchestration
    let windowsManager = window.windowsManagerInstance;

    // If not globally available, try to get it via Singleton if it exists
    if (!windowsManager) {
      try {
        const { WindowsManager } = await import('@/features/windows/managers/WindowsManager.js');
        windowsManager = WindowsManager.getInstance();
      } catch {
        // Class not available yet
      }
    }

    const hasManager = !!windowsManager;

    logger.info('Global selection change received in useWindowsManager', { 
      text: detail.text?.substring(0, 20),
      hasManager 
    });

    // If we have the manager, let it handle the heavy lifting (logic, settings, positioning)
    if (hasManager && typeof windowsManager.show === 'function') {
      windowsManager.show(detail.text, detail.position, detail.options);
    }
  };

  /**
   * Event handlers
   */
  const handleShowWindow = (detail) => {
    // SECURITY/DUPLICATION FIX: Only handle the window if it's meant for this specific frame.
    const currentFrameId = window.windowsManagerInstance?.crossFrameManager?.frameId;
    
    // If the event is targeted to a specific frame, we MUST have a matching currentFrameId
    if (detail.frameId) {
      if (!currentFrameId || detail.frameId !== currentFrameId) {
        return;
      }
    }

    logger.debug('Show window event received', { id: detail.id, frameId: detail.frameId });
    
    // Check if we're updating an existing window
    const existingWindowIndex = translationWindows.value.findIndex(w => w.id === detail.id);
    
    const windowData = {
      id: detail.id,
      selectedText: detail.selectedText,
      translatedText: detail.initialTranslatedText || detail.translatedText, // Support both property names
      position: detail.position,
      theme: detail.theme || 'light',
      isError: detail.isError || false,
      errorType: detail.errorType || null,
      canRetry: detail.canRetry || false,
      needsSettings: detail.needsSettings || false,
      isLoading: detail.isLoading || false,
      initialSize: detail.initialSize || (detail.isLoading ? 'small' : 'normal'),
      targetLanguage: detail.targetLanguage || detail.to || detail.tl || 'auto',
      sourceLanguage: detail.sourceLanguage || detail.from || detail.sl || 'auto',
      detectedSourceLanguage: detail.detectedSourceLanguage || null,
      provider: detail.provider || ''
    };

    if (existingWindowIndex >= 0) {
      // Update existing window reactive-friendly
      const updatedWindows = [...translationWindows.value];
      updatedWindows[existingWindowIndex] = windowData;
      translationWindows.value = updatedWindows;
      logger.debug('Updated existing window', detail.id);
    } else {
      // Remove other windows first (single window at a time)
      // Add new window
      translationWindows.value = [windowData];
      logger.debug('Created new window', detail.id);
    }
  };

  const handleShowIcon = (detail) => {
    // SECURITY/DUPLICATION FIX: Only handle the icon if it's meant for this specific frame.
    const currentFrameId = window.windowsManagerInstance?.crossFrameManager?.frameId;
    
    // If the event is targeted to a specific frame, we MUST have a matching currentFrameId
    if (detail.frameId) {
      if (!currentFrameId || detail.frameId !== currentFrameId) {
        return;
      }
    }

    logger.debug('Show icon event received', { id: detail.id, frameId: detail.frameId });

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
    logger.debug('Dismiss window event', { id: detail.id });
    translationWindows.value = translationWindows.value.filter(w => w.id !== detail.id);
  };

  const handleUpdateWindow = (detail) => {
    // SECURITY/DUPLICATION FIX: Only handle the update if it's meant for this specific frame.
    const currentFrameId = window.windowsManagerInstance?.crossFrameManager?.frameId;
    
    // If the event is targeted to a specific frame, we MUST have a matching currentFrameId
    if (detail.frameId) {
      if (!currentFrameId || detail.frameId !== currentFrameId) {
        return;
      }
    }

    logger.debug('Update window event', { id: detail.id, frameId: detail.frameId });

    const existingWindowIndex = translationWindows.value.findIndex(w => w.id === detail.id);
    if (existingWindowIndex >= 0) {
      const updatedWindows = [...translationWindows.value];
      const existingWindow = updatedWindows[existingWindowIndex];
      
      // Update the window data
      updatedWindows[existingWindowIndex] = {
        ...existingWindow,
        ...detail,
        translatedText: detail.initialTranslatedText || detail.translatedText || existingWindow.translatedText,
        sourceLanguage: detail.sourceLanguage || detail.from || detail.sl || existingWindow.sourceLanguage,
        detectedSourceLanguage: detail.detectedSourceLanguage || detail.sourceLanguage || existingWindow.detectedSourceLanguage,
        targetLanguage: detail.targetLanguage || detail.to || detail.tl || existingWindow.targetLanguage,
        initialSize: detail.initialSize || existingWindow.initialSize
      };
      
      translationWindows.value = updatedWindows;
      logger.debug('Window updated', detail.id);
    } else {
      // Window was closed before translation completed - this is normal behavior
      logger.debug('Window was closed before translation completed', detail.id);
    }
  };

  const handleDismissIcon = (detail) => {
    logger.debug('Dismiss icon event', { id: detail.id });
    // Find the icon to get its ID
    const iconToRemove = translationIcons.value.find(icon => icon.id === detail.id);

    if (iconToRemove) {
      // Emit specific dismiss event for the icon component
      const eventName = `dismiss-icon-${iconToRemove.id}`;
      pageEventBus.emit(eventName, { id: iconToRemove.id });
    }

    translationIcons.value = translationIcons.value.filter(icon => icon.id !== detail.id);
  };

  /**
   * Component event handlers
   */
  const onTranslationIconClick = (detail) => {
    logger.debug('Translation icon clicked', { id: detail.id });
    pageEventBus.emit(WINDOWS_MANAGER_EVENTS.ICON_CLICKED, detail);
  };

  const onTranslationWindowClose = (id) => {
    logger.debug('Translation window closed', { id });
    translationWindows.value = translationWindows.value.filter(w => w.id !== id);

    // Emit dismiss event to WindowsManager
    pageEventBus.emit(WINDOWS_MANAGER_EVENTS.DISMISS_WINDOW, { id });
  };

  const onTranslationWindowSpeak = (detail) => {
    logger.debug('Translation window speak request', { textLength: detail.text?.length });
    pageEventBus.emit('translation-window-speak', detail);
  };

  const onTranslationIconClose = (id) => {
    logger.debug('Translation icon closed', { id });
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
    pageEventBus.on(SELECTION_EVENTS.GLOBAL_SELECTION_CHANGE, handleGlobalSelectionChange);

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
    pageEventBus.off(SELECTION_EVENTS.GLOBAL_SELECTION_CHANGE, handleGlobalSelectionChange);

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
