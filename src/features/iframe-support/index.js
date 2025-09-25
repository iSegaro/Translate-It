// IFrame Support System - Lazy Loading Entry Point
import { getScopedLogger } from '../../shared/logging/logger.js';
import { LOG_COMPONENTS } from '../../shared/logging/logConstants.js';

// Export lazy loading factory
export { IFrameSupportFactory } from './IFrameSupportFactory.js';
export { useIFrameSupportLazy } from './composables/useIFrameSupportLazy.js';

// Lazy loading functions for dynamic imports
export const loadIFrameCore = async () => {
  const [manager, registry] = await Promise.all([
    import('./managers/IFrameManager.js'),
    import('../windows/managers/crossframe/FrameRegistry.js')
  ]);

  return {
    IFrameManager: manager.IFrameManager,
    iFrameManager: manager.iFrameManager,
    FrameRegistry: registry.FrameRegistry
  };
};

export const loadIFrameComposables = async () => {
  const composables = await import('./composables/useIFrameSupport.js');

  return {
    useIFrameSupport: composables.useIFrameSupport,
    useIFrameDetection: composables.useIFrameDetection,
    useIFramePositioning: composables.useIFramePositioning
  };
};

// Backward compatibility - lazy loaded when accessed
export const IFrameManager = async () => {
  const { IFrameManager: Manager } = await loadIFrameCore();
  return Manager;
};

export const iFrameManager = async () => {
  const { iFrameManager: manager } = await loadIFrameCore();
  return manager;
};

export const FrameRegistry = async () => {
  const { FrameRegistry: Registry } = await loadIFrameCore();
  return Registry;
};

export const useIFrameSupport = async () => {
  const { useIFrameSupport: composable } = await loadIFrameComposables();
  return composable;
};

export const useIFrameDetection = async () => {
  const { useIFrameDetection: composable } = await loadIFrameComposables();
  return composable;
};

export const useIFramePositioning = async () => {
  const { useIFramePositioning: composable } = await loadIFrameComposables();
  return composable;
};

/**
 * Check if iframe support is available
 */
export function checkIFrameSupport() {
  const isInIframe = window !== window.top;
  const hasFrameElement = !!window.frameElement;
  
  return {
    available: true, // Always available in simplified version
    isInIframe,
    hasFrameElement,
    canAccessParent: hasFrameElement,
    frameDepth: getFrameDepth()
  };
}

/**
 * Get frame depth
 */
function getFrameDepth() {
  let depth = 0;
  let currentWindow = window;
  
  try {
    while (currentWindow !== currentWindow.parent) {
      depth++;
      currentWindow = currentWindow.parent;
      if (depth > 10) break; // Safety check
    }
  } catch {
    // Cross-origin frame access error
  }
  
  return depth;
}

/**
 * Initialize iframe support (simplified)
 */
export async function initializeIFrameSupport(options = {}) {
  const {
    enableLogging = true
  } = options;
  
  const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'IFrameSupport');
  
  try {
    if (enableLogging) {
      const support = checkIFrameSupport();
      logger.info('IFrame support initialized', {
        isInIframe: support.isInIframe,
        frameDepth: support.frameDepth,
        canAccessParent: support.canAccessParent
      });
    }
    
    return {
      success: true,
      info: checkIFrameSupport()
    };
  } catch (error) {
    logger.error('Failed to initialize iframe support', error);
    
    return {
      success: false,
      error: error.message
    };
  }
}

