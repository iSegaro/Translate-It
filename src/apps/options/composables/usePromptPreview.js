import { ref } from 'vue'
import { TranslationMode } from '@/shared/config/config.js'

/**
 * Composable to manage prompt preview generation logic.
 * Decouples the UI from the complex prompt assembly logic.
 */
export function usePromptPreview(customLogger = null) {
  const logger = customLogger || { error: (...args) => console.error('[usePromptPreview]', ...args) }
  const promptExamples = ref([])
  const loadingExamples = ref(false)

  // Sample data for previews
  const SAMPLE_TEXT = "Hello, how are you today? This is a sample text for previewing translation prompts."
  const SAMPLE_WORD = "Discovery"
  const SAMPLE_JSON = JSON.stringify([
    { id: "1", text: "Welcome to our website" },
    { id: "2", text: "Click here to learn more" },
    { id: "3", text: "Contact us for support" }
  ])

  /**
   * Internal helper to build a prompt using a provided template string instead of storage.
   * Mirrors runtime logic from promptBuilder.js and AIConversationHelper.js.
   */
  const buildPromptWithTemplate = async (template, text, sourceLang, targetLang, translateMode, providerType) => {
    const {
      getPromptBASESelectAsync,
      getPromptPopupTranslateAsync,
      getPromptBASEFieldAsync,
      getPromptBASEFieldAutoAsync,
      getPromptBASEScreenCaptureAsync,
      getPromptBASEBatchAsync,
      getPromptBASEAIBatchAsync,
      getPromptBASEAIBatchAutoAsync,
      getEnableDictionaryAsync,
      getPromptDictionaryAsync,
      getSourceLanguageAsync,
    } = await import('@/shared/config/config.js')

    const { getLanguageNameFromCode, getCanonicalCode } = await import('@/shared/config/languageConstants.js')

    const isSpecificTextJsonFormat = (obj) => {
      return (
        Array.isArray(obj) &&
        obj.length > 0 &&
        obj.every(
          (item) => typeof item === 'object' && item !== null && typeof item.text === 'string'
        )
      )
    }

    let isJsonMode = false
    try {
      const parsedText = JSON.parse(text)
      if (isSpecificTextJsonFormat(parsedText)) {
        isJsonMode = true
      }
    } catch {
      // Not JSON
    }

    const isAI = providerType === 'ai'
    const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1)

    let actualSourceLang = sourceLang === 'auto' ? await getSourceLanguageAsync() : sourceLang
    if (actualSourceLang === 'auto') {
      actualSourceLang = 'en'
    }

    const sourceName = capitalize(getLanguageNameFromCode(getCanonicalCode(actualSourceLang)) || actualSourceLang)
    const targetName = capitalize(getLanguageNameFromCode(getCanonicalCode(targetLang)) || targetLang)

    // Assembly instructions from template
    const promptInstructions = template
      .replace(/\$_{TEXT}\s*/g, '')
      .replace(/\n\s*$/g, '')
      .replace(/\$_{SOURCE}/g, sourceName)
      .replace(/\$_{TARGET}/g, targetName)

    const shouldUseBatchPrompt = isAI && (
      translateMode === TranslationMode.Select_Element ||
      translateMode === TranslationMode.Page ||
      isJsonMode
    )

    if (shouldUseBatchPrompt) {
      const batchPromptTemplate = sourceLang === 'auto'
        ? await getPromptBASEAIBatchAutoAsync()
        : await getPromptBASEAIBatchAsync()

      return batchPromptTemplate
        .replace(/\$_{SOURCE}/g, sourceName)
        .replace(/\$_{TARGET}/g, targetName)
        .replace(/\$_{PROMPT_INSTRUCTIONS}/g, promptInstructions)
        .replace(/\$_{TEXT}/g, text)
    }

    if (translateMode === TranslationMode.Select_Element && !isJsonMode) {
      const batchPromptTemplate = await getPromptBASEBatchAsync()
      return batchPromptTemplate
        .replace(/\$_{SOURCE}/g, sourceName)
        .replace(/\$_{TARGET}/g, targetName)
        .replace(/\$_{PROMPT_INSTRUCTIONS}/g, promptInstructions)
        .replace(/\$_{TEXT}/g, text)
    }

    let promptBase
    if (isJsonMode) {
      promptBase = await getPromptBASESelectAsync()
    } else if (translateMode === TranslationMode.Popup_Translate || translateMode === TranslationMode.Sidepanel_Translate) {
      promptBase = await getPromptPopupTranslateAsync()
    } else if (await getEnableDictionaryAsync() && translateMode === TranslationMode.Dictionary_Translation) {
      promptBase = await getPromptDictionaryAsync()
    } else {
      if (translateMode === TranslationMode.ScreenCapture) {
        promptBase = await getPromptBASEScreenCaptureAsync()
      } else {
        promptBase = sourceLang === 'auto' ? await getPromptBASEFieldAutoAsync() : await getPromptBASEFieldAsync()
      }
    }

    return promptBase
      .replace(/\$_{SOURCE}/g, sourceName)
      .replace(/\$_{TARGET}/g, targetName)
      .replace(/\$_{PROMPT_INSTRUCTIONS}/g, promptInstructions)
      .replace(/\$_{TEXT}/g, text)
  }

  /**
   * Generates a set of preview examples for various translation modes.
   */
  const generateExamples = async ({ template, isAuto, sourceLang, targetLang, t }) => {
    if (loadingExamples.value) return

    loadingExamples.value = true
    const examples = []
    
    // For Auto template preview, we force source language to 'auto' to see bidirectional logic
    const effectiveSourceLang = isAuto ? 'auto' : (sourceLang || 'en')

    try {
      // Field mode
      examples.push({
        mode: t('prompt_preview_mode_field') || 'Field Translation',
        description: t('prompt_preview_desc_field') || 'Text field translation (e.g., input boxes, text areas)',
        prompt: await buildPromptWithTemplate(template, SAMPLE_TEXT, effectiveSourceLang, targetLang, TranslationMode.Field, 'ai')
      })

      // Popup / Sidepanel mode
      examples.push({
        mode: t('prompt_preview_mode_popup') || 'Popup / Sidepanel Translation',
        description: t('prompt_preview_desc_popup') || 'Popup window or Sidepanel translation interface',
        prompt: await buildPromptWithTemplate(template, SAMPLE_TEXT, effectiveSourceLang, targetLang, TranslationMode.Popup_Translate, 'translate')
      })

      // Selection mode
      examples.push({
        mode: t('prompt_preview_mode_selection') || 'Text Selection',
        description: t('prompt_preview_desc_selection') || 'Selected text translation on the page',
        prompt: await buildPromptWithTemplate(template, SAMPLE_TEXT, effectiveSourceLang, targetLang, TranslationMode.Selection, 'translate')
      })

      // Select Element / Page mode (JSON)
      examples.push({
        mode: t('prompt_preview_mode_batch') || 'Select Element / Page Translate',
        description: t('prompt_preview_desc_batch') || 'Multiple elements or whole page translation in JSON format',
        prompt: await buildPromptWithTemplate(template, SAMPLE_JSON, effectiveSourceLang, targetLang, TranslationMode.Select_Element, 'ai')
      })

      // Dictionary mode
      examples.push({
        mode: t('prompt_preview_mode_dictionary') || 'Dictionary Translation',
        description: t('prompt_preview_desc_dictionary') || 'Brief word definitions and synonyms',
        prompt: await buildPromptWithTemplate(template, SAMPLE_WORD, effectiveSourceLang, targetLang, TranslationMode.Dictionary_Translation, 'ai')
      })

      promptExamples.value = examples
    } catch (error) {
      logger.error('Error generating examples:', error)
    } finally {
      loadingExamples.value = false
    }
  }

  return {
    promptExamples,
    loadingExamples,
    generateExamples
  }
}
