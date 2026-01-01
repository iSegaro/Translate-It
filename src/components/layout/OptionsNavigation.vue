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
import { ref, computed, watch } from 'vue'
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
  { name: 'appearance', labelKey: 'appearance_tab_title' },
  { name: 'activation', labelKey: 'activation_tab_title' },
  { name: 'prompt', labelKey: 'prompt_tab_title' },
  { name: 'import-export', labelKey: 'import_export_tab_title' },
  { name: 'advance', labelKey: 'advance_tab_title' },
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
  logger.debug('💾 Save All Settings clicked!')
  isSaving.value = true
  statusType.value = ''
  statusMessage.value = ''
  
  try {
    await settingsStore.saveAllSettings()
    logger.debug('✅ All settings saved successfully')

    // Refresh settings in all content scripts
    await settingsManager.refreshSettings()

    // Notify all tabs about settings change using cross-browser compatible approach
    await ExtensionContextManager.safeSendMessage({
      action: MessageActions.SETTINGS_UPDATED,
      timestamp: Date.now()
    }, 'settings-notification')
    logger.debug('✅ Settings update notification sent to all tabs')
    statusType.value = 'success'
  statusMessage.value = t('OPTIONS_STATUS_SAVED_SUCCESS') || 'Settings saved successfully!'
    
    // Clear status after 2 seconds
    setTimeout(() => {
      statusMessage.value = ''
      statusType.value = ''
    }, 2000)
  } catch (error) {
    logger.error('❌ Failed to save settings:', error)
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

// Disable prompt tab based on selected API (like original logic)
const shouldDisablePromptTab = computed(() => {
  const provider = settingsStore.selectedProvider
  return ['google', 'bing', 'browserapi', 'yandex'].includes(provider)
})

// Apply disabled state to prompt tab
navigationItems.value.find(item => item.name === 'prompt').disabled = shouldDisablePromptTab
</script>

<style lang="scss" scoped>
@use "@/assets/styles/base/variables" as *;

.vertical-tabs {
  flex: 0 0 200px;
  border-right: $border-width $border-style var(--color-border);
  padding: $spacing-md 0;
  display: flex;
  flex-direction: column;
  background-color: var(--color-surface);
  position: relative;
  box-sizing: border-box;
  max-width: 200px;
  width: 200px;
  
  // Custom scrollbar
  &::-webkit-scrollbar {
    width: 6px;
  }
  
  &::-webkit-scrollbar-track {
    background-color: transparent;
  }
  
  &::-webkit-scrollbar-thumb {
    background-color: var(--color-border);
    border-radius: 3px;
    
    &:hover {
      background-color: var(--color-text-secondary);
    }
  }
}

.tab-button {
  display: flex;
  align-items: center;
  width: auto;
  padding: $spacing-base $spacing-xl;
  border: none;
  border-left: 4px solid transparent;
  background-color: transparent;
  cursor: pointer;
  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  color: var(--color-text-secondary);
  text-align: left;
  text-decoration: none;
  transition: all $transition-base;
  position: relative;
  
  &:hover:not(.disabled) {
    background-color: var(--color-background);
    color: var(--color-text);
    transform: translateX(2px);
  }
  
  &.active {
    color: var(--color-primary);
    background-color: var(--color-background);
    border-left-color: var(--color-primary);
    font-weight: $font-weight-semibold;
    
    &::before {
      content: '';
      position: absolute;
      right: 0;
      top: 50%;
      transform: translateY(-50%);
      width: 0;
      height: 0;
      border-left: 8px solid var(--color-background);
      border-top: 8px solid transparent;
      border-bottom: 8px solid transparent;
    }
  }
  
  &.disabled {
    opacity: 0.5;
    cursor: not-allowed;
    pointer-events: none;
  }
}

.tabs-action-area {
  margin-top: auto;
  padding: $spacing-md;
  border-top: $border-width $border-style var(--color-border);
  display: flex;
  flex-direction: column;
  gap: $spacing-base;
  align-items: center;
}

.save-button {
  width: auto;
  padding: $spacing-sm $spacing-lg;
  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  cursor: pointer;
  border: none;
  border-radius: $border-radius-base;
  background-color: var(--color-primary);
  color: white;
  transition: background-color $transition-base;
  
  &:hover:not(:disabled) {
    background-color: var(--color-primary-dark);
  }
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

#status {
  width: 100%;
  text-align: center;
  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  margin: 0;
  min-height: 1.2em;
  order: -1;
  
  &.status-success {
    color: var(--color-success);
  }
  
  &.status-error {
    color: var(--color-error);
  }
}

// Tablet responsive
@media (max-width: #{$breakpoint-lg}) {
  .vertical-tabs {
    flex: none;
    border-right: none;
    border-bottom: $border-width $border-style var(--color-border);
    flex-direction: row;
    overflow-x: auto;
    padding: $spacing-sm 0;
    width: 100%;
    max-width: none;
    
    .tab-button {
      border-left: none;
      border-bottom: 4px solid transparent;
      white-space: nowrap;
      min-width: 120px;
      
      &.active {
        border-left: none;
        border-bottom-color: var(--color-primary);
      }
    }
  }
}

// Mobile responsive
@media (max-width: #{$breakpoint-md}) {
  .vertical-tabs {
    flex: none;
    border-right: none;
    border-bottom: $border-width $border-style var(--color-border);
    flex-direction: row;
    overflow-x: auto;
    padding: $spacing-sm 0;
    width: 100%;
    max-width: none;
    
    .tab-button {
      flex-shrink: 0;
      border-left: none;
      border-bottom: 4px solid transparent;
      padding: $spacing-sm $spacing-md;
      white-space: nowrap;
      
      &.active {
        border-left-color: transparent;
        border-bottom-color: var(--color-primary);
      }
    }
    
    .tabs-action-area {
      display: none;
    }
  }
}

// RTL specific styles for navigation
:global(.options-layout.rtl) {
  .vertical-tabs {
    border-right: none;
    border-left: $border-width $border-style var(--color-border);
  }
  
  .tab-button {
    text-align: right;
    border-left: none;
    border-right: 4px solid transparent;
    
    &.active {
      border-left-color: transparent;
      border-right-color: var(--color-primary);
    }
  }
  
  .tabs-action-area {
    text-align: right;
  }
}
</style>