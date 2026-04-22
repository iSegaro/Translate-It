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
import { computed, ref, watch, onMounted } from 'vue'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import BaseFieldset from '@/components/base/BaseFieldset.vue'
import FontSelector from '@/components/feature/FontSelector.vue'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'

const { t } = useUnifiedI18n()
const settingsStore = useSettingsStore()

// Refs
const fontSelectorRef = ref(null)
const validationError = ref('')

// --- Font settings (Computed with Getter/Setter for Clean Sync) ---

const fontFamily = computed({
  get: () => settingsStore.settings?.TRANSLATION_FONT_FAMILY || 'auto',
  set: (value) => {
    validationError.value = ''
    settingsStore.updateSettingLocally('TRANSLATION_FONT_FAMILY', value)
    validateFonts()
  }
})

const fontSize = computed({
  get: () => settingsStore.settings?.TRANSLATION_FONT_SIZE || '14',
  set: (value) => {
    validationError.value = ''
    settingsStore.updateSettingLocally('TRANSLATION_FONT_SIZE', value)
    validateFonts()
  }
})

// Get target language for font preview
const targetLanguage = computed(() => settingsStore.settings.TARGET_LANGUAGE)

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
