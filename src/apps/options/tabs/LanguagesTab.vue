<template>
  <section class="languages-tab">
  <h2>{{ t('languages_section_title') || 'Languages' }}</h2>
    
    <div class="setting-group">
  <label>{{ t('source_language_label') || 'Source Language' }}</label>
      <LanguageDropdown
        v-model="sourceLanguage"
        :languages="sourceLanguages"
        type="source"
      />
    </div>
    
    <div class="setting-group">
  <label>{{ t('target_language_label') || 'Target Language' }}</label>
      <LanguageDropdown
        v-model="targetLanguage"
        :languages="targetLanguages"
        type="target"
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
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useValidation } from '@/utils/core/validation.js'
import { useLanguages } from '@/composables/useLanguages.js'
import LanguageDropdown from '@/components/feature/LanguageDropdown.vue'
import { useI18n } from 'vue-i18n'

const settingsStore = useSettingsStore()
const { validateLanguages: validate, getFirstError, clearErrors } = useValidation()
const { sourceLanguages, targetLanguages } = useLanguages()

const { t } = useI18n()

// Form values as refs
const sourceLanguage = ref(settingsStore.settings?.SOURCE_LANGUAGE || 'auto')
const targetLanguage = ref(settingsStore.settings?.TARGET_LANGUAGE || 'English')

// Sync with settings on mount
import { onMounted } from 'vue'
onMounted(() => {
  sourceLanguage.value = settingsStore.settings?.SOURCE_LANGUAGE || 'auto'
  targetLanguage.value = settingsStore.settings?.TARGET_LANGUAGE || 'English'
})

// Update settings when changed
watch(sourceLanguage, (value) => {
  settingsStore.updateSettingLocally('SOURCE_LANGUAGE', value)
  validateLanguages()
})
watch(targetLanguage, (value) => {
  settingsStore.updateSettingLocally('TARGET_LANGUAGE', value)
  validateLanguages()
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

// No need for extra watch logic; handled above
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
  flex-wrap: nowrap;
  align-items: center;
  justify-content: space-between;
  gap: $spacing-md;
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
    flex: 1;
    white-space: nowrap;
  }
  
  .language-dropdown {
    flex: 0 0 250px;
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
    
    .language-dropdown {
      min-width: auto;
      width: 100%;
    }
  }
}
</style>