// src/composables/useApiProvider.js
// Vue composable for API provider management in sidepanel with improved API handling
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useBrowserAPI } from './useBrowserAPI.js'
import { useSettingsStore } from '@/store/core/settings.js'
import { getProvidersForDropdown, getProviderById } from '@/core/provider-registry.js'

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
    console.log('[useApiProvider] currentProviderData computed - currentProvider.value:', currentProvider.value);
    console.log('[useApiProvider] currentProviderData computed - availableProviders.value:', availableProviders.value);
    const data = availableProviders.value.find(p => p.id === currentProvider.value) || null;
    console.log('[useApiProvider] currentProviderData computed - result data:', data);
    return data;
  })

  const currentProviderIcon = computed(() => {
    if (currentProviderData.value && currentProviderData.value.icon) {
      return `@/assets/icons/api-providers/${currentProviderData.value.icon}`
    }
    return '@/assets/icons/api-providers/google.svg'
  })

  const currentProviderName = computed(() => {
    return currentProviderData.value?.name || 'Translation Provider'
  })

  // Load available providers
  const loadAvailableProviders = () => {
    try {
      console.log('[useApiProvider] Starting to load providers...')
      
      const providersFromRegistry = getProvidersForDropdown()
      availableProviders.value = providersFromRegistry.map(provider => ({
        id: provider.value,
        name: provider.label,
        icon: provider.icon
      }))
      
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
      currentProvider.value = settingsStore.settings.TRANSLATION_API || 'google'
      console.log('[useApiProvider] loadCurrentProvider - currentProvider.value set to:', currentProvider.value);


      // Check if current provider is available, fallback if needed
      const providerExists = getProviderById(currentProvider.value)
      if (!providerExists) {
        console.log(`[useApiProvider] Provider ${currentProvider.value} not available, using fallback: google`)
        currentProvider.value = 'google'
        
        // Update settings with fallback
        await settingsStore.updateSettingAndPersist('TRANSLATION_API', 'google')
      }
    } catch (error) {
      console.error('[useApiProvider] Error loading current provider:', error)
      currentProvider.value = 'google' // Safe fallback
    }
  }

  // Select a new provider
  const selectProvider = async (providerId) => {
    if (!providerId || providerId === currentProvider.value) {
      console.log('[useApiProvider] selectProvider - Provider already selected or invalid ID:', providerId);
      return false
    }

    try {
      isLoading.value = true
      providerError.value = ''

      // Update both settingsStore and browser storage to ensure sync
      await settingsStore.updateSettingAndPersist('TRANSLATION_API', providerId)
      
      // Also directly update browser storage to ensure legacy code sees the change
      const browser = await browserAPI.ensureReady()
      await browser.storage.local.set({ TRANSLATION_API: providerId })
      
      currentProvider.value = providerId
      console.log('[useApiProvider] selectProvider - currentProvider.value updated to:', currentProvider.value);
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

  // Watch for changes in settingsStore.settings.TRANSLATION_API
  watch(() => settingsStore.settings.TRANSLATION_API, (newProvider) => {
    if (newProvider && newProvider !== currentProvider.value) {
      currentProvider.value = newProvider
      console.log(`[useApiProvider] Provider updated from settings store: ${newProvider}`)
    }
  })

  // Listen for browser storage changes to sync with legacy code
  const setupStorageListener = async () => {
    try {
      const browser = await browserAPI.ensureReady()
      
      if (browser && browser.storage && browser.storage.onChanged) {
        browser.storage.onChanged.addListener((changes, areaName) => {
          if (areaName === 'local' && changes.TRANSLATION_API) {
            const newProvider = changes.TRANSLATION_API.newValue
            if (newProvider && newProvider !== currentProvider.value) {
              currentProvider.value = newProvider
              settingsStore.settings.TRANSLATION_API = newProvider
              console.log(`[useApiProvider] Provider synced from storage: ${newProvider}`)
            }
          }
        })
        console.log('[useApiProvider] Storage listener setup successful')
      } else {
        console.warn('[useApiProvider] Browser storage API not available')
      }
    } catch (error) {
      console.error('[useApiProvider] Error setting up storage listener:', error)
    }
  }

  // Convenience functions for opening/closing dropdown
  const openDropdown = () => {
    isDropdownOpen.value = true
    console.log('[useApiProvider] API dropdown opened')
  }

  const closeDropdown = () => {
    isDropdownOpen.value = false
    console.log('[useApiProvider] API dropdown closed')
  }

  // Initialize
  const initialize = async () => {
    await loadAvailableProviders()
    await loadCurrentProvider()
    await setupStorageListener()
  }

  // Lifecycle
  onMounted(() => {
    initialize()
  })

  onUnmounted(() => {
    // No specific cleanup needed as we are watching settingsStore
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

    // Dropdown Management
    openDropdown,
    closeDropdown,
    setDropdownOpen
  }
}