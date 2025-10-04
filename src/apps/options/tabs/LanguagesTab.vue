<template>
  <section class="languages-tab">
    <h2>{{ t('languages_section_title') || 'Languages' }}</h2>
    
    <div v-if="!isLoaded" class="loading-message">
      Loading languages...
    </div>
    <template v-else>
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
    </template>
    
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
import { ref, onMounted, watch } from 'vue'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useValidation } from '@/core/validation.js'
import { useLanguages } from '@/composables/shared/useLanguages.js'
import LanguageDropdown from '@/components/feature/LanguageDropdown.vue'
import { useI18n } from 'vue-i18n'

const settingsStore = useSettingsStore()
const { validateLanguages: validate, getFirstError, clearErrors } = useValidation()
const { sourceLanguages, targetLanguages, loadLanguages, isLoaded } = useLanguages()

const { t } = useI18n()

// Form values as refs
const sourceLanguage = ref(settingsStore.settings?.SOURCE_LANGUAGE || 'auto')
const targetLanguage = ref(settingsStore.settings?.TARGET_LANGUAGE || 'English')

// Sync with settings on mount
onMounted(async () => {
  await loadLanguages();
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

// Only validate languages in this tab
defineExpose({
  validate: validateLanguages
})
</script>

<style lang="scss" scoped>
@use "@/assets/styles/base/variables" as *;

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

.font-settings {
  flex-direction: column;
  align-items: stretch;
  border-top: 2px solid var(--color-border);
  margin-top: $spacing-xl;
  padding-top: $spacing-lg;
  
  h3 {
    font-size: $font-size-lg;
    font-weight: $font-weight-medium;
    margin: 0 0 $spacing-base 0;
    color: var(--color-text);
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