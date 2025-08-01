<template>
  <section class="languages-tab">
    <h2>{{ $i18n('languages_section_title') || 'Languages' }}</h2>
    
    <div class="setting-group">
      <label>{{ $i18n('source_language_label') || 'Source Language' }}</label>
      <LanguageSelector
        v-model="sourceLanguage"
        :languages="sourceLanguages"
        type="source"
        class="language-select"
      />
    </div>
    
    <div class="setting-group">
      <label>{{ $i18n('target_language_label') || 'Target Language' }}</label>
      <LanguageSelector
        v-model="targetLanguage"
        :languages="targetLanguages"
        type="target"
        class="language-select"
      />
    </div>
    
    <!-- Validation errors -->
    <div
      v-if="validationError"
      class="validation-error"
    >
      {{ validationError }}
    </div>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useSettingsStore } from '@/store/core/settings'
import { useValidation } from '@/utils/validation.js'
import { useLanguages } from '@/composables/useLanguages.js'
import LanguageSelector from '@/components/feature/LanguageSelector.vue'

const settingsStore = useSettingsStore()
const { validateLanguages: validate, getFirstError, clearErrors } = useValidation()
const { sourceLanguages, targetLanguages } = useLanguages()

// Form values
const sourceLanguage = computed({
  get: () => settingsStore.settings?.SOURCE_LANGUAGE || 'auto',
  set: async (value) => {
    settingsStore.updateSettingLocally('SOURCE_LANGUAGE', value)
    await validateLanguages()
  }
})

const targetLanguage = computed({
  get: () => settingsStore.settings?.TARGET_LANGUAGE || 'English',
  set: async (value) => {
    settingsStore.updateSettingLocally('TARGET_LANGUAGE', value)
    await validateLanguages()
  }
})

// Validation
const validationError = ref('')

const validateLanguages = async () => {
  clearErrors()
  const isValid = await validate(sourceLanguage.value, targetLanguage.value)
  
  if (!isValid) {
    validationError.value = getFirstError('sourceLanguage') || getFirstError('targetLanguage')
  } else {
    validationError.value = ''
  }
  
  return isValid
}

// Watch for changes and validate
watch([sourceLanguage, targetLanguage], () => {
  if (sourceLanguage.value && targetLanguage.value) {
    validateLanguages()
  }
})
</script>

<style lang="scss" scoped>
@use '@/assets/styles/variables.scss' as *;

.languages-tab {
  max-width: 600px;
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
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  padding-bottom: $spacing-base;
  border-bottom: $border-width $border-style var(--color-border);
  
  &:last-child {
    border-bottom: none;
    margin-bottom: 0;
  }
  
  label {
    font-size: $font-size-base;
    font-weight: $font-weight-medium;
    color: var(--color-text);
    margin-bottom: 0;
    flex-grow: 1;
    min-width: 200px;
  }
  
  .language-select {
    min-width: 250px;
    flex-shrink: 0;
  }
}

.validation-error {
  background-color: var(--color-error);
  color: white;
  padding: $spacing-base;
  border-radius: $border-radius-base;
  margin-top: $spacing-base;
  font-size: $font-size-sm;
}

// Mobile responsive
@media (max-width: #{$breakpoint-md}) {
  .setting-group {
    flex-direction: column;
    align-items: stretch;
    gap: $spacing-sm;
    
    label {
      min-width: auto;
    }
    
    .language-select {
      min-width: auto;
      width: 100%;
    }
  }
}
</style>