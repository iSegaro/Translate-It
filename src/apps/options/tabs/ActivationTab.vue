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
    <div 
      class="feature-card"
      :class="{ 'is-enabled': showDesktopFab }"
    >
      <div class="card-header">
        <div class="card-title-group">
          <div class="title-with-icon">
            <span class="card-icon">🔘</span>
            <h3>{{ t('activation_group_fab_title') || 'Quick Action Button (FAB)' }}</h3>
          </div>
          <p class="card-description">{{ t('show_desktop_fab_description') || 'Display a floating action button on desktop to quickly access tools like Translate Page and Select Element.' }}</p>
        </div>
        <div class="card-actions">
          <BaseToggle 
            id="SHOW_DESKTOP_FAB"
            v-model="showDesktopFab"
            :disabled="!extensionEnabled"
          />
        </div>
      </div>

      <Transition name="fade-slide">
        <div 
          v-if="showDesktopFab" 
          class="card-content"
        >
          <BaseAccordion
            :id="'ADVANCED_FAB'"
            :legend="t('advanced_settings_label') || 'Advanced Settings'"
            class="advanced-settings-accordion"
          >
            <div class="advanced-content">
              <div class="setting-row horizontal">
                <label class="setting-label">{{ t('mobile_ui_mode_label') || 'UI Mode' }}</label>
                <BaseSelect
                  v-model="mobileUiMode"
                  :options="mobileModeOptions"
                  :disabled="!extensionEnabled"
                  class="compact-select"
                />
              </div>

              <div class="section-separator mini" />

              <div class="fab-appearance-grid">
                <div class="fab-appearance-item opacity-item">
                  <BaseRange
                    id="FAB_IDLE_OPACITY"
                    v-model="fabIdleOpacity"
                    :label="t('fab_idle_opacity_label') || 'Idle Fade Opacity'"
                    value-suffix="%"
                    min="0"
                    max="100"
                    :disabled="!extensionEnabled"
                  />
                </div>

                <div class="fab-appearance-item size-item">
                  <label class="setting-label">{{ t('fab_size_label') || 'Icon Size' }}</label>
                  <BaseSelect
                    id="FAB_SIZE"
                    v-model="fabSize"
                    :options="fabSizeOptions"
                    :disabled="!extensionEnabled"
                    class="compact-select"
                  />
                </div>
              </div>
            </div>
          </BaseAccordion>
        </div>
      </Transition>
    </div>

    <!-- Text Field Translation -->
    <div 
      class="feature-card"
      :class="{ 'is-enabled': translateOnTextFields || enableShortcutForTextFields }"
    >
      <div class="card-header">
        <div class="card-title-group">
          <div class="title-with-icon">
            <span class="card-icon">⌨️</span>
            <h3>{{ t('activation_group_text_fields_title') || 'Text Field Translation' }}</h3>
          </div>
          <p class="card-description">{{ t('translate_on_text_fields_description') || 'Allow triggering translation directly within input/textarea fields.' }}</p>
        </div>
        <div class="card-actions">
          <BaseToggle 
            v-model="translateOnTextFields"
            :disabled="!extensionEnabled"
          />
        </div>
      </div>

      <Transition name="fade-slide">
        <div 
          v-if="translateOnTextFields || enableShortcutForTextFields" 
          class="card-content"
        >
          <BaseAccordion
            :id="'ADVANCED_TEXT_FIELD'"
            :legend="t('advanced_settings_label') || 'Advanced Settings'"
            class="advanced-settings-accordion"
          >
            <div class="advanced-content">
              <div class="setting-row horizontal">
                <label class="setting-label">{{ t('provider_label') }}</label>
                <div class="setting-control">
                  <ProviderSelector
                    v-model="fieldProvider"
                    allow-default
                    mode="button"
                    required-feature="bulk"
                    only-configured
                    :is-global="false"
                    :disabled="!extensionEnabled"
                  />
                </div>
              </div>

              <div class="section-separator mini" />

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
              </div>

              <div class="section-separator mini" />

              <div class="radio-group horizontal">
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

              <div class="setting-group mt-md">
                <BaseCheckbox 
                  v-model="replaceOnSpecialSites" 
                  :disabled="!extensionEnabled || textFieldMode !== 'copy'"
                  :label="t('enable_replace_on_special_sites') || 'Enable replace on special sites (Whatsapp, Telegram, etc.)'"
                />
              </div>
            </div>
          </BaseAccordion>
        </div>
      </Transition>
    </div>

    <!-- Select Element -->
    <div 
      class="feature-card"
      :class="{ 'is-enabled': translateWithSelectElement }"
    >
      <div class="card-header">
        <div class="card-title-group">
          <div class="title-with-icon">
            <span class="card-icon">🖱️</span>
            <h3>{{ t('activation_group_select_element_title') || 'Select Element' }}</h3>
          </div>
          <p class="card-description">{{ t('translate_with_select_element_description') || 'Allow triggering translation using a specific selection method.' }}</p>
        </div>
        <div class="card-actions">
          <BaseToggle 
            v-model="translateWithSelectElement"
            :disabled="!extensionEnabled"
          />
        </div>
      </div>

      <Transition name="fade-slide">
        <div 
          v-if="translateWithSelectElement" 
          class="card-content"
        >
          <BaseAccordion
            :id="'ADVANCED_SELECT_ELEMENT'"
            :legend="t('advanced_settings_label') || 'Advanced Settings'"
            class="advanced-settings-accordion"
          >
            <div class="advanced-content">
              <div class="setting-row horizontal">
                <label class="setting-label">{{ t('provider_label') }}</label>
                <div class="setting-control">
                  <ProviderSelector
                    v-model="selectElementProvider"
                    allow-default
                    mode="button"
                    required-feature="bulk"
                    only-configured
                    :is-global="false"
                    :disabled="!extensionEnabled"
                  />
                </div>
              </div>

              <div class="section-separator mini" />

              <div class="setting-row horizontal">
                <label class="setting-label">{{ t('shortcuts_label') || 'Shortcut' }}</label>
                <div 
                  id="SELECT_ELEMENT_CONFIGURE_SHORTCUTS"
                  class="setting-control"
                >
                  <ConfigureShortcutButton
                    command-name="SELECT-ELEMENT-COMMAND"
                    :disabled="!extensionEnabled"
                  />
                </div>
              </div>

              <div class="section-separator mini" />

              <div class="setting-group vertical">
                <BaseCheckbox
                  v-model="selectElementShowOriginal"
                  :disabled="!extensionEnabled"
                  :label="t('select_element_show_original_on_hover_label') || 'Show original on hover'"
                />
                <BaseCheckbox
                  v-model="showSelectElementInContextMenu"
                  :disabled="!extensionEnabled"
                  :label="t('show_select_element_in_context_menu_label') || 'Show in context menu'"
                />
              </div>
            </div>
          </BaseAccordion>
        </div>
      </Transition>
    </div>

    <!-- On-Page Selection -->
    <div 
      class="feature-card"
      :class="{ 'is-enabled': translateOnTextSelection }"
    >
      <div class="card-header">
        <div class="card-title-group">
          <div class="title-with-icon">
            <span class="card-icon">🎯</span>
            <h3>{{ t('activation_group_page_selection_title') || 'On-Page Selection' }}</h3>
          </div>
          <p class="card-description">{{ t('translate_on_text_selection_description') || 'Allow triggering translation automatically or via icon after selecting text.' }}</p>
        </div>
        <div class="card-actions">
          <BaseToggle 
            v-model="translateOnTextSelection"
            :disabled="!extensionEnabled"
          />
        </div>
      </div>

      <Transition name="fade-slide">
        <div 
          v-if="translateOnTextSelection" 
          class="card-content"
        >
          <BaseAccordion
            :id="'ADVANCED_SELECTION'"
            :legend="t('advanced_settings_label') || 'Advanced Settings'"
            class="advanced-settings-accordion"
          >
            <div class="advanced-content">
              <div class="setting-row horizontal">
                <label class="setting-label">{{ t('provider_label') }}</label>
                <div class="setting-control">
                  <ProviderSelector
                    v-model="selectionProvider"
                    allow-default
                    mode="button"
                    only-configured
                    :is-global="false"
                    :disabled="!extensionEnabled"
                  />
                </div>
              </div>

              <div class="section-separator mini" />

              <div class="radio-group horizontal">
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

              <div class="section-separator mini" />

              <div class="setting-group vertical">
                <BaseCheckbox
                  v-model="requireCtrlForTextSelection"
                  :disabled="!extensionEnabled || selectionTranslationMode !== SelectionTranslationMode.IMMEDIATE"
                  :label="t('require_ctrl_for_text_selection_label') || 'Require Ctrl key for text selection translation'"
                />
                <BaseCheckbox
                  v-model="activeSelectionIconOnTextfields"
                  :disabled="!extensionEnabled"
                  :label="t('active_selection_icon_on_textfields_label') || 'Active Selection Icon on Textfields'"
                />
                <BaseCheckbox
                  v-model="enhancedTripleClickDrag"
                  :disabled="!extensionEnabled"
                  :label="t('enhanced_triple_click_drag_label') || 'Enhanced Triple-Click + Drag Support'"
                />
              </div>
            </div>
          </BaseAccordion>
        </div>
      </Transition>
    </div>

    <!-- Whole Page Translation -->
    <div 
      class="feature-card"
      :class="{ 'is-enabled': wholePageEnabled }"
    >
      <div class="card-header">
        <div class="card-title-group">
          <div class="title-with-icon">
            <span class="card-icon">🌐</span>
            <h3>{{ t('whole_page_translation_section_title') || 'Whole Page Translation' }}</h3>
          </div>
          <p class="card-description">{{ t('whole_page_translation_enabled_description') || 'Allow translating the entire web page content while maintaining the layout.' }}</p>
        </div>
        <div class="card-actions">
          <BaseToggle 
            v-model="wholePageEnabled"
            :disabled="!extensionEnabled"
          />
        </div>
      </div>

      <Transition name="fade-slide">
        <div 
          v-if="wholePageEnabled" 
          class="card-content"
        >
          <BaseAccordion
            :id="'ADVANCED_WHOLE_PAGE'"
            :legend="t('advanced_settings_label') || 'Advanced Settings'"
            class="advanced-settings-accordion"
          >
            <div class="advanced-content">
              <div class="setting-row horizontal">
                <label class="setting-label">{{ t('provider_label') }}</label>
                <div class="setting-control">
                  <ProviderSelector
                    v-model="pageProvider"
                    allow-default
                    mode="button"
                    required-feature="bulk"
                    only-configured
                    :is-global="false"
                    :disabled="!extensionEnabled"
                  />
                </div>
              </div>

              <div class="section-separator mini" />

              <div class="setting-group vertical">
                <div class="radio-group horizontal mb-md">
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

                <div class="setting-row horizontal">
                  <label class="setting-label">{{ t('whole_page_delay_label') || 'Translation Delay' }}</label>
                  <div class="number-input-container">
                    <input
                      v-model.number="wholePageScrollStopDelay"
                      type="number"
                      min="100"
                      max="5000"
                      step="100"
                      class="base-number-input compact-input"
                      :disabled="!extensionEnabled"
                    >
                    <span class="unit-label">ms</span>
                  </div>
                </div>
              </div>

              <div class="section-separator mini" />

              <div class="setting-group vertical">
                <BaseCheckbox
                  v-model="wholePageShowOriginal"
                  :disabled="!extensionEnabled"
                  :label="t('whole_page_show_original_on_hover_label') || 'Show original on hover'"
                />
                <BaseCheckbox
                  v-model="wholePageLazyLoading"
                  :disabled="!extensionEnabled"
                  :label="t('whole_page_lazy_loading_label') || 'Lazy Loading (Performance)'"
                />
                <BaseCheckbox
                  v-model="wholePageAutoTranslate"
                  :disabled="!extensionEnabled"
                  :label="t('whole_page_auto_translate_on_dom_changes_label') || 'Auto-translate new content'"
                />
                <BaseCheckbox
                  v-model="wholePageTokenWarningEnabled"
                  :disabled="!extensionEnabled"
                  :label="t('whole_page_token_warning_label') || 'Show token usage warning'"
                />
              </div>
            </div>
          </BaseAccordion>
        </div>
      </Transition>
    </div>

    <!-- Mouse on Hover Translation -->
    <div 
      class="feature-card"
      :class="{ 'is-enabled': mouseHoverEnabled }"
    >
      <div class="card-header">
        <div class="card-title-group">
          <div class="title-with-icon">
            <span class="card-icon">🖱️</span>
            <h3>{{ t('activation_group_mouse_hover_title') || 'Mouse on Hover Translation' }}</h3>
          </div>
          <p class="card-description">{{ t('mouse_hover_translation_enabled_description') || 'Automatically translate text when you hover over it.' }}</p>
        </div>
        <div class="card-actions">
          <BaseToggle 
            v-model="mouseHoverEnabled"
            :disabled="!extensionEnabled"
          />
        </div>
      </div>

      <Transition name="fade-slide">
        <div 
          v-if="mouseHoverEnabled" 
          class="card-content"
        >
          <BaseAccordion
            :id="'ADVANCED_MOUSE_HOVER'"
            :legend="t('advanced_settings_label') || 'Advanced Settings'"
            class="advanced-settings-accordion"
          >
            <div class="advanced-content">
              <div class="setting-row horizontal">
                <label class="setting-label">{{ t('provider_label') }}</label>
                <div class="setting-control">
                  <ProviderSelector
                    v-model="mouseHoverProvider"
                    allow-default
                    mode="button"
                    required-feature="bulk"
                    only-configured
                    :is-global="false"
                    :disabled="!extensionEnabled"
                  />
                </div>
              </div>

              <div class="section-separator mini" />

              <div class="setting-row horizontal">
                <label class="setting-label">{{ t('mouse_hover_scope_label') || 'Translation Scope' }}</label>
                <div class="setting-control">
                  <BaseSelect
                    id="MOUSE_HOVER_SCOPE"
                    v-model="mouseHoverScope"
                    :options="mouseHoverScopeOptions"
                    :disabled="!extensionEnabled"
                    class="compact-select"
                  />
                </div>
              </div>

              <div 
                v-if="mouseHoverScope === 'container'"
                class="setting-group vertical mt-sm"
              >
                <BaseCheckbox
                  id="MOUSE_HOVER_SHOW_CONTAINER_BORDER"
                  v-model="mouseHoverShowBorder"
                  :disabled="!extensionEnabled"
                  :label="t('mouse_hover_show_container_border_label') || 'Show border around container'"
                />
              </div>

              <div class="section-separator mini" />

              <div class="setting-row horizontal">
                <label class="setting-label">{{ t('mouse_hover_trigger_label') || 'Trigger' }}</label>
                <div class="setting-control">
                  <BaseSelect
                    id="MOUSE_HOVER_TRIGGER"
                    v-model="mouseHoverTrigger"
                    :options="mouseHoverTriggerOptions"
                    :disabled="!extensionEnabled"
                    class="compact-select"
                  />
                </div>
              </div>

              <div 
                v-if="mouseHoverTrigger === 'hover'"
                class="setting-row horizontal mt-sm"
              >
                <label class="setting-label">{{ t('mouse_hover_delay_label') || 'Hover Delay' }}</label>
                <div class="number-input-container">
                  <input
                    id="MOUSE_HOVER_DELAY"
                    v-model.number="mouseHoverDelay"
                    type="number"
                    min="100"
                    max="5000"
                    step="100"
                    class="base-number-input compact-input"
                    :disabled="!extensionEnabled"
                  >
                  <span class="unit-label">ms</span>
                </div>
              </div>

              <div class="section-separator mini" />

              <div class="setting-row horizontal">
                <label class="setting-label">{{ t('mouse_hover_autoclose_label') || 'Auto-Close Tooltip' }}</label>
                <div class="setting-control">
                  <BaseSelect
                    id="MOUSE_HOVER_AUTO_CLOSE"
                    v-model="mouseHoverAutoClose"
                    :options="mouseHoverAutoCloseOptions"
                    :disabled="!extensionEnabled"
                    class="compact-select"
                  />
                </div>
              </div>

              <div 
                v-if="mouseHoverAutoClose === 'timer'"
                class="setting-row horizontal mt-sm"
              >
                <label class="setting-label">{{ t('mouse_hover_timer_label') || 'Display Time' }}</label>
                <div class="number-input-container">
                  <input
                    id="MOUSE_HOVER_TIMER_DURATION"
                    v-model.number="mouseHoverTimerDuration"
                    type="number"
                    min="1000"
                    max="30000"
                    step="500"
                    class="base-number-input compact-input"
                    :disabled="!extensionEnabled"
                  >
                  <span class="unit-label">ms</span>
                </div>
              </div>
            </div>
          </BaseAccordion>
        </div>
      </Transition>
    </div>
  </section>
</template>

<script setup>
import './ActivationTab.scss'
import { computed, onMounted, onUnmounted } from 'vue'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { useTabSettings } from '../composables/useTabSettings.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { TranslationMode, SelectionTranslationMode, CONFIG } from '@/shared/config/config.js'
import { MOBILE_CONSTANTS } from '@/shared/constants/mobile.js'
import { useHighlightManager } from '../composables/useHighlightManager.js'

// Components
import BaseCheckbox from '@/components/base/BaseCheckbox.vue'
import BaseToggle from '@/components/base/BaseToggle.vue'
import BaseRadio from '@/components/base/BaseRadio.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import BaseRange from '@/components/base/BaseRange.vue'
import BaseFieldset from '@/components/base/BaseFieldset.vue'
import ShortcutPicker from '@/components/base/ShortcutPicker.vue'
import ConfigureShortcutButton from '@/components/feature/ConfigureShortcutButton.vue'
import ProviderSelector from '@/components/shared/ProviderSelector.vue'
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'ActivationTab')
const settingsStore = useSettingsStore()
const { highlightElement } = useHighlightManager()
const { t } = useUnifiedI18n()
const { createSetting, createProviderSetting } = useTabSettings(settingsStore, logger)

// --- Actions ---

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

const fabIdleOpacity = createSetting('FAB_IDLE_OPACITY', 20)
const fabSize = createSetting('FAB_SIZE', '1')

const fabSizeOptions = computed(() => [
  { value: '0.8', label: t('fab_size_small') || 'Small' },
  { value: '1', label: t('fab_size_default') || 'Default' },
  { value: '1.2', label: t('fab_size_large') || 'Large' },
  { value: '1.5', label: t('fab_size_extra_large') || 'Extra Large' }
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
const wholePageTokenWarningEnabled = createSetting('WHOLE_PAGE_TOKEN_WARNING_HIDDEN', false, {
  transformGet: (v) => !v,
  transformSet: (v) => !v
})

// Mouse on Hover
const mouseHoverEnabled = createSetting('MOUSE_HOVER_TRANSLATION_ENABLED', false)
const mouseHoverScope = createSetting('MOUSE_HOVER_SCOPE', 'container')
const mouseHoverTrigger = createSetting('MOUSE_HOVER_TRIGGER', 'ctrl')
const mouseHoverDelay = createSetting('MOUSE_HOVER_DELAY', 500)
const mouseHoverAutoClose = createSetting('MOUSE_HOVER_AUTO_CLOSE', 'mouseleave')
const mouseHoverTimerDuration = createSetting('MOUSE_HOVER_TIMER_DURATION', 3000)
const mouseHoverShowBorder = createSetting('MOUSE_HOVER_SHOW_CONTAINER_BORDER', true)

const mouseHoverScopeOptions = computed(() => [
  { value: 'word', label: t('mouse_hover_scope_word') || 'Word' },
  { value: 'sentence', label: t('mouse_hover_scope_sentence') || 'Sentence' },
  { value: 'container', label: t('mouse_hover_scope_container') || 'Container' }
])

const mouseHoverTriggerOptions = computed(() => [
  { value: 'hover', label: t('mouse_hover_trigger_hover') || 'Immediate (Hover)' },
  { value: 'ctrl', label: t('mouse_hover_trigger_ctrl') || 'Ctrl + Hover' },
  { value: 'alt', label: t('mouse_hover_trigger_alt') || 'Alt + Hover' },
  { value: 'shift', label: t('mouse_hover_trigger_shift') || 'Shift + Hover' }
])

const mouseHoverAutoCloseOptions = computed(() => [
  { value: 'mouseleave', label: t('mouse_hover_autoclose_mouseleave') || 'On Mouse Leave' },
  { value: 'timer', label: t('mouse_hover_autoclose_timer') || 'After Time' }
])

const fieldProvider = createProviderSetting(TranslationMode.Field)
const selectElementProvider = createProviderSetting(TranslationMode.Select_Element)
const selectionProvider = createProviderSetting(TranslationMode.Selection)
const pageProvider = createProviderSetting(TranslationMode.Page)
const mouseHoverProvider = createProviderSetting(TranslationMode.MouseHover)

// --- Validation Feedback ---

const handleValidationFeedback = (e) => {
  const { field, mode } = e.detail || {};
  
  if (field === 'provider' && mode) {
    // Map mode to fieldset ID
    const modeToId = {
      [TranslationMode.Field]: 'activation_group_text_fields',
      [TranslationMode.Select_Element]: 'activation_group_select_element',
      [TranslationMode.Selection]: 'activation_group_page_selection',
      [TranslationMode.Page]: 'FIELDSET_WHOLE_PAGE',
      [TranslationMode.MouseHover]: 'activation_group_mouse_hover'
    };
    
    const id = modeToId[mode];
    if (id) highlightElement(id);
  } else if (field === 'WHOLE_PAGE_SCROLL_STOP_DELAY') {
    highlightElement('WHOLE_PAGE_TRIGGER_MODE');
  }
};

onMounted(async () => {
  window.addEventListener('options-trigger-validation-feedback', handleValidationFeedback);
})

onUnmounted(() => {
  window.removeEventListener('options-trigger-validation-feedback', handleValidationFeedback);
})

</script>
