<template>
  <section class="options-tab-content">
    <h2>{{ t('translation_activation_section_title') || 'Translation Activation Methods' }}</h2>

    <!-- Extension Enable/Disable -->
    <div class="setting-group extension-enabled-group">
      <BaseCheckbox
        v-model="extensionEnabled"
        :label="t('extension_enabled_label') || 'Enable Extension'"
      />
      <span class="setting-description">
        {{ t('extension_enabled_description') || 'Enable or disable the entire extension functionality except Popup and Sidepanel.' }}
      </span>
    </div>

    <!-- Desktop FAB Menu -->
    <BaseFieldset :legend="t('activation_group_fab_title') || 'Quick Action Button (FAB)'">
      <div class="setting-group">
        <BaseCheckbox
          v-model="showDesktopFab"
          :disabled="!extensionEnabled"
          :label="t('show_desktop_fab_label') || 'Show Desktop Quick Action Button (FAB)'"
        />
        <span
          class="setting-description"
          style="margin-inline-start: 32px; display: block; margin-top: 4px; color: var(--text-color-secondary, #666); font-size: 0.9em;"
        >
          {{ t('show_desktop_fab_description') || 'Display a floating action button on desktop to quickly access tools like Translate Page and Select Element.' }}
        </span>

        <!-- Mobile UI Mode Settings nested under FAB -->
        <div 
          v-if="showDesktopFab"
          class="sub-options-group fab-sub-options"
        >
          <div class="radio-group ui-mode-radio-group">
            <BaseRadio
              v-model="mobileUiMode"
              :value="MOBILE_CONSTANTS.UI_MODE.AUTO"
              name="mobileUiMode"
              :disabled="!extensionEnabled"
            >
              <div class="radio-label-content">
                <span class="label-title">{{ t('mobile_ui_mode_auto') }}</span>
              </div>
            </BaseRadio>
            <BaseRadio
              v-model="mobileUiMode"
              :value="MOBILE_CONSTANTS.UI_MODE.MOBILE"
              name="mobileUiMode"
              :disabled="!extensionEnabled"
            >
              <div class="radio-label-content">
                <span class="label-title">{{ t('mobile_ui_mode_mobile') }}</span>
                <span class="label-description">{{ t('mobile_ui_mode_mobile_desc') }}</span>
              </div>
            </BaseRadio>
            <BaseRadio
              v-model="mobileUiMode"
              :value="MOBILE_CONSTANTS.UI_MODE.DESKTOP"
              name="mobileUiMode"
              :disabled="!extensionEnabled"
            >
              <div class="radio-label-content">
                <span class="label-title">{{ t('mobile_ui_mode_desktop') }}</span>
                <span class="label-description">{{ t('mobile_ui_mode_desktop_desc') }}</span>
              </div>
            </BaseRadio>
          </div>
        </div>
      </div>
    </BaseFieldset>

    <!-- Text Field Translation -->
    <BaseFieldset :legend="t('activation_group_text_fields_title') || 'Text Field Translation'">
      <div class="setting-group">
        <div class="setting-row-with-provider">
          <BaseCheckbox
            v-model="translateOnTextFields"
            :disabled="!extensionEnabled"
            :label="t('translate_on_text_fields_label') || 'Enable translation on text fields'"
          />
          <div class="mode-provider-container">
            <span 
              class="mode-provider-label"
              :class="{ 'is-disabled': !extensionEnabled || (!translateOnTextFields && !enableShortcutForTextFields) }"
            >{{ t('provider_label') }}:</span>
            <ProviderSelector
              v-model="fieldProvider"
              allow-default
              mode="button"
              :is-global="false"
              :disabled="!extensionEnabled || (!translateOnTextFields && !enableShortcutForTextFields)"
            />
          </div>
        </div>
        <span class="setting-description">
          {{ t('translate_on_text_fields_description') || 'Allow triggering translation directly within input/textarea fields (e.g., via context menu or shortcut).' }}
        </span>
      </div>

      <div class="setting-group">
        <div class="setting-row">
          <BaseCheckbox
            v-model="enableShortcutForTextFields"
            :disabled="!extensionEnabled"
            :label="t('enable_shortcut_for_text_fields_label') || 'Enable shortcut for text fields'"
          />
          <ShortcutPicker
            v-if="enableShortcutForTextFields"
            v-model="textFieldShortcut"
            :disabled="!extensionEnabled"
            :placeholder="t('click_to_set_shortcut') || 'Set shortcut'"
            class="inline-picker"
          />
        </div>
        <span
          v-if="!enableShortcutForTextFields"
          class="setting-description"
        >
          {{ t('enable_shortcut_for_text_fields_description') || 'Allow using a keyboard shortcut to trigger translation when inside a text field.' }}
        </span>
      </div>

      <!-- Text Field Mode Options -->
      <div 
        v-if="translateOnTextFields || enableShortcutForTextFields"
        class="sub-options-group"
      >
        <div class="radio-group">
          <BaseRadio
            v-model="textFieldMode"
            value="copy"
            name="textFieldMode"
            :disabled="!extensionEnabled"
            :label="t('options_textField_mode_copy') || 'Copy to Clipboard'"
          />
          <BaseRadio
            v-model="textFieldMode"
            value="replace"
            name="textFieldMode"
            :disabled="!extensionEnabled"
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
        <div class="setting-row-with-provider">
          <BaseCheckbox
            v-model="translateWithSelectElement"
            :disabled="!extensionEnabled"
            :label="t('translate_with_select_element_label') || 'Enable translation via select element'"
          />
          <div class="mode-provider-container">
            <span 
              class="mode-provider-label"
              :class="{ 'is-disabled': !extensionEnabled || !translateWithSelectElement }"
            >{{ t('provider_label') }}:</span>
            <ProviderSelector
              v-model="selectElementProvider"
              allow-default
              mode="button"
              :is-global="false"
              :disabled="!extensionEnabled || !translateWithSelectElement"
            />
          </div>
        </div>
        <span class="setting-description">
          {{ t('translate_with_select_element_description') || 'Allow triggering translation using a specific selection method (if implemented, e.g., selecting a whole paragraph).' }}
        </span>
      </div>

      <div class="setting-group">
        <div class="setting-row-with-provider">
          <BaseCheckbox
            v-model="translateOnTextSelection"
            :disabled="!extensionEnabled"
            :label="t('translate_on_text_selection_label') || 'Enable translation on text selection'"
          />
          <div class="mode-provider-container">
            <span 
              class="mode-provider-label"
              :class="{ 'is-disabled': !extensionEnabled || !translateOnTextSelection }"
            >{{ t('provider_label') }}:</span>
            <ProviderSelector
              v-model="selectionProvider"
              allow-default
              mode="button"
              :is-global="false"
              :disabled="!extensionEnabled || !translateOnTextSelection"
            />
          </div>
        </div>
        <span class="setting-description">
          {{ t('translate_on_text_selection_description') || 'Allow triggering translation automatically or via shortcut after selecting text on the page.' }}
        </span>
      </div>

      <!-- Selection Mode Options -->
      <div 
        v-if="translateOnTextSelection"
        class="sub-options-group"
      >
        <div class="radio-group">
          <BaseRadio
            v-model="selectionTranslationMode"
            :value="SelectionTranslationMode.IMMEDIATE"
            name="selectionTranslationMode"
            :disabled="!extensionEnabled"
            :label="t('options_selection_mode_immediate') || 'Immediate'"
          />
          <BaseRadio
            v-model="selectionTranslationMode"
            :value="SelectionTranslationMode.ON_CLICK"
            name="selectionTranslationMode"
            :disabled="!extensionEnabled"
            :label="t('options_selection_mode_onclick') || 'On Click'"
          />
          <BaseRadio
            v-model="selectionTranslationMode"
            :value="SelectionTranslationMode.ON_FAB_CLICK"
            name="selectionTranslationMode"
            :disabled="!extensionEnabled || !showDesktopFab"
            :label="t('options_selection_mode_onfabclick') || 'Use Desktop FAB'"
          />
        </div>

        <div class="setting-group sub-setting-group">
          <BaseCheckbox
            v-model="requireCtrlForTextSelection"
            :disabled="!extensionEnabled || selectionTranslationMode !== SelectionTranslationMode.IMMEDIATE"
            :label="t('require_ctrl_for_text_selection_label') || 'Require Ctrl key for text selection translation'"
          />
        </div>

        <div class="setting-group sub-setting-group">
          <BaseCheckbox
            v-model="activeSelectionIconOnTextfields"
            :disabled="!extensionEnabled"
            :label="t('active_selection_icon_on_textfields_label') || 'Active Selection Icon on Textfields'"
          />
          <span class="setting-description">
            {{ t('active_selection_icon_on_textfields_description') || 'Show translation icon when selecting text inside text fields (input, textarea).' }}
          </span>
        </div>

        <div class="setting-group sub-setting-group">
          <BaseCheckbox
            v-model="enhancedTripleClickDrag"
            :disabled="!extensionEnabled"
            :label="t('enhanced_triple_click_drag_label') || 'Enhanced Triple-Click + Drag Support'"
          />
          <span class="setting-description">
            {{ t('enhanced_triple_click_drag_description') || 'When enabled, triple-clicking to select a paragraph and then dragging to extend the selection will wait until you release the mouse before showing the translation. This prevents premature translation when you want to select multiple paragraphs.' }}
          </span>
        </div>
      </div>
    </BaseFieldset>

    <!-- Dictionary Mode -->
    <BaseFieldset :legend="t('activation_group_dictionary_title') || 'Dictionary Mode'">
      <div class="setting-group">
        <div class="setting-row-with-provider">
          <BaseCheckbox
            v-model="enableDictionary"
            :disabled="!extensionEnabled"
            :label="t('enable_dictionary_translation_label') || 'Enable Dictionary Translation'"
          />
          <div class="mode-provider-container">
            <span 
              class="mode-provider-label"
              :class="{ 'is-disabled': !extensionEnabled || !enableDictionary }"
            >{{ t('provider_label') }}:</span>
            <ProviderSelector
              v-model="dictionaryProvider"
              allow-default
              mode="button"
              :is-global="false"
              :disabled="!extensionEnabled || !enableDictionary"
            />
          </div>
        </div>
        <span class="setting-description">
          {{ t('enable_dictionary_translation_description') || 'When text selection translation is enabled, single words or short phrases will be treated as dictionary lookups, providing detailed definitions instead of standard translations.' }}
        </span>
      </div>
    </BaseFieldset>

    <!-- Whole Page Translation (NEW) -->
    <BaseFieldset :legend="t('whole_page_translation_section_title') || 'Whole Page Translation'">
      <div class="setting-group">
        <div class="setting-row-with-provider">
          <BaseCheckbox
            v-model="wholePageEnabled"
            :disabled="!extensionEnabled"
            :label="t('whole_page_translation_enabled_label') || 'Enable Whole Page Translation'"
          />
          <div class="mode-provider-container">
            <span 
              class="mode-provider-label"
              :class="{ 'is-disabled': !extensionEnabled || !wholePageEnabled }"
            >{{ t('provider_label') }}:</span>
            <ProviderSelector
              v-model="pageProvider"
              allow-default
              mode="button"
              :is-global="false"
              :disabled="!extensionEnabled || !wholePageEnabled"
            />
          </div>
        </div>
        <span class="setting-description">
          {{ t('whole_page_translation_enabled_description') || 'Allow translating the entire web page content while maintaining the layout.' }}
        </span>
      </div>

      <div
        v-if="wholePageEnabled"
        class="sub-options-group"
      >
        <div class="setting-group sub-setting-group">
          <BaseCheckbox
            v-model="wholePageLazyLoading"
            :disabled="!extensionEnabled"
            :label="t('whole_page_lazy_loading_label') || 'Lazy Loading (Performance)'"
          />
          <span class="setting-description">
            {{ t('whole_page_lazy_loading_description') || 'Only translate parts of the page that are visible or near the viewport.' }}
          </span>
        </div>

        <div class="setting-group sub-setting-group">
          <BaseCheckbox
            v-model="wholePageAutoTranslate"
            :disabled="!extensionEnabled"
            :label="t('whole_page_auto_translate_on_dom_changes_label') || 'Auto-translate new content (Infinite Scroll)'"
          />
          <span class="setting-description">
            {{ t('whole_page_auto_translate_on_dom_changes_description') || 'Automatically detect and translate new content as it appears.' }}
          </span>
        </div>

        <div class="setting-group sub-setting-group">
          <BaseCheckbox
            v-model="wholePageShowOriginal"
            :disabled="!extensionEnabled"
            :label="t('whole_page_show_original_on_hover_label') || 'Show original on hover'"
          />
          <span class="setting-description">
            {{ t('whole_page_show_original_on_hover_description') || 'Show the original text in a tooltip when hovering over translated content.' }}
          </span>
        </div>
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
import ShortcutPicker from '@/components/base/ShortcutPicker.vue'
import ProviderSelector from '@/components/shared/ProviderSelector.vue'
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
    logger.debug('📝 Extension enabled changed:', value)
    settingsStore.updateSettingLocally('EXTENSION_ENABLED', value)
  }
})

// Desktop FAB settings
const showDesktopFab = computed({
  get: () => settingsStore.settings?.SHOW_DESKTOP_FAB || false,
  set: (value) => {
    logger.debug('📝 Show Desktop FAB changed:', value)
    settingsStore.updateSettingLocally('SHOW_DESKTOP_FAB', value)
  }
})

// Mobile UI Mode settings
const mobileUiMode = computed({
  get: () => settingsStore.settings?.MOBILE_UI_MODE || MOBILE_CONSTANTS.UI_MODE.AUTO,
  set: (value) => {
    logger.debug('📝 Mobile UI Mode changed:', value)
    settingsStore.updateSettingLocally('MOBILE_UI_MODE', value)
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

const textFieldShortcut = computed({
  get: () => settingsStore.settings?.TEXT_FIELD_SHORTCUT || 'Ctrl+/',
  set: (value) => settingsStore.updateSettingLocally('TEXT_FIELD_SHORTCUT', value)
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
  get: () => settingsStore.settings?.selectionTranslationMode || SelectionTranslationMode.IMMEDIATE,
  set: (value) => settingsStore.updateSettingLocally('selectionTranslationMode', value)
})

const requireCtrlForTextSelection = computed({
  get: () => settingsStore.settings?.REQUIRE_CTRL_FOR_TEXT_SELECTION || false,
  set: (value) => settingsStore.updateSettingLocally('REQUIRE_CTRL_FOR_TEXT_SELECTION', value)
})

const activeSelectionIconOnTextfields = computed({
  get: () => settingsStore.settings?.ACTIVE_SELECTION_ICON_ON_TEXTFIELDS ?? true,
  set: (value) => settingsStore.updateSettingLocally('ACTIVE_SELECTION_ICON_ON_TEXTFIELDS', value)
})

const enhancedTripleClickDrag = computed({
  get: () => settingsStore.settings?.ENHANCED_TRIPLE_CLICK_DRAG || false,
  set: (value) => settingsStore.updateSettingLocally('ENHANCED_TRIPLE_CLICK_DRAG', value)
})

// Dictionary settings
const enableDictionary = computed({
  get: () => settingsStore.settings?.ENABLE_DICTIONARY || false,
  set: (value) => settingsStore.updateSettingLocally('ENABLE_DICTIONARY', value)
})

// Whole Page settings
const wholePageEnabled = computed({
  get: () => settingsStore.settings?.WHOLE_PAGE_TRANSLATION_ENABLED ?? true,
  set: (value) => settingsStore.updateSettingLocally('WHOLE_PAGE_TRANSLATION_ENABLED', value)
})

const wholePageLazyLoading = computed({
  get: () => settingsStore.settings?.WHOLE_PAGE_LAZY_LOADING ?? true,
  set: (value) => settingsStore.updateSettingLocally('WHOLE_PAGE_LAZY_LOADING', value)
})

const wholePageAutoTranslate = computed({
  get: () => settingsStore.settings?.WHOLE_PAGE_AUTO_TRANSLATE_ON_DOM_CHANGES ?? true,
  set: (value) => settingsStore.updateSettingLocally('WHOLE_PAGE_AUTO_TRANSLATE_ON_DOM_CHANGES', value)
})

const wholePageShowOriginal = computed({
  get: () => settingsStore.settings?.WHOLE_PAGE_SHOW_ORIGINAL_ON_HOVER ?? false,
  set: (value) => settingsStore.updateSettingLocally('WHOLE_PAGE_SHOW_ORIGINAL_ON_HOVER', value)
})

import { TranslationMode, SelectionTranslationMode } from '@/shared/config/config.js'
import { MOBILE_CONSTANTS } from '@/shared/config/constants.js'

// --- Mode Specific Providers ---

const fieldProvider = computed({
  get: () => settingsStore.settings?.MODE_PROVIDERS?.[TranslationMode.Field] || 'default',
  set: (value) => {
    const modeProviders = { ...settingsStore.settings.MODE_PROVIDERS, [TranslationMode.Field]: value === 'default' ? null : value }
    settingsStore.updateSettingLocally('MODE_PROVIDERS', modeProviders)
  }
})

const selectElementProvider = computed({
  get: () => settingsStore.settings?.MODE_PROVIDERS?.[TranslationMode.Select_Element] || 'default',
  set: (value) => {
    const modeProviders = { ...settingsStore.settings.MODE_PROVIDERS, [TranslationMode.Select_Element]: value === 'default' ? null : value }
    settingsStore.updateSettingLocally('MODE_PROVIDERS', modeProviders)
  }
})

const selectionProvider = computed({
  get: () => settingsStore.settings?.MODE_PROVIDERS?.[TranslationMode.Selection] || 'default',
  set: (value) => {
    const modeProviders = { ...settingsStore.settings.MODE_PROVIDERS, [TranslationMode.Selection]: value === 'default' ? null : value }
    settingsStore.updateSettingLocally('MODE_PROVIDERS', modeProviders)
  }
})

const pageProvider = computed({
  get: () => settingsStore.settings?.MODE_PROVIDERS?.[TranslationMode.Page] || 'default',
  set: (value) => {
    const modeProviders = { ...settingsStore.settings.MODE_PROVIDERS, [TranslationMode.Page]: value === 'default' ? null : value }
    settingsStore.updateSettingLocally('MODE_PROVIDERS', modeProviders)
  }
})

const dictionaryProvider = computed({
  get: () => settingsStore.settings?.MODE_PROVIDERS?.[TranslationMode.Dictionary_Translation] || 'default',
  set: (value) => {
    const modeProviders = { ...settingsStore.settings.MODE_PROVIDERS, [TranslationMode.Dictionary_Translation]: value === 'default' ? null : value }
    settingsStore.updateSettingLocally('MODE_PROVIDERS', modeProviders)
  }
})
</script>

<style lang="scss" scoped>
@use "@/assets/styles/base/variables" as *;

.setting-row {
  display: flex;
  align-items: center;
  gap: $spacing-md;
  width: 100%;

  .setting-label {
    font-weight: 600;
    color: var(--color-text);
    min-width: 150px;
  }
}

.setting-row-with-provider {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $spacing-md;
  width: 100%;

  .mode-provider-container {
    display: flex;
    align-items: center;
    gap: $spacing-sm;
    width: 250px; // Increased from 180px to match other dropdowns

    .mode-provider-label {
      font-size: $font-size-xs;
      color: var(--color-text-secondary);
      white-space: nowrap;
      transition: opacity 0.2s;

      &.is-disabled {
        opacity: 0.6;
      }
    }

    :deep(.ti-provider-button-container) {
      flex: 1;
      min-width: 0;

      .ti-provider-button {
        width: 100% !important;
        padding: 6px 10px !important; // Slightly more compact padding for these rows
      }
    }
  }
}

.shortcut-setting {
  width: 100%;
  margin-top: $spacing-md;
  padding: $spacing-md;
  background-color: var(--color-surface);
  border-radius: $border-radius-sm;
  border: 1px solid var(--color-border);

  .shortcut-label {
    display: block;
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
    color: var(--color-text);
    margin-bottom: $spacing-sm;
  }
}

.shortcut-setting-compact {
  width: 100%;
  margin-top: $spacing-sm;
  margin-inline-start: $spacing-lg;
  display: flex;
  align-items: center;
}

.setting-description {
  padding-inline-start: $spacing-xl;
  margin-top: $spacing-xs;
}

.sub-options-group {
  padding-inline-start: $spacing-lg;
  margin-inline-start: $spacing-md;
  border-inline-start: 2px solid var(--color-border);
  margin-top: $spacing-base;
  padding-top: $spacing-base;
  
  .radio-group {
    display: flex;
    align-items: center;
    gap: $spacing-xl;
    margin-bottom: $spacing-base;

    &.ui-mode-radio-group {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      align-items: stretch;
      gap: $spacing-lg;
      width: 100%;

      .radio-label-content {
        display: flex;
        flex-direction: column;
        line-height: 1.2;

        .label-title {
          font-weight: 500;
          color: var(--color-text);
          display: block;
        }

        .label-description {
          font-size: 0.85em;
          color: var(--color-text-secondary);
          display: block;
          margin-top: 2px;
        }
      }
    }
  }
  
  .sub-setting-group {
    margin-inline-start: $spacing-lg;
    padding-inline-start: $spacing-md;
    border-inline-start: 2px solid var(--color-border);
  }
}

// Mobile responsive
@media (max-width: #{$breakpoint-md}) {
  .setting-row, .setting-row-with-provider {
    flex-direction: column;
    align-items: stretch;
    gap: $spacing-sm;
  }

  .setting-description {
    padding-inline-start: 0;
  }
  
  .sub-options-group {
    padding-inline-start: $spacing-base;
    margin-inline-start: $spacing-sm;
    
    .radio-group {
      flex-direction: column;
      align-items: stretch;
      gap: $spacing-base;

      &.ui-mode-radio-group {
        grid-template-columns: 1fr;
      }
    }
    
    .sub-setting-group {
      margin-inline-start: $spacing-base;
      padding-inline-start: $spacing-sm;
    }
  }
}
</style>
