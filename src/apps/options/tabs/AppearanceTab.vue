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
            @update:font-family="updateFontFamily"
            @update:font-size="updateFontSize"
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
