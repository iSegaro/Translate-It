<template>
  <section class="options-tab-content prompt-tab">
    <div class="settings-container">
      <h2>{{ t('prompt_section_title') || 'Prompt Template' }}</h2>
      
      <div class="setting-group prompt-template-group vertical">
        <div class="prompt-type-selector">
          <button 
            type="button" 
            :class="['selector-btn', { active: currentPromptKey === 'PROMPT_TEMPLATE' }]"
            @click="currentPromptKey = 'PROMPT_TEMPLATE'"
          >
            {{ t('prompt_type_general') || 'General Template' }}
          </button>
          <button 
            type="button" 
            :class="['selector-btn', { active: currentPromptKey === 'PROMPT_TEMPLATE_AUTO' }]"
            @click="currentPromptKey = 'PROMPT_TEMPLATE_AUTO'"
          >
            {{ t('prompt_type_auto') || 'Auto Template' }}
          </button>
        </div>

        <div class="prompt-type-help-text">
          {{ currentPromptKey === 'PROMPT_TEMPLATE' 
            ? (t('prompt_help_general') || 'This template is used for standard translations from a specific source language.') 
            : (t('prompt_help_auto') || 'This template is used in bidirectional mode when the source language is set to "Auto".') 
          }}
        </div>

        <div class="prompt-label-with-button">
          <span class="setting-label">
            {{ currentPromptKey === 'PROMPT_TEMPLATE' 
              ? (t('prompt_template_label') || 'Prompt Template') 
              : (t('prompt_template_auto_label') || 'Auto Prompt Template') 
            }}
          </span>
          <button
            type="button"
            class="button-inline"
            @click="resetPrompt"
          >
            {{ t('prompt_reset_button') || 'Reset' }}
          </button>
        </div>
        
        <BaseTextarea
          :id="currentPromptKey"
          v-model="activeTemplateValue"
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
            id="PROMPT_PREVIEW_BUTTON"
            type="button"
            class="prompt-preview-button-action"
            @click="refreshPreview"
          >
            <span class="button-icon">🔍</span>
            <span>{{ t('prompt_preview_button') || 'Preview Generated Prompts' }}</span>
          </button>

          <div
            v-if="showPreview"
            class="prompt-preview-content"
          >
            <div
              v-if="loadingExamples"
              class="loading-indicator"
            >
              <div class="spinner" />
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
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { useTabSettings } from '../composables/useTabSettings.js'
import { useValidation } from '@/core/validation.js'
import { CONFIG, TranslationMode } from '@/shared/config/config.js'
import { useHighlightManager } from '../composables/useHighlightManager.js'

// Components
import BaseTextarea from '@/components/base/BaseTextarea.vue'

const settingsStore = useSettingsStore()
const { t } = useUnifiedI18n()
const logger = { debug: (...args) => console.debug('[PromptTab]', ...args) }
const { createSetting } = useTabSettings(settingsStore, logger)
const { validatePromptTemplate: validate, getFirstError, getFirstErrorTranslated, clearErrors } = useValidation()
const { highlightElement } = useHighlightManager()

// State
const currentPromptKey = ref('PROMPT_TEMPLATE')

// Default prompt template from config
const DEFAULT_PROMPT = CONFIG.PROMPT_TEMPLATE
const DEFAULT_PROMPT_AUTO = CONFIG.PROMPT_TEMPLATE_AUTO

// Validation State
const validationErrorKey = ref('')
const validationError = computed(() => validationErrorKey.value ? getFirstErrorTranslated('promptTemplate', t) : '')

// Prompt template settings
const promptTemplate = createSetting('PROMPT_TEMPLATE', DEFAULT_PROMPT)
const promptTemplateAuto = createSetting('PROMPT_TEMPLATE_AUTO', DEFAULT_PROMPT_AUTO)

// Computed property for the active textarea binding
const activeTemplateValue = computed({
  get: () => currentPromptKey.value === 'PROMPT_TEMPLATE' ? promptTemplate.value : promptTemplateAuto.value,
  set: (val) => {
    if (currentPromptKey.value === 'PROMPT_TEMPLATE') promptTemplate.value = val
    else promptTemplateAuto.value = val
  }
})

// Watch for prompt type switch to clear validation state
watch(currentPromptKey, () => {
  validationErrorKey.value = ''
  clearErrors()
  
  if (showPreview.value) {
    generatePromptExamples()
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
  const currentPromptTemplate = activeTemplateValue.value

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
  
  // For Auto template preview, we force source language to 'auto' to see the effect
  const isAutoMode = currentPromptKey.value === 'PROMPT_TEMPLATE_AUTO'
  const sourceLang = isAutoMode ? 'auto' : (settingsStore.settings?.SOURCE_LANGUAGE || 'en')
  const targetLang = settingsStore.settings?.TARGET_LANGUAGE || 'en'

  try {
    // Field mode
    examples.push({
      mode: t('prompt_preview_mode_field') || 'Field Translation',
      description: t('prompt_preview_desc_field') || 'Text field translation (e.g., input boxes, text areas)',
      prompt: await buildPromptWithCurrentTemplate(SAMPLE_TEXT, sourceLang, targetLang, TranslationMode.Field, 'ai')
    })

    // Popup / Sidepanel mode
    examples.push({
      mode: t('prompt_preview_mode_popup') || 'Popup / Sidepanel Translation',
      description: t('prompt_preview_desc_popup') || 'Popup window or Sidepanel translation interface',
      prompt: await buildPromptWithCurrentTemplate(SAMPLE_TEXT, sourceLang, targetLang, TranslationMode.Popup_Translate, 'translate')
    })

    // Selection mode
    examples.push({
      mode: t('prompt_preview_mode_selection') || 'Text Selection',
      description: t('prompt_preview_desc_selection') || 'Selected text translation on the page',
      prompt: await buildPromptWithCurrentTemplate(SAMPLE_TEXT, sourceLang, targetLang, TranslationMode.Selection, 'translate')
    })

    // Select Element / Page mode (JSON)
    examples.push({
      mode: t('prompt_preview_mode_batch') || 'Select Element / Page Translate',
      description: t('prompt_preview_desc_batch') || 'Multiple elements or whole page translation in JSON format',
      prompt: await buildPromptWithCurrentTemplate(
        SAMPLE_JSON,
        sourceLang,
        targetLang,
        TranslationMode.Select_Element,
        'ai'
      )
    })

    // Dictionary mode
    examples.push({
      mode: t('prompt_preview_mode_dictionary') || 'Dictionary Translation',
      description: t('prompt_preview_desc_dictionary') || 'Brief word definitions and synonyms (Note: This mode uses a fixed format)',
      prompt: await buildPromptWithCurrentTemplate(SAMPLE_WORD, sourceLang, targetLang, TranslationMode.Dictionary_Translation, 'ai')
    })

    promptExamples.value = examples
  } catch (error) {
    logger.error('Error generating prompt examples:', error)
  } finally {
    loadingExamples.value = false
  }
}

// Refresh preview section
const refreshPreview = async () => {
  showPreview.value = true
  // Perform validation and (re)generate examples
  await validatePrompt()
  await generatePromptExamples()
}

// Validation feedback listener
const handleValidationFeedback = (e) => {
  const { field } = e.detail || {};
  
  if (field === 'prompt' || field === 'PROMPT_TEMPLATE' || field === 'PROMPT_TEMPLATE_AUTO') {
    // If feedback is for the other template, switch to it first
    if (field === 'PROMPT_TEMPLATE' && currentPromptKey.value !== 'PROMPT_TEMPLATE') {
      currentPromptKey.value = 'PROMPT_TEMPLATE'
    } else if (field === 'PROMPT_TEMPLATE_AUTO' && currentPromptKey.value !== 'PROMPT_TEMPLATE_AUTO') {
      currentPromptKey.value = 'PROMPT_TEMPLATE_AUTO'
    }

    // Explicitly trigger validation feedback display
    validatePrompt(true);
    
    // Focus and highlight logic
    setTimeout(() => {
      highlightElement(currentPromptKey.value);
    }, 400);
  }
};

onMounted(() => {
  window.addEventListener('options-trigger-validation-feedback', handleValidationFeedback);
})

onUnmounted(() => {
  window.removeEventListener('options-trigger-validation-feedback', handleValidationFeedback);
})

// Validation function
const validatePrompt = async (showFeedback = false) => {
  clearErrors()
  const isValid = await validate(activeTemplateValue.value)
  
  if (!isValid && showFeedback) {
    validationErrorKey.value = getFirstError('promptTemplate') || ''
  } else if (isValid) {
    validationErrorKey.value = ''
  }
  
  return isValid
}

// Reset prompt to default
const resetPrompt = async () => {
  if (currentPromptKey.value === 'PROMPT_TEMPLATE') {
    promptTemplate.value = DEFAULT_PROMPT
  } else {
    promptTemplateAuto.value = DEFAULT_PROMPT_AUTO
  }
  
  if (showPreview.value) {
    await validatePrompt()
    await generatePromptExamples()
  }

  // Add highlight effect
  const textarea = document.querySelector('.prompt-template-input textarea')
  if (textarea) {
    textarea.classList.add('highlight-on-reset')
    setTimeout(() => {
      textarea.classList.remove('highlight-on-reset')
    }, 800)
  }
}

// Watch for UI language changes to refresh localized labels in examples
watch(() => settingsStore.settings?.APPLICATION_LOCALIZE, async (newVal, oldVal) => {
  if (newVal && oldVal && newVal !== oldVal && showPreview.value && !loadingExamples.value) {
    await generatePromptExamples()
  }
})
</script>
