<template>
  <!-- Split Button Mode for Popup -->
  <div
    v-if="mode === 'split'"
    class="split-translate-button-container"
  >
    <div class="split-translate-button">
      <button
        type="submit"
        class="translate-main-area"
        :title="t('popup_translate_button_title') || 'ترجمه'"
        :disabled="isTranslating || disabled"
        @click="handleTranslate"
      >
        <img
          :src="currentProviderIcon"
          alt="API Provider"
          class="api-provider-icon"
        >
        <span>{{ t('popup_translate_button_text') || 'ترجمه' }}</span>
      </button>
      <button 
        type="button"
        class="provider-dropdown-area"
        :class="{ active: isDropdownOpen }"
        @click.stop="toggleDropdown"
      >
        <IconButton
          icon="dropdown-arrow.svg"
          alt="Dropdown"
          type="inline"
          class="dropdown-arrow"
        />
      </button>
    </div>
    
    <!-- Provider Dropdown -->
    <div 
      v-show="isDropdownOpen"
      class="provider-dropdown-menu"
      @click.stop
    >
      <div
        v-for="provider in availableProviders"
        :key="provider.id"
        class="dropdown-item"
        :class="{ active: currentProvider === provider.id }"
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
    class="provider-button-container"
  >
    <button
      class="provider-button"
      :class="{ active: isDropdownOpen }"
      @click="toggleDropdown"
    >
      <img
        :src="currentProviderIcon"
        alt="API Provider"
        class="api-provider-icon"
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
      class="provider-dropdown-menu"
      @click.stop
    >
      <div
        v-for="provider in availableProviders"
        :key="provider.id"
        class="dropdown-item"
        :class="{ active: currentProvider === provider.id }"
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
    class="provider-icon-only-container"
  >
    <button
      class="provider-icon-button"
      :class="{ active: isDropdownOpen }"
      :title="currentProviderName"
      @click="toggleDropdown"
    >
      <img
        :src="currentProviderIcon"
        alt="API Provider"
        class="provider-icon-only"
      >
    </button>
    
    <!-- Provider Dropdown -->
    <div 
      v-show="isDropdownOpen"
      class="provider-dropdown-menu"
      @click.stop
    >
      <div
        v-for="provider in availableProviders"
        :key="provider.id"
        class="dropdown-item"
        :class="{ active: currentProvider === provider.id }"
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
    class="provider-compact-container"
  >
    <select
      :value="currentProvider"
      class="provider-select"
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
  // Use paths that match build output structure
  if (!iconPath) return '/assets/icons/providers/google.svg'
  if (iconPath.startsWith('@/assets/')) {
    return iconPath.replace('@/assets/', '/')
  }
  if (iconPath.includes('/')) {
    return `/assets/icons/${iconPath}`
  }
  return `/assets/icons/providers/${iconPath}`
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
  if (!event.target.closest('.split-translate-button-container, .provider-button-container, .provider-icon-only-container')) {
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
.split-translate-button-container {
  position: relative;
  flex-shrink: 0;
  z-index: 100;
}

.split-translate-button {
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

.split-translate-button:hover {
  border-color: var(--language-select-border-color);
}

.split-translate-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.translate-main-area {
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

.translate-main-area:hover {
  background-color: var(--toolbar-link-hover-bg-color);
}

.api-provider-icon {
  width: 14px !important;
  height: 14px !important;
  max-width: 14px !important;
  max-height: 14px !important;
  opacity: var(--icon-opacity);
  transition: opacity 0.2s ease-in-out;
  object-fit: contain;
}

.provider-dropdown-area {
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

.provider-dropdown-area:hover {
  background-color: var(--toolbar-link-hover-bg-color);
}

.provider-dropdown-area.active {
  background-color: var(--language-controls-bg-color);
}

/* Regular Button Styles */
.provider-button-container {
  position: relative;
  z-index: 100;
}

.provider-button {
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

.provider-button:hover {
  background-color: var(--toolbar-link-hover-bg-color);
}

.provider-button.active {
  background-color: var(--language-controls-bg-color);
}

/* Icon Only Mode Styles */
.provider-icon-only-container {
  position: relative;
  z-index: 100;
  display: flex;
  justify-content: flex-end;
}

.provider-icon-only-container .provider-dropdown-menu {
  left: 100%;
  right: auto;
  top: 0;
  margin-left: 4px;
  margin-top: 0;
  width: 200px;
  min-width: 200px;
}

.provider-icon-button {
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

  &.active {
    background-color: var(--color-primary);

    .provider-icon-only {
      filter: invert(1);
    }
  }
}

.provider-icon-only {
  width: 18px;
  height: 18px;
  object-fit: contain;
  opacity: var(--icon-opacity);
  transition: opacity 0.2s ease-in-out;
}

/* Right-aligned dropdown for icon-only mode */
.dropdown-menu-right {
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
.provider-icon-only-container .dropdown-item {
  background-color: var(--color-background, #ffffff);
  color: var(--color-text, #374151);
  border-bottom: 1px solid var(--color-border, #e5e7eb);
}

.provider-icon-only-container .dropdown-item:hover {
  background-color: var(--color-surface-alt, #f3f4f6) !important;
}

.provider-icon-only-container .dropdown-item.active {
  background-color: var(--color-primary, #3b82f6) !important;
  color: white !important;
}

.provider-icon-only-container .dropdown-item.active span {
  color: white !important;
}

/* Compact Select Styles */
.provider-select {
  padding: 6px 8px;
  border: 1px solid var(--header-border-color);
  border-radius: 4px;
  background-color: var(--bg-color);
  color: var(--text-color);
  font-size: 14px;
  cursor: pointer;
}

/* Common Styles */

.translate-main-area:hover .api-provider-icon {
  opacity: var(--icon-hover-opacity);
}

.dropdown-arrow {
  width: 6px !important;
  height: 4px !important;
  opacity: var(--icon-opacity);
  transition: opacity 0.2s ease-in-out, transform 0.2s ease;
  filter: var(--icon-filter);
  pointer-events: none;
}

.dropdown-arrow.rotated {
  transform: rotate(180deg);
}

.provider-dropdown-area.active .dropdown-arrow {
  transform: rotate(180deg);
}

.translate-main-area span {
  color: var(--text-color);
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Provider Dropdown Menu */
.provider-dropdown-menu {
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



.dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  border-bottom: 1px solid var(--header-border-color);
}

.dropdown-item:last-child {
  border-bottom: none;
}

.dropdown-item:hover {
  background-color: var(--toolbar-link-hover-bg-color) !important;
  opacity: 1 !important;
  filter: none !important;
}

.dropdown-item.active {
  background-color: var(--language-controls-bg-color);
  font-weight: 500;
}

.dropdown-item img {
  width: 16px !important;
  height: 16px !important;
  max-width: 16px !important;
  max-height: 16px !important;
  opacity: var(--icon-opacity);
  object-fit: contain;
}

.dropdown-item span {
  color: var(--text-color);
  font-size: 14px;
}

/* Context-specific adjustments for popup vs sidepanel */
.popup-wrapper .split-translate-button {
  height: 32px;
  min-width: 100px;
  align-self: center;
}

.popup-wrapper .translate-main-area {
  padding: 0;
  height: 100%;
  display: flex;
  align-items: center;
  padding-left: 5px;
}

.popup-wrapper .translate-main-area span {
  font-size: 13px;
  font-weight: 500;
}

.popup-wrapper .api-provider-icon {
  width: 12px !important;
  height: 12px !important;
}

.popup-wrapper .provider-dropdown-area {
  width: 18px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sidepanel-wrapper .split-translate-button {
  height: 28px;
  min-width: 100px;
  border-radius: 3px;
  align-self: center;
}

.sidepanel-wrapper .translate-main-area {
  padding: 0;
  height: 100%;
  display: flex;
  align-items: center;
  padding-left: 5px;
}

.sidepanel-wrapper .translate-main-area span {
  font-size: 13px;
  font-weight: 500;
}

.sidepanel-wrapper .api-provider-icon {
  width: 12px !important;
  height: 12px !important;
}

.sidepanel-wrapper .provider-dropdown-area {
  width: 18px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sidepanel-wrapper .split-translate-button-container {
  max-width: 150px;
  align-self: flex-start;
}

.sidepanel-wrapper .split-translate-button {
  background-color: var(--bg-color);
  border: 1px solid var(--primary-color, #007bff);
}

.sidepanel-wrapper .translate-main-area span {
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