<template>
  <section class="options-tab-content prompt-tab">
    <div class="settings-container">
      <h2>{{ t('prompt_section_title') || 'Prompt Template' }}</h2>
      
      <div class="setting-group prompt-template-group vertical">
        <div class="prompt-label-with-button">
          <span class="setting-label">{{ t('prompt_template_label') || 'Prompt Template' }}</span>
          <button
            type="button"
            class="button-inline"
            @click="resetPrompt"
          >
            {{ t('prompt_reset_button') || 'Reset' }}
          </button>
        </div>
        
        <BaseTextarea
          v-model="promptTemplate"
          :placeholder="t('prompt_template_placeholder') || 'Enter your prompt template here. Use keywords like $_{SOURCE}, $_{TARGET}, and $_{TEXT}.'"
          :rows="10"
          class="prompt-template-input"
          dir="ltr"
        />

        <!-- Validation error -->
        <div
          v-if="validationError"
          class="validation-error"
        >
          {{ validationError }}
        </div>

        <div class="prompt-template-help">
          <p>{{ t('prompt_template_help') || 'You must use the following keywords in your prompt template:' }}</p>
          <ul>
            <li>
              <div class="keyword-box">
                <code dir="ltr">${_SOURCE}</code>
                <span class="lang-name">{{ sourceLanguageName }}</span>
              </div>
              <div class="keyword-desc">
                {{ t('prompt_source_help') || 'Source language.' }}
              </div>
            </li>
            <li>
              <div class="keyword-box">
                <code dir="ltr">${_TARGET}</code>
                <span class="lang-name">{{ targetLanguageName }}</span>
              </div>
              <div class="keyword-desc">
                {{ t('prompt_target_help') || 'Target language.' }}
              </div>
            </li>
            <li>
              <div class="keyword-box">
                <code dir="ltr">${_TEXT}</code>
              </div>
              <div class="keyword-desc">
                {{ t('prompt_text_help') || 'Text to be translated.' }}
              </div>
            </li>
          </ul>
        </div>

        <!-- Preview Prompts Section -->
        <div class="prompt-preview-section">
          <button
            type="button"
            class="prompt-preview-toggle"
            @click="togglePreview"
          >
            <span class="toggle-icon">{{ showPreview ? '▼' : '▶' }}</span>
            <span>{{ t('prompt_preview_button') || 'Preview Generated Prompts' }}</span>
          </button>

          <div v-if="showPreview" class="prompt-preview-content">
            <div v-if="loadingExamples" class="loading-indicator">
              <div class="spinner"></div>
              <span>{{ t('prompt_preview_loading') || 'Generating prompts...' }}</span>
            </div>

            <template v-else>
              <div class="preview-note">
                ℹ️ {{ t('prompt_preview_note') || 'These examples show how your template is used in different translation modes' }}
              </div>

              <div
                v-for="example in promptExamples"
                :key="example.mode"
                class="prompt-example-card"
              >
                <div class="example-header">
                  <span class="example-mode">{{ example.mode }}</span>
                  <span class="example-desc">{{ example.description }}</span>
                </div>
                <pre
                  class="example-prompt"
                  dir="ltr"
                >{{ example.prompt }}</pre>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import './PromptTab.scss'
import { ref, computed, watch } from 'vue'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { useTabSettings } from '../composables/useTabSettings.js'
import { useValidation } from '@/core/validation.js'
import { CONFIG, TranslationMode } from '@/shared/config/config.js'

// Components
import BaseTextarea from '@/components/base/BaseTextarea.vue'

const settingsStore = useSettingsStore()
const { t } = useUnifiedI18n()
const logger = { debug: (...args) => console.debug('[PromptTab]', ...args) }
const { createSetting } = useTabSettings(settingsStore, logger)
const { validatePromptTemplate: validate, getFirstError, getFirstErrorTranslated, clearErrors } = useValidation()

// Default prompt template from config
const DEFAULT_PROMPT = CONFIG.PROMPT_TEMPLATE

// Validation State
const validationErrorKey = ref('')
const validationError = computed(() => validationErrorKey.value ? getFirstErrorTranslated('promptTemplate', t) : '')

// Prompt template setting
const promptTemplate = createSetting('PROMPT_TEMPLATE', DEFAULT_PROMPT, {
  onChanged: () => {
    validatePrompt()
    // Only regenerate examples if preview is already open
    if (showPreview.value) {
      generatePromptExamples()
    }
  }
})

// Language names for help text
const sourceLanguageName = computed(() => settingsStore.settings?.SOURCE_LANGUAGE || 'Auto')
const targetLanguageName = computed(() => settingsStore.settings?.TARGET_LANGUAGE || 'English')

// Preview State
const showPreview = ref(false)
const promptExamples = ref([])
const loadingExamples = ref(false)

// Sample text for preview
const SAMPLE_TEXT = "Hello, how are you today? This is a sample text for previewing translation prompts."
const SAMPLE_WORD = "Discovery"

// Sample JSON for Select Element mode
const SAMPLE_JSON = JSON.stringify([
  { id: "1", text: "Welcome to our website" },
  { id: "2", text: "Click here to learn more" },
  { id: "3", text: "Contact us for support" }
])

// Helper function to build prompt with current template value (not from storage)
const buildPromptWithCurrentTemplate = async (text, sourceLang, targetLang, translateMode, providerType) => {
  // Import here to avoid circular dependency
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
    getPromptAsync,
    getPromptAutoAsync,
  } = await import('@/shared/config/config.js')

  const { getLanguageNameFromCode, getCanonicalCode } = await import('@/shared/config/languageConstants.js')

  // Helper function to check JSON format (same as in AIConversationHelper)
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

  // Use current template value from the input field (not from storage)
  const currentPromptTemplate = promptTemplate.value

  // Remove $_{TEXT} from prompt instructions since it will be replaced in the base prompt
  const promptInstructionsWithoutText = currentPromptTemplate
    .replace(/\$_{TEXT}\s*/g, '')  // Remove $_{TEXT} placeholder and trailing whitespace
    .replace(/\n\s*$/g, '')        // Remove trailing empty lines

  const promptInstructions = promptInstructionsWithoutText
    .replace(/\$_{SOURCE}/g, sourceName)
    .replace(/\$_{TARGET}/g, targetName)

  // Handle AI provider batch translation - MIRRORS AIConversationHelper logic
  // Use batch prompt for Select_Element, Page, or JSON input (excluding dictionary)
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

  // Select Element mode (non-JSON) - MIRRORS promptBuilder logic
  if (translateMode === TranslationMode.Select_Element && !isJsonMode) {
    const batchPromptTemplate = await getPromptBASEBatchAsync()
    return batchPromptTemplate
      .replace(/\$_{SOURCE}/g, sourceName)
      .replace(/\$_{TARGET}/g, targetName)
      .replace(/\$_{PROMPT_INSTRUCTIONS}/g, promptInstructions)
      .replace(/\$_{TEXT}/g, text)
  }

  // Select appropriate base prompt - MIRRORS promptBuilder logic
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

  let finalPromptWithInstructions = promptBase
    .replace(/\$_{SOURCE}/g, sourceName)
    .replace(/\$_{TARGET}/g, targetName)
    .replace(/\$_{PROMPT_INSTRUCTIONS}/g, promptInstructions)

  // Replace text placeholder
  const finalPrompt = finalPromptWithInstructions.replace(/\$_{TEXT}/g, text)

  return finalPrompt
}

// Generate prompt examples for different modes
const generatePromptExamples = async () => {
  if (loadingExamples.value) return

  loadingExamples.value = true
  const examples = []
  const sourceLang = settingsStore.settings?.SOURCE_LANGUAGE || 'en'
  const targetLang = settingsStore.settings?.TARGET_LANGUAGE || 'en'

  try {
    /* Commented out as it's currently unused by any provider
    // Field mode (translate provider)
    examples.push({
      mode: 'Field Translation (Low LLM Capability)',
      description: 'Text field translation (e.g., input boxes, text areas)',
      prompt: await buildPromptWithCurrentTemplate(SAMPLE_TEXT, sourceLang, targetLang, TranslationMode.Field, 'translate')
    })
    */

    // Field mode
    examples.push({
      mode: 'Field Translation',
      description: 'Text field translation (e.g., input boxes, text areas)',
      prompt: await buildPromptWithCurrentTemplate(SAMPLE_TEXT, sourceLang, targetLang, TranslationMode.Field, 'ai')
    })

    // Popup / Sidepanel mode
    examples.push({
      mode: 'Popup / Sidepanel Translation',
      description: 'Popup window or Sidepanel translation interface',
      prompt: await buildPromptWithCurrentTemplate(SAMPLE_TEXT, sourceLang, targetLang, TranslationMode.Popup_Translate, 'translate')
    })

    // Selection mode
    examples.push({
      mode: 'Text Selection',
      description: 'Selected text translation on the page',
      prompt: await buildPromptWithCurrentTemplate(SAMPLE_TEXT, sourceLang, targetLang, TranslationMode.Selection, 'translate')
    })

    // Select Element / Page mode (JSON)
    examples.push({
      mode: 'Select Element / Page Translate',
      description: 'Multiple elements or whole page translation in JSON format',
      prompt: await buildPromptWithCurrentTemplate(
        SAMPLE_JSON,
        sourceLang,
        targetLang,
        TranslationMode.Select_Element,
        'ai'
      )
    })

    // Screen Capture mode
    examples.push({
      mode: 'Screen Capture',
      description: 'OCR and translation of text from images',
      prompt: await buildPromptWithCurrentTemplate(SAMPLE_TEXT, sourceLang, targetLang, TranslationMode.ScreenCapture, 'translate')
    })

    // Dictionary mode
    examples.push({
      mode: 'Dictionary Translation',
      description: 'Brief word definitions and synonyms (Note: This mode uses a fixed format)',
      prompt: await buildPromptWithCurrentTemplate(SAMPLE_WORD, sourceLang, targetLang, TranslationMode.Dictionary_Translation, 'ai')
    })

    promptExamples.value = examples
  } catch (error) {
    logger.error('Error generating prompt examples:', error)
  } finally {
    loadingExamples.value = false
  }
}

// Toggle preview section
const togglePreview = () => {
  showPreview.value = !showPreview.value
  if (showPreview.value && promptExamples.value.length === 0) {
    generatePromptExamples()
  }
}

// Validation function
const validatePrompt = async () => {
  clearErrors()
  const isValid = await validate(promptTemplate.value)
  validationErrorKey.value = isValid ? '' : (getFirstError('promptTemplate') || '')
  return isValid
}

// Reset prompt to default
const resetPrompt = async () => {
  promptTemplate.value = DEFAULT_PROMPT
  await validatePrompt()

  // Add highlight effect
  const textarea = document.querySelector('.prompt-template-input textarea')
  if (textarea) {
    textarea.classList.add('highlight-on-reset')
    setTimeout(() => {
      textarea.classList.remove('highlight-on-reset')
    }, 800)
  }
}

// Watch for prompt changes and regenerate examples if preview is open
watch(promptTemplate, async () => {
  if (showPreview.value && !loadingExamples.value) {
    await generatePromptExamples()
  }
})
</script>
