<template>
  <section class="options-tab-content">
    <h2>{{ t('appearance_section_title') || 'Appearance' }}</h2>
    
    <!-- Interface Settings -->
    <div class="setting-group interface-settings">
      <h3>{{ t('interface_settings_title') || 'Interface Settings' }}</h3>
      <p class="setting-description">
        {{ t('interface_settings_description') || 'Customize how the translation interface appears on different devices' }}
      </p>
      
      <div class="setting-row mobile-ui-mode-row">
        <label class="setting-label">{{ t('mobile_ui_mode_label') || 'Mobile UI Mode' }}:</label>
        <div class="radio-group">
          <BaseRadio
            v-model="mobileUiMode"
            :value="MOBILE_CONSTANTS.UI_MODE.AUTO"
            name="mobileUiMode"
            :label="t('mobile_ui_mode_auto') || 'Auto'"
          />
          <BaseRadio
            v-model="mobileUiMode"
            :value="MOBILE_CONSTANTS.UI_MODE.MOBILE"
            name="mobileUiMode"
            :label="t('mobile_ui_mode_mobile') || 'Always Mobile'"
          />
          <BaseRadio
            v-model="mobileUiMode"
            :value="MOBILE_CONSTANTS.UI_MODE.DESKTOP"
            name="mobileUiMode"
            :label="t('mobile_ui_mode_desktop') || 'Always Desktop'"
          />
        </div>
      </div>
      <p class="setting-hint">
        {{ t('mobile_ui_mode_description') || 'Choose how the translation interface should appear on mobile and touch devices.' }}
      </p>
    </div>

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
import BaseRadio from '@/components/base/BaseRadio.vue'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { MOBILE_CONSTANTS } from '@/shared/config/constants.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'

// Logger
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'AppearanceTab')

const { t } = useUnifiedI18n()
const settingsStore = useSettingsStore()

// Refs
const fontSelectorRef = ref(null)
const validationError = ref('')

// Mobile UI Mode settings
const mobileUiMode = computed({
  get: () => settingsStore.settings?.MOBILE_UI_MODE || MOBILE_CONSTANTS.UI_MODE.AUTO,
  set: (value) => {
    logger.debug('📝 Mobile UI Mode changed:', value)
    settingsStore.updateSettingLocally('MOBILE_UI_MODE', value)
  }
})

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

.setting-group {
  .setting-description {
    margin: 0 0 $spacing-lg 0;
  }
}

.font-settings, .interface-settings {
  background-color: var(--color-surface);
  border: $border-width $border-style var(--color-border);
  border-radius: $border-radius-base;
  padding: $spacing-md;
  margin-bottom: $spacing-lg;

  h3 {
    margin: 0 0 $spacing-sm 0;
    padding: 0;
    border: none;
    color: var(--color-text);
  }
}

.setting-row {
  display: flex;
  align-items: center;
  gap: $spacing-md;
  margin-bottom: $spacing-sm;

  .setting-label {
    font-weight: 600;
    color: var(--color-text);
    min-width: 150px;
  }

  .radio-group {
    display: flex;
    gap: $spacing-lg;
    flex-wrap: wrap;
  }
}

.setting-hint {
  font-size: 0.9em;
  color: var(--color-text-secondary);
  margin: $spacing-sm 0 0 0;
}

// Mobile responsive
@media (max-width: #{$breakpoint-md}) {
  .font-settings, .interface-settings {
    padding: $spacing-sm;
  }

  .setting-row {
    flex-direction: column;
    align-items: flex-start;
    gap: $spacing-sm;

    .radio-group {
      gap: $spacing-sm;
    }
  }
}
</style>