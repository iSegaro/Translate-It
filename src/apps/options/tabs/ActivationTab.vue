<template>
  <section class="activation-tab">
  <h2>{{ t('translation_activation_section_title') || 'Translation Activation Methods' }}</h2>

    <!-- Extension Enable/Disable -->
    <div class="setting-group extension-enabled-group">
      <BaseCheckbox
        v-model="extensionEnabled"
        :label="t('extension_enabled_label') || 'Enable Extension'"
      />
      <span class="setting-description">
        {{ t('extension_enabled_description') || 'Enable or disable the entire extension functionality except Popup.' }}
      </span>
    </div>

    <!-- Text Field Translation -->
  <BaseFieldset :legend="t('activation_group_text_fields_title') || 'Text Field Translation'">
      <div class="setting-group">
        <BaseCheckbox
          v-model="translateOnTextFields"
          :disabled="!extensionEnabled"
          :label="t('translate_on_text_fields_label') || 'Enable translation on text fields'"
        />
        <span class="setting-description">
          {{ t('translate_on_text_fields_description') || 'Allow triggering translation directly within input/textarea fields (e.g., via context menu or shortcut).' }}
        </span>
      </div>

      <div class="setting-group">
        <BaseCheckbox
          v-model="enableShortcutForTextFields"
          :disabled="!extensionEnabled"
          :label="t('enable_shortcut_for_text_fields_label') || 'Enable Ctrl+/ shortcut for text fields'"
        />
        <span class="setting-description">
          {{ t('enable_shortcut_for_text_fields_description') || 'Allow using the Ctrl+/ keyboard shortcut to trigger translation when inside a text field.' }}
        </span>
      </div>

      <!-- Text Field Mode Options -->
      <div class="sub-options-group">
        <div class="radio-group">
          <BaseRadio
            v-model="textFieldMode"
            value="copy"
            name="textFieldMode"
            :label="t('options_textField_mode_copy') || 'Copy to Clipboard'"
          />
          <BaseRadio
            v-model="textFieldMode"
            value="replace"
            name="textFieldMode"
            :label="t('options_textField_mode_replace') || 'Replace on Textfield'"
          />
        </div>

        <div class="setting-group sub-setting-group">
          <BaseCheckbox 
            v-model="replaceOnSpecialSites" 
            :disabled="!extensionEnabled || textFieldMode !== 'copy'"
            :label="t('enable_replace_on_special_sites') || 'Enable replace on special sites (Whatsapp, Telegram, etc.)'"
          />
        </div>
      </div>
    </BaseFieldset>

    <!-- On-Page Selection -->
  <BaseFieldset :legend="t('activation_group_page_selection_title') || 'On-Page Selection'">
      <div class="setting-group">
        <BaseCheckbox
          v-model="translateWithSelectElement"
          :disabled="!extensionEnabled"
          :label="t('translate_with_select_element_label') || 'Enable translation via select element'"
        />
        <span class="setting-description">
          {{ t('translate_with_select_element_description') || 'Allow triggering translation using a specific selection method (if implemented, e.g., selecting a whole paragraph).' }}
        </span>
      </div>

      <div class="setting-group">
        <BaseCheckbox
          v-model="translateOnTextSelection"
          :disabled="!extensionEnabled"
          :label="t('translate_on_text_selection_label') || 'Enable translation on text selection'"
        />
        <span class="setting-description">
          {{ t('translate_on_text_selection_description') || 'Allow triggering translation automatically or via shortcut after selecting text on the page.' }}
        </span>
      </div>

      <!-- Selection Mode Options -->
      <div class="sub-options-group">
        <div class="radio-group">
          <BaseRadio
            v-model="selectionTranslationMode"
            value="immediate"
            name="selectionTranslationMode"
            :label="t('options_selection_mode_immediate') || 'Immediate'"
          />
          <BaseRadio
            v-model="selectionTranslationMode"
            value="onClick"
            name="selectionTranslationMode"
            :label="t('options_selection_mode_onclick') || 'On Click'"
          />
        </div>

        <div class="setting-group sub-setting-group">
          <BaseCheckbox 
            v-model="requireCtrlForTextSelection" 
            :disabled="!extensionEnabled || !translateOnTextSelection || selectionTranslationMode !== 'immediate'"
            :label="t('require_ctrl_for_text_selection_label') || 'Require Ctrl key for text selection translation'"
          />
        </div>
      </div>
    </BaseFieldset>

    <!-- Dictionary Mode -->
  <BaseFieldset :legend="t('activation_group_dictionary_title') || 'Dictionary Mode'">
      <div class="setting-group">
        <BaseCheckbox
          v-model="enableDictionary"
          :disabled="!extensionEnabled"
          :label="t('enable_dictionary_translation_label') || 'Enable Dictionary Translation'"
        />
        <span class="setting-description">
          {{ t('enable_dictionary_translation_description') || 'When text selection translation is enabled, single words or short phrases will be treated as dictionary lookups, providing detailed definitions instead of standard translations.' }}
        </span>
      </div>
    </BaseFieldset>

    <!-- Video Subtitle -->
  <BaseFieldset :legend="t('activation_group_subtitle_title') || 'Video Subtitle'">
      <div class="setting-group">
        <BaseCheckbox
          v-model="enableSubtitle"
          :disabled="!extensionEnabled"
          :label="t('enable_subtitle_translation_label') || 'Enable Subtitle Translation'"
        />
        <span class="setting-description">
          {{ t('enable_subtitle_translation_description') || 'وقتی که فعال باشد، در سایت یوتوب برای ویدیوهایی که زیرنویس وجود دارد ترجمه اتفاق می افتد و جایگزین زیرنویس پیش‌فرض یوتوب می شود.' }}
        </span>
      </div>

      <div class="setting-group">
        <BaseCheckbox
          v-model="iconSubtitle"
          :disabled="!extensionEnabled"
          :label="t('icon_subtitle_translation_label') || 'Show Subtitle Icon'"
        />
        <span class="setting-description">
          {{ t('icon_subtitle_translation_description') || 'نمایش ایکون ترجمه زیرنویس در نوار پخش‌کننده یوتوب.' }}
        </span>
      </div>
    </BaseFieldset>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import BaseCheckbox from '@/components/base/BaseCheckbox.vue'
import BaseRadio from '@/components/base/BaseRadio.vue'
import BaseFieldset from '@/components/base/BaseFieldset.vue'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'

// Logger
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'ActivationTab')

const settingsStore = useSettingsStore()

const { t } = useI18n()

// Extension enabled state
const extensionEnabled = computed({
  get: () => settingsStore.settings?.EXTENSION_ENABLED ?? true,
  set: (value) => {
    logger.debug('⚡ Extension enabled changed:', value)
    settingsStore.updateSettingLocally('EXTENSION_ENABLED', value)
  }
})

// Text field settings
const translateOnTextFields = computed({
  get: () => settingsStore.settings?.TRANSLATE_ON_TEXT_FIELDS || false,
  set: (value) => {
    logger.debug('📝 Translate on text fields changed:', value)
    settingsStore.updateSettingLocally('TRANSLATE_ON_TEXT_FIELDS', value)
  }
})

const enableShortcutForTextFields = computed({
  get: () => settingsStore.settings?.ENABLE_SHORTCUT_FOR_TEXT_FIELDS || false,
  set: (value) => settingsStore.updateSettingLocally('ENABLE_SHORTCUT_FOR_TEXT_FIELDS', value)
})

const textFieldMode = computed({
  get: () => settingsStore.settings?.COPY_REPLACE === 'replace' ? 'replace' : 'copy',
  set: (value) => settingsStore.updateSettingLocally('COPY_REPLACE', value)
})

const replaceOnSpecialSites = computed({
  get: () => settingsStore.settings?.REPLACE_SPECIAL_SITES || false,
  set: (value) => settingsStore.updateSettingLocally('REPLACE_SPECIAL_SITES', value)
})

// Selection settings
const translateWithSelectElement = computed({
  get: () => settingsStore.settings?.TRANSLATE_WITH_SELECT_ELEMENT || false,
  set: (value) => settingsStore.updateSettingLocally('TRANSLATE_WITH_SELECT_ELEMENT', value)
})

const translateOnTextSelection = computed({
  get: () => settingsStore.settings?.TRANSLATE_ON_TEXT_SELECTION || false,
  set: (value) => settingsStore.updateSettingLocally('TRANSLATE_ON_TEXT_SELECTION', value)
})

const selectionTranslationMode = computed({
  get: () => settingsStore.settings?.selectionTranslationMode || 'immediate',
  set: (value) => settingsStore.updateSettingLocally('selectionTranslationMode', value)
})

const requireCtrlForTextSelection = computed({
  get: () => settingsStore.settings?.REQUIRE_CTRL_FOR_TEXT_SELECTION || false,
  set: (value) => settingsStore.updateSettingLocally('REQUIRE_CTRL_FOR_TEXT_SELECTION', value)
})

// Dictionary and subtitle settings
const enableDictionary = computed({
  get: () => settingsStore.settings?.ENABLE_DICTIONARY || false,
  set: (value) => settingsStore.updateSettingLocally('ENABLE_DICTIONARY', value)
})

const enableSubtitle = computed({
  get: () => settingsStore.settings?.ENABLE_SUBTITLE_TRANSLATION ?? true,
  set: (value) => settingsStore.updateSettingLocally('ENABLE_SUBTITLE_TRANSLATION', value)
})

const iconSubtitle = computed({
  get: () => settingsStore.settings?.SHOW_SUBTITLE_ICON ?? true,
  set: (value) => settingsStore.updateSettingLocally('SHOW_SUBTITLE_ICON', value)
})
</script>

<style lang="scss" scoped>
@use '@/assets/styles/variables.scss' as *;

.activation-tab {
  max-width: 800px;
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
  }
}

.setting-description {
  font-size: $font-size-sm;
  color: var(--color-text-secondary);
  flex-basis: 100%;
  padding-left: $spacing-xl;
  margin-top: $spacing-xs;
}

.sub-options-group {
  padding-left: $spacing-lg;
  margin-left: $spacing-md;
  border-left: 2px solid var(--color-border);
  margin-top: $spacing-base;
  padding-top: $spacing-base;
  
  .radio-group {
    display: flex;
    align-items: center;
    gap: $spacing-xl;
    margin-bottom: $spacing-base;
  }
  
  .sub-setting-group {
    margin-left: $spacing-lg;
    padding-left: $spacing-md;
    border-left: 2px solid var(--color-border);
  }
}

// Mobile responsive
@media (max-width: #{$breakpoint-md}) {
  .setting-group {
    flex-direction: column;
    align-items: stretch;
    gap: $spacing-sm;
    
    .setting-description {
      padding-left: 0;
    }
  }
  
  .sub-options-group {
    padding-left: $spacing-base;
    margin-left: $spacing-sm;
    
    .radio-group {
      flex-direction: column;
      align-items: stretch;
      gap: $spacing-base;
    }
    
    .sub-setting-group {
      margin-left: $spacing-base;
      padding-left: $spacing-sm;
    }
  }
}
</style>