<template>
  <!-- Split Button Mode for Popup -->
  <div
    v-if="mode === 'split'"
    ref="selectorRef"
    class="ti-split-translate-button-container"
    :class="{
      'ti-dropdown-open': isDropdownOpen,
      'is-disabled': disabled,
      'ti-split-translate-button-container--compact-label': presentation === 'compact-label'
    }"
    v-bind="$attrs"
  >
    <div
      class="ti-split-translate-button"
      :class="{ 'ti-is-loading': loading }"
    >
      <button
        type="submit"
        class="ti-translate-main-area"
        :title="mainActionLabel"
        :aria-label="mainActionLabel"
        :disabled="disabled"
        @click="handleTranslate"
        @keydown="handleKeydown"
      >
        <Icon 
          v-if="loading"
          icon="fa6-solid:square" 
          class="ti-api-provider-icon ti-stop-icon"
        />
        <img
          v-else
          :src="currentProviderIcon"
          alt="API Provider"
          class="ti-api-provider-icon"
          :class="{ 'ti-invert-dark': isProviderInverted(currentProvider) }"
        >
        <span class="ti-translate-main-labels">
          <span class="ti-translate-main-label">{{ mainActionLabel }}</span>
          <span
            class="ti-translate-main-label-reserve"
            aria-hidden="true"
          >{{ translateActionLabel }}</span>
          <span
            class="ti-translate-main-label-reserve"
            aria-hidden="true"
          >{{ stopActionLabel }}</span>
        </span>
      </button>
      <button
        ref="triggerBtnRef"
        type="button"
        class="ti-provider-dropdown-area"
        :class="{ 'ti-active': isDropdownOpen }"
        :disabled="isProviderSelectionDisabled"
        :aria-expanded="isDropdownOpen"
        :aria-controls="menuId"
        :aria-label="dropdownTriggerLabel"
        @click.stop="toggleDropdown"
        @keydown="handleKeydown"
      >
        <IconButton
          icon="dropdown-arrow.svg"
          alt="Dropdown"
          type="inline"
          class="ti-dropdown-arrow"
          :disabled="isProviderSelectionDisabled"
        />
      </button>
    </div>
  </div>
  
  <!-- Regular Button Mode for Sidepanel -->
  <div
    v-else-if="mode === 'button'"
    ref="selectorRef"
    class="ti-provider-button-container"
    :class="{ 'ti-dropdown-open': isDropdownOpen, 'is-disabled': isProviderSelectionDisabled }"
    v-bind="$attrs"
  >
    <button
      ref="triggerBtnRef"
      class="ti-provider-button"
      :class="{ 'ti-active': isDropdownOpen }"
      :disabled="isProviderSelectionDisabled"
      :aria-expanded="isDropdownOpen"
      :aria-controls="menuId"
      @click="toggleDropdown"
      @keydown="handleKeydown"
    >
      <img
        :src="currentProviderIcon"
        alt="API Provider"
        class="ti-api-provider-icon"
        :class="{ 'ti-invert-dark': isProviderInverted(currentProvider) }"
      >
      <span>{{ currentProviderName }}</span>
      <IconButton
        icon="dropdown-arrow.svg"
        alt="Dropdown"
        type="inline"
        class="dropdown-arrow"
        :class="{ rotated: isDropdownOpen }"
        :disabled="isProviderSelectionDisabled"
      />
    </button>
  </div>
  
  <!-- Icon Only Mode for Sidepanel Toolbar -->
  <div
    v-else-if="mode === 'icon-only'"
    ref="selectorRef"
    class="ti-provider-icon-only-container"
    :class="{ 'ti-dropdown-open': isDropdownOpen, 'is-disabled': isProviderSelectionDisabled }"
    v-bind="$attrs"
  >
    <button
      ref="triggerBtnRef"
      class="ti-provider-icon-button"
      :class="{ 'ti-active': isDropdownOpen }"
      :title="currentProviderName"
      :disabled="isProviderSelectionDisabled"
      :aria-expanded="isDropdownOpen"
      :aria-controls="menuId"
      @click="toggleDropdown"
      @keydown="handleKeydown"
    >
      <img
        :src="currentProviderIcon"
        alt="API Provider"
        class="ti-provider-icon-only"
        :class="{ 'ti-invert-dark': isProviderInverted(currentProvider) }"
      >
    </button>
  </div>

  <!-- Mobile Mode for Manual Input / Bottom Sheets -->
  <div
    v-else-if="mode === 'mobile'"
    ref="selectorRef"
    class="ti-provider-mobile-container"
    :class="{ 'ti-dropdown-open': isDropdownOpen, 'is-disabled': isProviderSelectionDisabled }"
    v-bind="$attrs"
  >
    <button
      ref="triggerBtnRef"
      class="ti-provider-mobile-button"
      :class="{ 'ti-active': isDropdownOpen }"
      :disabled="isProviderSelectionDisabled"
      :aria-expanded="isDropdownOpen"
      :aria-controls="menuId"
      @click="toggleDropdown"
      @keydown="handleKeydown"
    >
      <img
        :src="currentProviderIcon"
        alt="API Provider"
        class="ti-api-provider-icon"
        :class="{ 'ti-invert-dark': isProviderInverted(currentProvider) }"
      >
      <span>{{ currentProviderName }}</span>
      <IconButton
        icon="dropdown-arrow.svg"
        alt="Dropdown"
        type="inline"
        class="dropdown-arrow"
        :class="{ rotated: isDropdownOpen }"
        :disabled="isProviderSelectionDisabled"
      />
    </button>
  </div>
  
  <!-- Compact Mode (Native select + adjacent accessible Configure Providers control) -->
  <div
    v-else
    class="ti-provider-compact-container"
    :class="{ 'is-disabled': isProviderSelectionDisabled }"
    v-bind="$attrs"
  >
    <select
      :value="currentProvider"
      class="ti-provider-select"
      :class="{ 'is-dark': settingsStore.isDarkTheme }"
      :disabled="isProviderSelectionDisabled"
      @change="handleProviderChange"
    >
      <!-- Single source of truth: groupedMenu preserves EVERY entry
           (synthetic Default, uncategorized providers included) in full menu
           visual order. Labeled bins become optgroups; unlabeled bins
           (Default first, uncategorized) stay as loose options so all
           selections remain available. -->
      <template
        v-for="group in groupedMenu"
        :key="group.key"
      >
        <optgroup
          v-if="group.header"
          :key="`${group.key}-optgroup`"
          :label="group.header"
        >
          <option
            v-for="item in group.items"
            :key="item.id"
            :value="item.id"
          >
            {{ item.name }}
          </option>
        </optgroup>
        <template v-else>
          <option
            v-for="item in group.items"
            :key="item.id"
            :value="item.id"
          >
            {{ item.name }}
          </option>
        </template>
      </template>
    </select>
    <button
      type="button"
      class="ti-provider-compact-config-btn"
      :title="configureProvidersLabel"
      :aria-label="configureProvidersLabel"
      @click.stop="openProvidersSettings"
    >
      <Icon
        icon="fa6-solid:gear"
        class="ti-compact-config-icon"
      />
    </button>
  </div>

  <!-- Common Dropdown Teleport (Single instance for all modes) -->
  <Teleport
    v-if="mode !== 'compact'"
    :to="teleportTarget"
    :disabled="!isTeleportEnabled"
  >
    <div
      v-if="isDropdownOpen"
      :id="menuId"
      ref="dropdownMenuElRef"
      class="ti-provider-dropdown-menu"
      :class="{ 
        'ti-open-upward': isUpward,
        'ti-is-teleported': isTeleportEnabled,
        'ti-provider-dropdown-menu--popup': isPopupTextContext
      }"
      :style="dropdownStyles"
      @click.stop
      @keydown="handleMenuKeydown"
      @focusout="handleMenuFocusOut"
    >
      <div
        ref="dropdownMenuRef"
        class="ti-provider-dropdown-list"
        @mouseleave="focusedIndex = -1"
      >
        <div
          v-for="group in groupedMenu"
          :key="group.key"
          class="ti-dropdown-group"
          :role="group.header ? 'group' : undefined"
          :aria-labelledby="group.headerId || undefined"
        >
          <!-- Category heading (announced via the group's aria-labelledby) -->
          <div
            v-if="group.header"
            :id="group.headerId"
            class="ti-dropdown-group-header"
            aria-hidden="true"
          >
            {{ group.header }}
          </div>

          <div
            v-for="item in group.items"
            :key="item.id"
            class="ti-dropdown-item"
            :class="{
              'ti-active': currentProvider === item.id,
              'is-focused': focusedIndex === item.index
            }"
            @click="selectProvider(item)"
            @mouseenter="focusedIndex = item.index"
          >
            <!-- Semantic selection button: owns the full selectable rectangle
                 (padding lives on it) and keyboard activation. The sibling star
                 stays an independent control; the row is only a click safety
                 net for edge/gap hits. -->
            <button
              type="button"
              class="ti-dropdown-item-btn"
              :aria-current="currentProvider === item.id ? 'true' : undefined"
              @click.stop="selectProvider(item)"
              @focus="focusedIndex = item.index"
            >
              <img
                :src="getProviderIcon(item.icon)"
                alt=""
                :class="{ 'ti-invert-dark': isProviderInverted(item.id) }"
              >
              <span>{{ item.name }}</span>
            </button>

            <!-- Set as Default (Star) Icon -->
            <button
              v-if="allowSetDefault && !isGlobal"
              type="button"
              class="ti-set-default-btn"
              :class="{ 'is-default': globalDefaultProvider === item.id }"
              :title="globalDefaultProvider === item.id ? t('is_default_provider_tooltip') || 'Default Service' : t('set_as_default_tooltip') || 'Set as Default Service'"
              :aria-label="globalDefaultProvider === item.id ? t('is_default_provider_tooltip') || 'Default Service' : t('set_as_default_tooltip') || 'Set as Default Service'"
              :aria-pressed="globalDefaultProvider === item.id ? 'true' : 'false'"
              @click.stop="setAsGlobalDefault(item)"
            >
              <Icon
                :icon="globalDefaultProvider === item.id ? 'fa6-solid:star' : 'fa6-regular:star'"
                class="ti-star-icon"
              />
            </button>
          </div>
        </div>
      </div>

      <!-- Dropdown footer: ephemeral sync rows (optional) + persistent Configure Providers action -->
      <div class="ti-provider-dropdown-footer">
        <template v-if="showSync">
          <button
            class="ti-sync-row"
            :class="{
              'is-active': ephemeralSync.page,
              'is-disabled': !canSyncToBulk
            }"
            :disabled="!canSyncToBulk"
            :title="!canSyncToBulk ? t('provider_does_not_support_bulk') || 'This provider does not support page/element translation' : ''"
            @click.stop="canSyncToBulk && toggleSync('page')"
          >
            <div class="ti-sync-info">
              <Icon
                :icon="ephemeralSync.page ? 'fa6-solid:link' : 'fa6-solid:link-slash'"
                class="ti-sync-icon"
              />
              <span>{{ t('sync_page_label') || 'Sync Page' }}</span>
            </div>
            <img
              :src="getEffectiveIcon('page')"
              class="ti-sync-provider-icon"
              :class="{ 'ti-invert-dark': isProviderInverted(getEffectiveProviderId('page')) }"
              alt="Target Provider"
            >
          </button>

          <button
            class="ti-sync-row"
            :class="{
              'is-active': ephemeralSync.element,
              'is-disabled': !canSyncToBulk
            }"
            :disabled="!canSyncToBulk"
            :title="!canSyncToBulk ? t('provider_does_not_support_bulk') || 'This provider does not support page/element translation' : ''"
            @click.stop="canSyncToBulk && toggleSync('element')"
          >
            <div class="ti-sync-info">
              <Icon
                :icon="ephemeralSync.element ? 'fa6-solid:link' : 'fa6-solid:link-slash'"
                class="ti-sync-icon"
              />
              <span>{{ t('sync_element_label') || 'Sync Element' }}</span>
            </div>
            <img
              :src="getEffectiveIcon('element')"
              class="ti-sync-provider-icon"
              :class="{ 'ti-invert-dark': isProviderInverted(getEffectiveProviderId('element')) }"
              alt="Target Provider"
            >
          </button>
        </template>

        <button
          type="button"
          class="ti-configure-row"
          :title="configureProvidersLabel"
          :aria-label="configureProvidersLabel"
          @click.stop="openProvidersSettings"
        >
          <div class="ti-sync-info">
            <Icon
              icon="fa6-solid:gear"
              class="ti-sync-icon"
            />
            <span>{{ configureProvidersLabel }}</span>
          </div>
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import './ProviderSelector.scss'
import { ref, computed, onMounted, onUnmounted, nextTick, useId } from 'vue'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useTranslationStore } from '@/features/translation/stores/translation.js'
import { useErrorHandler } from '@/composables/shared/useErrorHandler.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { useSelectElementTranslation } from '@/features/translation/composables/useTranslationModes.js'
import { getProvidersForDropdown, getProviderById } from '@/core/provider-registry.js'
import { openOptionsPage } from '@/core/helpers.js'
import { isProviderConfigured } from '@/features/translation/utils/providerValidator.js'
import IconButton from './IconButton.vue'
import { Icon } from '@iconify/vue'
import browser from 'webextension-polyfill'
import ExtensionContextManager from '@/core/extensionContext.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { useResourceTracker } from '@/composables/core/useResourceTracker.js'

import { TranslationMode } from '@/shared/config/config.js'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'ProviderSelector')

// Popup Text view menu budget (user-approved 245 CSS px), clamped to the
// viewport with 8px gutters on both sizing and positioning.
const POPUP_MENU_WIDTH = 245

// Resource tracker for automatic cleanup
const tracker = useResourceTracker('provider-selector')

// Composables
const { t } = useUnifiedI18n()

// Props
const props = defineProps({
  mode: {
    type: String,
    default: 'split', // split, button, icon-only, compact, mobile
    validator: (value) => ['split', 'button', 'icon-only', 'compact', 'mobile'].includes(value)
  },
  modelValue: {
    type: String,
    default: ''
  },
  disabled: {
    type: Boolean,
    default: false
  },
  dropdownDisabled: {
    type: Boolean,
    default: false
  },
  isGlobal: {
    type: Boolean,
    default: true
  },
  showSync: {
    type: Boolean,
    default: false
  },
  allowDefault: {
    type: Boolean,
    default: false
  },
  requiredFeature: {
    type: String,
    default: 'translation'
  },
  loading: {
    type: Boolean,
    default: false
  },
  presentation: {
    type: String,
    default: 'default',
    validator: (value) => ['default', 'compact-label'].includes(value)
  },
  onlyConfigured: {
    type: Boolean,
    default: false
  },
  ignoreHidden: {
    type: Boolean,
    default: false
  },
  allowSetDefault: {
    type: Boolean,
    default: false
  },
  placement: {
    type: String,
    default: 'auto', // auto, up, down
    validator: (value) => ['auto', 'up', 'down'].includes(value)
  },
  translateOnProviderChange: {
    type: Boolean,
    default: true
  }
})

const translateActionLabel = computed(() => t('popup_translate_button_text') || 'Translate')
const stopActionLabel = computed(() => t('popup_stop_button_title') || 'Stop')
const mainActionLabel = computed(() => (props.loading ? stopActionLabel.value : translateActionLabel.value))
// Accessible name for the split-mode arrow trigger — it otherwise only derives
// the name from the inner image alt attribute.
const dropdownTriggerLabel = computed(() => t('switch_provider_label') || 'Switch translation service')

// Stable per-instance prefix for the menu and its category headings
const dropdownUid = `ti-provider-dropdown-${useId()}`
const menuId = `${dropdownUid}-menu`

// Emits
const emit = defineEmits(['translate', 'cancel', 'provider-change', 'update:modelValue'])

// Stores
const settingsStore = useSettingsStore()
const translationStore = useTranslationStore()
const { handleError } = useErrorHandler()
const { isSelectModeActive, deactivateSelectMode } = useSelectElementTranslation()

// State
const selectorRef = ref(null)
const triggerBtnRef = ref(null)
const dropdownMenuRef = ref(null)
const dropdownMenuElRef = ref(null)
const isDropdownOpen = ref(false)
const isUpward = ref(false)
const focusedIndex = ref(-1)
const dropdownMaxHeight = ref('400px')
const dropdownStyles = ref({})

const teleportTarget = ref('body')
const isTeleportEnabled = ref(false)
let resizeAnimationFrameId = null

/**
 * Detects RTL direction for correct alignment of teleported dropdowns.
 */
const isRTL = computed(() => {
  try {
    return document.documentElement.dir === 'rtl' || document.body.dir === 'rtl' || selectorRef.value?.closest('.rtl') !== null;
  } catch {
    return false;
  }
})

const isProviderSelectionDisabled = computed(() => props.disabled || props.dropdownDisabled)

/**
 * Popup Text view detection via its unique `.translation-view` ancestor. The
 * menu teleports to body (or the shadow overlay), where ancestor CSS cannot
 * reach it, hence the explicit menu-root class used with this detection.
 */
const isPopupTextContext = computed(() => !!selectorRef.value?.closest?.('.translation-view'))

/**
 * Computed property to identify the current global default provider
 */
const globalDefaultProvider = computed(() => settingsStore.settings?.TRANSLATION_API)

/**
 * Sets a provider as the global default translation service.
 * Used primarily in the Popup to allow making session overrides permanent.
 */
const setAsGlobalDefault = async (provider) => {
  logger.debug('Setting global default provider:', provider.id)
  try {
    // 1. Persist to storage
    await settingsStore.updateSettingAndPersist('TRANSLATION_API', provider.id)
    
    // 2. Also select it for the current session if it wasn't already
    if (currentProvider.value !== provider.id) {
      await selectProvider(provider)
    }
    
    // 3. Control activation closes the menu (selection path above already
    //    closed it when the provider changed)
    if (isDropdownOpen.value) closeDropdown(false)

    logger.info(`Provider ${provider.id} set as global default.`)
  } catch (error) {
    logger.error('Failed to set global default provider:', error)
    await handleError(error, 'provider-selector-set-default')
  }
}

// Handle keyboard navigation
const handleKeydown = (event) => {
  if (props.disabled) return

  const { key } = event
  const items = availableProviders.value
  const currentIndex = items.findIndex(p => p.id === currentProvider.value)

  // If dropdown is closed, Arrow keys change selection directly (Native behavior - No looping)
  if (!isDropdownOpen.value) {
    if (key === 'ArrowDown') {
      event.preventDefault()
      if (currentIndex < items.length - 1) {
        selectProvider(items[currentIndex + 1])
      }
      return
    }
    if (key === 'ArrowUp') {
      event.preventDefault()
      if (currentIndex > 0) {
        selectProvider(items[currentIndex - 1])
      }
      return
    }
    if (key === 'Enter') {
      event.preventDefault()
      // In split mode, Enter triggers translation instead of opening dropdown
      if (props.mode === 'split') {
        handleTranslate()
      } else {
        toggleDropdown()
        focusedIndex.value = indexInMenuItems() !== -1 ? indexInMenuItems() : 0
      }
      return
    }
    if (key === ' ') {
      event.preventDefault()
      toggleDropdown()
      focusedIndex.value = indexInMenuItems() !== -1 ? indexInMenuItems() : 0
      return
    }
    return
  }

  // Dropdown open (focus still on the trigger): mirror the menu keyboard
  // model. All open-menu navigation is driven by focusedIndex state so the
  // outcome is identical whether the browser moved focus into the menu or the
  // trigger still holds focus.
  switch (key) {
    case 'ArrowDown':
      event.preventDefault()
      focusedIndex.value = (focusedIndex.value + 1) % menuItems.value.length
      moveListFocus()
      break
    case 'ArrowUp':
      event.preventDefault()
      focusedIndex.value = (focusedIndex.value - 1 + menuItems.value.length) % menuItems.value.length
      moveListFocus()
      break
    case 'Enter':
    case ' ':
      event.preventDefault()
      if (focusedIndex.value >= 0 && focusedIndex.value < menuItems.value.length) {
        selectProvider(menuItems.value[focusedIndex.value])
      }
      break
    case 'Escape':
      event.preventDefault()
      closeDropdown(true)
      break
    // 'Tab': let the browser move focus naturally (item → star → sync →
    // configure); the menu closes via focusout once focus leaves it.
  }
}

/**
 * Index of the current selection within the visual (group-ordered) menu list
 */
const indexInMenuItems = () => menuItems.value.findIndex(p => p.id === currentProvider.value)

/**
 * Moves real DOM focus to the provider row at the current focused index.
 * The focus() must run AFTER the open/position flush settles: a rendering
 * pass within the same flush (style patch after positioning, teleport stub
 * re-render in tests) can replace menu nodes and silently drop a same-tick
 * focus(). The current focusedIndex is read at execution time so a queued
 * move never reverts newer state advances.
 */
const moveListFocus = () => {
  nextTick(() => {
    const container = dropdownMenuRef.value
    if (!container) return
    const rows = container.querySelectorAll('.ti-dropdown-item')
    rows[focusedIndex.value]?.querySelector('.ti-dropdown-item-btn')?.focus()
  })
  scrollToFocused()
}

/**
 * Delegated keyboard handling for the open dropdown menu.
 * Arrow keys move real focus between provider rows (visual order, groups
 * included); Enter/Space select. The star, sync rows and the Configure action
 * are natural buttons reached by Tab — Tab itself is not intercepted, so
 * focus moves freely between those controls; the menu closes once focus
 * leaves the menu (see handleMenuFocusOut).
 */
const handleMenuKeydown = (event) => {
  const { key } = event
  const items = menuItems.value
  if (!items.length) return

  if (key === 'ArrowDown' || key === 'ArrowUp') {
    event.preventDefault()
    const delta = key === 'ArrowDown' ? 1 : -1
    const next = (focusedIndex.value + delta + items.length) % items.length
    focusedIndex.value = next
    moveListFocus(next)
    return
  }

  if (key === 'Enter' || key === ' ') {
    // Only provider selection buttons are activated here; the star, sync and
    // footer controls rely on their native button activation.
    if (!event.target?.closest?.('.ti-dropdown-item-btn')) return
    event.preventDefault()
    if (focusedIndex.value >= 0 && focusedIndex.value < items.length) {
      selectProvider(items[focusedIndex.value])
    }
    return
  }

  if (key === 'Escape') {
    event.preventDefault()
    closeDropdown(true)
  }
}

/**
 * Closes the menu silently when focus moves out of it entirely (e.g. Tab past
 * the Configure row). Moving focus between controls inside the menu keeps it
 * open, as does a blur-to-null caused by the pointer interacting with a
 * non-focusable menu region during an in-menu pointer interaction (tracked by
 * the pointer latch below). Outside clicks should never steal focus, so this
 * close is silent.
 */
const handleMenuFocusOut = (event) => {
  if (!isDropdownOpen.value) return
  if (dropdownMenuElRef.value?.contains(event.relatedTarget)) return
  if (menuPointerInside) return
  closeDropdown(false)
}

/**
 * Pointer latch for the focusout suppression above: latched while a pointer
 * interaction begins inside the menu, cleared by pointerup anywhere or
 * pointercancel, so a canceled/outside pointer can never leave it stuck and
 * keyboard-only focus changes (no latch) still dismiss the menu normally.
 */
let menuPointerInside = false
const handleMenuPointerTracking = (event) => {
  if (event.type === 'pointerdown') {
    menuPointerInside = event.composedPath().includes(dropdownMenuElRef.value)
  } else {
    menuPointerInside = false
  }
}

const scrollToFocused = () => {
  nextTick(() => {
    const container = dropdownMenuRef.value
    if (!container) return
    // Rows live inside optional category groups; query the row list instead
    // of container.children so group headings never corrupt the index.
    const rows = container.querySelectorAll('.ti-dropdown-item')
    const focusedEl = rows[focusedIndex.value]

    if (focusedEl) {
      const containerRect = container.getBoundingClientRect()
      const elementRect = focusedEl.getBoundingClientRect()

      if (elementRect.top < containerRect.top) {
        // Scroll up to show element at top
        container.scrollTo({ top: container.scrollTop - (containerRect.top - elementRect.top), behavior: 'smooth' })
      } else if (elementRect.bottom > containerRect.bottom) {
        // Scroll down to show element at bottom
        container.scrollTo({ top: container.scrollTop + (elementRect.bottom - containerRect.bottom), behavior: 'smooth' })
      }
    }
  })
}

/**
 * Handle click outside to close dropdown (Shadow DOM compatible)
 */
const handleClickOutside = (event) => {
  // Use composedPath to support Shadow DOM and handle retargeting
  const path = event.composedPath()

  if (!isDropdownOpen.value || !selectorRef.value) return
  
  // The click is internal when the trigger container OR the (possibly
  // teleported) menu is in the event path — Teleport on body and in a
  // shadow root both report the menu node in composedPath().
  // Inside-menu clicks must not close during capture: real click flows
  // dismiss through their own handlers (selection, footer actions).
  if (!path.includes(selectorRef.value) && !path.includes(dropdownMenuElRef.value)) {
    // Silent close — restoring trigger focus here would steal focus from
    // wherever the user clicked (including clicks inside the menu).
    closeDropdown(false)
  }
}

/**
 * Computed list of providers based on current settings and props
 */
const availableProviders = computed(() => {
  // Use provider registry for consistent provider information
  // Pass current debug mode state to allow/hide mock provider dynamically
  const debugMode = settingsStore.settings?.DEBUG_MODE || false;
  const providersFromRegistry = getProvidersForDropdown(debugMode);
  const hiddenProviders = settingsStore.settings?.HIDDEN_PROVIDERS || [];
  
  // Filter by required feature if provided
  let filteredRegistry = props.requiredFeature 
    ? providersFromRegistry.filter(p => p.features?.includes(props.requiredFeature))
    : providersFromRegistry;

  // Filter out hidden providers (but always show currently selected even if hidden)
  if (!props.ignoreHidden) {
    filteredRegistry = filteredRegistry.filter(p => {
      return !hiddenProviders.includes(p.id) || currentProvider.value === p.id;
    });
  }

  // Filter by configuration status if requested
  if (props.onlyConfigured) {
    filteredRegistry = filteredRegistry.filter(p => isProviderConfigured(p.id, settingsStore.settings));
  }

  const mappedProviders = filteredRegistry.map(provider => ({
    id: provider.id,
    name: provider.name,
    icon: provider.icon,
    category: provider.category || ''
  }));

  if (props.allowDefault) {
    const defaultProviderId = settingsStore.settings?.TRANSLATION_API || 'googlev2';
    const defaultProvider = getProviderById(defaultProviderId);
    
    // Default provider logic: 
    // 1. If no specific feature is required, always show Default.
    // 2. If a feature is required, only show Default if the global provider supports it.
    // 3. If onlyConfigured is true, only show Default if global provider is configured.
    // 4. SPECIAL CASE: If the current selection IS 'default', we MUST show it 
    //    to prevent the UI from displaying wrong names/icons.
    
    const defaultSupportsFeature = !props.requiredFeature || 
                                 (defaultProvider && defaultProvider.features?.includes(props.requiredFeature));
    
    const isDefaultConfigured = !props.onlyConfigured || isProviderConfigured(defaultProviderId, settingsStore.settings);
    
    const isCurrentlyDefault = currentProvider.value === 'default';

    // We show "Default" if:
    // 1. allowDefault is true (outer if) AND
    // 2. It's either configured, currently selected, or we just want to allow selecting it (always true if allowDefault is true)
    if (isDefaultConfigured || isCurrentlyDefault || props.allowDefault) {
      const baseName = t('provider_default') || 'Default';
      const displayName = !defaultSupportsFeature ? `${baseName} (${t('incompatible_label') || 'Incompatible'})` : baseName;

      return [
        { 
          id: 'default', 
          name: displayName, 
          icon: defaultProvider?.icon || 'providers/google.svg' 
        },
        ...mappedProviders
      ];
    }
  }
  
  return mappedProviders;
});

// ─── Conditional Category Grouping (Traditional / AI / Local) ──────────────
// Grouping is view-only on top of availableProviders (filters + synthetic
// Default stay untouched). Rules:
// - Only group when >= 6 visible real providers span >= 2 categories; keep the
//   list flat otherwise.
// - The synthetic "Default" entry leads the menu and is never classified/
//   bucketed (no category, no cost implication).
// - FREE category means Traditional translation services, not free-of-cost.
// - Category buckets keep stable manifest order inside them, so Vajehyab
//   (traditional per FREE category, trailing after the LOCAL providers in the
//   manifest) trails inside the Traditional bucket.
const CATEGORY_LABEL_KEYS = {
  free: 'provider_category_free',
  ai: 'provider_category_ai',
  local: 'provider_category_local'
}

const groupedMenu = computed(() => {
  const all = availableProviders.value
  const hasDefault = props.allowDefault && all.length > 0 && all[0].id === 'default'
  const real = hasDefault ? all.slice(1) : all

  const normalized = real.map(provider => ({
    ...provider,
    categoryKey: String(provider.category || '').trim().toLowerCase()
  }))
  const categorySet = new Set(normalized.map(provider => provider.categoryKey).filter(Boolean))
  const useGroups = real.length >= 6 && categorySet.size >= 2

  if (!useGroups) {
    const items = all.map((provider, index) => ({ ...provider, index }))
    return [{ key: 'flat', header: '', headerId: '', items }]
  }

  const order = ['free', 'ai', 'local']
  for (const categoryKey of categorySet) {
    if (!order.includes(categoryKey)) order.push(categoryKey)
  }

  const buckets = new Map()
  const uncategorized = []
  for (const provider of normalized) {
    if (!provider.categoryKey) {
      uncategorized.push(provider)
      continue
    }
    if (!buckets.has(provider.categoryKey)) buckets.set(provider.categoryKey, [])
    buckets.get(provider.categoryKey).push(provider)
  }

  const entries = []
  if (hasDefault) {
    entries.push({ key: 'default', header: '', items: [all[0]] })
  }
  for (const categoryKey of order) {
    const items = buckets.get(categoryKey)
    if (!items?.length) continue
    const labelKey = CATEGORY_LABEL_KEYS[categoryKey]
    entries.push({
      key: categoryKey,
      header: labelKey ? (t(labelKey) || '') : '',
      items
    })
  }
  if (uncategorized.length) {
    entries.push({ key: 'uncategorized', header: '', items: uncategorized })
  }

  let cursor = 0
  return entries.map((entry, groupIndex) => ({
    key: `${entry.key}-${groupIndex}`,
    header: entry.header,
    headerId: entry.header ? `${dropdownUid}-group-${groupIndex}` : '',
    items: entry.items.map(provider => ({ ...provider, index: cursor++ }))
  }))
})

const menuItems = computed(() => groupedMenu.value.flatMap(group => group.items))

/**
 * Opens the Providers tab of the options page (background resolves the anchor).
 */
const configureProvidersLabel = computed(() => t('configure_providers') || 'Configure Providers')
const openProvidersSettings = () => {
  // Control activation closes the menu (silent — focus must stay with the
  // activating control while the options page opens).
  if (isDropdownOpen.value) closeDropdown(false)
  openOptionsPage('providers')
}

// Ephemeral Sync State from store
const ephemeralSync = computed(() => translationStore.ephemeralSync)

/**
 * Currently selected provider ID
 */
const currentProvider = computed(() => {
  if (props.modelValue) return props.modelValue
  return settingsStore.settings.TRANSLATION_API
})

/**
 * Checks if the 'Default' selection is actually valid for this mode's requirements
 */
const isDefaultInvalid = computed(() => {
  if (currentProvider.value !== 'default' && props.modelValue !== 'default') return false;
  
  const globalId = settingsStore.settings?.TRANSLATION_API || 'googlev2';
  const globalProvider = getProviderById(globalId);
  
  return props.requiredFeature && 
         globalProvider && 
         !globalProvider.features?.includes(props.requiredFeature);
})

const currentProviderIcon = computed(() => {
  const provider = availableProviders.value.find(p => p.id === currentProvider.value)
  return getProviderIcon(provider?.icon || 'providers/google.svg')
})

const currentProviderName = computed(() => {
  if (currentProvider.value === 'default') {
    const baseName = t('provider_default') || 'Default';
    return isDefaultInvalid.value ? `${baseName} (${t('incompatible_label') || 'Incompatible'})` : baseName;
  }
  const provider = availableProviders.value.find(p => p.id === currentProvider.value)
  
  if (!provider) {
    logger.warn('[ProviderSelector] Unknown provider ID:', currentProvider.value);
    return currentProvider.value || 'Unknown';
  }
  
  return provider.name;
})

/**
 * Checks if the currently selected provider supports bulk operations (required for Page/Element sync)
 */
const canSyncToBulk = computed(() => {
  let providerId = currentProvider.value
  
  // Resolve 'default' to actual provider
  if (providerId === 'default') {
    providerId = settingsStore.settings?.TRANSLATION_API || 'googlev2'
  }
  
  const provider = getProviderById(providerId)
  return provider?.features?.includes('bulk') || false
})

/**
 * Helper to determine if a provider icon should be inverted in dark mode
 */
const isProviderInverted = (providerId) => {
  let effectiveId = providerId
  
  // If it's 'default', resolve to the actual global provider ID
  if (providerId === 'default') {
    effectiveId = settingsStore.settings?.TRANSLATION_API || 'googlev2'
  }
  
  const blackIcons = ['deepl', 'openai', 'openrouter', 'requesty', 'webai']
  return blackIcons.includes(effectiveId)
}

/**
 * Helper to get effective provider ID for sync icons
 */
const getEffectiveProviderId = (type) => {
  const isSynced = ephemeralSync.value[type]
  if (isSynced) return currentProvider.value
  
  if (type === 'page') {
    return settingsStore.settings?.MODE_PROVIDERS?.[TranslationMode.Page] || settingsStore.settings.TRANSLATION_API
  }
  return settingsStore.settings?.MODE_PROVIDERS?.[TranslationMode.Select_Element] || settingsStore.settings.TRANSLATION_API
}

/**
 * Resolves a provider icon URL safely
 */
const getProviderIcon = (iconPath) => {
  try {
    const fallback = 'icons/providers/google.svg';
    
    if (!iconPath) return ExtensionContextManager.safeGetURL(fallback);
    
    let path = iconPath;
    if (iconPath.startsWith('@/assets/')) {
      path = iconPath.replace('@/assets/', 'icons/')
    } else if (!iconPath.includes('/')) {
      path = `icons/providers/${iconPath}`;
    } else if (!iconPath.startsWith('icons/')) {
      path = `icons/${iconPath}`;
    }
    
    return ExtensionContextManager.safeGetURL(path, fallback);
  } catch (error) {
    if (ExtensionContextManager.isContextError(error)) {
      ExtensionContextManager.handleContextError(error, 'ProviderSelector:getProviderIcon');
    } else {
      logger.error('[getProviderIcon] Failed to resolve icon URL:', error);
    }
    return ExtensionContextManager.GENERIC_FALLBACK_ICON;
  }
}

/**
 * Resolves the icon for sync rows
 */
const getEffectiveIcon = (type) => {
  const isSynced = ephemeralSync.value[type]
  let providerId;

  if (isSynced) {
    // Show UI provider if synced
    providerId = currentProvider.value
  } else {
    // Show default from settings
    if (type === 'page') {
      const pageKey = TranslationMode.Page
      providerId = settingsStore.settings?.MODE_PROVIDERS?.[pageKey] || settingsStore.settings.TRANSLATION_API
    } else {
      const elementKey = TranslationMode.Select_Element
      providerId = settingsStore.settings?.MODE_PROVIDERS?.[elementKey] || settingsStore.settings.TRANSLATION_API
    }
  }

  const provider = getProviderById(providerId)
  return getProviderIcon(provider?.icon || 'providers/google.svg')
}

/**
 * Toggles provider synchronization for specific modes
 */
const toggleSync = (type) => {
  translationStore.ephemeralSync[type] = !translationStore.ephemeralSync[type]
  
  // Also update translationStore.selectedProvider to match current UI selection
  // This ensures UnifiedTranslationService knows WHICH provider to use when synced
  translationStore.selectedProvider = currentProvider.value
  
  // Control activation closes the menu (silent)
  if (isDropdownOpen.value) closeDropdown(false)

  logger.debug(`[ProviderSelector] Toggled sync for ${type}:`, translationStore.ephemeralSync[type])
}

/**
 * Handles the main translation button click (split mode)
 */
const handleTranslate = () => {
  logger.debug('Translate/Stop button clicked!', {
    currentProvider: currentProvider.value,
    loading: props.loading,
    mode: props.mode
  })
  
  if (props.loading) {
    emit('cancel')
  } else {
    emit('translate', { provider: currentProvider.value })
  }
}

/**
 * Toggles the provider selection dropdown
 */
const toggleDropdown = () => {
  if (isProviderSelectionDisabled.value) return;

  // Deactivate select element mode if it's active when user interacts with this control
  if (isSelectModeActive.value) {
    deactivateSelectMode();
  }

  const newState = !isDropdownOpen.value;

  // Sync focusedIndex with current selection when opening (visual menu order)
  if (newState) {
    focusedIndex.value = indexInMenuItems() !== -1 ? indexInMenuItems() : 0;
  }

  logger.debug('Provider selector dropdown toggled!', {
    currentState: isDropdownOpen.value,
    newState: newState,
    direction: isUpward.value ? 'up' : 'down'
  })
  
  isDropdownOpen.value = newState;
  if (newState) {
    nextTick(() => {
      if (!updateDropdownPosition()) {
        closeDropdown()
        return
      }
      // Move real focus into the menu so keyboard interaction is immediate
      moveListFocus()
      scrollToFocused()
    })
  }
}

const updateDropdownPosition = () => {
  const selector = selectorRef.value
  const trigger = triggerBtnRef.value

  if (!selector?.isConnected || !trigger?.isConnected) return false

  const rect = selector.getBoundingClientRect()
  const dimensions = [rect.width, rect.height]

  if (dimensions.some(dimension => !Number.isFinite(dimension) || dimension <= 0)) return false

  const isFloatingWindow = selector.closest('.ti-window');
  const mobileContainer = selector.closest('.ti-m-sheet-content');
  const sidepanelContainer = selector.closest('.ti-sidepanel-container');
  const tabContainer = selector.closest('.tab-content-container');
  const windowBody = selector.closest('.ti-window-body');
  const container = mobileContainer || sidepanelContainer || tabContainer || windowBody;
  const isTeleport = isTeleportEnabled.value;
  const useViewport = isTeleport || !container || isFloatingWindow;
  const containerRect = useViewport
    ? { top: 0, bottom: window.innerHeight }
    : container.getBoundingClientRect();
  const spaceBelow = containerRect.bottom - rect.bottom;
  const spaceAbove = rect.top - containerRect.top;
  const isOptionsPage = window.location.href.includes('options.html');

  if (props.placement !== 'auto') {
    isUpward.value = props.placement === 'up';
  } else if (props.mode === 'mobile') {
    isUpward.value = spaceBelow < 220 && spaceAbove > spaceBelow;
  } else if (isOptionsPage || !props.isGlobal || isFloatingWindow) {
    const flipThreshold = isFloatingWindow ? 180 : 250;
    isUpward.value = spaceBelow < flipThreshold && spaceAbove > spaceBelow;
  } else {
    isUpward.value = spaceBelow < 100 && spaceAbove > spaceBelow;
  }

  const availableHeight = isUpward.value ? spaceAbove - 20 : spaceBelow - 20;
  const maxLimit = isFloatingWindow ? 650 : (props.mode === 'mobile' ? 350 : (props.isGlobal ? 400 : 550));
  dropdownMaxHeight.value = `${Math.max(0, Math.min(maxLimit, availableHeight))}px`;

  if (isTeleport) {
    const styles = {
      position: 'fixed !important',
      zIndex: '2147483647 !important',
      maxHeight: `${dropdownMaxHeight.value} !important`
    };

    if (isUpward.value) {
      styles.bottom = `${window.innerHeight - rect.top + 4}px !important`;
      styles.top = 'auto !important';
    } else {
      styles.top = `${rect.bottom + 4}px !important`;
      styles.bottom = 'auto !important';
    }

    if (props.mode === 'icon-only') {
      styles.insetInlineStart = `${rect.right + 10}px !important`;
      styles.top = `${rect.top}px !important`;
      styles.bottom = 'auto !important';
    } else if (isPopupTextContext.value) {
      // Popup Text view: fixed budget width (user-approved ~245px), clamped
      // to the viewport with 8px gutters; left/right anchored to the trigger
      // edge and clamped again so the bounded width never leaves the viewport.
      const popupWidth = Math.min(POPUP_MENU_WIDTH, window.innerWidth - 16)
      styles.width = `${popupWidth}px !important`;
      styles.minWidth = '0 !important';
      const maxOffset = Math.max(8, window.innerWidth - 16 - popupWidth);
      if (isRTL.value) {
        const desiredRight = window.innerWidth - rect.right;
        styles.right = `${Math.max(8, Math.min(desiredRight, maxOffset))}px !important`;
        styles.left = 'auto !important';
      } else {
        styles.left = `${Math.max(8, Math.min(rect.left, maxOffset))}px !important`;
        styles.right = 'auto !important';
      }
    } else {
      if (props.mode === 'button' || props.mode === 'mobile') {
        styles.width = `${rect.width}px !important`;
        styles.minWidth = '220px !important';
      }

      const expectedWidth = Math.max(rect.width, 220);

      if (isRTL.value) {
        const rightDist = window.innerWidth - rect.right;
        if (rightDist + expectedWidth > window.innerWidth) {
          styles.left = `${rect.left}px !important`;
          styles.right = 'auto !important';
        } else {
          styles.right = `${rightDist}px !important`;
          styles.left = 'auto !important';
        }
      } else if (rect.left + expectedWidth > window.innerWidth) {
        styles.right = `${window.innerWidth - rect.right}px !important`;
        styles.left = 'auto !important';
      } else {
        styles.left = `${rect.left}px !important`;
        styles.right = 'auto !important';
      }
    }

    dropdownStyles.value = styles;
  }

  return true
}

/**
 * Closes the dropdown. `restoreFocus` puts focus back on the trigger (Escape,
 * provider selection). Other closes (outside clicks, scroll, resize, focus
 * leaving the menu) must be silent so they do not steal focus.
 */
const closeDropdown = (restoreFocus = true) => {
  isDropdownOpen.value = false;
  if (!restoreFocus) return;
  // Return focus to trigger button to prevent focus jumping to tab/top of page
  nextTick(() => {
    triggerBtnRef.value?.focus();
  });
}

/**
 * Selects a new provider and emits changes
 */
const selectProvider = async (provider) => {
  logger.debug('Provider selected!', {
    providerId: provider.id,
    providerName: provider.name || 'Unknown',
    mode: props.mode,
    isGlobal: props.isGlobal
  })

  try {
    // Always update the store's active provider so other components (and sync logic) use the latest selection
    translationStore.selectedProvider = provider.id

    if (props.isGlobal) {
      await settingsStore.updateSettingAndPersist('TRANSLATION_API', provider.id)
      logger.debug('Global provider updated successfully:', provider.id)
    } else {
      logger.debug('Local provider selected:', provider.id)
    }
    
    emit('update:modelValue', provider.id)
    emit('provider-change', provider.id)
    closeDropdown(true)

    // Auto-trigger translation in split mode after selecting a provider
    if (props.mode === 'split' && !props.disabled && props.translateOnProviderChange) {
      emit('translate', { provider: provider.id })
    }
  } catch (error) {
    logger.error('Failed to update provider:', error)
    await handleError(error, 'provider-selector-change')
  }
}

/**
 * Handles change for compact select mode
 */
const handleProviderChange = (event) => {
  logger.debug('Provider change event triggered:', event.target.value)
  selectProvider({ id: event.target.value })
}

/**
 * Storage change handler for cross-context updates
 */
const handleStorageChange = (changes, areaName) => {
  if (areaName === 'sync' || areaName === 'local') {
    if (changes.TRANSLATION_API) {
      // Force update the store to reflect storage changes
      settingsStore.updateSettingLocally('TRANSLATION_API', changes.TRANSLATION_API.newValue)
    }
  }
}

// Initialize providers
onMounted(() => {
  // Determine teleport target dynamically
  if (ExtensionContextManager.isContentScript() && selectorRef.value) {
    const rootNode = selectorRef.value.getRootNode();
    if (rootNode instanceof ShadowRoot) {
      // Find a suitable overlay/container that is fixed and has no transform
      // to ensure fixed positioning works correctly inside the shadow DOM.
      const overlay = rootNode.querySelector('.ti-m-sheet-overlay') || 
                      rootNode.querySelector('.ti-window-overlay') ||
                      rootNode.querySelector('.ti-host-container') ||
                      rootNode.querySelector('.ti-shadow-host-inner') ||
                      rootNode.firstElementChild; // Fallback to root element
                      
      if (overlay) {
        teleportTarget.value = overlay;
        isTeleportEnabled.value = true;
      } else {
        isTeleportEnabled.value = false;
      }
    }
  } else {
    // In extension pages (Popup, Options, Sidepanel), teleport to body
    teleportTarget.value = 'body';
    isTeleportEnabled.value = true;
  }

  /**
   * USE CAPTURE PHASE FOR CLICK-OUTSIDE
   * Why? Content script UI often uses @click.stop to prevent events from reaching the host page.
   * By using 'capture: true', we intercept the click before it's stopped by any parent container
   * (like TranslationWindow.vue). This ensures the dropdown closes correctly in Shadow DOM.
   */
  tracker.addEventListener(document, 'click', handleClickOutside, { capture: true })

  // Pointer latch tracking (see handleMenuFocusOut / handleMenuPointerTracking):
  // pointerdown decides whether the interaction begins inside the menu;
  // pointerup/pointercancel anywhere release the latch.
  tracker.addEventListener(document, 'pointerdown', handleMenuPointerTracking, { capture: true })
  tracker.addEventListener(document, 'pointerup', handleMenuPointerTracking, { capture: true })
  tracker.addEventListener(document, 'pointercancel', handleMenuPointerTracking, { capture: true })
  
  // Close dropdown on scroll; reposition on resize when teleported
  if (isTeleportEnabled.value) {
    tracker.addEventListener(window, 'scroll', (event) => {
      if (!isDropdownOpen.value) return;
      
      // Ignore scroll events originating from within the dropdown itself
      const path = event.composedPath();
      const isInternalScroll = path.some(el => 
        el instanceof HTMLElement && 
        (el.classList?.contains('ti-provider-dropdown-menu') || el.classList?.contains('ti-provider-dropdown-list'))
      );
      
      if (isInternalScroll) return;
      
      closeDropdown(false);
    }, { capture: true, passive: true });

    tracker.addEventListener(window, 'resize', () => {
      if (!isDropdownOpen.value || resizeAnimationFrameId !== null) return
      resizeAnimationFrameId = requestAnimationFrame(() => {
        resizeAnimationFrameId = null
        if (isDropdownOpen.value && !updateDropdownPosition()) closeDropdown(false)
      })
    }, { passive: true });
  }
  
  // Add storage listener for cross-context updates using ResourceTracker
  if (typeof browser !== 'undefined' && browser.storage) {
    tracker.addEventListener(browser.storage.onChanged, 'addListener', handleStorageChange)
  }
})

onUnmounted(() => {
  if (resizeAnimationFrameId !== null) cancelAnimationFrame(resizeAnimationFrameId)
  // Event listener cleanup is now handled automatically by useResourceTracker
})
</script>
