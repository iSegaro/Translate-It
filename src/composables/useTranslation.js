// src/composables/useTranslation.js
// Vue composable for translation functionality in sidepanel with improved error handling
import { ref, computed, nextTick } from 'vue'
import { useBrowserAPI } from './useBrowserAPI.js'
import { useSettingsStore } from '@/store/core/settings.js'
import { languageList } from '@/utils/languages.js'
import { SimpleMarkdown } from '@/utils/simpleMarkdown.js'
import { getTranslationString } from '@/utils/i18n.js'
import { getErrorMessageByKey } from '../error-management/ErrorMessages.js'
import { determineTranslationMode } from '@/utils/translationModeHelper.js'
import { TranslationMode } from '@/config.js'
import { correctTextDirection, applyElementDirection } from '@/utils/textDetection.js'
import { parseBoolean } from '@/utils/i18n.js'
import { AUTO_DETECT_VALUE } from '@/constants.js'

// Helper functions
const getLanguagePromptName = (code) => {
  const lang = languageList.find(l => l.code === code)
  return lang?.promptName || code
}

const getLanguageDisplayValue = (code) => {
  const lang = languageList.find(l => l.code === code)
  return lang?.name || code
}

export function useTranslation() {
  // State
  const sourceText = ref('')
  const translatedText = ref('')
  const sourceLanguage = ref(AUTO_DETECT_VALUE)
  const targetLanguage = ref('English')
  const isTranslating = ref(false)
  const translationError = ref('')
  const translationResult = ref(null)

  // Composables
  const browserAPI = useBrowserAPI()
  const settingsStore = useSettingsStore()

  // Computed
  const hasSourceText = computed(() => sourceText.value.trim().length > 0)
  const hasTranslation = computed(() => translatedText.value.length > 0)
  const canTranslate = computed(() => {
    return hasSourceText.value && 
           targetLanguage.value && 
           targetLanguage.value !== AUTO_DETECT_VALUE &&
           !isTranslating.value
  })

  // Extract error message helper
  const extractErrorMessage = (err) => {
    if (!err) return ''
    if (typeof err === 'string') return err
    if (err._originalMessage && typeof err._originalMessage === 'string') return err._originalMessage
    if (typeof err.message === 'string') return err.message
    try {
      return JSON.stringify(err)
    } catch {
      return ''
    }
  }

  // Show spinner in result area
  const showSpinner = (resultElement) => {
    if (!resultElement) return
    
    resultElement.classList.remove('fade-in')
    resultElement.textContent = ''
    
    const spinnerContainer = document.createElement('div')
    spinnerContainer.className = 'spinner-center'
    
    const spinner = document.createElement('div')
    spinner.className = 'spinner'
    
    spinnerContainer.appendChild(spinner)
    resultElement.appendChild(spinnerContainer)
  }

  // Handle translation response
  const handleTranslationResponse = async (response, textToTranslate, sourceLangIdentifier, targetLangIdentifier, resultElement) => {
    if (!resultElement) return

    resultElement.textContent = ''
    translationError.value = ''

    // Handle connection errors
    if (response._isConnectionError) {
      const errorMsg = 'Translation service temporarily unavailable. Please try again.'
      translationError.value = errorMsg
      resultElement.textContent = errorMsg
      return
    }

    if (response?.success && response.data?.translatedText) {
      const translated = response.data.translatedText
      translatedText.value = translated
      
      // Render markdown
      const markdownElement = SimpleMarkdown.render(translated)
      if (markdownElement) {
        resultElement.appendChild(markdownElement)
      }
      
      // Store original markdown for copy functionality
      resultElement.dataset.originalMarkdown = translated
      resultElement.classList.add('fade-in')
      correctTextDirection(resultElement, translated)

      // Update detected source language if auto-detect was used
      const sourceLangCode = getLanguagePromptName(sourceLangIdentifier)
      if (response.data.detectedSourceLang && 
          (!sourceLangCode || sourceLangCode === AUTO_DETECT_VALUE)) {
        const detectedDisplay = getLanguageDisplayValue(response.data.detectedSourceLang)
        if (detectedDisplay) {
          sourceLanguage.value = detectedDisplay
        }
      }
    } else {
      // Handle error
      const fallback = await getTranslationString('popup_string_translate_error_response') || 
                      '(⚠️ An error occurred during translation.)'
      let msg = extractErrorMessage(response?.error) || fallback
      const error_msg = getErrorMessageByKey(msg)
      if (error_msg) msg = error_msg
      
      translationError.value = msg
      resultElement.textContent = msg
      correctTextDirection(resultElement, msg)
    }
  }

  // Main translation function
  const triggerTranslation = async (resultElement) => {
    const textToTranslate = sourceText.value.trim()
    const targetLangIdentifier = targetLanguage.value.trim()
    const sourceLangIdentifier = sourceLanguage.value.trim()

    if (!textToTranslate) {
      return false
    }
    
    if (!targetLangIdentifier) {
      return false
    }

    const targetLangCodeCheck = getLanguagePromptName(targetLangIdentifier)
    if (!targetLangCodeCheck || targetLangCodeCheck === AUTO_DETECT_VALUE) {
      return false
    }

    let sourceLangCheck = getLanguagePromptName(sourceLangIdentifier)
    if (!sourceLangCheck) {
      sourceLangCheck = AUTO_DETECT_VALUE
    }

    isTranslating.value = true
    translationError.value = ''
    translatedText.value = ''
    
    if (resultElement) {
      showSpinner(resultElement)
    }
    
    correctTextDirection(document.getElementById('sourceText'), textToTranslate)
    
    // Apply RTL direction to result if needed
    try {
      const isRTL = parseBoolean(await getTranslationString('IsRTL'))
      if (resultElement) {
        applyElementDirection(resultElement, isRTL)
      }
    } catch (error) {
      console.warn('Could not determine text direction:', error)
    }

    const translateMode = determineTranslationMode(
      textToTranslate,
      TranslationMode.Sidepanel_Translate
    )

    try {
      const response = await browserAPI.safeSendMessage({
        action: 'TRANSLATE',
        context: 'popup',
        data: {
          text: textToTranslate,
          provider: settingsStore.settings.TRANSLATION_API,
          sourceLanguage: sourceLangCheck,
          targetLanguage: targetLangCodeCheck,
          mode: 'popup',
          options: {}
        }
      })

      await handleTranslationResponse(
        response,
        textToTranslate,
        sourceLangIdentifier,
        targetLangIdentifier,
        resultElement
      )
      
      return true
    } catch (error) {
      const fallback = await getTranslationString('popup_string_translate_error_trigger') || 
                      '(⚠️ An error occurred.)'
      const errMsg = extractErrorMessage(error) || fallback
      
      translationError.value = errMsg
      if (resultElement) {
        resultElement.textContent = errMsg
        correctTextDirection(resultElement, errMsg)
      }
      
      return false
    } finally {
      isTranslating.value = false
    }
  }

  // Clear translation
  const clearTranslation = () => {
    sourceText.value = ''
    translatedText.value = ''
    translationError.value = ''
    sourceLanguage.value = AUTO_DETECT_VALUE
    
    // Reset target language to user preference
    settingsStore.loadSettings().then(() => {
      const settings = settingsStore.settings
      targetLanguage.value = getLanguageDisplayValue(settings.TARGET_LANGUAGE) || 'English'
    })
  }

  // Swap languages
  const swapLanguages = async () => {
    const sourceVal = sourceLanguage.value
    const targetVal = targetLanguage.value

    const sourceCode = getLanguagePromptName(sourceVal)
    const targetCode = getLanguagePromptName(targetVal)

    let resolvedSourceCode = sourceCode
    let resolvedTargetCode = targetCode

    // If source is auto-detect, get from settings
    if (sourceCode === AUTO_DETECT_VALUE) {
      try {
        await settingsStore.loadSettings()
        const settings = settingsStore.settings
        resolvedSourceCode = settings.SOURCE_LANGUAGE
      } catch (err) {
        console.error('[useTranslation] Failed to load source language from settings', err)
        resolvedSourceCode = null
      }
    }

    // If target is auto-detect (shouldn't happen but for safety)
    if (targetCode === AUTO_DETECT_VALUE) {
      try {
        await settingsStore.loadSettings()
        const settings = settingsStore.settings
        resolvedTargetCode = settings.TARGET_LANGUAGE
      } catch (err) {
        console.error('[useTranslation] Failed to load target language from settings', err)
        resolvedTargetCode = null
      }
    }

    // Only swap if both languages are valid
    if (resolvedSourceCode && 
        resolvedTargetCode && 
        resolvedSourceCode !== AUTO_DETECT_VALUE) {
      
      const newSourceDisplay = getLanguageDisplayValue(resolvedTargetCode)
      const newTargetDisplay = getLanguageDisplayValue(resolvedSourceCode)

      sourceLanguage.value = newSourceDisplay || targetVal
      targetLanguage.value = newTargetDisplay || sourceVal
      
      return true
    } else {
      console.warn('[useTranslation] Cannot swap - invalid language selection.', {
        resolvedSourceCode,
        resolvedTargetCode
      })
      return false
    }
  }

  // Setter functions
  const setSourceText = (text) => {
    sourceText.value = text || ''
  }

  const setSourceLanguage = (language) => {
    sourceLanguage.value = language || AUTO_DETECT_VALUE
  }

  const setTargetLanguage = (language) => {
    targetLanguage.value = language || 'English'
  }

  // Load last translation
  const loadLastTranslation = async () => {
    try {
      await settingsStore.loadSettings()
      const settings = settingsStore.settings
      
      if (settings.lastTranslation) {
        const { sourceText: lastSource, translatedText: lastTranslated, 
                sourceLanguage: lastSourceLang, targetLanguage: lastTargetLang } = settings.lastTranslation
        
        if (lastSource) {
          sourceText.value = lastSource
        }
        if (lastTranslated) {
          translatedText.value = lastTranslated
        }
        if (lastSourceLang) {
          const sourceLangDisplay = getLanguageDisplayValue(lastSourceLang)
          if (sourceLangDisplay) {
            sourceLanguage.value = sourceLangDisplay
          }
        }
        if (lastTargetLang) {
          const targetLangDisplay = getLanguageDisplayValue(lastTargetLang)
          if (targetLangDisplay) {
            targetLanguage.value = targetLangDisplay
          }
        }
      }
    } catch (error) {
      console.error('[useTranslation] Error loading last translation:', error)
    }
  }

  return {
    // State
    sourceText,
    translatedText,
    sourceLanguage,
    targetLanguage,
    isTranslating,
    translationError,
    translationResult,
    
    // Computed
    hasSourceText,
    hasTranslation,
    canTranslate,
    
    // Methods
    triggerTranslation,
    clearTranslation,
    swapLanguages,
    loadLastTranslation,
    showSpinner,
    handleTranslationResponse,
    
    // Setters
    setSourceText,
    setSourceLanguage,
    setTargetLanguage
  }
}