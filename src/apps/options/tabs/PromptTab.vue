<template>
  <section class="prompt-tab">
    <h2>{{ t('prompt_section_title') || 'Prompt Template' }}</h2>
    
    <div class="setting-group prompt-template-group">
      <label class="prompt-label-with-button">
        <span>{{ t('prompt_template_label') || 'Prompt Template' }}</span>
        <button
          type="button"
          class="button-inline"
          @click="resetPrompt"
        >
          {{ t('prompt_reset_button') || 'Reset' }}
        </button>
      </label>
      
      <BaseTextarea
        v-model="promptTemplate"
        :placeholder="t('prompt_template_placeholder') || 'Enter your prompt template here. Use keywords like $_{SOURCE}, $_{TARGET}, and $_{TEXT}.'"
        :rows="5"
        class="prompt-template-input"
      />

      <!-- Validation error -->
      <div
        v-if="validationErrorKey"
        class="validation-error"
      >
        {{ t(validationErrorKey) }}
      </div>

      <div class="prompt-template-help">
        <p>{{ t('prompt_template_help') || 'You can use the following keywords in your prompt template:' }}</p>
        <ul>
          <li>
            <code>${_SOURCE}</code>: {{ t('prompt_source_help') || 'Source language.' }}
            <span class="lang-name">({{ sourceLanguageName }})</span>
          </li>
          <li>
            <code>${_TARGET}</code>: {{ t('prompt_target_help') || 'Target language.' }}
            <span class="lang-name">({{ targetLanguageName }})</span>
          </li>
          <li>
            <code>${_TEXT}</code>: {{ t('prompt_text_help') || 'Text to be translated.' }}
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
    // Get the error key directly for reactive translation
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

<style lang="scss" scoped>
@use "@/assets/styles/base/variables" as *;

.prompt-tab {
  max-width: 100%;
  width: 100%;
  box-sizing: border-box;
}

h2 {
  font-size: $font-size-xl;
  font-weight: $font-weight-medium;
  margin-top: 0;
  margin-bottom: $spacing-lg;
  padding-bottom: $spacing-base;
  border-bottom: $border-width $border-style var(--color-border);
  color: var(--color-text);
}

.setting-group {
  margin-bottom: $spacing-lg;
  
  &:last-child {
    margin-bottom: 0;
  }
}

.prompt-label-with-button {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  width: 100%;
  max-width: 100%;
  margin-bottom: $spacing-sm;
  box-sizing: border-box;
  
  span {
    font-size: $font-size-base;
    font-weight: $font-weight-medium;
    color: var(--color-text);
    flex: 1;
    min-width: 0;
  }
}

.button-inline {
  padding: $spacing-xs $spacing-sm;
  font-size: $font-size-xs;
  font-weight: $font-weight-semibold;
  border: $border-width $border-style var(--color-primary);
  background-color: transparent;
  color: var(--color-primary);
  border-radius: $border-radius-base;
  cursor: pointer;
  transition: all $transition-base;
  flex-shrink: 0;
  margin-left: $spacing-sm;
  white-space: nowrap;
  
  &:hover {
    background-color: var(--color-primary);
    color: white;
  }
}

.prompt-template-input {
  width: 100%;
  margin-bottom: $spacing-lg;
  
  :deep(textarea) {
    font-family: inherit;
    line-height: 1.6;
    background-color: var(--input-bg-color, var(--color-background));
    color: var(--input-text-color, var(--color-text));
    min-height: 150px;
    
    &.highlight-on-reset {
      animation: strong-highlight 1s ease-out;
    }
  }
}

.prompt-template-help {
  max-width: 90%;
  margin: $spacing-lg auto 0;
  background-color: var(--tab-button-active-bg, var(--color-surface));
  border: $border-width $border-style var(--color-border);
  border-radius: $border-radius-md;
  padding: $spacing-md;
  font-size: $font-size-xs;
  color: var(--color-text-secondary);
  
  p {
    margin: 0 0 $spacing-base 0;
  }
  
  ul {
    padding-left: $spacing-lg;
    margin: 0;
  }
  
  li {
    margin-bottom: $spacing-xs;
  }
  
  code {
    background-color: var(--color-border);
    color: var(--color-text);
    padding: 3px 6px;
    border-radius: $border-radius-sm;
    font-family: monospace;
  }
  
  .lang-name {
    font-style: italic;
    color: var(--color-text);
  }
}

// Animation for reset button feedback
@keyframes strong-highlight {
  0% {
    background-color: var(--input-bg-color, var(--color-background));
  }
  30% {
    background-color: var(--tab-button-active-bg, var(--color-surface));
    border-color: var(--input-focus-border-color, var(--color-primary));
    box-shadow: 0 0 8px var(--input-focus-shadow-color, rgba(25, 103, 210, 0.2));
  }
  70% {
    background-color: var(--tab-button-active-bg, var(--color-surface));
    border-color: var(--input-focus-border-color, var(--color-primary));
    box-shadow: 0 0 8px var(--input-focus-shadow-color, rgba(25, 103, 210, 0.2));
  }
  100% {
    background-color: var(--input-bg-color, var(--color-background));
  }
}

// Mobile responsive
@media (max-width: #{$breakpoint-md}) {
  .prompt-label-with-button {
    flex-direction: column;
    align-items: stretch;
    gap: $spacing-sm;
  }
  
  .prompt-template-help {
    max-width: 100%;
    margin-left: 0;
    margin-right: 0;
  }
}
</style>