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
  let lastGenerationId = 0

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
    const myGenerationId = ++lastGenerationId
    loadingExamples.value = true
    const examples = []
    
    // For Auto template preview, we force source language to 'auto' to see bidirectional logic
    const effectiveSourceLang = isAuto ? 'auto' : (sourceLang || 'en')

    try {
      // Modes to generate
      const modes = [
        { mk: 'prompt_preview_mode_field', dk: 'prompt_preview_desc_field', m: TranslationMode.Field, type: 'ai' },
        { mk: 'prompt_preview_mode_popup', dk: 'prompt_preview_desc_popup', m: TranslationMode.Popup_Translate, type: 'translate' },
        { mk: 'prompt_preview_mode_selection', dk: 'prompt_preview_desc_selection', m: TranslationMode.Selection, type: 'translate' },
        { mk: 'prompt_preview_mode_batch', dk: 'prompt_preview_desc_batch', m: TranslationMode.Select_Element, type: 'ai' },
        { mk: 'prompt_preview_mode_dictionary', dk: 'prompt_preview_desc_dictionary', m: TranslationMode.Dictionary_Translation, type: 'ai' }
      ]

      for (const modeSpec of modes) {
        // Abandon if a newer request has started
        if (myGenerationId !== lastGenerationId) return

        const sample = modeSpec.m === TranslationMode.Select_Element ? SAMPLE_JSON : (modeSpec.m === TranslationMode.Dictionary_Translation ? SAMPLE_WORD : SAMPLE_TEXT)
        const prompt = await buildPromptWithTemplate(template, sample, effectiveSourceLang, targetLang, modeSpec.m, modeSpec.type)
        
        examples.push({
          mode: t(modeSpec.mk) || modeSpec.mk,
          description: t(modeSpec.dk) || modeSpec.dk,
          prompt
        })
      }

      // Only apply if this is still the latest request
      if (myGenerationId === lastGenerationId) {
        promptExamples.value = examples
        loadingExamples.value = false
      }
    } catch (error) {
      if (myGenerationId === lastGenerationId) {
        logger.error('Error generating examples:', error)
        loadingExamples.value = false
      }
    }
  }

  return {
    promptExamples,
    loadingExamples,
    generateExamples
  }
}
