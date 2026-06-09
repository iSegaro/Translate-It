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
        :disabled="isSaving"
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
import { useRouter } from 'vue-router'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { settingsManager } from '@/shared/managers/SettingsManager.js'
import { safeSendMessage } from '@/shared/messaging/core/UnifiedMessaging.js'
import { MessageActions } from '@/shared/messaging/core/MessageActions.js'
import { getFirstMissingSetting } from '@/features/translation/utils/providerValidator.js'
import { PROMPT_REGISTRY } from '@/shared/config/PromptRegistry.js'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'OptionsNavigation')

const { t, locale } = useUnifiedI18n()

const settingsStore = useSettingsStore()
const router = useRouter()

// Navigation items, labels are reactive to language changes
const navigationItems = ref([
  { name: 'languages', labelKey: 'languages_tab_title' },
  { name: 'providers', labelKey: 'providers_tab_title' },
  { name: 'activation', labelKey: 'activation_tab_title' },
  { name: 'tts', labelKey: 'tts_tab_title' },
  { name: 'ocr', labelKey: 'ocr_tab_title' },
  { name: 'prompt', labelKey: 'prompt_tab_title' },
  { name: 'live-caption', labelKey: 'live_caption_tab_title' },
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
  
  // 1. Validate all critical settings before proceeding
  const validation = settingsStore.validateSettings()
  if (!validation.isValid) {
    logger.debug('Cannot save settings: Validation failed', validation.errors)
    
    // Check if it's a provider configuration error
    const globalProvider = settingsStore.settings.TRANSLATION_API;
    const missingKey = getFirstMissingSetting(globalProvider, settingsStore.settings);
    
    if (missingKey) {
      // Redirect to providers tab with highlight parameter if not already there
      const currentRoute = router.currentRoute.value.name
      if (currentRoute !== 'providers') {
        await router.push({ name: 'providers', query: { highlight: missingKey } })
      } else {
        // Already on providers tab, just dispatch the event
        window.dispatchEvent(new CustomEvent('options-trigger-validation-feedback', { 
          detail: { field: missingKey } 
        }))
      }
      return
    }

    // Check mode-specific providers for Activation tab
    if (settingsStore.settings.MODE_PROVIDERS) {
      for (const [mode, providerId] of Object.entries(settingsStore.settings.MODE_PROVIDERS)) {
        if (providerId && providerId !== 'default') {
          const modeMissingKey = getFirstMissingSetting(providerId, settingsStore.settings);
          if (modeMissingKey) {
            // Redirect to activation tab if it's a mode managed there
            const currentRoute = router.currentRoute.value.name
            if (currentRoute !== 'activation') {
              await router.push({ name: 'activation' })
            }
            window.dispatchEvent(new CustomEvent('options-trigger-validation-feedback', { 
              detail: { field: 'provider', mode } 
            }))
            return
          }
        }
      }
    }

    // Handle language validation errors
    if (validation.errors.some(e => e.includes('language'))) {
      if (router.currentRoute.value.name !== 'languages') {
        await router.push({ name: 'languages' })
      }
      window.dispatchEvent(new CustomEvent('options-trigger-validation-feedback', { 
        detail: { field: 'languages' } 
      }))
      return
    }

    // Handle prompt validation errors
    const promptError = validation.errors.find(e => e.startsWith('prompt:'))
    if (promptError) {
      const parts = promptError.split(':')
      const promptKey = parts.length >= 2 ? parts[1] : null
      
      if (promptKey && PROMPT_REGISTRY[promptKey]) {
        if (router.currentRoute.value.name !== 'prompt') {
          await router.push({ name: 'prompt' })
        }
        window.dispatchEvent(new CustomEvent('options-trigger-validation-feedback', { 
          detail: { field: 'prompt', promptKey } 
        }))
        return
      } else {
        logger.warn('Received malformed or unknown prompt validation error:', promptError)
      }
    }

    // Handle activation tab validation errors (scroll delay)
    if (validation.errors.includes('validation_scroll_delay_invalid')) {
      if (router.currentRoute.value.name !== 'activation') {
        await router.push({ name: 'activation' })
      }
      window.dispatchEvent(new CustomEvent('options-trigger-validation-feedback', { 
        detail: { field: 'WHOLE_PAGE_SCROLL_STOP_DELAY' } 
      }))
      return
    }

    // Handle font validation errors
    if (validation.errors.includes('font_size_range_error') || validation.errors.includes('font_family_required')) {
      if (router.currentRoute.value.name !== 'appearance') {
        await router.push({ name: 'appearance' })
      }
      window.dispatchEvent(new CustomEvent('options-trigger-validation-feedback', { 
        detail: { field: 'font_settings' } 
      }))
      return
    }

    // Handle proxy validation errors
    if (validation.errors.some(e => e.includes('proxy'))) {
      if (router.currentRoute.value.name !== 'advance') {
        await router.push({ name: 'advance' })
      }
      window.dispatchEvent(new CustomEvent('options-trigger-validation-feedback', { 
        detail: { field: 'proxy' } 
      }))
      return
    }

    // For other errors, show the specific error message to help debugging
    statusType.value = 'error'
    const firstError = validation.errors[0]
    
    // Try to translate the error key, or use a default if it fails
    statusMessage.value = t(firstError) || t('OPTIONS_STATUS_VALIDATION_FAILED') || 'Please fix errors before saving'
    
    setTimeout(() => { statusMessage.value = ''; statusType.value = ''; }, 5000)
    return
  }

  isSaving.value = true
  statusType.value = ''
  statusMessage.value = ''
  
  try {
    await settingsStore.saveAllSettings()
    logger.debug('All settings saved successfully')

    // Refresh settings in all content scripts
    await settingsManager.refreshSettings()

    // Notify all tabs about settings change using cross-browser compatible approach
    await safeSendMessage({
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
