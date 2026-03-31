<template>
  <!-- Split Button Mode for Popup -->
  <div
    v-if="mode === 'split'"
    ref="selectorRef"
    class="ti-split-translate-button-container"
    :class="{ 'ti-dropdown-open': isDropdownOpen }"
    v-bind="$attrs"
  >
    <div class="ti-split-translate-button">
      <button
        type="submit"
        class="ti-translate-main-area"
        :title="t('popup_translate_button_title') || 'ترجمه'"
        :disabled="isTranslating || disabled"
        @click="handleTranslate"
      >
        <img
          :src="currentProviderIcon"
          alt="API Provider"
          class="ti-api-provider-icon"
          :class="{ 'ti-invert-dark': isProviderInverted(currentProvider) }"
        >
        <span>{{ t('popup_translate_button_text') || 'ترجمه' }}</span>
      </button>
      <button 
        type="button"
        class="ti-provider-dropdown-area"
        :class="{ 'ti-active': isDropdownOpen }"
        @click.stop="toggleDropdown"
        @keydown="handleKeydown"
      >
        <IconButton
          icon="dropdown-arrow.svg"
          alt="Dropdown"
          type="inline"
          class="ti-dropdown-arrow"
        />
      </button>
    </div>
    
    <!-- Provider Dropdown -->
    <div 
      v-if="isDropdownOpen"
      class="ti-provider-dropdown-menu"
      :style="{ maxHeight: dropdownMaxHeight + ' !important' }"
      @click.stop
    >
      <div
        ref="dropdownMenuRef"
        class="ti-provider-dropdown-list"
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
    :class="{ 'ti-dropdown-open': isDropdownOpen }"
    v-bind="$attrs"
  >
    <button
      class="ti-provider-button"
      :class="{ 'ti-active': isDropdownOpen }"
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
      />
    </button>
    
    <!-- Provider Dropdown -->
    <div 
      v-if="isDropdownOpen"
      class="ti-provider-dropdown-menu"
      :style="{ maxHeight: dropdownMaxHeight + ' !important' }"
      @click.stop
    >
      <div
        ref="dropdownMenuRef"
        class="ti-provider-dropdown-list"
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
    :class="{ 'ti-dropdown-open': isDropdownOpen }"
    v-bind="$attrs"
  >
    <button
      class="ti-provider-icon-button"
      :class="{ 'ti-active': isDropdownOpen }"
      :title="currentProviderName"
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
    :class="{ 'ti-dropdown-open': isDropdownOpen }"
    v-bind="$attrs"
  >
    <button
      class="ti-provider-mobile-button"
      :class="{ 'ti-active': isDropdownOpen }"
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
    v-bind="$attrs"
  >
    <select
      :value="currentProvider"
      class="ti-provider-select"
      :class="{ 'is-dark': settingsStore.isDarkTheme }"
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
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useTranslationStore } from '@/features/translation/stores/translation.js'
import { useErrorHandler } from '@/composables/shared/useErrorHandler.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { useSelectElementTranslation } from '@/features/translation/composables/useTranslationModes.js'
import { getProvidersForDropdown, getProviderById } from '@/core/provider-registry.js'
import IconButton from './IconButton.vue'
import { Icon } from '@iconify/vue'
import browser from 'webextension-polyfill'
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
  }
})

// Emits
const emit = defineEmits(['translate', 'provider-change', 'update:modelValue'])

// Stores
const settingsStore = useSettingsStore()
const translationStore = useTranslationStore()
const { handleError } = useErrorHandler()
const { isSelectModeActive, deactivateSelectMode } = useSelectElementTranslation()

// State
const selectorRef = ref(null)
const dropdownMenuRef = ref(null)
const isDropdownOpen = ref(false)
const isUpward = ref(false)
const isTranslating = ref(false)
const focusedIndex = ref(-1)
const dropdownMaxHeight = ref('400px')

import { nextTick } from 'vue'

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
    if (key === 'Enter' || key === ' ') {
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
      isDropdownOpen.value = false
      break
  }
}

const scrollToFocused = () => {
  nextTick(() => {
    if (dropdownMenuRef.value) {
      const focusedEl = dropdownMenuRef.value.children[focusedIndex.value]
      if (focusedEl) {
        focusedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    }
  })
}

// Handle click outside to close dropdown (Shadow DOM compatible)
const handleClickOutside = (event) => {
  if (!isDropdownOpen.value || !selectorRef.value) return

  // Use composedPath to support Shadow DOM and handle retargeting
  const path = event.composedPath()
  
  // If the component container is NOT in the event path, the click was outside
  if (!path.includes(selectorRef.value)) {
    isDropdownOpen.value = false
  }
}

const availableProviders = ref([])

// Ephemeral Sync State from store
const ephemeralSync = computed(() => translationStore.ephemeralSync)

// Computed
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

// Helper to determine if a provider icon should be inverted in dark mode
const isProviderInverted = (providerId) => {
  let effectiveId = providerId
  
  // If it's 'default', resolve to the actual global provider ID
  if (providerId === 'default') {
    effectiveId = settingsStore.settings?.TRANSLATION_API || 'googlev2'
  }
  
  const blackIcons = ['deepl', 'openai', 'openrouter']
  return blackIcons.includes(effectiveId)
}

// Helper to get effective provider ID for sync icons
const getEffectiveProviderId = (type) => {
  const isSynced = ephemeralSync.value[type]
  if (isSynced) return currentProvider.value
  
  if (type === 'page') {
    return settingsStore.settings?.MODE_PROVIDERS?.[TranslationMode.Page] || settingsStore.settings.TRANSLATION_API
  }
  return settingsStore.settings?.MODE_PROVIDERS?.[TranslationMode.Select_Element] || settingsStore.settings.TRANSLATION_API
}

// Methods
const getProviderIcon = (iconPath) => {
  // Use runtime.getURL for extension icons
  if (!browser || !browser.runtime || !browser.runtime.getURL) return '/icons/providers/google.svg'

  if (!iconPath) return browser.runtime.getURL('icons/providers/google.svg')
  if (iconPath.startsWith('@/assets/')) {
    const cleanPath = iconPath.replace('@/assets/', 'icons/')
    return browser.runtime.getURL(cleanPath)
  }
  if (iconPath.includes('/')) {
    return browser.runtime.getURL(`icons/${iconPath}`)
  }
  return browser.runtime.getURL(`icons/providers/${iconPath}`)
}

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

const toggleSync = (type) => {
  translationStore.ephemeralSync[type] = !translationStore.ephemeralSync[type]
  
  // Also update translationStore.selectedProvider to match current UI selection
  // This ensures UnifiedTranslationService knows WHICH provider to use when synced
  translationStore.selectedProvider = currentProvider.value
  
  logger.debug(`[ProviderSelector] Toggled sync for ${type}:`, translationStore.ephemeralSync[type])
}

const handleTranslate = () => {
  logger.debug('🗳️ Translate button clicked!', {
    currentProvider: currentProvider.value,
    isTranslating: isTranslating.value,
    mode: props.mode
  })
  
  if (isTranslating.value) {
    logger.debug('⏳ Translation already in progress, ignoring click')
    return
  }
  
  isTranslating.value = true
  emit('translate', { provider: currentProvider.value })
  
  // Reset after a delay using ResourceTracker (actual implementation should listen for translation completion)
  tracker.trackTimeout(() => {
    isTranslating.value = false
  }, 1000)
}

const toggleDropdown = () => {
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
        
        // Find the nearest scrollable container or sheet content that might clip us
        const container = selectorRef.value.closest('.ti-m-sheet-content, .ti-window-body');
        const containerRect = container ? container.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
        
        const spaceBelow = containerRect.bottom - rect.bottom;
        const spaceAbove = rect.top - containerRect.top;
        
        // If space below is less than 250px and there's more space above, open upwards
        isUpward.value = spaceBelow < 250 && spaceAbove > spaceBelow;

        const availableHeight = isUpward.value 
          ? spaceAbove - 16 // Space above within container
          : spaceBelow - 16; // Space below within container
        
        // Detect if we are in an Extension Popup or Sidepanel
        const isPopupOrSidepanel = props.isGlobal || window.innerWidth < 600;
        
        // Use a smarter limit:
        // In Popup: max 400px
        // In Shadow DOM: max 600px (ideal for standard desktop viewports)
        // BUT always constrained by the actual available space
        const maxLimit = isPopupOrSidepanel ? 400 : 600;
        
        dropdownMaxHeight.value = `${Math.min(maxLimit, Math.max(150, availableHeight))}px`;
      }
      scrollToFocused();
    });
  }

  logger.debug('🔧 Provider selector dropdown toggled!', {
    currentState: isDropdownOpen.value,
    newState: newState,
    direction: isUpward.value ? 'up' : 'down'
  })
  
  isDropdownOpen.value = newState;
}

const selectProvider = async (provider) => {
  logger.debug('🔧 Provider selected!', {
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
      logger.debug('✅ Global provider updated successfully:', provider.id)
    } else {
      logger.debug('✅ Local provider selected:', provider.id)
    }
    
    emit('update:modelValue', provider.id)
    emit('provider-change', provider.id)
    isDropdownOpen.value = false
  } catch (error) {
    logger.error('❌ Failed to update provider:', error)
    await handleError(error, 'provider-selector-change')
  }
}

const handleProviderChange = (event) => {
  logger.debug('🔧 Provider change event triggered:', event.target.value)
  selectProvider({ id: event.target.value })
}

// Storage change handler for cross-context updates
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
  // Use provider registry for consistent provider information
  const providersFromRegistry = getProvidersForDropdown()
  const mappedProviders = providersFromRegistry.map(provider => ({
    id: provider.id,
    name: provider.name,
    icon: provider.icon
  }))

  if (props.allowDefault) {
    const defaultProviderId = settingsStore.settings?.TRANSLATION_API || 'googlev2';
    const defaultProvider = getProviderById(defaultProviderId);
    
    availableProviders.value = [
      { 
        id: 'default', 
        name: t('provider_default') || 'Default', 
        icon: defaultProvider?.icon || 'providers/google.svg' 
      },
      ...mappedProviders
    ]
  } else {
    availableProviders.value = mappedProviders
  }
  
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
  // No manual cleanup needed!
})
</script>
