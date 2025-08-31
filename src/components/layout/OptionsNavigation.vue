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
import { useSettingsStore } from '@/store/core/settings'
import { getScopedLogger } from '@/utils/core/logger.js'
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js'
import { useUnifiedI18n } from '@/composables/useUnifiedI18n.js'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'OptionsNavigation')

const { t, locale } = useUnifiedI18n()

const settingsStore = useSettingsStore()

// Navigation items, labels are reactive to language changes
const navigationItems = ref([
  { name: 'languages', labelKey: 'languages_tab_title' },
  { name: 'activation', labelKey: 'activation_tab_title' },
  { name: 'prompt', labelKey: 'prompt_tab_title' },
  { name: 'api', labelKey: 'api_tab_title' },
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
@use '@/assets/styles/variables.scss' as *;

.vertical-tabs {
  flex: 0 0 200px;
  border-right: $border-width $border-style var(--color-border);
  padding: $spacing-md 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  background-color: var(--color-background);
}

.tab-button {
  display: flex;
  align-items: center;
  width: 100%;
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
  
  &:hover {
    background-color: var(--color-surface);
  }
  
  &.active {
    color: var(--color-primary);
    background-color: var(--color-surface);
    border-left-color: var(--color-primary);
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

// Mobile responsive
@media (max-width: #{$breakpoint-md}) {
  .vertical-tabs {
    flex: none;
    border-right: none;
    border-bottom: $border-width $border-style var(--color-border);
    flex-direction: row;
    overflow-x: auto;
    padding: $spacing-sm 0;
    
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
    
    #status {
      text-align: right;
    }
  }
  
  // Mobile RTL adjustments
  @media (max-width: #{$breakpoint-md}) {
    .vertical-tabs {
      border-left: none;
    }
    
    .tab-button {
      border-right: none;
      border-bottom: 4px solid transparent;
      text-align: center;
      
      &.active {
        border-right-color: transparent;
        border-bottom-color: var(--color-primary);
      }
    }
  }
}
</style>