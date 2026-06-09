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
import { usePromptPreview } from '../composables/usePromptPreview.js'

// Components
import BaseTextarea from '@/components/base/BaseTextarea.vue'

const settingsStore = useSettingsStore()
const { t } = useUnifiedI18n()
const logger = { 
  debug: (...args) => console.debug('[PromptTab]', ...args),
  error: (...args) => console.error('[PromptTab]', ...args)
}
const { createSetting } = useTabSettings(settingsStore, logger)
const { validatePromptTemplate: validate, getFirstError, getFirstErrorTranslated, clearErrors } = useValidation()
const { highlightElement } = useHighlightManager()
const { promptExamples, loadingExamples, generateExamples } = usePromptPreview(logger)

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
watch(currentPromptKey, async () => {
  validationErrorKey.value = ''
  clearErrors()
  
  if (showPreview.value) {
    await refreshExamples()
  }
})

// Language names for help text
const sourceLanguageName = computed(() => settingsStore.settings?.SOURCE_LANGUAGE || 'Auto')
const targetLanguageName = computed(() => settingsStore.settings?.TARGET_LANGUAGE || 'English')

// Preview State
const showPreview = ref(false)

// Helper to trigger example generation with current UI state
const refreshExamples = async () => {
  await generateExamples({
    template: activeTemplateValue.value,
    isAuto: currentPromptKey.value === 'PROMPT_TEMPLATE_AUTO',
    sourceLang: settingsStore.settings?.SOURCE_LANGUAGE,
    targetLang: settingsStore.settings?.TARGET_LANGUAGE,
    t
  })
}

// Refresh preview section
const refreshPreview = async () => {
  showPreview.value = true
  // Perform validation and (re)generate examples
  await validatePrompt()
  await refreshExamples()
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
  const isValid = await validate(activeTemplateValue.value, currentPromptKey.value)
  
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
    await refreshExamples()
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
    await refreshExamples()
  }
})
</script>
