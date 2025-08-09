<template>
  <div
    id="apiProviderDropdown"
    ref="dropdownMenu"
    class="dropdown-menu"
  >
    <div
      ref="dropdownContent"
      class="dropdown-content"
    >
      <template v-if="isLoading">
        <div class="loading-message">
          Loading providers...
        </div>
      </template>
      <template v-else-if="!hasProviders">
        <div class="empty-message">
          No providers available
        </div>
      </template>
      <template v-else>
        <ApiProviderItem
          v-for="item in providerItems"
          :key="item.id"
          :item="item"
          @select="handleProviderSelect"
        />
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
import { useApiProvider } from '@/composables/useApiProvider.js'
import { useUI } from '@/composables/useUI.js'
import { useErrorHandler } from '@/composables/useErrorHandler.js'
import ApiProviderItem from './ApiProviderItem.vue'

const { handleError } = useErrorHandler()

// Props
const props = defineProps({
  isVisible: {
    type: Boolean,
    default: false
  }
})

// Emits
const emit = defineEmits(['close', 'providerSelected', 'update:isVisible'])

// Composables
const { 
  availableProviders,
  currentProvider,
  selectProvider,
  createProviderItems,
  getProviderIconUrl,
  closeDropdown: closeApiDropdownComposable // Use the composable's close method
} = useApiProvider()

const { showVisualFeedback } = useUI()

// Template refs
const dropdownMenu = ref(null)
const dropdownContent = ref(null)

// Local state
const providerItems = ref([])
const isLoading = ref(false)

// Computed
const hasProviders = computed(() => providerItems.value.length > 0)

// Handle provider selection
const handleProviderSelect = async (providerId) => {
  if (!providerId) {
    return
  }
  
  // If same provider is selected, just close the dropdown
  if (providerId === currentProvider.value) {
    emit('close')
    emit('update:isVisible', false)
    return
  }

  try {
    isLoading.value = true
    
    const success = await selectProvider(providerId)
    
    if (success) {
      emit('providerSelected', providerId)
      emit('close')
      emit('update:isVisible', false)
      
      // Visual feedback - assuming the button is the target
      const apiButton = document.getElementById('apiProviderBtn')
      if (apiButton) {
        showVisualFeedback(apiButton, 'success', 300)
      }
      
      console.log(`[SidepanelApiDropdown] Provider selected: ${providerId}`)
    }
  } catch (error) {
    await handleError(error, 'sidepanel-api-dropdown-select-provider')
    
    const apiButton = document.getElementById('apiProviderBtn')
    if (apiButton) {
      showVisualFeedback(apiButton, 'error')
    }
  } finally {
    isLoading.value = false
  }
}

// Render provider items
const renderProviderItems = async () => {
  if (!dropdownContent.value) {
    console.log('[SidepanelApiDropdown] dropdownContent not available')
    return
  }

  console.log('[SidepanelApiDropdown] Rendering provider items...')
  console.log('[SidepanelApiDropdown] isLoading:', isLoading.value)
  console.log('[SidepanelApiDropdown] hasProviders:', hasProviders.value)  
  console.log('[SidepanelApiDropdown] providerItems count:', providerItems.value.length)

  if (isLoading.value) {
    // Handled by template
    return
  }

  if (!hasProviders.value) {
    // Handled by template
    return
  }
  // No longer manually rendering, Vue will handle it
  console.log('[SidepanelApiDropdown] Finished rendering', providerItems.value.length, 'items')
}

// Load provider items
const loadProviderItems = async () => {
  try {
    isLoading.value = true
    
    // Ensure providers are loaded first
    let attempts = 0
    const maxAttempts = 10
    
    while (availableProviders.value.length === 0 && attempts < maxAttempts) {
      console.log(`[SidepanelApiDropdown] No providers available, waiting... (attempt ${attempts + 1}/${maxAttempts})`)
      await new Promise(resolve => setTimeout(resolve, 100))
      attempts++
    }
    
    if (availableProviders.value.length === 0) {
      await handleError(new Error('No providers loaded after waiting'), 'sidepanel-api-dropdown-no-providers')
      return
    }
    
    providerItems.value = await createProviderItems()
    console.log('[SidepanelApiDropdown] Provider items loaded:', providerItems.value.length)
    
    await nextTick()
    await renderProviderItems()
  } catch (error) {
    await handleError(error, 'sidepanel-api-dropdown-load-items')
  } finally {
    isLoading.value = false
  }
}

// Position dropdown
const positionDropdown = () => {
  if (!dropdownMenu.value) return

  const apiButton = document.getElementById('apiProviderBtn')
  if (!apiButton) return

  const buttonRect = apiButton.getBoundingClientRect()
  const dropdown = dropdownMenu.value

  // Calculate position relative to the button
  const leftPosition = buttonRect.left + buttonRect.width + 8 // 8px gap
  const topPosition = buttonRect.top

  dropdown.style.left = `${leftPosition}px`
  dropdown.style.top = `${topPosition}px`
}

// Setup event listeners
const setupEventListeners = () => {
  // Handle clicks outside dropdown
  document.addEventListener('click', handleOutsideClick)
}

// Cleanup event listeners
const cleanupEventListeners = () => {
  document.removeEventListener('click', handleOutsideClick)
}

// Handle outside clicks
const handleOutsideClick = (event) => {
  if (!dropdownMenu.value) return

  const apiButton = document.getElementById('apiProviderBtn')
  
  if (apiButton && 
      !dropdownMenu.value.contains(event.target) && 
      !apiButton.contains(event.target)) {
    emit('update:isVisible', false)
    console.log('[SidepanelApiDropdown] Outside click detected, emitting update:isVisible(false)')
  }
}

// Initialize component
const initialize = async () => {
  try {
    setupEventListeners()
    
    console.log('[SidepanelApiDropdown] Initializing with', availableProviders.value.length, 'providers')
    console.log('[SidepanelApiDropdown] Available providers:', availableProviders.value)
    
    await loadProviderItems()
    
    console.log('[SidepanelApiDropdown] Component initialized')
  } catch (error) {
    await handleError(error, 'sidepanel-api-dropdown-init')
  }
}

// Watch for visibility changes
watch(() => props.isVisible, async (visible) => {
  if (dropdownMenu.value) {
    dropdownMenu.value.style.display = visible ? 'flex' : 'none'
    
    if (visible) {
      // Only reload if we don't have items already
      if (providerItems.value.length === 0) {
        await loadProviderItems()
      } else {
        // Just re-render existing items
        await renderProviderItems()
      }
      await nextTick()
      positionDropdown()
    }
  }
})

// Watch for current provider changes
watch(currentProvider, async () => {
  await loadProviderItems()
})

// Watch for available providers changes
watch(availableProviders, async () => {
  await loadProviderItems()
}, { deep: true })

// Lifecycle
onMounted(() => {
  initialize()
})

onUnmounted(() => {
  cleanupEventListeners()
})
</script>

<style lang="scss" scoped>
@use '@/assets/styles/variables.scss' as *;

.dropdown-menu {
  position: fixed;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: $border-radius-md;
  box-shadow: $shadow-md;
  padding: $spacing-xs;
  z-index: 200;
  display: none; /* Managed by JS */
  flex-direction: column;
  min-width: 200px;
  max-width: 300px;
  max-height: 400px;
}

.dropdown-content {
  display: flex;
  flex-direction: column;
  gap: $spacing-xs;
  max-height: 350px;
  overflow-y: auto;
}

// Provider item styles
.provider-item {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  padding: $spacing-sm;
  border-radius: $border-radius-sm;
  cursor: pointer;
  transition: all $transition-fast;
  background-color: transparent;
  border: 1px solid transparent;

  &:hover {
    background-color: var(--color-background);
    border-color: var(--color-border);
  }

  &.active {
    background-color: var(--color-primary);
    color: white;
    cursor: default;

    .provider-name {
      color: white;
    }

    .active-indicator {
      color: rgba(255, 255, 255, 0.9);
    }

    .provider-icon img {
      filter: brightness(0) invert(1);
    }
  }
}

.provider-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
}

.provider-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0; // Allow text truncation

  .provider-name {
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
    color: var(--color-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .active-indicator {
    font-size: $font-size-xs;
    color: var(--color-text-secondary);
    font-weight: $font-weight-normal;
  }
}

// State messages
.loading-message, .empty-message {
  text-align: center;
  color: var(--color-text-secondary);
  font-style: italic;
  padding: $spacing-base;
  font-size: $font-size-sm;
}

.empty-message {
  opacity: 0.8;
}
</style>