<template>
  <!-- Split Button Mode for Popup -->
  <div v-if="mode === 'split'" class="split-translate-button-container">
    <button
      type="submit"
      @click="handleTranslate"
      class="split-translate-button"
      :title="$i18n('popup_translate_button_title') || 'ترجمه'"
      :disabled="isTranslating"
    >
      <div class="translate-main-area">
        <img
          :src="currentProviderIcon"
          alt="API Provider"
          class="api-provider-icon"
        />
        <span>{{ $i18n('popup_translate_button_text') || 'ترجمه' }}</span>
      </div>
      <div 
        @click.stop="toggleDropdown"
        class="provider-dropdown-area"
        :class="{ active: isDropdownOpen }"
      >
        <IconButton
          icon="dropdown-arrow.svg"
          alt="Dropdown"
          type="inline"
          class="dropdown-arrow"
        />
      </div>
    </button>
    
    <!-- Provider Dropdown -->
    <div 
      v-if="isDropdownOpen"
      class="dropdown-menu"
      @click.stop
    >
      <div
        v-for="provider in availableProviders"
        :key="provider.id"
        @click="selectProvider(provider)"
        class="dropdown-item"
        :class="{ active: currentProvider === provider.id }"
      >
        <img :src="getProviderIcon(provider.icon)" :alt="provider.name" />
        <span>{{ provider.name }}</span>
      </div>
    </div>
  </div>
  
  <!-- Regular Button Mode for Sidepanel -->
  <div v-else-if="mode === 'button'" class="provider-button-container">
    <button
      @click="toggleDropdown"
      class="provider-button"
      :class="{ active: isDropdownOpen }"
    >
      <img
        :src="currentProviderIcon"
        alt="API Provider"
        class="api-provider-icon"
      />
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
      class="dropdown-menu"
      @click.stop
    >
      <div
        v-for="provider in availableProviders"
        :key="provider.id"
        @click="selectProvider(provider)"
        class="dropdown-item"
        :class="{ active: currentProvider === provider.id }"
      >
        <img :src="getProviderIcon(provider.icon)" :alt="provider.name" />
        <span>{{ provider.name }}</span>
      </div>
    </div>
  </div>
  
  <!-- Compact Mode -->
  <div v-else class="provider-compact-container">
    <select
      :value="currentProvider"
      @change="handleProviderChange"
      class="provider-select"
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
import { useSettingsStore } from '@/store/core/settings'
import { getProvidersForDropdown } from '@/core/provider-registry.js'
import IconButton from './IconButton.vue'

// Props
const props = defineProps({
  mode: {
    type: String,
    default: 'split', // split, button, compact
    validator: (value) => ['split', 'button', 'compact'].includes(value)
  }
})

// Emits
const emit = defineEmits(['translate', 'provider-change'])

// Stores
const settingsStore = useSettingsStore()

// State
const isDropdownOpen = ref(false)
const isTranslating = ref(false)
const availableProviders = ref([])

// Computed
const currentProvider = computed(() => settingsStore.settings.TRANSLATION_API)

const currentProviderIcon = computed(() => {
  const provider = availableProviders.value.find(p => p.id === currentProvider.value)
  return getProviderIcon(provider?.icon || 'api-providers/google.svg')
})

const currentProviderName = computed(() => {
  const provider = availableProviders.value.find(p => p.id === currentProvider.value)
  return provider?.name || 'Google Translate'
})

// Methods
const getProviderIcon = (iconPath) => {
  // Use paths that match build output structure
  if (!iconPath) return '/icons/api-providers/google.svg'
  if (iconPath.startsWith('@/assets/')) {
    return iconPath.replace('@/assets/', '/')
  }
  return `/icons/${iconPath}`
}

const handleTranslate = () => {
  if (isTranslating.value) return
  
  isTranslating.value = true
  emit('translate', { provider: currentProvider.value })
  
  // Reset after a delay (actual implementation should listen for translation completion)
  setTimeout(() => {
    isTranslating.value = false
  }, 1000)
}

const toggleDropdown = () => {
  console.log('[ProviderSelector] Toggle dropdown clicked, current state:', isDropdownOpen.value)
  isDropdownOpen.value = !isDropdownOpen.value
  console.log('[ProviderSelector] New dropdown state:', isDropdownOpen.value)
  console.log('[ProviderSelector] Available providers:', availableProviders.value.length)
}

const selectProvider = async (provider) => {
  try {
    await settingsStore.updateSettingAndPersist('TRANSLATION_API', provider.id)
    emit('provider-change', provider.id)
    isDropdownOpen.value = false
  } catch (error) {
    console.error('Error changing provider:', error)
  }
}

const handleProviderChange = (event) => {
  selectProvider({ id: event.target.value })
}

const closeDropdown = (event) => {
  if (!event.target.closest('.split-translate-button-container, .provider-button-container')) {
    isDropdownOpen.value = false
  }
}

// Initialize providers
onMounted(() => {
  // Use provider registry for consistent provider information
  const providersFromRegistry = getProvidersForDropdown()
  availableProviders.value = providersFromRegistry.map(provider => ({
    id: provider.value,
    name: provider.label,
    icon: `api-providers/${provider.icon}`
  }))
  
  // Add click listener to close dropdown
  document.addEventListener('click', closeDropdown)
})

onUnmounted(() => {
  document.removeEventListener('click', closeDropdown)
})
</script>

<style scoped>
/* Split Button Styles */
.split-translate-button-container {
  position: relative;
  flex-shrink: 0;
  z-index: 100; /* Ensure dropdown is above other elements */
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
  gap: 3px;
  padding: 6px 8px;
  flex: 1;
  transition: background-color 0.2s ease;
}

.translate-main-area:hover {
  background-color: var(--toolbar-link-hover-bg-color);
}

.api-provider-icon {
  width: 16px !important;
  height: 16px !important;
  max-width: 16px !important;
  max-height: 16px !important;
  opacity: var(--icon-opacity);
  transition: opacity 0.2s ease-in-out;
  object-fit: contain;
}

.provider-dropdown-area {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px 2px;
  border-left: 1px solid var(--header-border-color);
  transition: background-color 0.2s ease;
  cursor: pointer;
  min-width: 18px;
  width: 18px;
  flex-shrink: 0;
  align-self: stretch;
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
}

/* Dropdown Menu */
.dropdown-menu {
  position: absolute;
  top: 100%;
  left: 0;
  background: var(--bg-color);
  border: 1px solid var(--header-border-color);
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  z-index: 1001;
  min-width: 160px;
  margin-top: 2px;
  max-height: 300px;
  overflow-y: auto;
  display: block !important; /* Force visibility for debugging */
  visibility: visible !important;
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
  background-color: var(--toolbar-link-hover-bg-color);
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
</style>