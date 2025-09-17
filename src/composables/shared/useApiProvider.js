import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useBrowserAPI } from "./useBrowserAPI.js";
import { useSettingsStore } from "@/features/settings/stores/settings.js";
import { getProvidersForDropdown, getProviderById } from "@/core/provider-registry.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import browser from "webextension-polyfill";

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'useApiProvider');

export function useApiProvider() {
  const currentProvider = ref("google");
  const availableProviders = ref([]);
  const isDropdownOpen = ref(false);
  const isLoading = ref(false);
  const providerError = ref("");

  const { safeStorageSet, setupStorageListener, removeStorageListener } = useBrowserAPI('api-provider');
  const settingsStore = useSettingsStore();

  const currentProviderData = computed(() => getProviderById(currentProvider.value));
  const currentProviderIcon = computed(() => {
    if (!browser || !browser.runtime || !browser.runtime.getURL) return ""
    if (!currentProviderData.value) return browser.runtime.getURL('icons/providers/google.svg')
    const iconPath = currentProviderData.value.icon
    if (!iconPath) return browser.runtime.getURL('icons/providers/google.svg')
    if (iconPath.includes('/')) {
      return browser.runtime.getURL(`icons/${iconPath}`)
    }
    return browser.runtime.getURL(`icons/providers/${iconPath}`)
  });
  const currentProviderName = computed(() => currentProviderData.value?.name || "Translation Provider");

  const loadAvailableProviders = () => {
    try {
      const providers = getProvidersForDropdown();
      logger.debug('Raw providers from registry:', providers.map(p => ({ id: p.id, name: p.name, hasValue: !!p.value })));
      availableProviders.value = providers.map(p => ({ ...p }));
      logger.debug('Loaded available providers:', availableProviders.value.map(p => p.id));
    } catch (error) {
      logger.error('Failed to load providers:', error);
      providerError.value = "Failed to load providers";
    }
  };

  // Load available providers immediately after function definition
  loadAvailableProviders();

  const loadCurrentProvider = async () => {
    try {
      await settingsStore.loadSettings();
      const providerId = settingsStore.settings.TRANSLATION_API || "google";
      logger.debug('Loading provider from settings:', providerId);

      // Check if available providers are loaded
      if (availableProviders.value.length === 0) {
        logger.debug('Available providers not loaded, loading now...');
        loadAvailableProviders();
      }

      const provider = getProviderById(providerId);
      logger.debug('Found provider:', provider);
      if (provider) {
        currentProvider.value = providerId;
      } else {
        logger.warn('Provider not found in registry, falling back to google:', providerId);
        logger.debug('Available providers:', availableProviders.value.map(p => p.id));
        currentProvider.value = "google";
        await settingsStore.updateSettingAndPersist("TRANSLATION_API", "google");
      }
    } catch (error) {
      logger.error('Error loading current provider:', error);
      currentProvider.value = "google";
    }
  };

  const selectProvider = async (providerId) => {
    if (!providerId || providerId === currentProvider.value) return false;
    logger.debug('Selecting provider:', providerId);
    isLoading.value = true;
    try {
      await settingsStore.updateSettingAndPersist("TRANSLATION_API", providerId);
      await safeStorageSet({ TRANSLATION_API: providerId });
      currentProvider.value = providerId;
      logger.debug('Provider selected successfully:', providerId);
      isDropdownOpen.value = false;
      return true;
    } catch (error) {
      logger.error('Failed to change provider:', error);
      providerError.value = "Failed to change provider";
      return false;
    } finally {
      isLoading.value = false;
    }
  };

  const getProviderIconUrl = (iconPath) => {
      if (!browser || !browser.runtime || !browser.runtime.getURL) return "";
      return browser.runtime.getURL(iconPath);
  }

  const createProviderItems = async () => {
    return availableProviders.value.map(provider => ({
      ...provider,
      iconUrl: getProviderIconUrl(`icons/providers/${provider.icon}`),
      isActive: provider.id === currentProvider.value,
    }));
  };

  watch(() => settingsStore.settings.TRANSLATION_API, (newProvider) => {
    if (newProvider && newProvider !== currentProvider.value) {
      logger.debug('TRANSLATION_API changed in settings:', newProvider, 'current:', currentProvider.value);
      currentProvider.value = newProvider;
    }
  });

  let storageListener = null;
  onMounted(async () => {
    await loadAvailableProviders();
    await loadCurrentProvider();
    storageListener = setupStorageListener((changes) => {
      if (changes.TRANSLATION_API) {
        const newProvider = changes.TRANSLATION_API.newValue;
        logger.debug('Storage change for TRANSLATION_API:', newProvider, 'current:', currentProvider.value);
        if (newProvider && newProvider !== currentProvider.value) {
          currentProvider.value = newProvider;
          settingsStore.settings.TRANSLATION_API = newProvider;
        }
      }
    });
  });

  onUnmounted(() => {
      if(storageListener) removeStorageListener(storageListener)
  });

  return {
    currentProvider, availableProviders, isDropdownOpen, isLoading, providerError,
    currentProviderData, currentProviderIcon, currentProviderName,
    selectProvider, createProviderItems,
    openDropdown: () => isDropdownOpen.value = true,
    closeDropdown: () => isDropdownOpen.value = false,
    setDropdownOpen: (value) => isDropdownOpen.value = value,
  };
}
