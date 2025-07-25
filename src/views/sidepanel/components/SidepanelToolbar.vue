<template>
  <div class="side-toolbar">
    <div class="toolbar-group">
      <button
        id="selectElementBtn"
        class="toolbar-button"
        :title="$i18n('SIDEPANEL_SELECT_ELEMENT_TOOLTIP')"
      >
        <img
          src="@/assets/icons/select.png"
          alt="Select Element"
          class="toolbar-icon"
        />
      </button>
      <button
        id="revertActionBtn"
        class="toolbar-button"
        :title="$i18n('SIDEPANEL_REVERT_TOOLTIP')"
      >
        <img src="@/assets/icons/revert.png" alt="Revert" class="toolbar-icon" />
      </button>
      <button
        id="clearFieldsBtn"
        class="toolbar-button"
        :title="$i18n('SIDEPANEL_CLEAR_STORAGE_TITLE_ICON')"
      >
        <img
          src="@/assets/icons/clear.png"
          alt="Clear Fields"
          class="toolbar-icon"
        />
      </button>

      <div class="toolbar-separator"></div>

      <button
        id="apiProviderBtn"
        class="toolbar-button"
        :title="$i18n('SIDEPANEL_API_PROVIDER_TOOLTIP')"
      >
        <img
          id="apiProviderIcon"
          :src="apiProviderIconSrc"
          alt="API Provider"
          class="toolbar-icon"
        />
      </button>
      <button
        id="historyBtn"
        class="toolbar-button"
        :title="$i18n('SIDEPANEL_HISTORY_TOOLTIP')"
      >
        <img
          src="@assets/icons/history.svg"
          alt="History"
          class="toolbar-icon"
        />
      </button>
    </div>
    <div class="toolbar-group-bottom">
      <button
        id="settingsBtn"
        class="toolbar-button"
        :title="$i18n('SIDEPANEL_SETTINGS_TITLE_ICON')"
      >
        <img
          src="@assets/icons/settings.png"
          alt="Settings"
          class="toolbar-icon"
        />
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useUI } from '@/composables/useUI.js'
import { useApiProvider } from '@/composables/useApiProvider.js'
import { useHistory } from '@/composables/useHistory.js'
import { getBrowserAPI } from '@/utils/browser-unified.js'

// Import icons statically to ensure they're bundled
import googleIcon from '@/assets/icons/api-providers/google.svg'
import geminiIcon from '@/assets/icons/api-providers/gemini.svg'
import openaiIcon from '@/assets/icons/api-providers/openai.svg'
import bingIcon from '@/assets/icons/api-providers/bing.svg'
import yandexIcon from '@/assets/icons/api-providers/yandex.svg'
import customIcon from '@/assets/icons/api-providers/custom.svg'
import providerIcon from '@/assets/icons/api-providers/provider.svg'
import chromeTranslateIcon from '@/assets/icons/api-providers/chrome-translate.svg'
import deepseekIcon from '@/assets/icons/api-providers/deepseek.svg'
import openrouterIcon from '@/assets/icons/api-providers/openrouter.svg'
import webaiIcon from '@/assets/icons/api-providers/webai.svg'

const props = defineProps({
  isApiDropdownVisible: {
    type: Boolean,
    default: false
  },
  isHistoryVisible: {
    type: Boolean,
    default: false
  }
})

// Emits
const emit = defineEmits(['historyToggle', 'apiDropdownToggle'])

// Composables
const { 
  showVisualFeedback,
  toggleElementSelection,
  isSelectElementModeActive
} = useUI()

const { 
  currentProviderIcon,
  currentProviderName,
  toggleDropdown: toggleApiDropdown,
  isDropdownOpen: isApiDropdownOpen
} = useApiProvider()

const { 
  toggleHistoryPanel,
  isHistoryPanelOpen 
} = useHistory()

// Template refs
const apiProviderIcon = ref(null)

// Icon mapping
const iconMap = {
  'google.svg': googleIcon,
  'gemini.svg': geminiIcon,
  'openai.svg': openaiIcon,
  'bing.svg': bingIcon,
  'yandex.svg': yandexIcon,
  'custom.svg': customIcon,
  'provider.svg': providerIcon,
  'chrome-translate.svg': chromeTranslateIcon,
  'deepseek.svg': deepseekIcon,
  'openrouter.svg': openrouterIcon,
  'webai.svg': webaiIcon
}

// Computed properties
const apiProviderIconSrc = computed(() => {
  if (currentProviderIcon.value) {
    // Extract filename from path like "icons/api-providers/google.svg"
    const filename = currentProviderIcon.value.split('/').pop()
    return iconMap[filename] || googleIcon
  }
  return googleIcon
})

// Handle select element button click
const handleSelectElement = async () => {
  try {
    toggleElementSelection()
    
    const browser = await getBrowserAPI()
    await browser.runtime.sendMessage({
      action: 'startElementSelection'
    })
    
    const button = document.getElementById('selectElementBtn')
    showVisualFeedback(button, 'success')
    
    console.log('[SidepanelToolbar] Element selection mode activated')
  } catch (error) {
    console.error('[SidepanelToolbar] Error activating element selection:', error)
    const button = document.getElementById('selectElementBtn')
    showVisualFeedback(button, 'error')
  }
}

// Handle revert action button click
const handleRevertAction = async () => {
  try {
    const browser = await getBrowserAPI()
    await browser.runtime.sendMessage({
      action: 'revertLastAction'
    })
    
    const button = document.getElementById('revertActionBtn')
    showVisualFeedback(button, 'success')
    
    console.log('[SidepanelToolbar] Last action reverted')
  } catch (error) {
    console.error('[SidepanelToolbar] Error reverting action:', error)
    const button = document.getElementById('revertActionBtn')
    showVisualFeedback(button, 'error')
  }
}

// Handle clear fields button click
const handleClearFields = () => {
  try {
    // Clear source text area
    const sourceTextArea = document.getElementById('sourceText')
    if (sourceTextArea) {
      sourceTextArea.value = ''
    }
    
    // Clear translation result
    const translationResult = document.getElementById('translationResult')
    if (translationResult) {
      translationResult.textContent = ''
    }
    
    // Update toolbar visibility for containers
    const sourceContainer = document.querySelector('.source-container')
    const resultContainer = document.querySelector('.result-container')
    
    if (sourceContainer) {
      sourceContainer.classList.remove('has-content')
    }
    if (resultContainer) {
      resultContainer.classList.remove('has-content')
    }
    
    const button = document.getElementById('clearFieldsBtn')
    showVisualFeedback(button, 'success')
    
    console.log('[SidepanelToolbar] Fields cleared')
  } catch (error) {
    console.error('[SidepanelToolbar] Error clearing fields:', error)
    const button = document.getElementById('clearFieldsBtn')
    showVisualFeedback(button, 'error')
  }
}

// Handle API provider button click
const handleApiProviderClick = () => {
  try {
    emit('apiDropdownToggle', !props.isApiDropdownVisible)
    
    const button = document.getElementById('apiProviderBtn')
    showVisualFeedback(button, 'success', 300)
    
    console.log('[SidepanelToolbar] API provider dropdown toggled:', !props.isApiDropdownVisible)
  } catch (error) {
    console.error('[SidepanelToolbar] Error toggling API provider dropdown:', error)
  }
}

// Handle history button click
const handleHistoryClick = () => {
  try {
    emit('historyToggle', !props.isHistoryVisible)
    
    const button = document.getElementById('historyBtn')
    showVisualFeedback(button, 'success', 300)
    
    console.log('[SidepanelToolbar] History panel toggled:', !props.isHistoryVisible)
  } catch (error) {
    console.error('[SidepanelToolbar] Error toggling history panel:', error)
  }
}

// Handle settings button click
const handleSettingsClick = async () => {
  try {
    const browser = await getBrowserAPI()
    await browser.runtime.openOptionsPage()
    
    const button = document.getElementById('settingsBtn')
    showVisualFeedback(button, 'success')
    
    console.log('[SidepanelToolbar] Settings opened')
  } catch (error) {
    console.error('[SidepanelToolbar] Error opening settings:', error)
    const button = document.getElementById('settingsBtn')
    showVisualFeedback(button, 'error')
  }
}

// Setup event listeners
const setupEventListeners = () => {
  const selectElementBtn = document.getElementById('selectElementBtn')
  if (selectElementBtn) {
    selectElementBtn.addEventListener('click', handleSelectElement)
  }

  const revertActionBtn = document.getElementById('revertActionBtn')
  if (revertActionBtn) {
    revertActionBtn.addEventListener('click', handleRevertAction)
  }

  const clearFieldsBtn = document.getElementById('clearFieldsBtn')
  if (clearFieldsBtn) {
    clearFieldsBtn.addEventListener('click', handleClearFields)
  }

  const apiProviderBtn = document.getElementById('apiProviderBtn')
  if (apiProviderBtn) {
    apiProviderBtn.addEventListener('click', handleApiProviderClick)
  }

  const historyBtn = document.getElementById('historyBtn')
  if (historyBtn) {
    historyBtn.addEventListener('click', handleHistoryClick)
  }

  const settingsBtn = document.getElementById('settingsBtn')
  if (settingsBtn) {
    settingsBtn.addEventListener('click', handleSettingsClick)
  }
}

// Cleanup event listeners
const cleanupEventListeners = () => {
  const selectElementBtn = document.getElementById('selectElementBtn')
  if (selectElementBtn) {
    selectElementBtn.removeEventListener('click', handleSelectElement)
  }

  const revertActionBtn = document.getElementById('revertActionBtn')
  if (revertActionBtn) {
    revertActionBtn.removeEventListener('click', handleRevertAction)
  }

  const clearFieldsBtn = document.getElementById('clearFieldsBtn')
  if (clearFieldsBtn) {
    clearFieldsBtn.removeEventListener('click', handleClearFields)
  }

  const apiProviderBtn = document.getElementById('apiProviderBtn')
  if (apiProviderBtn) {
    apiProviderBtn.removeEventListener('click', handleApiProviderClick)
  }

  const historyBtn = document.getElementById('historyBtn')
  if (historyBtn) {
    historyBtn.removeEventListener('click', handleHistoryClick)
  }

  const settingsBtn = document.getElementById('settingsBtn')
  if (settingsBtn) {
    settingsBtn.removeEventListener('click', handleSettingsClick)
  }
}

// Update API provider icon
const updateApiProviderIcon = () => {
  const iconElement = document.getElementById('apiProviderIcon')
  if (iconElement && currentProviderIcon.value) {
    iconElement.src = currentProviderIcon.value
    iconElement.alt = currentProviderName.value || 'API Provider'
  }
}

// Initialize component
const initialize = () => {
  try {
    apiProviderIcon.value = document.getElementById('apiProviderIcon')
    updateApiProviderIcon()
    setupEventListeners()
    
    console.log('[SidepanelToolbar] Component initialized')
  } catch (error) {
    console.error('[SidepanelToolbar] Initialization error:', error)
  }
}

// Watch for API provider changes
watch(currentProviderIcon, () => {
  updateApiProviderIcon()
})

// Watch for element selection mode changes
watch(isSelectElementModeActive, (active) => {
  const button = document.getElementById('selectElementBtn')
  if (button) {
    button.classList.toggle('active', active)
  }
})

// Watch for API dropdown state changes
watch(() => props.isApiDropdownVisible, (open) => {
  const button = document.getElementById('apiProviderBtn')
  if (button) {
    button.classList.toggle('active', open)
    console.log('[SidepanelToolbar] API dropdown visibility changed to:', open, '-> button active state:', button.classList.contains('active'))
  }
})

// Watch for history panel state changes
watch(() => props.isHistoryVisible, (open) => {
  const button = document.getElementById('historyBtn')
  if (button) {
    button.classList.toggle('active', open)
    console.log('[SidepanelToolbar] History panel visibility changed to:', open, '-> button active state:', button.classList.contains('active'))
  }
})

// Lifecycle
onMounted(() => {
  initialize()
})

onUnmounted(() => {
  cleanupEventListeners()
})
</script>

<style lang="scss" scoped>
@use "@/assets/styles/variables.scss" as *;

.side-toolbar {
  width: 38px;
  background-color: var(--color-surface-alt);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  border-right: 1px solid var(--color-border);
  flex-shrink: 0;
  z-index: 20;
  position: relative;
}

.toolbar-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 15px;
}

.toolbar-group-bottom {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 15px;
}

.toolbar-button {
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: var(--color-background);
  }

  &.active {
    background-color: var(--color-primary);
    
    .toolbar-icon {
      filter: invert(1);
    }
  }
}

.toolbar-icon {
  width: 18px;
  height: 18px;
  filter: var(--icon-filter);
}

.toolbar-separator {
  width: 80%;
  height: 1px;
  background-color: var(--color-border);
  margin: $spacing-xs 0;
}
</style>