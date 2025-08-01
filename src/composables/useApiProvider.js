import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useBrowserAPI } from "./useBrowserAPI.js";
import { useSettingsStore } from "@/store/core/settings.js";
import { getProvidersForDropdown, getProviderById } from "@/core/provider-registry.js";

export function useApiProvider() {
  const currentProvider = ref("google");
  const availableProviders = ref([]);
  const isDropdownOpen = ref(false);
  const isLoading = ref(false);
  const providerError = ref("");

  const { messenger, safeStorageSet, setupStorageListener, removeStorageListener } = useBrowserAPI('api-provider');
  const settingsStore = useSettingsStore();

  const currentProviderData = computed(() => getProviderById(currentProvider.value));
  const currentProviderIcon = computed(() => currentProviderData.value ? `@/assets/icons/api-providers/${currentProviderData.value.icon}` : "@/assets/icons/api-providers/google.svg");
  const currentProviderName = computed(() => currentProviderData.value?.name || "Translation Provider");

  const loadAvailableProviders = () => {
    try {
      availableProviders.value = getProvidersForDropdown().map(p => ({ ...p, id: p.value }));
    } catch (error) {
      providerError.value = "Failed to load providers";
    }
  };

  const loadCurrentProvider = async () => {
    try {
      await settingsStore.loadSettings();
      const providerId = settingsStore.settings.TRANSLATION_API || "google";
      if (getProviderById(providerId)) {
        currentProvider.value = providerId;
      } else {
        currentProvider.value = "google";
        await settingsStore.updateSettingAndPersist("TRANSLATION_API", "google");
      }
    } catch (error) {
      currentProvider.value = "google";
    }
  };

  const selectProvider = async (providerId) => {
    if (!providerId || providerId === currentProvider.value) return false;
    isLoading.value = true;
    try {
      await settingsStore.updateSettingAndPersist("TRANSLATION_API", providerId);
      await safeStorageSet({ TRANSLATION_API: providerId });
      currentProvider.value = providerId;
      isDropdownOpen.value = false;
      return true;
    } catch (error) {
      providerError.value = "Failed to change provider";
      return false;
    } finally {
      isLoading.value = false;
    }
  };

  const getProviderIconUrl = (iconPath) => {
      if (!messenger || !messenger.runtime || !messenger.runtime.getURL) return "";
      return messenger.runtime.getURL(iconPath);
  }

  const createProviderItems = async () => {
    return availableProviders.value.map(provider => ({
      ...provider,
      iconUrl: getProviderIconUrl(`icons/api-providers/${provider.icon}`),
      isActive: provider.id === currentProvider.value,
    }));
  };

  watch(() => settingsStore.settings.TRANSLATION_API, (newProvider) => {
    if (newProvider && newProvider !== currentProvider.value) {
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
