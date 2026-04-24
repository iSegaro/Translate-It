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
          <p>{{ t('prompt_template_help') || 'You can use the following keywords in your prompt template:' }}</p>
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
      </div>
    </div>
  </section>
</template>

<script setup>
import './PromptTab.scss'
import { ref, computed } from 'vue'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { useTabSettings } from '../composables/useTabSettings.js'
import { useValidation } from '@/core/validation.js'
import { CONFIG } from '@/shared/config/config.js'

// Components
import BaseTextarea from '@/components/base/BaseTextarea.vue'

const settingsStore = useSettingsStore()
const { t } = useUnifiedI18n()
const logger = { debug: (...args) => console.debug('[PromptTab]', ...args) } // Simple logger for this tab
const { createSetting } = useTabSettings(settingsStore, logger)
const { validatePromptTemplate: validate, getFirstError, getFirstErrorTranslated, clearErrors } = useValidation()

// Default prompt template from config
const DEFAULT_PROMPT = CONFIG.PROMPT_TEMPLATE

// Validation State
const validationErrorKey = ref('')
const validationError = computed(() => validationErrorKey.value ? getFirstErrorTranslated('promptTemplate', t) : '')

// Prompt template setting
const promptTemplate = createSetting('PROMPT_TEMPLATE', DEFAULT_PROMPT, {
  onChanged: () => validatePrompt()
})

// Language names for help text
const sourceLanguageName = computed(() => settingsStore.settings?.SOURCE_LANGUAGE || 'Auto')
const targetLanguageName = computed(() => settingsStore.settings?.TARGET_LANGUAGE || 'English')

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
</script>
