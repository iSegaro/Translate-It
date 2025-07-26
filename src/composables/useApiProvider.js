// src/composables/useApiProvider.js
// Vue composable for API provider management in sidepanel with improved API handling
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useBrowserAPI } from './useBrowserAPI.js'
import { useSettingsStore } from '@/store/core/settings.js'
import { ProviderRegistry } from '@/providers/index.js'
import { ProviderHtmlGenerator } from '@/utils/providerHtmlGenerator.js'

export function useApiProvider() {
  // State
  const currentProvider = ref('google')
  const availableProviders = ref([])
  const isDropdownOpen = ref(false)
  const isLoading = ref(false)
  const providerError = ref('')

  // Composables
  const browserAPI = useBrowserAPI()
  const settingsStore = useSettingsStore()

  // Computed
  const currentProviderData = computed(() => {
    return availableProviders.value.find(p => p.id === currentProvider.value) || null
  })

  const currentProviderIcon = computed(() => {
    if (currentProviderData.value) {
      return `icons/api-providers/${currentProviderData.value.icon}`
    }
    return 'icons/api-providers/provider.svg'
  })

  const currentProviderName = computed(() => {
    return currentProviderData.value?.name || 'Translation Provider'
  })

  // Load available providers
  const loadAvailableProviders = () => {
    try {
      console.log('[useApiProvider] Starting to load providers...')
      console.log('[useApiProvider] ProviderHtmlGenerator:', ProviderHtmlGenerator)
      console.log('[useApiProvider] ProviderRegistry:', ProviderRegistry)
      
      availableProviders.value = ProviderHtmlGenerator.generateProviderArray()
      
      console.log(`[useApiProvider] Loaded ${availableProviders.value.length} available providers`)
      console.log('[useApiProvider] Providers:', availableProviders.value)
    } catch (error) {
      console.error('[useApiProvider] Error loading providers:', error)
      console.error('[useApiProvider] Error stack:', error.stack)
      providerError.value = 'Failed to load providers'
    }
  }

  // Load current provider from settings
  const loadCurrentProvider = async () => {
    try {
      await settingsStore.loadSettings()
      const settings = settingsStore.settings
      currentProvider.value = settings.TRANSLATION_API || 'google'

      // Check if current provider is available, fallback if needed
      const fallbackProvider = ProviderRegistry.getFallbackProvider(currentProvider.value)
      if (fallbackProvider !== currentProvider.value) {
        console.log(`[useApiProvider] Provider ${currentProvider.value} not available, using fallback: ${fallbackProvider}`)
        currentProvider.value = fallbackProvider
        
        // Update settings with fallback
        await browserAPI.safeStorageSet({ TRANSLATION_API: fallbackProvider })
      }
    } catch (error) {
      console.error('[useApiProvider] Error loading current provider:', error)
      currentProvider.value = 'google' // Safe fallback
    }
  }

  // Select a new provider
  const selectProvider = async (providerId) => {
    if (!providerId || providerId === currentProvider.value) {
      return false
    }

    try {
      isLoading.value = true
      providerError.value = ''

      await browserAPI.safeStorageSet({ TRANSLATION_API: providerId })
      
      currentProvider.value = providerId
      isDropdownOpen.value = false
      
      console.log(`[useApiProvider] Provider changed to: ${providerId}`)
      return true
    } catch (error) {
      console.error('[useApiProvider] Error changing provider:', error)
      providerError.value = 'Failed to change provider'
      return false
    } finally {
      isLoading.value = false
    }
  }

  // Set dropdown open state externally
  const setDropdownOpen = (value) => {
    isDropdownOpen.value = value
  }

  // Get provider icon URL
  const getProviderIconUrl = async (iconPath) => {
    try {
      const browser = await browserAPI.ensureReady()
      return browser.runtime.getURL(iconPath)
    } catch (error) {
      console.error('[useApiProvider] Error getting icon URL:', error)
      return ''
    }
  }

  // Create provider dropdown items (for template rendering)
  const createProviderItems = async () => {
    const items = []
    
    for (const provider of availableProviders.value) {
      const iconUrl = await getProviderIconUrl(`icons/api-providers/${provider.icon}`)
      items.push({
        id: provider.id,
        name: provider.name,
        icon: provider.icon,
        iconUrl,
        isActive: provider.id === currentProvider.value
      })
    }
    
    return items
  }

  // Handle provider change from other parts of extension
  const handleStorageChange = (changes) => {
    if (changes.TRANSLATION_API) {
      const newProvider = changes.TRANSLATION_API.newValue
      if (newProvider && newProvider !== currentProvider.value) {
        currentProvider.value = newProvider
        console.log(`[useApiProvider] Provider updated from storage: ${newProvider}`)
      }
    }
  }

  // Storage change listener
  let storageListener = null

  // Setup storage listener
  const setupStorageListener = async () => {
    try {
      storageListener = await browserAPI.setupStorageListener(handleStorageChange)
      if (storageListener) {
        console.log('[useApiProvider] Storage listener setup successfully')
      } else {
        console.warn('[useApiProvider] Browser storage API not available, skipping listener setup')
      }
    } catch (error) {
      console.warn('[useApiProvider] Unable to setup storage listener:', error.message)
    }
  }

  // Cleanup storage listener
  const cleanupStorageListener = async () => {
    if (storageListener) {
      try {
        await browserAPI.removeStorageListener(storageListener)
        storageListener = null
      } catch (error) {
        console.error('[useApiProvider] Error cleaning up storage listener:', error)
      }
    }
  }

  // Initialize
  const initialize = async () => {
    loadAvailableProviders()
    await loadCurrentProvider()
    await setupStorageListener()
  }

  // Cleanup
  const cleanup = async () => {
    await cleanupStorageListener()
  }

  // Lifecycle
  onMounted(() => {
    initialize()
  })

  onUnmounted(() => {
    cleanup()
  })

  return {
    // State
    currentProvider,
    availableProviders,
    isDropdownOpen,
    isLoading,
    providerError,

    // Computed
    currentProviderData,
    currentProviderIcon,  
    currentProviderName,

    // Methods
    loadAvailableProviders,
    loadCurrentProvider,
    selectProvider,
    getProviderIconUrl,
    createProviderItems,

    // Utilities
    initialize,
    cleanup,

    // External state setters
    setDropdownOpen
  }
}