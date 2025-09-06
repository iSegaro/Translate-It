// IFrame Support System - Simplified Entry Point

// Export core managers that are actually used
export { IFrameManager, iFrameManager } from './managers/IFrameManager.js';
export { FrameRegistry } from '../windows/managers/crossframe/FrameRegistry.js';

// Export Vue composables
export { 
  useIFrameSupport, 
  useIFrameDetection, 
  useIFramePositioning 
} from './composables/useIFrameSupport.js';

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
  } catch (e) {
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
  
  try {
    if (enableLogging) {
      const support = checkIFrameSupport();
      console.log('🎯 IFrame support initialized', {
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
    console.error('❌ Failed to initialize iframe support', error);
    
    return {
      success: false,
      error: error.message
    };
  }
}

