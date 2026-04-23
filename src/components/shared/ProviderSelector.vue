<template>
  <!-- Split Button Mode for Popup -->
  <div
    v-if="mode === 'split'"
    ref="selectorRef"
    class="ti-split-translate-button-container"
    :class="{ 'ti-dropdown-open': isDropdownOpen, 'is-disabled': disabled }"
    v-bind="$attrs"
  >
    <div
      class="ti-split-translate-button"
      :class="{ 'ti-is-loading': loading }"
    >
      <button
        type="submit"
        class="ti-translate-main-area"
        :title="loading ? (t('popup_stop_button_title') || 'توقف') : (t('popup_translate_button_title') || 'ترجمه')"
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
        <span>{{ t('popup_translate_button_text') || 'ترجمه' }}</span>
      </button>
      <button 
        ref="triggerBtnRef"
        type="button"
        class="ti-provider-dropdown-area"
        :class="{ 'ti-active': isDropdownOpen }"
        :disabled="disabled"
        @click.stop="toggleDropdown"
        @keydown="handleKeydown"
      >
        <IconButton
          icon="dropdown-arrow.svg"
          alt="Dropdown"
          type="inline"
          class="ti-dropdown-arrow"
          :disabled="disabled"
        />
      </button>
    </div>
    
    <!-- Provider Dropdown -->
    <div 
      v-if="isDropdownOpen"
      class="ti-provider-dropdown-menu"
      :class="{ 'ti-open-upward': isUpward }"
      :style="{ maxHeight: dropdownMaxHeight + ' !important' }"
      @click.stop
    >
      <div
        ref="dropdownMenuRef"
        class="ti-provider-dropdown-list"
        @mouseleave="focusedIndex = -1"
      >
        <div
          v-for="(provider, index) in availableProviders"
          :key="provider.id"
          class="ti-dropdown-item"
          :class="{ 
            'ti-active': currentProvider === provider.id,
            'is-focused': focusedIndex === index 
          }"
          @click="selectProvider(provider)"
          @mouseenter="focusedIndex = index"
        >
          <img
            :src="getProviderIcon(provider.icon)"
            :alt="provider.name"
            :class="{ 'ti-invert-dark': isProviderInverted(provider.id) }"
          >
          <span>{{ provider.name }}</span>
        </div>
      </div>

      <!-- Ephemeral Sync Footer -->
      <div
        v-if="showSync"
        class="ti-provider-dropdown-footer"
      >
        <button 
          class="ti-sync-row" 
          :class="{ 'is-active': ephemeralSync.page }"
          @click.stop="toggleSync('page')"
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
          :class="{ 'is-active': ephemeralSync.element }"
          @click.stop="toggleSync('element')"
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
      </div>
    </div>
  </div>
  
  <!-- Regular Button Mode for Sidepanel -->
  <div
    v-else-if="mode === 'button'"
    ref="selectorRef"
    class="ti-provider-button-container"
    :class="{ 'ti-dropdown-open': isDropdownOpen, 'is-disabled': disabled }"
    v-bind="$attrs"
  >
    <button
      ref="triggerBtnRef"
      class="ti-provider-button"
      :class="{ 'ti-active': isDropdownOpen }"
      :disabled="disabled"
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
        :disabled="disabled"
      />
    </button>
    
    <!-- Provider Dropdown -->
    <div 
      v-if="isDropdownOpen"
      class="ti-provider-dropdown-menu"
      :class="{ 'ti-open-upward': isUpward }"
      :style="{ maxHeight: dropdownMaxHeight + ' !important' }"
      @click.stop
    >
      <div
        ref="dropdownMenuRef"
        class="ti-provider-dropdown-list"
        @mouseleave="focusedIndex = -1"
      >
        <div
          v-for="(provider, index) in availableProviders"
          :key="provider.id"
          class="ti-dropdown-item"
          :class="{ 
            'ti-active': currentProvider === provider.id,
            'is-focused': focusedIndex === index 
          }"
          @click="selectProvider(provider)"
          @mouseenter="focusedIndex = index"
        >
          <img
            :src="getProviderIcon(provider.icon)"
            :alt="provider.name"
            :class="{ 'ti-invert-dark': isProviderInverted(provider.id) }"
          >
          <span>{{ provider.name }}</span>
        </div>
      </div>

      <!-- Ephemeral Sync Footer -->
      <div
        v-if="showSync"
        class="ti-provider-dropdown-footer"
      >
        <button 
          class="ti-sync-row" 
          :class="{ 'is-active': ephemeralSync.page }"
          @click.stop="toggleSync('page')"
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
          :class="{ 'is-active': ephemeralSync.element }"
          @click.stop="toggleSync('element')"
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
      </div>
    </div>
  </div>
  
  <!-- Icon Only Mode for Sidepanel Toolbar -->
  <div
    v-else-if="mode === 'icon-only'"
    ref="selectorRef"
    class="ti-provider-icon-only-container"
    :class="{ 'ti-dropdown-open': isDropdownOpen, 'is-disabled': disabled }"
    v-bind="$attrs"
  >
    <button
      ref="triggerBtnRef"
      class="ti-provider-icon-button"
      :class="{ 'ti-active': isDropdownOpen }"
      :title="currentProviderName"
      :disabled="disabled"
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
    
    <!-- Provider Dropdown -->
    <div 
      v-if="isDropdownOpen"
      class="ti-provider-dropdown-menu"
      :class="{ 'ti-open-upward': isUpward }"
      :style="{ maxHeight: dropdownMaxHeight + ' !important' }"
      @click.stop
    >
      <div
        ref="dropdownMenuRef"
        class="ti-provider-dropdown-list"
        @mouseleave="focusedIndex = -1"
      >
        <div
          v-for="(provider, index) in availableProviders"
          :key="provider.id"
          class="ti-dropdown-item"
          :class="{ 
            'ti-active': currentProvider === provider.id,
            'is-focused': focusedIndex === index 
          }"
          @click="selectProvider(provider)"
          @mouseenter="focusedIndex = index"
        >
          <img
            :src="getProviderIcon(provider.icon)"
            :alt="provider.name"
            :class="{ 'ti-invert-dark': isProviderInverted(provider.id) }"
          >
          <span>{{ provider.name }}</span>
        </div>
      </div>

      <!-- Ephemeral Sync Footer -->
      <div
        v-if="showSync"
        class="ti-provider-dropdown-footer"
      >
        <button 
          class="ti-sync-row" 
          :class="{ 'is-active': ephemeralSync.page }"
          @click.stop="toggleSync('page')"
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
          :class="{ 'is-active': ephemeralSync.element }"
          @click.stop="toggleSync('element')"
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
      </div>
    </div>
  </div>

  <!-- Mobile Mode for Manual Input / Bottom Sheets -->
  <div
    v-else-if="mode === 'mobile'"
    ref="selectorRef"
    class="ti-provider-mobile-container"
    :class="{ 'ti-dropdown-open': isDropdownOpen, 'is-disabled': disabled }"
    v-bind="$attrs"
  >
    <button
      ref="triggerBtnRef"
      class="ti-provider-mobile-button"
      :class="{ 'ti-active': isDropdownOpen }"
      :disabled="disabled"
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
        :disabled="disabled"
      />
    </button>
    
    <!-- Provider Dropdown -->
    <div 
      v-if="isDropdownOpen"
      class="ti-provider-dropdown-menu"
      :class="{ 'ti-open-upward': isUpward }"
      :style="{ maxHeight: dropdownMaxHeight + ' !important' }"
      @click.stop
    >
      <div
        ref="dropdownMenuRef"
        class="ti-provider-dropdown-list"
        @mouseleave="focusedIndex = -1"
      >
        <div
          v-for="(provider, index) in availableProviders"
          :key="provider.id"
          class="ti-dropdown-item"
          :class="{ 
            'ti-active': currentProvider === provider.id,
            'is-focused': focusedIndex === index 
          }"
          @click="selectProvider(provider)"
          @mouseenter="focusedIndex = index"
        >
          <img
            :src="getProviderIcon(provider.icon)"
            :alt="provider.name"
            :class="{ 'ti-invert-dark': isProviderInverted(provider.id) }"
          >
          <span>{{ provider.name }}</span>
        </div>
      </div>
    </div>
  </div>
  
  <!-- Compact Mode -->
  <div
    v-else
    class="ti-provider-compact-container"
    :class="{ 'is-disabled': disabled }"
    v-bind="$attrs"
  >
    <select
      :value="currentProvider"
      class="ti-provider-select"
      :class="{ 'is-dark': settingsStore.isDarkTheme }"
      :disabled="disabled"
      @change="handleProviderChange"
    >
      <option
        v-for="provider in availableProviders"
        :key="provider.id"
        :value="provider.id"
      >
        {{ provider.name }}
      </option>
    </select>
  </div>
</template>

<script setup>
import './ProviderSelector.scss'
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useTranslationStore } from '@/features/translation/stores/translation.js'
import { useErrorHandler } from '@/composables/shared/useErrorHandler.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { useSelectElementTranslation } from '@/features/translation/composables/useTranslationModes.js'
import { getProvidersForDropdown, getProviderById } from '@/core/provider-registry.js'
import IconButton from './IconButton.vue'
import { Icon } from '@iconify/vue'
import browser from 'webextension-polyfill'
import ExtensionContextManager from '@/core/extensionContext.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { useResourceTracker } from '@/composables/core/useResourceTracker.js'

import { TranslationMode } from '@/shared/config/config.js'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'ProviderSelector')

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
  loading: {
    type: Boolean,
    default: false
  }
})

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
const isDropdownOpen = ref(false)
const isUpward = ref(false)
const focusedIndex = ref(-1)
const dropdownMaxHeight = ref('400px')

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
        focusedIndex.value = currentIndex !== -1 ? currentIndex : 0
      }
      return
    }
    if (key === ' ') {
      event.preventDefault()
      toggleDropdown()
      focusedIndex.value = currentIndex !== -1 ? currentIndex : 0
      return
    }
    return
  }

  // If dropdown is open, handle navigation within the list
  switch (key) {
    case 'ArrowDown':
      event.preventDefault()
      focusedIndex.value = (focusedIndex.value + 1) % items.length
      scrollToFocused()
      break
    case 'ArrowUp':
      event.preventDefault()
      focusedIndex.value = (focusedIndex.value - 1 + items.length) % items.length
      scrollToFocused()
      break
    case 'Enter':
    case ' ':
      event.preventDefault()
      if (focusedIndex.value >= 0 && focusedIndex.value < items.length) {
        selectProvider(items[focusedIndex.value])
      }
      break
    case 'Escape':
    case 'Tab':
      closeDropdown()
      break
  }
}

const scrollToFocused = () => {
  nextTick(() => {
    if (dropdownMenuRef.value) {
      const container = dropdownMenuRef.value
      const items = container.children
      const focusedEl = items[focusedIndex.value]
      
      if (focusedEl) {
        const containerTop = container.scrollTop
        const containerBottom = containerTop + container.clientHeight
        const elementTop = focusedEl.offsetTop
        const elementBottom = elementTop + focusedEl.offsetHeight

        if (elementTop < containerTop) {
          // Scroll up to show element at top
          container.scrollTo({ top: elementTop, behavior: 'smooth' })
        } else if (elementBottom > containerBottom) {
          // Scroll down to show element at bottom
          container.scrollTo({ top: elementBottom - container.clientHeight, behavior: 'smooth' })
        }
      }
    }
  })
}

/**
 * Handle click outside to close dropdown (Shadow DOM compatible)
 */
const handleClickOutside = (event) => {
  if (!isDropdownOpen.value || !selectorRef.value) return

  // Use composedPath to support Shadow DOM and handle retargeting
  const path = event.composedPath()
  
  // If the component container is NOT in the event path, the click was outside
  if (!path.includes(selectorRef.value)) {
    closeDropdown()
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
  
  const mappedProviders = providersFromRegistry.map(provider => ({
    id: provider.id,
    name: provider.name,
    icon: provider.icon
  }));

  if (props.allowDefault) {
    const defaultProviderId = settingsStore.settings?.TRANSLATION_API || 'googlev2';
    const defaultProvider = getProviderById(defaultProviderId);
    
    return [
      { 
        id: 'default', 
        name: t('provider_default') || 'Default', 
        icon: defaultProvider?.icon || 'providers/google.svg' 
      },
      ...mappedProviders
    ];
  }
  
  return mappedProviders;
});

// Ephemeral Sync State from store
const ephemeralSync = computed(() => translationStore.ephemeralSync)

/**
 * Currently selected provider ID
 */
const currentProvider = computed(() => {
  if (props.modelValue) return props.modelValue
  return settingsStore.settings.TRANSLATION_API
})

const currentProviderIcon = computed(() => {
  const provider = availableProviders.value.find(p => p.id === currentProvider.value)
  return getProviderIcon(provider?.icon || 'providers/google.svg')
})

const currentProviderName = computed(() => {
  const provider = availableProviders.value.find(p => p.id === currentProvider.value)
  return provider?.name || 'Google Translate'
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
  
  const blackIcons = ['deepl', 'openai', 'openrouter', 'webai']
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
  if (props.disabled) return;

  // Deactivate select element mode if it's active when user interacts with this control
  if (isSelectModeActive.value) {
    deactivateSelectMode();
  }

  const newState = !isDropdownOpen.value;

  // Sync focusedIndex with current selection when opening
  if (newState) {
    const items = availableProviders.value;
    const currentIndex = items.findIndex(p => p.id === currentProvider.value);
    focusedIndex.value = currentIndex !== -1 ? currentIndex : 0;
    
    // Calculate dynamic max-height and direction based on available space
    nextTick(() => {
      if (selectorRef.value) {
        const rect = selectorRef.value.getBoundingClientRect();
        const isFloatingWindow = selectorRef.value.closest('.ti-window');
        
        // Mobile-specific sheet container detection
        const mobileContainer = selectorRef.value.closest('.ti-m-sheet-content');
        const sidepanelContainer = selectorRef.value.closest('.ti-sidepanel-container');
        const container = mobileContainer || sidepanelContainer || selectorRef.value.closest('.ti-window-body');
        
        // For floating windows or when outside a specific container, use viewport
        const useViewport = !container || isFloatingWindow;
        const containerRect = useViewport 
          ? { top: 0, bottom: window.innerHeight } 
          : container.getBoundingClientRect();
        
        const spaceBelow = containerRect.bottom - rect.bottom;
        const spaceAbove = rect.top - containerRect.top;
        
        const isOptionsPage = window.location.href.includes('options.html');

        if (props.mode === 'mobile') {
          // On mobile, downward is almost always preferred to avoid sheet header clipping
          // Only go upward if space below is less than 220px and space above is significant
          isUpward.value = spaceBelow < 220 && spaceAbove > spaceBelow;
        } else if (isOptionsPage || !props.isGlobal || isFloatingWindow) {
          // For floating windows, prioritize downward unless space is very tight
          const flipThreshold = isFloatingWindow ? 180 : 250;
          isUpward.value = spaceBelow < flipThreshold && spaceAbove > spaceBelow;
        } else {
          isUpward.value = spaceBelow < 100 && spaceAbove > spaceBelow;
        }

        const availableHeight = isUpward.value 
          ? spaceAbove - 20
          : spaceBelow - 20;
        
        // Large limit for desktop floating windows, smaller for mobile
        const maxLimit = isFloatingWindow ? 650 : (props.mode === 'mobile' ? 350 : (props.isGlobal ? 400 : 550));
        
        // Final height calculation
        dropdownMaxHeight.value = `${Math.min(maxLimit, Math.max(250, availableHeight))}px`;
      }
      scrollToFocused();
    });
  }

  logger.debug('Provider selector dropdown toggled!', {
    currentState: isDropdownOpen.value,
    newState: newState,
    direction: isUpward.value ? 'up' : 'down'
  })
  
  isDropdownOpen.value = newState;
}

/**
 * Closes the dropdown and restores focus to the trigger button
 */
const closeDropdown = () => {
  isDropdownOpen.value = false;
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
    closeDropdown()

    // Auto-trigger translation in split mode after selecting a provider
    if (props.mode === 'split' && !props.disabled) {
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
  /**
   * USE CAPTURE PHASE FOR CLICK-OUTSIDE
   * Why? Content script UI often uses @click.stop to prevent events from reaching the host page.
   * By using 'capture: true', we intercept the click before it's stopped by any parent container
   * (like TranslationWindow.vue). This ensures the dropdown closes correctly in Shadow DOM.
   */
  tracker.addEventListener(document, 'click', handleClickOutside, { capture: true })
  
  // Add storage listener for cross-context updates using ResourceTracker
  if (typeof browser !== 'undefined' && browser.storage) {
    tracker.addEventListener(browser.storage.onChanged, 'addListener', handleStorageChange)
  }
})

onUnmounted(() => {
  // Event listener cleanup is now handled automatically by useResourceTracker
})
</script>
