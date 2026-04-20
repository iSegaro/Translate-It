<template>
  <section class="options-tab-content">
    <h2>{{ t('prompt_section_title') || 'Prompt Template' }}</h2>
    
    <div class="setting-group prompt-template-group">
      <div class="prompt-label-with-button">
        <span>{{ t('prompt_template_label') || 'Prompt Template' }}</span>
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
            <code dir="ltr">${_SOURCE}</code>: {{ t('prompt_source_help') || 'Source language.' }}
            <span class="lang-name">({{ sourceLanguageName }})</span>
          </li>
          <li>
            <code dir="ltr">${_TARGET}</code>: {{ t('prompt_target_help') || 'Target language.' }}
            <span class="lang-name">({{ targetLanguageName }})</span>
          </li>
          <li>
            <code dir="ltr">${_TEXT}</code>: {{ t('prompt_text_help') || 'Text to be translated.' }}
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useValidation } from '@/core/validation.js'
import { CONFIG } from '@/shared/config/config.js'
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import { useI18n } from 'vue-i18n'

const settingsStore = useSettingsStore()
const { validatePromptTemplate: validate, getFirstError, getFirstErrorTranslated, clearErrors } = useValidation()

// Default prompt template from config
const DEFAULT_PROMPT = CONFIG.PROMPT_TEMPLATE
const { t } = useI18n()

// Validation
const validationErrorKey = ref('')

// Reactive translated validation error
const validationError = computed(() => {
  if (!validationErrorKey.value) return ''
  return getFirstErrorTranslated('promptTemplate', t) || ''
})

// Prompt template
const promptTemplate = computed({
  get: () => settingsStore.settings?.PROMPT_TEMPLATE || DEFAULT_PROMPT,
  set: async (value) => {
    settingsStore.updateSettingLocally('PROMPT_TEMPLATE', value)
    await validatePrompt()
  }
})

// Language names for help text
const sourceLanguageName = computed(() => settingsStore.settings?.SOURCE_LANGUAGE || 'Auto')
const targetLanguageName = computed(() => settingsStore.settings?.TARGET_LANGUAGE || 'English')

// Validation function
const validatePrompt = async () => {
  clearErrors()
  const isValid = await validate(promptTemplate.value)

  if (!isValid) {
    // Get the error key (not translated) for reactive translation
    validationErrorKey.value = getFirstError('promptTemplate') || ''
  } else {
    validationErrorKey.value = ''
  }

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
