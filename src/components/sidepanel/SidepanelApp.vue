<template>
  <div 
    class="sidepanel-container"
    @click="handleContainerClick"
  >
    <!-- Side Toolbar -->
    <SideToolbar
      @select-element="handleSelectElement"
      @revert="handleRevert"
      @clear="handleClear"
      @api-provider="handleApiProvider"
      @history="handleHistory"
      @settings="handleSettings"
    />

    <!-- Content area -->
    <div class="content-area">
      <!-- Main Content -->
      <div class="main-content">
        <TranslationForm
          v-model:source-text="sourceText"
          v-model:source-language="sourceLanguage"
          v-model:target-language="targetLanguage"
          :is-translating="isTranslating"
          @translate="handleTranslate"
          @swap-languages="handleSwapLanguages"
        />

        <TranslationResult
          :result="translationResult"
          :is-loading="isTranslating"
          :error="translationError"
          :target-language="targetLanguage"
        />
      </div>

      <!-- History Panel -->
      <div 
        v-if="showHistoryPanel" 
        class="history-panel show"
      >
        <div class="history-header">
          <h3>{{ t('SIDEPANEL_HISTORY_TITLE', 'Translation History') }}</h3>
          <button 
            class="close-btn"
            @click="showHistoryPanel = false"
          >
            ✕
          </button>
        </div>
        <div class="history-list">
          <!-- History content will be handled by existing HistoryManager -->
          <div
            id="historyList"
            ref="historyListElement"
          />
        </div>
        <div class="history-footer">
          <button
            class="clear-all-btn"
            :title="t('SIDEPANEL_CLEAR_ALL_HISTORY_TOOLTIP', 'Clear All History')"
            @click="handleClearAllHistory"
          >
            <img
              src="@/assets/icons/trash.svg"
              alt="Clear All"
              class="clear-all-icon"
            >
            <span>{{ t('SIDEPANEL_CLEAR_ALL_HISTORY', 'Clear All History') }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- API Provider Dropdown -->
    <div 
      v-if="showApiProviderDropdown"
      ref="apiProviderDropdownElement"
      class="dropdown-menu"
    >
      <!-- Dynamic provider options will be loaded here -->
      <div id="apiProviderDropdown" />
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import SideToolbar from './SideToolbar.vue'
import TranslationForm from './TranslationForm.vue'
import TranslationResult from './TranslationResult.vue'
import { useSidepanelTranslation, useSelectElementTranslation } from '@/features/translation/composables/useTranslationModes.js'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useHistory } from '@/features/history/composables/useHistory.js'
import { useBrowserAPI } from '@/composables/useBrowserAPI.js'
import { useLanguages } from '@/composables/useLanguages.js'
import { useI18n } from '@/composables/useI18n.js'
import { AUTO_DETECT_VALUE } from '@/constants.js'
// (helpers import removed: was empty / invalid)
import { MessageActions } from '@/shared/messaging/core/MessageActions.js'

import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'SidepanelApp');


// Composables
const sidepanelTranslation = useSidepanelTranslation()
const { isSelectModeActive, deactivateSelectMode } = useSelectElementTranslation()
const settingsStore = useSettingsStore()
const history = useHistory()
const browserAPI = useBrowserAPI()
const languages = useLanguages()
const { t } = useI18n()

// Refs
const historyListElement = ref(null)
const apiProviderDropdownElement = ref(null)

// Reactive State
const state = reactive({
  sourceText: '',
  sourceLanguage: 'Auto-Detect',
  targetLanguage: 'English',
  translationResult: null,
  translationError: '',
  isTranslating: false,
  showHistoryPanel: false,
  showApiProviderDropdown: false
})

// Computed getters for template
const sourceText = computed(() => state.sourceText)
const sourceLanguage = computed(() => state.sourceLanguage) 
const targetLanguage = computed(() => state.targetLanguage)
const translationResult = computed(() => state.translationResult)
const translationError = computed(() => state.translationError)
const isTranslating = computed(() => state.isTranslating)
const showHistoryPanel = computed(() => state.showHistoryPanel)
const showApiProviderDropdown = computed(() => state.showApiProviderDropdown)


// Event Handlers
const handleContainerClick = (event) => {
  // If select element mode is active, deactivate it
  if (isSelectModeActive.value) {
    // But not if the click is on the toggle button itself
    if (event.target.closest('#select-element-toggle-button')) {
      return;
    }
    logger.debug('Deactivating select element mode due to sidepanel click');
    deactivateSelectMode();
  }
}

const handleTranslate = async (data) => {
  logger.debug('Translation requested:', data)
  
  state.isTranslating = true
  state.translationError = ''
  state.translationResult = null

  try {
    const result = await sidepanelTranslation.translateText(
      data.text,
      data.sourceLanguage,
      data.targetLanguage
    )

    if (result && result.success) {
      state.translationResult = result
      logger.init('Translation successful')
      
      // The history is now managed by the translation engine
      // No need to add it here manually
      
    } else {
      // Handle Firefox MV3 bug where response is undefined
      if (result?.firefoxBug) {
        logger.debug('Firefox MV3 bug detected. Waiting for history update.')
        // The watcher on history.sortedHistoryItems will handle this
      } else {
        state.translationError = sidepanelTranslation.error.value || 'Translation failed'
        logger.error('Translation failed:', state.translationError)
      }
    }
  } catch (error) {
    state.translationError = error.message || 'Translation error occurred'
    logger.error('Translation error:', error)
  } finally {
    state.isTranslating = false
  }
}

// Watch for history changes to handle Firefox MV3 bug
watch(() => history.sortedHistoryItems, (newHistory) => {
  if (newHistory && newHistory.length > 0) {
    const lastItem = newHistory[0]
    
    // If the last history item matches the current source text, update the result
    if (lastItem.sourceText === state.sourceText && !state.translationResult) {
      logger.debug('Updating translation from history due to watcher trigger.')
      state.translationResult = {
        success: true,
        data: {
          translatedText: lastItem.translatedText,
          detectedSourceLang: lastItem.sourceLanguage
        }
      }
      state.translationError = '' // Clear any potential Firefox bug error message
    }
  }
}, { deep: true })

const handleSwapLanguages = async () => {
  logger.debug('Language swap requested')
  
  const sourceVal = state.sourceLanguage
  const targetVal = state.targetLanguage
  
  // منطق swap مشابه legacy code
  const sourceCode = languages.getLanguagePromptName(sourceVal)
  const targetCode = languages.getLanguagePromptName(targetVal)
  
  let resolvedSourceCode = sourceCode
  let resolvedTargetCode = targetCode
  
  // اگر زبان مبدأ Auto-Detect باشد، از تنظیمات بخوانیم
  if (sourceCode === AUTO_DETECT_VALUE) {
    try {
      await settingsStore.loadSettings()
      resolvedSourceCode = settingsStore.settings.SOURCE_LANGUAGE
    } catch (err) {
      logger.error('Failed to load source language from settings', err)
      resolvedSourceCode = null
    }
  }
  
  if (targetCode === AUTO_DETECT_VALUE) {
    try {
      await settingsStore.loadSettings()
      resolvedTargetCode = settingsStore.settings.TARGET_LANGUAGE
    } catch (err) {
      logger.error('Failed to load target language from settings', err)
      resolvedTargetCode = null
    }
  }
  
  // فقط در صورت معتبر بودن هر دو زبان swap کنیم
  if (resolvedSourceCode && 
      resolvedTargetCode && 
      resolvedSourceCode !== AUTO_DETECT_VALUE) {
    
    const newSourceDisplay = languages.getLanguageDisplayValue(resolvedTargetCode)
    const newTargetDisplay = languages.getLanguageDisplayValue(resolvedSourceCode)
    
    state.sourceLanguage = newSourceDisplay || targetVal
    state.targetLanguage = newTargetDisplay || sourceVal
    
    logger.init('Languages swapped successfully')
  } else {
    logger.debug('Cannot swap - invalid language selection')
  }
}

const handleSelectElement = () => {
  logger.debug('Select element activated')
  // SelectElement logic در composable handle شده
}

const handleRevert = () => {
  logger.debug('Revert requested')
  // Revert logic در composable handle شده
}

const handleClear = () => {
  logger.debug('Clear requested')
  
  // پاک کردن فیلدها
  state.sourceText = ''
  state.translationResult = null
  state.translationError = ''
  state.sourceLanguage = 'Auto-Detect'
  
  // بازیابی زبان مقصد از تنظیمات
  settingsStore.loadSettings().then(() => {
    const targetLangDisplay = languages.getLanguageDisplayValue(settingsStore.settings.TARGET_LANGUAGE)
    state.targetLanguage = targetLangDisplay || 'English'
  })
  
  // پاک کردن lastTranslation از storage
  browserAPI.safeSendMessage({ action: 'clearLastTranslation' })
    .catch(error => logger.error('Failed to clear last translation:', error))
}

const handleApiProvider = () => {
  logger.debug('API provider dropdown toggled')
  state.showApiProviderDropdown = !state.showApiProviderDropdown
}

const handleHistory = () => {
  logger.debug('History panel toggled')
  state.showHistoryPanel = !state.showHistoryPanel
  
  if (state.showHistoryPanel) {
    // Load history content
    nextTick(() => {
      history.loadHistory()
    })
  }
}

const handleSettings = () => {
  logger.debug('Settings requested')
  // Settings button در SideToolbar handle شده
}

const handleClearAllHistory = async () => {
  logger.debug('Clear all history requested')
  
  const success = await history.clearAllHistory()
  if (success) {
    logger.debug('All history cleared')
  }
}

// Message listener برای selectedTextForSidePanel
const handleMessage = (message) => {
  if (message.action === MessageActions.SELECTED_TEXT_FOR_SIDEPANEL) {
    state.sourceText = message.text
    logger.debug('Received selected text:', message.text)
    
    // شروع خودکار ترجمه
    if (state.sourceText.trim() && state.targetLanguage) {
      handleTranslate({
        text: state.sourceText,
        sourceLanguage: state.sourceLanguage,
        targetLanguage: state.targetLanguage
      })
    }
  }
}

// Load last translation
const loadLastTranslation = async () => {
  try {
    await settingsStore.loadSettings()
    const settings = settingsStore.settings
    
    if (settings.lastTranslation) {
      const { sourceText, translatedText, sourceLanguage, targetLanguage } = settings.lastTranslation
      
      if (sourceText) {
        state.sourceText = sourceText
      }
      if (translatedText) {
        state.translationResult = {
          success: true,
          data: { translatedText }
        }
      }
      if (sourceLanguage) {
        const sourceLangDisplay = languages.getLanguageDisplayValue(sourceLanguage)
        if (sourceLangDisplay) {
          state.sourceLanguage = sourceLangDisplay
        }
      }
      if (targetLanguage) {
        const targetLangDisplay = languages.getLanguageDisplayValue(targetLanguage)
        if (targetLangDisplay) {
          state.targetLanguage = targetLangDisplay
        }
      }
    }
  } catch (error) {
    logger.error('Error loading last translation:', error)
  }
}

// Initialize
onMounted(async () => {
  logger.debug('Sidepanel Vue app mounted')
  
  try {
    // بارگذاری تنظیمات اولیه
    await settingsStore.loadSettings()
    const settings = settingsStore.settings
    
    // تنظیم زبان‌های پیش‌فرض
    state.sourceLanguage = 'Auto-Detect'
    const targetLangDisplay = languages.getLanguageDisplayValue(settings.TARGET_LANGUAGE)
    state.targetLanguage = targetLangDisplay || 'English'
    
    // بارگذاری آخرین ترجمه
    await loadLastTranslation()
    
    // ثبت listener برای پیام‌ها
    if (browserAPI.browser?.runtime?.onMessage) {
      browserAPI.browser.runtime.onMessage.addListener.call(browserAPI.browser.runtime.onMessage, handleMessage)
    }
    
    logger.debug('Initialization complete')
  } catch (error) {
    logger.error('Error during initialization:', error)
  }
})

// Cleanup
onUnmounted(() => {
  if (browserAPI.browser?.runtime?.onMessage) {
    browserAPI.browser.runtime.onMessage.removeListener(handleMessage)
  }
  logger.debug('Sidepanel Vue app unmounted')
})
</script>

<style scoped>
.sidepanel-container {
  display: flex;
  height: 100vh;
  background: var(--bg-color);
  color: var(--text-color);
  font-family: "Vazirmatn", "Segoe UI", sans-serif;
  font-size: 15px;
}

.content-area {
  flex-grow: 1;
  position: relative;
  overflow: hidden;
  width: 100%;
  min-width: 0;
}

.main-content {
  width: 100%;
  height: 100%;
  padding: 12px;
  display: flex;
  flex-direction: column;
  overflow-y: hidden;
  box-sizing: border-box;
}

.history-panel {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--bg-color);
  z-index: 10;
  display: none;
  flex-direction: column;
  box-shadow: none;
  width: 100%;
  box-sizing: border-box;
}

.history-panel.show {
  display: flex;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.history-header h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 500;
}

.close-btn {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: var(--text-color);
  padding: 5px;
  line-height: 1;
}

.close-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.history-list {
  flex-grow: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 10px;
  box-sizing: border-box;
}

.history-footer {
  padding: 8px 16px;
  border-top: 1px solid var(--border-color);
}

.clear-all-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--bg-danger);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: background-color 0.2s ease;
}

.clear-all-btn:hover {
  background: var(--bg-danger-hover);
}

.clear-all-icon {
  width: 14px;
  height: 14px;
}

/* Scoped styles for dropdown menu */
.dropdown-menu {
  position: absolute;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  padding: 5px;
  z-index: 200;
  display: none; /* Managed by JS */
  flex-direction: column;
  gap: 5px;
}
</style>