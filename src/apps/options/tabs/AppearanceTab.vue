<template>
  <section class="options-tab-content appearance-tab">
    <div class="settings-container">
      <h2>{{ t('appearance_section_title') || 'Appearance' }}</h2>
      
      <!-- Font Settings -->
      <BaseFieldset :legend="t('font_settings_title') || 'Font Settings'">
        <p class="setting-description">
          {{ t('font_settings_description') || 'Customize the font and size for translation display' }}
        </p>
        <div class="font-selector-wrapper">
          <FontSelector
            ref="fontSelectorRef"
            :font-family="fontFamily"
            :font-size="fontSize"
            :target-language="targetLanguage"
            @update:font-family="fontFamily = $event"
            @update:font-size="fontSize = $event"
          />
        </div>
      </BaseFieldset>
      
      <!-- Validation errors -->
      <div
        v-if="validationError"
        class="validation-error"
      >
        {{ validationError }}
      </div>
    </div>
  </section>
</template>

<script setup>
import './AppearanceTab.scss'
import { computed, ref } from 'vue'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { useTabSettings } from '../composables/useTabSettings.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'

// Components
import BaseFieldset from '@/components/base/BaseFieldset.vue'
import FontSelector from '@/components/feature/FontSelector.vue'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'AppearanceTab')
const settingsStore = useSettingsStore()
const { t } = useUnifiedI18n()
const { createSetting } = useTabSettings(settingsStore, logger)

// Refs
const fontSelectorRef = ref(null)
const validationError = ref('')

// --- Settings ---

const fontFamily = createSetting('TRANSLATION_FONT_FAMILY', 'auto', {
  onChanged: () => validateFonts()
})

const fontSize = createSetting('TRANSLATION_FONT_SIZE', '14', {
  onChanged: () => validateFonts()
})

// Get target language for font preview
const targetLanguage = computed(() => settingsStore.settings?.TARGET_LANGUAGE || 'en')

// Validation logic
const validateFonts = () => {
  if (fontSelectorRef.value?.validate) {
    const isValid = fontSelectorRef.value.validate()
    validationError.value = isValid ? '' : (t('font_validation_failed') || 'Font settings validation failed')
  }
}
</script>
