/**
 * Lazy Element Selection Handler - Dynamic Loading for Background Script
 * Handles Element Selection actions with lazy loading to reduce initial bundle size
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'ElementSelectionLazyHandler');

// Cache for loaded Element Selection handlers
const handlerCache = new Map();
const loadingPromises = new Map();

/**
 * Load Element Selection handlers dynamically
 */
async function loadElementSelectionHandlers() {
  const cacheKey = 'element_selection_handlers';

  if (handlerCache.has(cacheKey)) {
    logger.debug('[ElementSelectionLazyHandler] Using cached Element Selection handlers');
    return handlerCache.get(cacheKey);
  }

  if (loadingPromises.has(cacheKey)) {
    logger.debug('[ElementSelectionLazyHandler] Element Selection handlers already loading, waiting...');
    return loadingPromises.get(cacheKey);
  }

  logger.debug('[ElementSelectionLazyHandler] Loading Element Selection handlers dynamically...');

  const loadingPromise = Promise.all([
    import('@/features/element-selection/handlers/handleActivateSelectElementMode.js'),
    import('@/features/element-selection/handlers/handleDeactivateSelectElementMode.js'),
    import('@/features/element-selection/handlers/handleGetSelectElementState.js'),
    import('@/features/element-selection/handlers/handleSetSelectElementState.js')
  ]).then(([activate, deactivate, getState, setState]) => {
    const handlers = {
      handleActivateSelectElementMode: activate.handleActivateSelectElementMode,
      handleDeactivateSelectElementMode: deactivate.handleDeactivateSelectElementMode,
      handleGetSelectElementState: getState.handleGetSelectElementState,
      handleSetSelectElementState: setState.handleSetSelectElementState
    };

    handlerCache.set(cacheKey, handlers);
    loadingPromises.delete(cacheKey);
    logger.debug('[ElementSelectionLazyHandler] Element Selection handlers loaded and cached successfully');

    return handlers;
  }).catch(error => {
    logger.error('[ElementSelectionLazyHandler] Failed to load Element Selection handlers:', error);
    loadingPromises.delete(cacheKey);
    throw error;
  });

  loadingPromises.set(cacheKey, loadingPromise);
  return loadingPromise;
}

/**
 * Lazy handler for activateSelectElementMode action
 */
export const handleActivateSelectElementModeLazy = async (message, sender) => {
  try {
    logger.debug('[ElementSelectionLazyHandler] activateSelectElementMode requested, loading handlers...');

    const { handleActivateSelectElementMode } = await loadElementSelectionHandlers();

    logger.debug('[ElementSelectionLazyHandler] Delegating to handleActivateSelectElementMode');
    return await handleActivateSelectElementMode(message, sender);
  } catch (error) {
    logger.error('[ElementSelectionLazyHandler] Failed to handle activateSelectElementMode:', error);
    return {
      success: false,
      error: {
        message: 'Failed to load Element Selection functionality',
        type: 'ELEMENT_SELECTION_LOADING_ERROR'
      }
    };
  }
};

/**
 * Lazy handler for deactivateSelectElementMode action
 */
export const handleDeactivateSelectElementModeLazy = async (message, sender) => {
  try {
    logger.debug('[ElementSelectionLazyHandler] deactivateSelectElementMode requested, loading handlers...');

    const { handleDeactivateSelectElementMode } = await loadElementSelectionHandlers();

    logger.debug('[ElementSelectionLazyHandler] Delegating to handleDeactivateSelectElementMode');
    return await handleDeactivateSelectElementMode(message, sender);
  } catch (error) {
    logger.error('[ElementSelectionLazyHandler] Failed to handle deactivateSelectElementMode:', error);
    return {
      success: false,
      error: {
        message: 'Failed to load Element Selection functionality',
        type: 'ELEMENT_SELECTION_LOADING_ERROR'
      }
    };
  }
};

/**
 * Lazy handler for getSelectElementState action
 */
export const handleGetSelectElementStateLazy = async (message, sender) => {
  try {
    logger.debug('[ElementSelectionLazyHandler] getSelectElementState requested, loading handlers...');

    const { handleGetSelectElementState } = await loadElementSelectionHandlers();

    logger.debug('[ElementSelectionLazyHandler] Delegating to handleGetSelectElementState');
    return await handleGetSelectElementState(message, sender);
  } catch (error) {
    logger.error('[ElementSelectionLazyHandler] Failed to handle getSelectElementState:', error);
    return {
      success: false,
      error: {
        message: 'Failed to load Element Selection functionality',
        type: 'ELEMENT_SELECTION_LOADING_ERROR'
      }
    };
  }
};

/**
 * Lazy handler for setSelectElementState action
 */
export const handleSetSelectElementStateLazy = async (message, sender) => {
  try {
    logger.debug('[ElementSelectionLazyHandler] setSelectElementState requested, loading handlers...');

    const { handleSetSelectElementState } = await loadElementSelectionHandlers();

    logger.debug('[ElementSelectionLazyHandler] Delegating to handleSetSelectElementState');
    return await handleSetSelectElementState(message, sender);
  } catch (error) {
    logger.error('[ElementSelectionLazyHandler] Failed to handle setSelectElementState:', error);
    return {
      success: false,
      error: {
        message: 'Failed to load Element Selection functionality',
        type: 'ELEMENT_SELECTION_LOADING_ERROR'
      }
    };
  }
};

/**
 * Get Element Selection handler statistics
 */
export const getElementSelectionHandlerStats = () => {
  return {
    handlersLoaded: handlerCache.has('element_selection_handlers'),
    isLoading: loadingPromises.has('element_selection_handlers'),
    cacheSize: handlerCache.size
  };
};

/**
 * Clear Element Selection handler cache (for testing/memory management)
 */
export const clearElementSelectionHandlerCache = () => {
  logger.debug('[ElementSelectionLazyHandler] Clearing Element Selection handler cache');
  handlerCache.clear();
  loadingPromises.clear();
};