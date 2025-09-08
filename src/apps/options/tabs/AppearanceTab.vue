<template>
  <section class="appearance-tab">
    <h2>{{ t('appearance_section_title') || 'Appearance' }}</h2>
    
    <!-- Font Settings -->
    <div class="setting-group font-settings">
      <h3>{{ t('font_settings_title') || 'Font Settings' }}</h3>
      <p class="setting-description">
        {{ t('font_settings_description') || 'Customize the font and size for translation display' }}
      </p>
      <FontSelector
        ref="fontSelectorRef"
        :font-family="fontFamily"
        :font-size="fontSize"
        :target-language="targetLanguage"
        @update:font-family="updateFontFamily"
        @update:font-size="updateFontSize"
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
import { computed, ref, watch, onMounted } from 'vue'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import FontSelector from '@/components/feature/FontSelector.vue'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'

const { t } = useUnifiedI18n()
const settingsStore = useSettingsStore()
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'AppearanceTab')

// Refs
const fontSelectorRef = ref(null)
const validationError = ref('')

// Font settings refs synchronized with store (like other tabs)
const fontFamily = ref(settingsStore.settings?.TRANSLATION_FONT_FAMILY || 'auto')
const fontSize = ref(settingsStore.settings?.TRANSLATION_FONT_SIZE || '14')

// Sync with settings on mount
onMounted(() => {
  fontFamily.value = settingsStore.settings?.TRANSLATION_FONT_FAMILY || 'auto'
  fontSize.value = settingsStore.settings?.TRANSLATION_FONT_SIZE || '14'
})

// Get target language for font preview
const targetLanguage = computed(() => settingsStore.settings.TARGET_LANGUAGE)

// Update settings locally when changed (like other tabs)
watch(fontFamily, (value) => {
  settingsStore.updateSettingLocally('TRANSLATION_FONT_FAMILY', value)
  validateFonts()
})

watch(fontSize, (value) => {
  settingsStore.updateSettingLocally('TRANSLATION_FONT_SIZE', value)
  validateFonts()
})

// Methods - only update local refs, store sync happens via watchers
const updateFontFamily = (newFontFamily) => {
  validationError.value = ''
  fontFamily.value = newFontFamily
}

const updateFontSize = (newFontSize) => {
  validationError.value = ''
  fontSize.value = newFontSize
}

// Validation
const validateFonts = () => {
  if (fontSelectorRef.value?.validate) {
    const isValid = fontSelectorRef.value.validate()
    if (!isValid) {
      validationError.value = t('font_validation_failed') || 'Font settings validation failed'
    } else {
      validationError.value = ''
    }
  }
}
</script>

<style lang="scss" scoped>
@use "@/assets/styles/base/variables" as *;

.appearance-tab {
  padding: $spacing-lg;
  
  h2 {
    font-size: $font-size-xl;
    font-weight: $font-weight-bold;
    color: var(--color-text);
    margin-bottom: $spacing-lg;
    border-bottom: 2px solid var(--color-primary);
    padding-bottom: $spacing-base;
  }

  .setting-group {
    margin-bottom: $spacing-xl;
    
    h3 {
      font-size: $font-size-lg;
      font-weight: $font-weight-medium;
      color: var(--color-text);
      margin-bottom: $spacing-sm;
    }
    
    .setting-description {
      font-size: $font-size-sm;
      color: var(--color-text-secondary);
      margin-bottom: $spacing-lg;
      line-height: 1.5;
    }
  }

  .font-settings {
    background-color: var(--color-background-secondary);
    border: 1px solid var(--color-border);
    border-radius: $border-radius-lg;
    padding: $spacing-lg;
    
    h3 {
      margin-top: 0;
      color: var(--color-primary);
    }
  }

  .validation-error {
    background-color: var(--color-error);
    color: white;
    padding: $spacing-base;
    border-radius: $border-radius-base;
    margin-top: $spacing-base;
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
  }
}

// Mobile responsive
@media (max-width: #{$breakpoint-md}) {
  .appearance-tab {
    padding: $spacing-base;
    
    h2 {
      font-size: $font-size-lg;
    }
    
    .setting-group {
      margin-bottom: $spacing-lg;
    }
    
    .font-settings {
      padding: $spacing-base;
    }
  }
}
</style>