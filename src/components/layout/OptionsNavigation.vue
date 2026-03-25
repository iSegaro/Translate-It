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
</script>

<style lang="scss" scoped>
@use "@/assets/styles/base/variables" as *;

.vertical-tabs {
  flex: 0 0 200px;
  border-right: $border-width $border-style var(--color-border);
  padding: $spacing-sm 0 0 0; /* Restored to 10px (spacing-sm) */
  display: flex;
  flex-direction: column;
  background-color: var(--color-surface);
  position: relative;
  box-sizing: border-box;
  max-width: 200px;
  width: 200px;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  
  // Custom scrollbar
  &::-webkit-scrollbar {
    width: 4px;
  }
  
  &::-webkit-scrollbar-track {
    background-color: transparent;
  }
  
  &::-webkit-scrollbar-thumb {
    background-color: var(--color-border);
    border-radius: 2px;
    
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
  position: sticky;
  bottom: 0;
  background-color: var(--color-surface);
  padding: $spacing-md $spacing-md calc($spacing-md + 45px) $spacing-md;
  border-top: $border-width $border-style var(--color-border);
  display: flex;
  flex-direction: column;
  gap: $spacing-base;
  align-items: center;
  z-index: 5;
}

.save-button {
  width: auto;
  min-width: max-content;
  white-space: nowrap;
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
    padding: $spacing-xs 0;
    width: 100%;
    max-width: none;
    height: auto; /* Reset desktop height */
    position: sticky;
    top: 0;
    z-index: 10;
    background-color: var(--color-surface);
    
    .tab-button {
      border-left: none;
      border-bottom: 3px solid transparent;
      white-space: nowrap;
      padding: $spacing-sm $spacing-md;
      min-width: auto;
      
      &.active {
        border-left: none;
        border-bottom-color: var(--color-primary);
        
        &::before {
          display: none;
        }
      }
    }

    .tabs-action-area {
      display: flex;
      flex-direction: row;
      margin-top: 0;
      border-top: none;
      padding: 0 $spacing-md;
      border-left: $border-width $border-style var(--color-border);
      flex-shrink: 0;
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
    padding: 0;
    width: 100%;
    max-width: none;
    height: auto; /* Reset desktop height */
    position: sticky;
    top: 0;
    z-index: 10;
    background-color: var(--color-surface);
    
    .tab-button {
      flex-shrink: 0;
      border-left: none;
      border-bottom: 3px solid transparent;
      padding: $spacing-md $spacing-md;
      font-size: $font-size-xs;
      
      &.active {
        border-left-color: transparent;
        border-bottom-color: var(--color-primary);
      }
    }
    
    .tabs-action-area {
      position: fixed;
      bottom: 20px; /* Elevated from 0 to clear most nav bars */
      left: 10px;
      right: 10px;
      height: 60px; 
      background: var(--color-surface);
      border: $border-width $border-style var(--color-border); /* Full border since it's floating now */
      border-radius: $border-radius-lg; /* Rounded corners for modern look */
      padding: 0 $spacing-md; 
      z-index: 100;
      flex-direction: row;
      align-items: center; 
      justify-content: space-between;
      box-shadow: 0 4px 15px rgba(0,0,0,0.15);
      margin: 0;
      width: calc(100% - 20px);
      box-sizing: border-box;

      .save-button {
        width: auto;
        min-width: max-content;
        white-space: nowrap;
        padding: $spacing-xs $spacing-lg;
        margin-bottom: 0; 
      }

      #status {
        width: auto;
        order: 0;
        font-size: $font-size-xs;
        margin: 0;
        padding-inline-end: $spacing-sm;
      }
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