// Composable for smart popup resizing based on content
import { ref, nextTick } from 'vue'
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'usePopupResize');

export function usePopupResize() {
  const isResizing = ref(false)
  
  // Popup size constraints
  // در استایل popup.scss حداکثر ارتفاع 600px تنظیم شده است
  // در استایل popup.scss حداقل ارتفاع 350px تنظیم شده است
  const MIN_HEIGHT = 350 // Default popup height
  const MAX_HEIGHT = 600 // Maximum allowed height
  const MAX_FIELD_HEIGHT = 200 // Maximum field height before scroll
  
  /**
   * Calculate optimal popup height based on content
   * @param {HTMLElement} outputElement - The translation output element
   * @returns {Promise<number>} - The calculated height
   */
  const calculateOptimalHeight = async (outputElement) => {
    if (!outputElement) return MIN_HEIGHT
    
    await nextTick()
    
    // Get the actual content height
    const contentHeight = outputElement.scrollHeight
    const currentHeight = outputElement.clientHeight
    
    // If content fits in current space, no resize needed
    if (contentHeight <= currentHeight) {
      return MIN_HEIGHT
    }
    
    // Calculate additional height needed
    const additionalHeight = Math.min(
      contentHeight - currentHeight,
      MAX_FIELD_HEIGHT - currentHeight
    )
    
    // Calculate new popup height
    const newPopupHeight = Math.min(MIN_HEIGHT + additionalHeight, MAX_HEIGHT)
    
    logger.debug('[usePopupResize] Height calculation:', {
      contentHeight,
      currentHeight,
      additionalHeight,
      newPopupHeight
    })
    
    return newPopupHeight
  }
  
  /**
   * Adjust popup window height dynamically based on content
   * @param {HTMLElement} outputElement - The output element to measure
   * @param {number} contentHeight - The content height
   */
  const adjustContentLayout = async (outputElement, contentHeight) => {
    if (isResizing.value || !outputElement) {
      logger.warn('[usePopupResize] Skipping layout adjustment:', { isResizing: isResizing.value, hasElement: !!outputElement })
      return
    }
    
    isResizing.value = true
    
    try {
      logger.debug('[usePopupResize] Element info:', {
        element: outputElement.tagName,
        classList: outputElement.classList.toString(),
        scrollHeight: outputElement.scrollHeight,
        clientHeight: outputElement.clientHeight,
        windowHeight: window.innerHeight,
        bodyHeight: document.body.scrollHeight
      })
      
      // Flexbox approach - let popup-wrapper handle the sizing
      const popupWrapper = document.querySelector('.popup-wrapper')
      const headerElement = document.querySelector('.sticky-header')
      const actualHeaderHeight = headerElement ? headerElement.offsetHeight : 88
      
      logger.debug('[usePopupResize] Flexbox measurements:', {
        actualHeaderHeight,
        contentHeight,
        currentWindowHeight: window.innerHeight,
        maxPopupHeight: MAX_HEIGHT
      })
      
      // Calculate required popup height
      const padding = 20
      const requiredPopupHeight = Math.min(
        actualHeaderHeight + contentHeight + padding,
        MAX_HEIGHT
      )
      
      if (requiredPopupHeight > MIN_HEIGHT) {
        // Check if content exceeds maximum popup height
        if (requiredPopupHeight >= MAX_HEIGHT) {
          // Content is too long, use maximum height and enable scrolling
          if (popupWrapper) {
            popupWrapper.style.height = `${MAX_HEIGHT}px`
          }
          document.body.style.height = `${MAX_HEIGHT}px`
          
          // Enable scroll in scrollable-content area instead of field itself
          const scrollableContent = document.querySelector('.scrollable-content')
          if (scrollableContent) {
            scrollableContent.style.setProperty('overflow-y', 'auto', 'important')
          }
          
          // Let field expand naturally within the scrollable area
          outputElement.style.removeProperty('max-height')
          outputElement.style.setProperty('height', 'auto', 'important')
          outputElement.style.setProperty('overflow-y', 'visible', 'important')
          
          logger.debug('[usePopupResize] ✅ Maximum height reached - enabled scrolling:', {
            popupHeight: MAX_HEIGHT,
            contentHeight,
            scrollEnabled: true
          })
        } else {
          // Content fits within popup, resize to fit exactly
          if (popupWrapper) {
            popupWrapper.style.height = `${requiredPopupHeight}px`
          }
          document.body.style.height = `${requiredPopupHeight}px`
          
          // Disable scrolling - content fits
          const scrollableContent = document.querySelector('.scrollable-content')
          if (scrollableContent) {
            scrollableContent.style.setProperty('overflow-y', 'visible', 'important')
          }
          
          // Let output field expand naturally to fit content
          outputElement.style.removeProperty('max-height')
          outputElement.style.setProperty('height', 'auto', 'important')
          outputElement.style.setProperty('overflow-y', 'visible', 'important')
          
          logger.debug('[usePopupResize] ✅ Flexbox resize to exact fit:', {
            fromHeight: window.innerHeight,
            toHeight: requiredPopupHeight,
            headerHeight: actualHeaderHeight,
            contentHeight,
            scrollEnabled: false
          })
        }
      } else {
        // Reset to minimum height
        if (popupWrapper) {
          popupWrapper.style.height = `${MIN_HEIGHT}px`
        }
        document.body.style.height = `${MIN_HEIGHT}px`
        
        outputElement.style.removeProperty('max-height')
        outputElement.style.setProperty('height', 'auto', 'important')
        outputElement.style.setProperty('overflow-y', 'visible', 'important')
        
        logger.debug('[usePopupResize] ✅ Using minimum height for flexbox layout')
      }
      
      // Force reflow to ensure styles are applied
      outputElement.offsetHeight
      
      setTimeout(() => {
        isResizing.value = false
      }, 100)
      
    } catch (error) {
      logger.error('[usePopupResize] Failed to adjust popup layout:', error)
      isResizing.value = false
    }
  }
  
  /**
   * Reset popup and output field to default state (Flexbox layout)
   * @param {HTMLElement} outputElement - The output element
   */
  const resetOutputField = (outputElement) => {
    if (!outputElement) return
    
    // Reset popup wrapper and body to minimum height
    const popupWrapper = document.querySelector('.popup-wrapper')
    if (popupWrapper) {
      popupWrapper.style.height = `${MIN_HEIGHT}px`
    }
    document.body.style.height = `${MIN_HEIGHT}px`
    
    // Reset output field styles to natural expansion
    outputElement.style.removeProperty('max-height')
    outputElement.style.setProperty('height', 'auto', 'important')
    outputElement.style.setProperty('overflow-y', 'visible', 'important')
    
    logger.debug('[usePopupResize] Reset flexbox layout to default:', {
      popupHeight: `${MIN_HEIGHT}px`,
      fieldMaxHeight: 'auto'
    })
  }
  
  /**
   * Reset all layout adjustments (Flexbox)
   */
  const resetLayout = () => {
    // Reset both popup wrapper and body to minimum height
    const popupWrapper = document.querySelector('.popup-wrapper')
    if (popupWrapper) {
      popupWrapper.style.height = `${MIN_HEIGHT}px`
    }
    document.body.style.height = `${MIN_HEIGHT}px`
    logger.debug('[usePopupResize] Reset flexbox layout - popup height to:', `${MIN_HEIGHT}px`)
  }
  
  /**
   * Handle translation result and adjust popup layout immediately (unified with fade-in)
   * @param {HTMLElement} outputElement - The translation output element
   */
  const handleTranslationResult = async (outputElement) => {
    if (!outputElement) return
    
    await nextTick()
    
    // Pre-calculate height immediately and start resize with fade-in animation
    // This creates a unified, smooth experience
    const contentHeight = outputElement.scrollHeight
    await adjustContentLayout(outputElement, contentHeight)
    
    logger.debug('[usePopupResize] Unified animation started - fade-in + resize together')
  }
  
  return {
    isResizing,
    calculateOptimalHeight,
    adjustContentLayout,
    resetOutputField,
    resetLayout,
    handleTranslationResult,
    MIN_HEIGHT,
    MAX_HEIGHT,
    MAX_FIELD_HEIGHT
  }
}