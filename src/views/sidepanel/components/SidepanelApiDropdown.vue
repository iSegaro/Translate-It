<template>
  <div id="apiProviderDropdown" class="dropdown-menu" ref="dropdownMenu">
    <div class="dropdown-content" ref="dropdownContent">
      <!-- Provider options will be rendered here -->
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
import { useApiProvider } from '@/composables/useApiProvider.js'
import { useUI } from '@/composables/useUI.js'

// Props
const props = defineProps({
  isVisible: {
    type: Boolean,
    default: false
  }
})

// Emits
const emit = defineEmits(['close', 'providerSelected'])

// Composables
const { 
  availableProviders,
  currentProvider,
  selectProvider,
  createProviderItems,
  getProviderIconUrl
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
  if (!providerId || providerId === currentProvider.value) {
    return
  }

  try {
    isLoading.value = true
    
    const success = await selectProvider(providerId)
    
    if (success) {
      emit('providerSelected', providerId)
      emit('close')
      
      // Visual feedback
      const providerElement = document.querySelector(`[data-provider-id="${providerId}"]`)
      if (providerElement) {
        showVisualFeedback(providerElement, 'success', 300)
      }
      
      console.log(`[SidepanelApiDropdown] Provider selected: ${providerId}`)
    }
  } catch (error) {
    console.error('[SidepanelApiDropdown] Error selecting provider:', error)
    
    const providerElement = document.querySelector(`[data-provider-id="${providerId}"]`)
    if (providerElement) {
      showVisualFeedback(providerElement, 'error')
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

  dropdownContent.value.innerHTML = ''

  if (isLoading.value) {
    dropdownContent.value.innerHTML = '<div class="loading-message">Loading providers...</div>'
    console.log('[SidepanelApiDropdown] Showing loading message')
    return
  }

  if (!hasProviders.value) {
    dropdownContent.value.innerHTML = '<div class="empty-message">No providers available</div>'
    console.log('[SidepanelApiDropdown] Showing empty message')
    return
  }

  console.log('[SidepanelApiDropdown] Creating provider items...')

  // Create provider items
  for (const item of providerItems.value) {
    console.log('[SidepanelApiDropdown] Creating item for:', item.name)
    
    const providerElement = document.createElement('div')
    providerElement.className = `provider-item ${item.isActive ? 'active' : ''}`
    providerElement.setAttribute('data-provider-id', item.id)
    
    // Get icon URL
    const iconUrl = await getProviderIconUrl(`icons/api-providers/${item.icon}`)
    console.log('[SidepanelApiDropdown] Icon URL for', item.name, ':', iconUrl)
    
    providerElement.innerHTML = `
      <div class="provider-icon">
        <img src="${iconUrl}" alt="${item.name}" />
      </div>
      <div class="provider-info">
        <span class="provider-name">${item.name}</span>
        ${item.isActive ? '<span class="active-indicator">Current</span>' : ''}
      </div>
    `

    // Add click event
    providerElement.addEventListener('click', () => {
      if (!item.isActive) {
        handleProviderSelect(item.id)
      }
    })

    dropdownContent.value.appendChild(providerElement)
  }
  
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
      console.error('[SidepanelApiDropdown] No providers loaded after waiting')
      return
    }
    
    providerItems.value = await createProviderItems()
    console.log('[SidepanelApiDropdown] Provider items loaded:', providerItems.value.length)
    
    await nextTick()
    await renderProviderItems()
  } catch (error) {
    console.error('[SidepanelApiDropdown] Error loading provider items:', error)
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
  
  // Cleanup provider item listeners
  if (dropdownContent.value) {
    const providerItems = dropdownContent.value.querySelectorAll('.provider-item')
    providerItems.forEach(item => {
      item.removeEventListener('click', handleProviderSelect)
    })
  }
}

// Handle outside clicks
const handleOutsideClick = (event) => {
  if (!dropdownMenu.value) return

  const apiButton = document.getElementById('apiProviderBtn')
  
  if (apiButton && 
      !dropdownMenu.value.contains(event.target) && 
      !apiButton.contains(event.target)) {
    emit('close')
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
    console.error('[SidepanelApiDropdown] Initialization error:', error)
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
