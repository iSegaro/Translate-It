// useIFrameSupport - Simplified Vue composable for essential iframe functionality
import { ref, computed } from 'vue';

/**
 * Simplified composable for basic iframe detection
 */
export function useIFrameDetection() {
  const isInIframe = ref(window !== window.top);
  const isMainDocument = ref(window === window.top);
  const frameDepth = ref(getFrameDepth());
  
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
  
  return {
    isInIframe,
    isMainDocument,
    frameDepth
  };
}

/**
 * Lightweight composable for iframe-aware positioning
 */
export function useIFramePositioning() {
  const { isInIframe } = useIFrameDetection();
  
  const transformPosition = (position) => {
    if (!isInIframe.value) return position;
    
    try {
      // Get iframe offset from parent
      const frameElement = window.frameElement;
      if (frameElement) {
        const frameRect = frameElement.getBoundingClientRect();
        return {
          x: position.x + frameRect.left,
          y: position.y + frameRect.top
        };
      }
    } catch {
      // Cross-origin access error
    }
    
    return position;
  };
  
  const getFrameBounds = () => {
    if (!isInIframe.value) {
      return {
        width: window.innerWidth,
        height: window.innerHeight,
        x: 0,
        y: 0
      };
    }
    
    try {
      const frameElement = window.frameElement;
      if (frameElement) {
        const rect = frameElement.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height,
          x: rect.left,
          y: rect.top
        };
      }
    } catch {
      // Cross-origin access error
    }
    
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      x: 0,
      y: 0
    };
  };
  
  return {
    isInIframe,
    transformPosition,
    getFrameBounds
  };
}

/**
 * Main composable for iframe support (simplified)
 */
export function useIFrameSupport() {
  const { isInIframe, isMainDocument } = useIFrameDetection();
  const { transformPosition, getFrameBounds } = useIFramePositioning();
  
  const hasIFrameSupport = computed(() => isInIframe.value || isMainDocument.value);
  
  return {
    // Basic detection
    isInIframe,
    isMainDocument,
    hasIFrameSupport,
    
    // Positioning utilities
    transformPosition,
    getFrameBounds
  };
}