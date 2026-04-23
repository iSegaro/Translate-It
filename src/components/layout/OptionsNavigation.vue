<template>
  <nav class="vertical-tabs">
    <router-link
      v-for="item in navigationItems"
      :key="item.name"
      :to="{ name: item.name }"
      :class="['tab-button', { active: $route.name === item.name, disabled: item.disabled }]"
    >
      {{ t(item.labelKey) }}
    </router-link>
    <div class="tabs-action-area">
      <div
        id="status"
        :class="`status-${statusType}`"
      >
        {{ statusMessage }}
      </div>
      <button 
        id="saveSettings" 
        :disabled="isSaving || !settingsStore.isSettingsValid"
        class="save-button"
        @click="saveAllSettings"
      >
        {{ t('save_settings_button') || 'Save' }}
      </button>
    </div>
  </nav>
</template>

<script setup>
import { ref, watch } from 'vue'
import './OptionsNavigation.scss'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { settingsManager } from '@/shared/managers/SettingsManager.js'
import ExtensionContextManager from '@/core/extensionContext.js'
import { MessageActions } from '@/shared/messaging/core/MessageActions.js'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'OptionsNavigation')

const { t, locale } = useUnifiedI18n()

const settingsStore = useSettingsStore()

// Navigation items, labels are reactive to language changes
const navigationItems = ref([
  { name: 'languages', labelKey: 'languages_tab_title' },
  { name: 'activation', labelKey: 'activation_tab_title' },
  { name: 'tts', labelKey: 'tts_tab_title' },
  { name: 'prompt', labelKey: 'prompt_tab_title' },
  { name: 'appearance', labelKey: 'appearance_tab_title' },
  { name: 'advance', labelKey: 'advance_tab_title' },
  { name: 'import-export', labelKey: 'import_export_tab_title' },
  { name: 'help', labelKey: 'help_tab_title' },
  { name: 'about', labelKey: 'about_tab_title' }
])

// Watch for language change to force update
watch(() => locale.value, () => {
  navigationItems.value = navigationItems.value.map(item => ({ ...item }))
})

// Status management
const statusMessage = ref('')
const statusType = ref('')
const isSaving = ref(false)

// Save all settings
const saveAllSettings = async () => {
  logger.debug('Save All Settings clicked!')
  isSaving.value = true
  statusType.value = ''
  statusMessage.value = ''
  
  try {
    await settingsStore.saveAllSettings()
    logger.debug('All settings saved successfully')

    // Refresh settings in all content scripts
    await settingsManager.refreshSettings()

    // Notify all tabs about settings change using cross-browser compatible approach
    await ExtensionContextManager.safeSendMessage({
      action: MessageActions.SETTINGS_UPDATED,
      timestamp: Date.now()
    }, 'settings-notification')
    logger.debug('All settings update notification sent to all tabs')
    statusType.value = 'success'
  statusMessage.value = t('OPTIONS_STATUS_SAVED_SUCCESS') || 'Settings saved successfully!'
    
    // Clear status after 2 seconds
    setTimeout(() => {
      statusMessage.value = ''
      statusType.value = ''
    }, 2000)
  } catch (error) {
    logger.error('Failed to save settings:', error)
    statusType.value = 'error'
  statusMessage.value = t('OPTIONS_STATUS_SAVED_FAILED') || 'Failed to save settings!'
    
    // Clear status after 3 seconds
    setTimeout(() => {
      statusMessage.value = ''
      statusType.value = ''
    }, 3000)
  } finally {
    isSaving.value = false
  }
}
</script>
