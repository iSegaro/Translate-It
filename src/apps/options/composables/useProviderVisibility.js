import { computed, unref } from 'vue'
import { useSettingsStore } from '@/features/settings/stores/settings.js'

/**
 * Composable to manage a provider's visibility in the UI lists.
 * 
 * @param {string|Ref<string>} providerId - The ID of the provider to manage.
 */
export function useProviderVisibility(providerId) {
  const settingsStore = useSettingsStore()

  const showInList = computed({
    get: () => {
      const id = unref(providerId)
      if (!id) return true
      const hidden = settingsStore.settings?.HIDDEN_PROVIDERS || []
      return !hidden.includes(id)
    },
    set: (isVisible) => {
      const id = unref(providerId)
      if (!id) return
      
      const hidden = [...(settingsStore.settings?.HIDDEN_PROVIDERS || [])]
      
      if (isVisible) {
        // Show -> remove from hidden list
        const index = hidden.indexOf(id)
        if (index > -1) {
          hidden.splice(index, 1)
        }
      } else {
        // Hide -> add to hidden list
        if (!hidden.includes(id)) {
          hidden.push(id)
        }
      }
      
      settingsStore.updateSettingLocally('HIDDEN_PROVIDERS', hidden)
    }
  })

  return {
    showInList
  }
}
