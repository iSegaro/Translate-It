<template>
  <!-- Split Button Mode for Popup -->
  <div
    v-if="mode === 'split'"
    class="ti-split-translate-button-container"
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
        >
        <span>{{ t('popup_translate_button_text') || 'ترجمه' }}</span>
      </button>
      <button 
        type="button"
        class="ti-provider-dropdown-area"
        :class="{ 'ti-active': isDropdownOpen }"
        @click.stop="toggleDropdown"
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
      v-show="isDropdownOpen"
      class="ti-provider-dropdown-menu"
      @click.stop
    >
      <div
        v-for="provider in availableProviders"
        :key="provider.id"
        class="ti-dropdown-item"
        :class="{ 'ti-active': currentProvider === provider.id }"
        @click="selectProvider(provider)"
      >
        <img
          :src="getProviderIcon(provider.icon)"
          :alt="provider.name"
        >
        <span>{{ provider.name }}</span>
      </div>
    </div>
  </div>
  
  <!-- Regular Button Mode for Sidepanel -->
  <div
    v-else-if="mode === 'button'"
    class="ti-provider-button-container"
  >
    <button
      class="ti-provider-button"
      :class="{ 'ti-active': isDropdownOpen }"
      @click="toggleDropdown"
    >
      <img
        :src="currentProviderIcon"
        alt="API Provider"
        class="ti-api-provider-icon"
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
      v-show="isDropdownOpen"
      class="ti-provider-dropdown-menu"
      @click.stop
    >
      <div
        v-for="provider in availableProviders"
        :key="provider.id"
        class="ti-dropdown-item"
        :class="{ 'ti-active': currentProvider === provider.id }"
        @click="selectProvider(provider)"
      >
        <img
          :src="getProviderIcon(provider.icon)"
          :alt="provider.name"
        >
        <span>{{ provider.name }}</span>
      </div>
    </div>
  </div>
  
  <!-- Icon Only Mode for Sidepanel Toolbar -->
  <div
    v-else-if="mode === 'icon-only'"
    class="ti-provider-icon-only-container"
  >
    <button
      class="ti-provider-icon-button"
      :class="{ 'ti-active': isDropdownOpen }"
      :title="currentProviderName"
      @click="toggleDropdown"
    >
      <img
        :src="currentProviderIcon"
        alt="API Provider"
        class="ti-provider-icon-only"
      >
    </button>
    
    <!-- Provider Dropdown -->
    <div 
      v-show="isDropdownOpen"
      class="ti-provider-dropdown-menu"
      @click.stop
    >
      <div
        v-for="provider in availableProviders"
        :key="provider.id"
        class="ti-dropdown-item"
        :class="{ 'ti-active': currentProvider === provider.id }"
        @click="selectProvider(provider)"
      >
        <img
          :src="getProviderIcon(provider.icon)"
          :alt="provider.name"
        >
        <span>{{ provider.name }}</span>
      </div>
    </div>
  </div>
  
  <!-- Compact Mode -->
  <div
    v-else
    class="ti-provider-compact-container"
  >
    <select
      :value="currentProvider"
      class="ti-provider-select"
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
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useErrorHandler } from '@/composables/shared/useErrorHandler.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { useSelectElementTranslation } from '@/features/translation/composables/useTranslationModes.js'
import { getProvidersForDropdown } from '@/core/provider-registry.js'
import IconButton from './IconButton.vue'
import browser from 'webextension-polyfill'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { useResourceTracker } from '@/composables/core/useResourceTracker.js'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'ProviderSelector')

// Resource tracker for automatic cleanup
const tracker = useResourceTracker('provider-selector')

// Composables
const { t } = useUnifiedI18n()

// Props
const props = defineProps({
  mode: {
    type: String,
    default: 'split', // split, button, icon-only, compact
    validator: (value) => ['split', 'button', 'icon-only', 'compact'].includes(value)
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

// Emits
const emit = defineEmits(['translate', 'provider-change'])

// Stores
const settingsStore = useSettingsStore()
const { handleError } = useErrorHandler()
const { isSelectModeActive, deactivateSelectMode } = useSelectElementTranslation()

// State
const isDropdownOpen = ref(false)
const isTranslating = ref(false)
const availableProviders = ref([])

// Computed
const currentProvider = computed(() => settingsStore.settings.TRANSLATION_API)

const currentProviderIcon = computed(() => {
  const provider = availableProviders.value.find(p => p.id === currentProvider.value)
  return getProviderIcon(provider?.icon || 'providers/google.svg')
})

const currentProviderName = computed(() => {
  const provider = availableProviders.value.find(p => p.id === currentProvider.value)
  return provider?.name || 'Google Translate'
})

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

const handleTranslate = () => {
  logger.debug('🚀 Translate button clicked!', {
    currentProvider: currentProvider.value?.name || 'Unknown',
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

  logger.debug('🔧 Provider selector dropdown toggled!', {
    currentState: isDropdownOpen.value,
    newState: !isDropdownOpen.value,
    mode: props.mode
  })
  
  isDropdownOpen.value = !isDropdownOpen.value
}

const selectProvider = async (provider) => {
  logger.debug('🔧 Provider selected!', {
    providerId: provider.id,
    providerName: provider.name || 'Unknown',
    mode: props.mode
  })
  try {
    await settingsStore.updateSettingAndPersist('TRANSLATION_API', provider.id)
    logger.debug('✅ Provider updated successfully:', provider.id)
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

const closeDropdown = (event) => {
  if (!event.target.closest('.ti-split-translate-button-container, .ti-provider-button-container, .ti-provider-icon-only-container')) {
    isDropdownOpen.value = false
  }
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
  availableProviders.value = providersFromRegistry.map(provider => ({
    id: provider.id,
    name: provider.name,
    icon: provider.icon
  }))
  
  // Add click listener to close dropdown using ResourceTracker
  tracker.addEventListener(document, 'click', closeDropdown)
  
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

<style scoped>
/* Split Button Styles */
.ti-split-translate-button-container {
  position: relative;
  flex-shrink: 0;
  z-index: 100;
}

.ti-split-translate-button {
  background: none;
  border: 1px solid var(--header-border-color);
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  padding: 0;
  transition: background-color 0.2s ease, border-color 0.2s ease;
  flex-shrink: 0;
  position: relative;
  overflow: hidden;
  height: 32px;
}

.ti-split-translate-button:hover {
  border-color: var(--language-select-border-color);
}

.ti-split-translate-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.ti-translate-main-area {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  flex: 1;
  transition: background-color 0.2s ease;
  height: 100%;
  box-sizing: border-box;
  background: none;
  border: none;
  color: var(--text-color);
}

.ti-translate-main-area:hover {
  background-color: var(--toolbar-link-hover-bg-color);
}

.ti-api-provider-icon {
  width: 14px !important;
  height: 14px !important;
  max-width: 14px !important;
  max-height: 14px !important;
  opacity: var(--icon-opacity);
  transition: opacity 0.2s ease-in-out;
  object-fit: contain;
}

.ti-provider-dropdown-area {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 3px;
  border-left: 1px solid var(--primary-color, #007bff);
  transition: background-color 0.2s ease;
  cursor: pointer;
  width: 20px;
  flex-shrink: 0;
  height: 100%;
  box-sizing: border-box;
  background: none;
}

.ti-provider-dropdown-area:hover {
  background-color: var(--toolbar-link-hover-bg-color);
}

.ti-provider-dropdown-area.ti-active {
  background-color: var(--language-controls-bg-color);
}

/* Regular Button Styles */
.ti-provider-button-container {
  position: relative;
  z-index: 100;
}

.ti-provider-button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-color);
  border: 1px solid var(--header-border-color);
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  font-size: 14px;
  color: var(--text-color);
}

.ti-provider-button:hover {
  background-color: var(--toolbar-link-hover-bg-color);
}

.ti-provider-button.ti-active {
  background-color: var(--language-controls-bg-color);
}

/* Icon Only Mode Styles */
.ti-provider-icon-only-container {
  position: relative;
  z-index: 100;
  display: flex;
  justify-content: flex-end;
}

.ti-provider-icon-only-container .ti-provider-dropdown-menu {
  left: 100%;
  right: auto;
  top: 0;
  margin-left: 4px;
  margin-top: 0;
  width: 200px;
  min-width: 200px;
}

.ti-provider-icon-button {
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  transition: background-color 0.2s ease;
  
  &:hover {
    background-color: var(--color-background);
  }

  &.ti-active {
    background-color: var(--color-primary);

    .ti-provider-icon-only {
      filter: invert(1);
    }
  }
}

.ti-provider-icon-only {
  width: 18px;
  height: 18px;
  object-fit: contain;
  opacity: var(--icon-opacity);
  transition: opacity 0.2s ease-in-out;
}

/* Right-aligned dropdown for icon-only mode */
.ti-dropdown-menu-right {
  right: 0;
  left: auto;
  top: 100%;
  margin-top: 2px;
  background-color: var(--color-background, #ffffff) !important;
  border: 1px solid var(--color-border, #e5e7eb) !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
  z-index: 9999 !important;
}

/* Enhanced dropdown items for icon-only mode */
.ti-provider-icon-only-container .ti-dropdown-item {
  background-color: var(--color-background, #ffffff);
  color: var(--color-text, #374151);
  border-bottom: 1px solid var(--color-border, #e5e7eb);
}

.ti-provider-icon-only-container .ti-dropdown-item:hover {
  background-color: var(--color-surface-alt, #f3f4f6) !important;
}

.ti-provider-icon-only-container .ti-dropdown-item.ti-active {
  background-color: var(--color-primary, #3b82f6) !important;
  color: white !important;
}

.ti-provider-icon-only-container .ti-dropdown-item.ti-active span {
  color: white !important;
}

/* Compact Select Styles */
.ti-provider-select {
  padding: 6px 8px;
  border: 1px solid var(--header-border-color);
  border-radius: 4px;
  background-color: var(--bg-color);
  color: var(--text-color);
  font-size: 14px;
  cursor: pointer;
}

/* Common Styles */

.ti-translate-main-area:hover .ti-api-provider-icon {
  opacity: var(--icon-hover-opacity);
}

.ti-dropdown-arrow {
  width: 6px !important;
  height: 4px !important;
  opacity: var(--icon-opacity);
  transition: opacity 0.2s ease-in-out, transform 0.2s ease;
  filter: var(--icon-filter);
  pointer-events: none;
}

.ti-dropdown-arrow.rotated {
  transform: rotate(180deg);
}

.ti-provider-dropdown-area.ti-active .ti-dropdown-arrow {
  transform: rotate(180deg);
}

.ti-translate-main-area span {
  color: var(--text-color);
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Provider Dropdown Menu */
.ti-provider-dropdown-menu {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 2px;
  background: var(--bg-color, white);
  border: 1px solid var(--header-border-color);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  z-index: 9999;
  min-width: 160px;
  max-height: 300px;
  overflow-y: auto;
  display: block;
  opacity: 1 !important;
  filter: none !important;
}



.ti-dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  border-bottom: 1px solid var(--header-border-color);
}

.ti-dropdown-item:last-child {
  border-bottom: none;
}

.ti-dropdown-item:hover {
  background-color: var(--toolbar-link-hover-bg-color) !important;
  opacity: 1 !important;
  filter: none !important;
}

.ti-dropdown-item.ti-active {
  background-color: var(--language-controls-bg-color);
  font-weight: 500;
}

.ti-dropdown-item img {
  width: 16px !important;
  height: 16px !important;
  max-width: 16px !important;
  max-height: 16px !important;
  opacity: var(--icon-opacity);
  object-fit: contain;
  flex-shrink: 0;
}

.ti-dropdown-item span {
  color: var(--text-color);
  font-size: 14px;
  white-space: nowrap;
}

/* Context-specific adjustments for popup vs sidepanel */
.popup-wrapper .ti-split-translate-button {
  height: 32px;
  min-width: 100px;
  align-self: center;
}

.popup-wrapper .ti-translate-main-area {
  padding: 0;
  height: 100%;
  display: flex;
  align-items: center;
  padding-left: 5px;
}

.popup-wrapper .ti-translate-main-area span {
  font-size: 13px;
  font-weight: 500;
}

.popup-wrapper .ti-api-provider-icon {
  width: 12px !important;
  height: 12px !important;
}

.popup-wrapper .ti-provider-dropdown-area {
  width: 18px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sidepanel-wrapper .ti-split-translate-button {
  height: 28px;
  min-width: 100px;
  border-radius: 3px;
  align-self: center;
}

.sidepanel-wrapper .ti-translate-main-area {
  padding: 0;
  height: 100%;
  display: flex;
  align-items: center;
  padding-left: 5px;
}

.sidepanel-wrapper .ti-translate-main-area span {
  font-size: 13px;
  font-weight: 500;
}

.sidepanel-wrapper .ti-api-provider-icon {
  width: 12px !important;
  height: 12px !important;
}

.sidepanel-wrapper .ti-provider-dropdown-area {
  width: 18px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sidepanel-wrapper .ti-split-translate-button-container {
  max-width: 150px;
  align-self: flex-start;
}

.sidepanel-wrapper .ti-split-translate-button {
  background-color: var(--bg-color);
  border: 1px solid var(--primary-color, #007bff);
}

.sidepanel-wrapper .ti-translate-main-area span {
  color: var(--text-color);
}

/* Toolbar Link Styles */
.toolbar-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--toolbar-link-color);
  text-decoration: none;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  opacity: var(--icon-opacity);
  transition: opacity 0.2s ease-in-out, background-color 0.2s ease-in-out;
  background-color: transparent;
}

.toolbar-link:hover {
  opacity: var(--icon-hover-opacity);
  background-color: var(--toolbar-link-hover-bg-color);
}
</style>