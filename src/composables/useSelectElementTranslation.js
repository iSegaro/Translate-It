// src/composables/useSelectElementTranslation.js
// Vue composable for Select Element Translation Mode
// Integrates with existing background script handlers

import { ref, reactive, onMounted, onUnmounted, readonly } from 'vue'
import { useI18n } from './useI18n.js'
import { getBrowserAsync } from '@/utils/browser-polyfill.js'

export function useSelectElementTranslation() {
  const { t } = useI18n()
  
  // Browser API reference
  let Browser = null
  
  // Reactive state following Plan1.md architecture
  const state = reactive({
    isActivating: false,      // در حال فعال‌سازی mode
    isSelecting: false,       // mode فعال، منتظر انتخاب
    selectedElement: null,    // element انتخاب شده
    extractedText: '',        // متن استخراج شده
    error: null              // خطاهای احتمالی
  })

  // Event emitter for parent components
  const onTextExtracted = ref(null)
  const onModeChanged = ref(null)
  
  // Timeout management
  const selectionTimeout = ref(null)
  const SELECTION_TIMEOUT_MS = 30000 // 30 seconds

  /**
   * فعال‌سازی Select Element Mode
   * مطابق با Plan1.md و OLD implementation
   */
  const activateSelectElement = async () => {
    state.isActivating = true
    state.error = null
    
    try {
      console.log('[useSelectElementTranslation] Activating select element mode')
      
      // اطمینان از دسترسی به Browser API
      if (!Browser) {
        Browser = await getBrowserAsync()
      }
      
      // ارسال پیام به background script (مطابق elementModeHandler.js)
      const response = await Browser.runtime.sendMessage({
        action: "activateSelectElementMode",
        data: true
      })

      if (response?.success) {
        state.isSelecting = true
        console.log('[useSelectElementTranslation] Select element mode activated successfully')
        
        // تنظیم timeout برای selection
        startSelectionTimeout()
        
        // اطلاع‌رسانی به parent component
        if (onModeChanged.value) {
          onModeChanged.value(true)
        }
      } else {
        throw new Error(response?.error || 'Failed to activate select element mode')
      }
      
    } catch (error) {
      console.error('[useSelectElementTranslation] Activation error:', error)
      state.error = error.message
      
      // نمایش پیام خطا مناسب به کاربر
      handleSelectElementError(error)
      
    } finally {
      state.isActivating = false
    }
  }

  /**
   * غیرفعال‌سازی Select Element Mode
   */
  const deactivateSelectElement = async () => {
    state.isActivating = true
    state.error = null
    
    try {
      console.log('[useSelectElementTranslation] Deactivating select element mode')
      
      // اطمینان از دسترسی به Browser API
      if (!Browser) {
        Browser = await getBrowserAsync()
      }
      
      const response = await Browser.runtime.sendMessage({
        action: "activateSelectElementMode",
        data: false
      })

      if (response?.success) {
        state.isSelecting = false
        state.selectedElement = null
        state.extractedText = ''
        state.error = null
        
        // پاکسازی timeout
        clearSelectionTimeout()
        
        console.log('[useSelectElementTranslation] Select element mode deactivated successfully')
        
        // اطلاع‌رسانی به parent component
        if (onModeChanged.value) {
          onModeChanged.value(false)
        }
      } else {
        throw new Error(response?.error || 'Failed to deactivate select element mode')
      }
      
    } catch (error) {
      console.error('[useSelectElementTranslation] Deactivation error:', error)
      state.error = error.message
      
    } finally {
      state.isActivating = false
    }
  }

  /**
   * تغییر وضعیت Select Element Mode (toggle)
   */
  const toggleSelectElement = async () => {
    if (state.isSelecting) {
      await deactivateSelectElement()
    } else {
      await activateSelectElement()
    }
  }

  /**
   * شروع timeout برای selection
   */
  const startSelectionTimeout = () => {
    // پاکسازی timeout قبلی در صورت وجود
    clearSelectionTimeout()
    
    selectionTimeout.value = setTimeout(() => {
      console.warn('[useSelectElementTranslation] Selection timeout reached')
      handleSelectElementError(new Error('Selection timeout'))
    }, SELECTION_TIMEOUT_MS)
  }

  /**
   * پاکسازی timeout
   */
  const clearSelectionTimeout = () => {
    if (selectionTimeout.value) {
      clearTimeout(selectionTimeout.value)
      selectionTimeout.value = null
    }
  }

  /**
   * مدیریت انتخاب element از content script
   * مطابق با Plan1.md flow
   */
  const handleElementSelected = (elementData) => {
    console.log('[useSelectElementTranslation] Element selected:', elementData)
    
    // پاکسازی timeout
    clearSelectionTimeout()
    
    state.selectedElement = elementData
    state.extractedText = elementData.text || ''
    state.isSelecting = false
    state.error = null // پاکسازی خطاهای قبلی
    
    // اطلاع‌رسانی به parent component برای populate کردن form
    if (onTextExtracted.value && state.extractedText) {
      onTextExtracted.value(state.extractedText, elementData)
    }
    
    // اطلاع‌رسانی تغییر mode
    if (onModeChanged.value) {
      onModeChanged.value(false)
    }
  }

  /**
   * مدیریت خطاهای Select Element
   * مطابق با Plan1.md Error Handling Strategy
   */
  const handleSelectElementError = (error) => {
    console.error('[useSelectElementTranslation] Error:', error)
    
    // پاکسازی timeout
    clearSelectionTimeout()
    
    // Reset state
    state.isActivating = false
    state.isSelecting = false
    
    // تشخیص نوع خطا و نمایش پیام مناسب
    let errorMessage = t('SELECT_ELEMENT_GENERIC_ERROR', 'An error occurred while activating select mode')
    
    if (error.message?.includes('permission') || error.message?.includes('Permission')) {
      errorMessage = t('SELECT_ELEMENT_PERMISSION_ERROR', 'Permission denied. Please reload the page and try again.')
    } else if (error.message?.includes('timeout') || error.message?.includes('Selection timeout')) {
      errorMessage = t('SELECT_ELEMENT_TIMEOUT', 'Selection timeout. No element was selected within 30 seconds.')
    } else if (error.message?.includes('tab') || error.message?.includes('Tab')) {
      errorMessage = t('SELECT_ELEMENT_TAB_ERROR', 'Cannot access current tab. Please try again.')
    }
    
    // تنظیم پیام خطا
    state.error = errorMessage
    
    // اطلاع‌رسانی تغییر mode
    if (onModeChanged.value) {
      onModeChanged.value(false)
    }
    
    // Cleanup background state
    deactivateSelectElement().catch(err => {
      console.error('[useSelectElementTranslation] Cleanup error:', err)
    })
  }

  /**
   * تنظیم listener برای پیام‌های background script
   * مطابق با Plan1.md Event Listeners
   */
  const setupBackgroundListener = async () => {
    const messageListener = (message, sender) => {
      console.log('[useSelectElementTranslation] Background message received:', message)
      
      // مدیریت پیام انتخاب element
      if (message.action === 'elementSelected') {
        handleElementSelected(message.data)
      }
      // مدیریت خطاهای element selection
      else if (message.action === 'elementSelectionError') {
        handleSelectElementError(new Error(message.data?.error || 'Element selection failed'))
      }
      // مدیریت لغو selection توسط کاربر
      else if (message.action === 'elementSelectionCancelled') {
        state.isSelecting = false
        clearSelectionTimeout()
        if (onModeChanged.value) {
          onModeChanged.value(false)
        }
      }
      // مدیریت success پیام‌ها
      else if (message.action === 'elementSelectionSuccess') {
        console.log('[useSelectElementTranslation] Element selection completed successfully')
        state.isSelecting = false
        clearSelectionTimeout()
        if (onModeChanged.value) {
          onModeChanged.value(false)
        }
      }
    }

    // اطمینان از دسترسی به Browser API
    if (!Browser) {
      Browser = await getBrowserAsync()
    }
    
    Browser.runtime.onMessage.addListener(messageListener)
    return messageListener
  }

  /**
   * بررسی وضعیت فعلی Select Element از storage
   */
  const loadCurrentState = async () => {
    try {
      // اطمینان از دسترسی به Browser API
      if (!Browser) {
        Browser = await getBrowserAsync()
      }
      
      const result = await Browser.storage.local.get('selectElementState')
      if (result.selectElementState === true) {
        state.isSelecting = true
        console.log('[useSelectElementTranslation] Restored active select element state')
      }
    } catch (error) {
      console.error('[useSelectElementTranslation] Error loading state:', error)
    }
  }

  // Event listener management
  let messageListener = null

  // Lifecycle management
  onMounted(async () => {
    console.log('[useSelectElementTranslation] Component mounted, setting up listeners')
    
    try {
      // اطمینان از دسترسی به Browser API
      if (!Browser) {
        Browser = await getBrowserAsync()
      }
      
      // تنظیم listener برای پیام‌های background
      messageListener = await setupBackgroundListener()
      
      // بارگذاری وضعیت فعلی
      await loadCurrentState()
    } catch (error) {
      console.error('[useSelectElementTranslation] Initialization error:', error)
    }
  })

  onUnmounted(() => {
    console.log('[useSelectElementTranslation] Component unmounted, cleaning up')
    
    // پاکسازی timeout
    clearSelectionTimeout()
    
    // پاکسازی listeners
    if (messageListener && Browser) {
      Browser.runtime.onMessage.removeListener(messageListener)
    }
    
    // غیرفعال‌سازی mode در صورت فعال بودن
    if (state.isSelecting) {
      deactivateSelectElement().catch(err => {
        console.error('[useSelectElementTranslation] Cleanup deactivation error:', err)
      })
    }
  })

  // Public API
  return {
    // State (readonly for external components)
    isActivating: readonly(ref(state.isActivating)),
    isSelecting: readonly(ref(state.isSelecting)),
    selectedElement: readonly(ref(state.selectedElement)),
    extractedText: readonly(ref(state.extractedText)),
    error: readonly(ref(state.error)),
    
    // Methods
    activateSelectElement,
    deactivateSelectElement,
    toggleSelectElement,
    
    // Event handlers for parent components
    onTextExtracted,
    onModeChanged,
    
    // Utilities
    handleElementSelected,
    loadCurrentState
  }
}