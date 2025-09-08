/**
 * useFont.js - Font management composable
 * Provides reactive font settings and CSS generation for translation display
 */

import { computed, watch, ref, onUnmounted } from 'vue'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { CONFIG } from '@/shared/config/config.js'
import { systemFontDetector } from '@/shared/fonts/SystemFontDetector.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'useFont')

// Font CSS mapping with fallbacks
const FONT_CSS_MAP = {
  'auto': 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
  'system': 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto',
  'vazirmatn': '"Vazirmatn", "Vazir", Tahoma, Arial, sans-serif',
  'noto-sans': '"Noto Sans", "Noto Sans Arabic", "Noto Sans CJK", Arial, sans-serif',
  'arial': 'Arial, Helvetica, sans-serif',
  'times': '"Times New Roman", Times, serif',
  'georgia': 'Georgia, Times, serif',
  'tahoma': 'Tahoma, Geneva, sans-serif',
  'segoe-ui': '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
  'roboto': 'Roboto, Arial, sans-serif'
}

// RTL language detection
const RTL_LANGUAGES = ['farsi', 'persian', 'fa', 'arabic', 'ar', 'hebrew', 'he', 'urdu', 'ur']

/**
 * Font management composable
 * @param {string} targetLanguage - Target language for smart font detection
 * @param {Object} options - Configuration options
 */
export function useFont(targetLanguage = 'English', options = {}) {
  const {
    enableSmartDetection = true,
    fallbackFont = 'system',
    enableCSSVariables = true
  } = options

  // Handle both string and computed ref for targetLanguage
  const computedTargetLanguage = computed(() => {
    if (typeof targetLanguage === 'string') {
      return targetLanguage
    } else if (targetLanguage && typeof targetLanguage.value !== 'undefined') {
      return targetLanguage.value
    }
    return 'English'
  })
  
  // Get settings store
  const settingsStore = useSettingsStore()
  
  // Reactive font settings from store
  const fontFamily = computed(() => settingsStore.fontFamily || CONFIG.TRANSLATION_FONT_FAMILY)
  const fontSize = computed(() => settingsStore.fontSize || CONFIG.TRANSLATION_FONT_SIZE)
  
  // Smart font detection based on target language
  const getSmartFontFamily = (lang) => {
    if (!enableSmartDetection) return FONT_CSS_MAP[fallbackFont]
    
    const language = lang?.toLowerCase()
    
    // Persian/Farsi languages
    if (language === 'farsi' || language === 'persian' || language === 'fa') {
      return FONT_CSS_MAP['vazirmatn']
    }
    
    // Arabic languages
    if (language === 'arabic' || language === 'ar') {
      return FONT_CSS_MAP['noto-sans']
    }
    
    // Hebrew
    if (language === 'hebrew' || language === 'he') {
      return FONT_CSS_MAP['noto-sans']
    }
    
    // Urdu
    if (language === 'urdu' || language === 'ur') {
      return FONT_CSS_MAP['noto-sans']
    }
    
    // Default for Latin scripts
    return FONT_CSS_MAP['system']
  }
  
  // Generate CSS font-family value using SystemFontDetector
  const fontFamilyCSS = computed(() => {
    const fontValue = fontFamily.value
    
    if (fontValue === 'auto') {
      return getSmartFontFamily(computedTargetLanguage.value)
    }
    
    // Use SystemFontDetector for dynamic font CSS generation
    try {
      return systemFontDetector.getFontCSSFamily(fontValue)
    } catch (error) {
      logger.warn('Failed to get font CSS from SystemFontDetector, using fallback:', error)
      return FONT_CSS_MAP[fontValue] || FONT_CSS_MAP[fallbackFont]
    }
  })
  
  // Font size in pixels
  const fontSizeCSS = computed(() => {
    const size = parseInt(fontSize.value)
    return isNaN(size) ? '14px' : `${Math.max(10, Math.min(30, size))}px`
  })
  
  // Check if language is RTL
  const isRTL = computed(() => {
    return RTL_LANGUAGES.includes(computedTargetLanguage.value?.toLowerCase())
  })
  
  // Combined font styles object
  const fontStyles = computed(() => ({
    fontFamily: fontFamilyCSS.value,
    fontSize: fontSizeCSS.value,
    direction: isRTL.value ? 'rtl' : 'ltr',
    textAlign: isRTL.value ? 'right' : 'left'
  }))
  
  // CSS custom properties for dynamic styling
  const cssVariables = computed(() => {
    if (!enableCSSVariables) return {}
    
    return {
      '--translation-font-family': fontFamilyCSS.value,
      '--translation-font-size': fontSizeCSS.value,
      '--translation-direction': isRTL.value ? 'rtl' : 'ltr',
      '--translation-text-align': isRTL.value ? 'right' : 'left'
    }
  })
  
  // Apply CSS variables to document root (for global styling)
  const appliedVariables = ref(false)
  const applyGlobalCSSVariables = () => {
    if (typeof document === 'undefined' || !enableCSSVariables) return
    
    try {
      const root = document.documentElement
      Object.entries(cssVariables.value).forEach(([property, value]) => {
        root.style.setProperty(property, value)
      })
      appliedVariables.value = true
      logger.debug('Applied global CSS variables for fonts', cssVariables.value)
    } catch (error) {
      logger.warn('Failed to apply global CSS variables:', error)
    }
  }
  
  // Remove CSS variables from document root
  const removeGlobalCSSVariables = () => {
    if (typeof document === 'undefined' || !appliedVariables.value) return
    
    try {
      const root = document.documentElement
      Object.keys(cssVariables.value).forEach(property => {
        root.style.removeProperty(property)
      })
      appliedVariables.value = false
      logger.debug('Removed global CSS variables for fonts')
    } catch (error) {
      logger.warn('Failed to remove global CSS variables:', error)
    }
  }
  
  // Watch for changes and update global variables
  watch(cssVariables, () => {
    if (appliedVariables.value) {
      applyGlobalCSSVariables()
    }
  }, { deep: true })
  
  // Cleanup on unmount
  onUnmounted(() => {
    removeGlobalCSSVariables()
  })
  
  // Font validation
  const validateFont = () => {
    const errors = []
    
    // Validate font family
    if (!fontFamily.value) {
      errors.push('Font family is required')
    } else if (!FONT_CSS_MAP[fontFamily.value] && fontFamily.value !== 'auto') {
      errors.push('Invalid font family selected')
    }
    
    // Validate font size
    const size = parseInt(fontSize.value)
    if (isNaN(size)) {
      errors.push('Font size must be a valid number')
    } else if (size < 10 || size > 30) {
      errors.push('Font size must be between 10 and 30 pixels')
    }
    
    return {
      isValid: errors.length === 0,
      errors
    }
  }
  
  // Get available fonts from SystemFontDetector
  const availableFonts = ref([])
  const fontSizeOptions = computed(() => CONFIG.FONT_SIZE_OPTIONS || [])
  
  // Load fonts from SystemFontDetector
  const loadAvailableFonts = async () => {
    try {
      const fonts = await systemFontDetector.getAvailableFonts()
      availableFonts.value = fonts
    } catch (error) {
      logger.warn('Failed to load available fonts:', error)
      availableFonts.value = []
    }
  }
  
  
  // Font loading detection (basic)
  const isFontLoaded = ref(false)
  const checkFontLoading = async () => {
    if (typeof document === 'undefined') return true
    
    try {
      // Simple check if document fonts are ready
      await document.fonts.ready
      isFontLoaded.value = true
      return true
    } catch (error) {
      logger.warn('Font loading check failed:', error)
      isFontLoaded.value = false
      return false
    }
  }
  
  // Initialize font loading check
  checkFontLoading()
  
  return {
    // Reactive font settings
    fontFamily,
    fontSize,
    fontFamilyCSS,
    fontSizeCSS,
    isRTL,
    
    // Combined styles
    fontStyles,
    cssVariables,
    
    // State
    isFontLoaded,
    
    // Methods
    applyGlobalCSSVariables,
    removeGlobalCSSVariables,
    validateFont,
    checkFontLoading,
    
    // Configuration
    availableFonts,
    fontSizeOptions,
    loadAvailableFonts,
    
    // Utilities
    getSmartFontFamily
  }
}

/**
 * Global font composable for app-wide font management
 */
export function useGlobalFont() {
  return useFont('English', {
    enableCSSVariables: true,
    enableSmartDetection: true
  })
}

export default useFont