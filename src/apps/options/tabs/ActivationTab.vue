<template>
  <section class="options-tab-content activation-tab">
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
    <BaseFieldset 
      id="FIELDSET_FAB"
      :legend="t('activation_group_fab_title') || 'Quick Action Button (FAB)'"
    >
      <div class="setting-group">
        <div class="setting-row fab-setting-row">
          <BaseCheckbox
            id="SHOW_DESKTOP_FAB"
            v-model="showDesktopFab"
            :disabled="!extensionEnabled"
            :label="t('show_desktop_fab_label') || 'Show Desktop Quick Action Button (FAB)'"
          />
          <div 
            class="fab-mode-select-wrapper"
            :class="{ open: showDesktopFab }"
          >
            <BaseSelect
              v-model="mobileUiMode"
              :options="mobileModeOptions"
              :disabled="!extensionEnabled || !showDesktopFab"
              class="compact-select"
            />
          </div>
        </div>
        <span class="setting-description">
          {{ t('show_desktop_fab_description') || 'Display a floating action button on desktop to quickly access tools like Translate Page and Select Element.' }}
        </span>
      </div>
    </BaseFieldset>

    <!-- Text Field Translation -->
    <BaseFieldset :legend="t('activation_group_text_fields_title') || 'Text Field Translation'">
      <template #header>
        <div class="legend-actions-wrapper">
          <span 
            class="legend-action-label"
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
      </template>

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
        <div class="setting-row">
          <BaseCheckbox
            v-model="enableShortcutForTextFields"
            :disabled="!extensionEnabled"
            :label="t('enable_shortcut_for_text_fields_label') || 'Enable shortcut for text fields'"
          />
          <div 
            class="shortcut-picker-animated-wrapper"
            :class="{ open: enableShortcutForTextFields }"
          >
            <ShortcutPicker
              v-model="textFieldShortcut"
              :disabled="!extensionEnabled"
              :placeholder="t('click_to_set_shortcut') || 'Set shortcut'"
              class="inline-picker"
            />
          </div>
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
        class="sub-options-group"
        :class="{ open: translateOnTextFields || enableShortcutForTextFields }"
      >
        <div class="sub-options-inner">
          <div class="radio-group">
            <BaseRadio
              v-model="textFieldMode"
              value="replace"
              name="textFieldMode"
              :disabled="!extensionEnabled"
              :label="t('options_textField_mode_replace') || 'Replace on Textfield'"
            />
            <BaseRadio
              v-model="textFieldMode"
              value="copy"
              name="textFieldMode"
              :disabled="!extensionEnabled"
              :label="t('options_textField_mode_copy') || 'Copy to Clipboard'"
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
      </div>
    </BaseFieldset>

    <!-- Select Element -->
    <BaseFieldset :legend="t('activation_group_select_element_title') || 'Select Element'">
      <template #header>
        <div class="legend-actions-wrapper">
          <span 
            class="legend-action-label"
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
      </template>
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

      <!-- Select Element Sub-Options -->
      <div 
        class="sub-options-group"
        :class="{ open: translateWithSelectElement }"
      >
        <div class="sub-options-inner">
          <div
            id="SELECT_ELEMENT_SHOW_ORIGINAL_ON_HOVER"
            class="setting-group sub-setting-group"
          >
            <BaseCheckbox
              v-model="selectElementShowOriginal"
              :disabled="!extensionEnabled"
              :label="t('select_element_show_original_on_hover_label') || 'Show original on hover'"
            />
            <span class="setting-description">
              {{ t('select_element_show_original_on_hover_description') || 'Show the original text in a tooltip when hovering over elements translated via Select Element.' }}
            </span>
          </div>

          <div
            id="PAGE_CONTEXT_SELECT_ELEMENT"
            class="setting-group sub-setting-group"
          >
            <BaseCheckbox
              v-model="showSelectElementInContextMenu"
              :disabled="!extensionEnabled"
              :label="t('show_select_element_in_context_menu_label') || 'Show in context menu'"
            />
            <span class="setting-description">
              {{ t('show_select_element_in_context_menu_description') || 'Display the \'Select Element\' option in the browser\'s right-click context menu.' }}
            </span>
          </div>
        </div>
      </div>
    </BaseFieldset>

    <!-- On-Page Selection -->
    <BaseFieldset :legend="t('activation_group_page_selection_title') || 'On-Page Selection'">
      <template #header>
        <div class="legend-actions-wrapper">
          <span 
            class="legend-action-label"
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
      </template>

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
      <div 
        class="sub-options-group"
        :class="{ open: translateOnTextSelection }"
      >
        <div class="sub-options-inner">
          <div class="radio-group">
            <BaseRadio
              v-model="selectionTranslationMode"
              :value="SelectionTranslationMode.IMMEDIATE"
              name="selectionTranslationMode"
              :disabled="!extensionEnabled"
              :label="t('options_selection_mode_immediate') || 'Immediately'"
            />
            <BaseRadio
              v-model="selectionTranslationMode"
              :value="SelectionTranslationMode.ON_CLICK"
              name="selectionTranslationMode"
              :disabled="!extensionEnabled"
              :label="t('options_selection_mode_onclick') || 'Show Icon'"
            />
            <BaseRadio
              v-model="selectionTranslationMode"
              :value="SelectionTranslationMode.ON_FAB_CLICK"
              name="selectionTranslationMode"
              :disabled="!extensionEnabled || !showDesktopFab"
              :label="t('options_selection_mode_onfabclick') || 'FAB'"
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
      </div>
    </BaseFieldset>

    <!-- Whole Page Translation -->
    <BaseFieldset 
      id="FIELDSET_WHOLE_PAGE"
      :legend="t('whole_page_translation_section_title') || 'Whole Page Translation'"
    >
      <template #header>
        <div class="legend-actions-wrapper">
          <span 
            class="legend-action-label"
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
      </template>

      <div class="setting-group">
        <BaseCheckbox
          id="WHOLE_PAGE_TRANSLATION_ENABLED"
          v-model="wholePageEnabled"
          :disabled="!extensionEnabled"
          :label="t('whole_page_translation_enabled_label') || 'Enable Whole Page Translation'"
        />
        <span class="setting-description">
          {{ t('whole_page_translation_enabled_description') || 'Allow translating the entire web page content while maintaining the layout.' }}
        </span>
      </div>

      <div
        class="sub-options-group"
        :class="{ open: wholePageEnabled }"
      >
        <div class="sub-options-inner">
          <div 
            id="WHOLE_PAGE_TRIGGER_MODE"
            class="setting-group sub-setting-group whole-page-trigger-group"
          >
            <div class="trigger-modes-container">
              <div class="radio-group-horizontal">
                <BaseRadio
                  v-model="wholePageTranslateAfterScrollStop"
                  :value="true"
                  name="wholePageTrigger"
                  :disabled="!extensionEnabled"
                  :label="t('whole_page_trigger_on_stop') || 'On Scroll Stop'"
                />
                <BaseRadio
                  v-model="wholePageTranslateAfterScrollStop"
                  :value="false"
                  name="wholePageTrigger"
                  :disabled="!extensionEnabled"
                  :label="t('whole_page_trigger_fluid') || 'During Scroll'"
                />
              </div>
            </div>

            <div class="delay-setting-container">
              <span 
                class="delay-label"
                :class="{ 'is-disabled': !extensionEnabled }"
              >{{ t('whole_page_delay_label') || 'Translation Delay' }}:</span>
              <div class="number-input-container inline-delay-input">
                <input
                  v-model.number="wholePageScrollStopDelay"
                  type="number"
                  min="100"
                  max="5000"
                  step="100"
                  class="base-number-input compact-input"
                  :disabled="!extensionEnabled"
                >
                <span 
                  class="unit-label"
                  :class="{ 'is-disabled': !extensionEnabled }"
                >{{ t('whole_page_scroll_stop_delay_unit') || 'ms' }}</span>
              </div>
            </div>
            <span class="setting-description">
              {{ wholePageTranslateAfterScrollStop 
                ? (t('whole_page_translate_after_scroll_stop_description') || 'Only trigger translation when you stop scrolling.')
                : (t('whole_page_translate_fluid_description') || 'Translate continuously with a slight delay during scrolling.') 
              }}
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
        </div>
      </div>
    </BaseFieldset>
  </section>
</template>

<script setup>
import './ActivationTab.scss'
import { computed } from 'vue'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { useTabSettings } from '../composables/useTabSettings.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { TranslationMode, SelectionTranslationMode, CONFIG } from '@/shared/config/config.js'
import { MOBILE_CONSTANTS } from '@/shared/config/constants.js'

// Components
import BaseCheckbox from '@/components/base/BaseCheckbox.vue'
import BaseRadio from '@/components/base/BaseRadio.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import BaseFieldset from '@/components/base/BaseFieldset.vue'
import ShortcutPicker from '@/components/base/ShortcutPicker.vue'
import ProviderSelector from '@/components/shared/ProviderSelector.vue'
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'ActivationTab')
const settingsStore = useSettingsStore()
const { t } = useUnifiedI18n()
const { createSetting, createProviderSetting } = useTabSettings(settingsStore, logger)

// --- State ---
// --- Settings Definitions ---

// General
const extensionEnabled = createSetting('EXTENSION_ENABLED', true)

// FAB
const showMobileFab = createSetting('SHOW_MOBILE_FAB', true)
const showDesktopFab = createSetting('SHOW_DESKTOP_FAB', false, {
  onChanged: (val) => {
    // Sync mobile FAB with desktop FAB toggle
    showMobileFab.value = val
    
    if (!val && selectionTranslationMode.value === SelectionTranslationMode.ON_FAB_CLICK) {
      selectionTranslationMode.value = SelectionTranslationMode.ON_CLICK
    }
  }
})
const mobileUiMode = createSetting('MOBILE_UI_MODE', MOBILE_CONSTANTS.UI_MODE.AUTO)

const mobileModeOptions = computed(() => [
  { value: MOBILE_CONSTANTS.UI_MODE.AUTO, label: t('mobile_ui_mode_auto') },
  { value: MOBILE_CONSTANTS.UI_MODE.MOBILE, label: t('mobile_ui_mode_mobile') },
  { value: MOBILE_CONSTANTS.UI_MODE.DESKTOP, label: t('mobile_ui_mode_desktop') }
])

// Text Fields
const translateOnTextFields = createSetting('TRANSLATE_ON_TEXT_FIELDS', false)
const enableShortcutForTextFields = createSetting('ENABLE_SHORTCUT_FOR_TEXT_FIELDS', false)
const textFieldShortcut = createSetting('TEXT_FIELD_SHORTCUT', 'Ctrl+/')
const textFieldMode = createSetting('COPY_REPLACE', 'copy', {
  transformGet: (v) => v === 'replace' ? 'replace' : 'copy'
})
const replaceOnSpecialSites = createSetting('REPLACE_SPECIAL_SITES', false)

// Selection
const translateWithSelectElement = createSetting('TRANSLATE_WITH_SELECT_ELEMENT', false)
const selectElementShowOriginal = createSetting('SELECT_ELEMENT_SHOW_ORIGINAL_ON_HOVER', false)
const contextMenuVisibility = createSetting('CONTEXT_MENU_VISIBILITY', CONFIG.CONTEXT_MENU_VISIBILITY)

const showSelectElementInContextMenu = computed({
  get: () => contextMenuVisibility.value?.PAGE_CONTEXT_SELECT_ELEMENT ?? true,
  set: (val) => {
    contextMenuVisibility.value = {
      ...contextMenuVisibility.value,
      PAGE_CONTEXT_SELECT_ELEMENT: val
    }
  }
})

const translateOnTextSelection = createSetting('TRANSLATE_ON_TEXT_SELECTION', CONFIG.TRANSLATE_ON_TEXT_SELECTION)
const selectionTranslationMode = createSetting('selectionTranslationMode', SelectionTranslationMode.IMMEDIATE)
const requireCtrlForTextSelection = createSetting('REQUIRE_CTRL_FOR_TEXT_SELECTION', false)
const activeSelectionIconOnTextfields = createSetting('ACTIVE_SELECTION_ICON_ON_TEXTFIELDS', true)
const enhancedTripleClickDrag = createSetting('ENHANCED_TRIPLE_CLICK_DRAG', false)

// Whole Page
const wholePageEnabled = createSetting('WHOLE_PAGE_TRANSLATION_ENABLED', true)
const wholePageLazyLoading = createSetting('WHOLE_PAGE_LAZY_LOADING', true)
const wholePageAutoTranslate = createSetting('WHOLE_PAGE_AUTO_TRANSLATE_ON_DOM_CHANGES', true)
const wholePageShowOriginal = createSetting('WHOLE_PAGE_SHOW_ORIGINAL_ON_HOVER', false)
const wholePageTranslateAfterScrollStop = createSetting('WHOLE_PAGE_TRANSLATE_AFTER_SCROLL_STOP', false)
const wholePageScrollStopDelay = createSetting('WHOLE_PAGE_SCROLL_STOP_DELAY', 500)

const fieldProvider = createProviderSetting(TranslationMode.Field)
const selectElementProvider = createProviderSetting(TranslationMode.Select_Element)
const selectionProvider = createProviderSetting(TranslationMode.Selection)
const pageProvider = createProviderSetting(TranslationMode.Page)

</script>
