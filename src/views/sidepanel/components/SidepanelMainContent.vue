<template>
  <div class="main-content">
    <form id="translationForm">
      <div class="language-controls">
        <select
          id="sourceLanguageInput"
          class="language-select"
          :title="$i18n('SIDEPANEL_SOURCE_LANGUAGE_TITLE')"
        ></select>
        <button
          type="button"
          id="swapLanguagesBtn"
          class="swap-button"
          :title="$i18n('SIDEPANEL_SWAP_LANGUAGES_TITLE')"
        >
          <img src="@assets/icons/swap.png" alt="Swap" />
        </button>

        <select
          id="targetLanguageInput"
          class="language-select"
          :title="$i18n('SIDEPANEL_TARGET_LANGUAGE_TITLE')"
        ></select>
      </div>

      <!-- Source Text Area with Toolbar -->
      <div class="textarea-container source-container">
        <div class="inline-toolbar source-toolbar">
          <img
            src="@assets/icons/copy.png"
            id="copySourceBtn"
            class="inline-icon"
            :title="$i18n('SIDEPANEL_COPY_SOURCE_TITLE_ICON')"
          />
          <img
            src="@assets/icons/speaker.png"
            id="voiceSourceIcon"
            class="inline-icon"
            :title="$i18n('SIDEPANEL_VOICE_SOURCE_TITLE_ICON')"
          />
        </div>
        <img
          src="@assets/icons/paste.png"
          id="pasteSourceBtn"
          class="inline-icon paste-icon-separate"
          :title="$i18n('SIDEPANEL_PASTE_SOURCE_TITLE_ICON')"
        />
        <textarea
          id="sourceText"
          rows="6"
          :placeholder="$i18n('SIDEPANEL_SOURCE_TEXT_PLACEHOLDER')"
        ></textarea>
      </div>

      <!-- Action Bar -->
      <div class="action-bar">
        <button
          type="submit"
          id="translateBtn"
          class="translate-button-main"
        >
          <span :data-i18n="$i18n('SIDEPANEL_TRANSLATE_BUTTON_TEXT')"
            >Translate</span
          >
          <img src="@assets/icons/translate.png" alt="Translate" />
        </button>
      </div>

      <!-- Result Area with Toolbar -->
      <div class="textarea-container result-container">
        <div class="inline-toolbar target-toolbar">
          <img
            src="@assets/icons/copy.png"
            id="copyTargetBtn"
            class="inline-icon"
            :title="$i18n('SIDEPANEL_COPY_TARGET_TITLE_ICON')"
          />
          <img
            src="@assets/icons/speaker.png"
            id="voiceTargetIcon"
            class="inline-icon"
            :title="$i18n('SIDEPANEL_VOICE_TARGET_TITLE_ICON')"
          />
        </div>
        <div id="translationResult" class="result"></div>
      </div>
    </form>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useTranslation } from '@/composables/useTranslation.js'
import { useClipboard } from '@/composables/useClipboard.js'
import { useSidepanelTTS } from '@/composables/useSidepanelTTS.js'
import { useUI } from '@/composables/useUI.js'
import { useHistory } from '@/composables/useHistory.js'
import { useSettingsStore } from '@/store/core/settings.js'
import { languageList } from '@/utils/languages.js'
import { AUTO_DETECT_VALUE } from '@/constants.js'
import { getBrowserAPI } from '@/utils/browser-unified.js'

// Helper functions
const getAllLanguages = async () => {
  return languageList.map(lang => ({
    code: lang.code,
    name: lang.name,
    promptName: lang.promptName,
    voiceCode: lang.voiceCode
  }))
}

const isValidLanguage = (code) => {
  if (code === AUTO_DETECT_VALUE) return true
  return languageList.some(l => l.code === code)
}

// Store
const settingsStore = useSettingsStore()

// Composables
const { 
  sourceText, 
  translationResult, 
  sourceLanguage, 
  targetLanguage,
  isTranslating,
  translationError,
  triggerTranslation,
  swapLanguages,
  clearTranslation,
  setSourceText,
  setSourceLanguage,
  setTargetLanguage
} = useTranslation()

const { 
  copyText, 
  pasteText, 
  handleCopySource, 
  handleCopyTarget 
} = useClipboard()

const { 
  speakText, 
  handleSourceTTS, 
  handleTargetTTS,
  isSpeaking 
} = useSidepanelTTS()

const { 
  showVisualFeedback, 
  toggleInlineToolbarVisibility,
  setupGlobalListeners,
  cleanupGlobalListeners 
} = useUI()

const { addToHistory } = useHistory()

// Template refs
const sourceTextArea = ref(null)
const translationResultDiv = ref(null)
const sourceLanguageSelect = ref(null)
const targetLanguageSelect = ref(null)
const translateButton = ref(null)
const sourceContainer = ref(null)
const resultContainer = ref(null)

// Local state
const allLanguages = ref([])
const isInitialized = ref(false)

// Initialize languages
const initializeLanguages = async () => {
  try {
    allLanguages.value = await getAllLanguages()
    console.log('[SidepanelMainContent] Languages loaded:', allLanguages.value.length)
  } catch (error) {
    console.error('[SidepanelMainContent] Error loading languages:', error)
  }
}

// Populate language dropdowns
const populateLanguageDropdowns = () => {
  if (!sourceLanguageSelect.value || !targetLanguageSelect.value) {
    console.log('[SidepanelMainContent] Dropdown elements not ready')
    return
  }
  
  if (!allLanguages.value.length) {
    console.log('[SidepanelMainContent] No languages loaded yet')
    return
  }

  console.log('[SidepanelMainContent] Populating dropdowns with', allLanguages.value.length, 'languages')

  // Store current selected values before clearing
  const currentSourceValue = sourceLanguageSelect.value.value
  const currentTargetValue = targetLanguageSelect.value.value

  // Clear existing options
  sourceLanguageSelect.value.innerHTML = ''
  targetLanguageSelect.value.innerHTML = ''

  // Add auto-detect option for source
  const autoDetectOption = document.createElement('option')
  autoDetectOption.value = 'Auto Detect'
  autoDetectOption.textContent = 'Auto Detect'
  sourceLanguageSelect.value.appendChild(autoDetectOption)

  // Add all languages to both dropdowns
  allLanguages.value.forEach(lang => {
    // Source language option
    const sourceOption = document.createElement('option')
    sourceOption.value = lang.name
    sourceOption.textContent = lang.name
    sourceLanguageSelect.value.appendChild(sourceOption)

    // Target language option (skip auto-detect)
    if (lang.code !== AUTO_DETECT_VALUE) {
      const targetOption = document.createElement('option')
      targetOption.value = lang.name
      targetOption.textContent = lang.name
      targetLanguageSelect.value.appendChild(targetOption)
    }
  })

  // Set values from composable state (loaded from settings)
  const sourceValue = sourceLanguage.value || currentSourceValue || 'Auto Detect'
  const targetValue = targetLanguage.value || currentTargetValue || 'English'
  
  sourceLanguageSelect.value.value = sourceValue
  targetLanguageSelect.value.value = targetValue

  console.log('[SidepanelMainContent] Dropdowns populated successfully with selections:', {
    source: sourceValue,
    target: targetValue,
    sourceFromComposable: sourceLanguage.value,
    targetFromComposable: targetLanguage.value,
    actualSourceSelected: sourceLanguageSelect.value.value,
    actualTargetSelected: targetLanguageSelect.value.value
  })
}

// Handle form submission
const handleTranslationSubmit = async (event) => {
  event.preventDefault()
  
  const text = sourceTextArea.value?.value?.trim()
  if (!text) {
    showVisualFeedback(sourceTextArea.value, 'error')
    return
  }

  // Update source text in composable
  setSourceText(text)
  
  // Trigger translation
  const success = await triggerTranslation()
  
  if (success) {
    // Add to history
    await addToHistory({
      sourceText: text,
      translatedText: translationResult.value,
      sourceLanguage: sourceLanguage.value,
      targetLanguage: targetLanguage.value
    })
    
    // Show success feedback
    showVisualFeedback(translateButton.value, 'success')
    
    // Update toolbar visibility
    await nextTick()
    toggleInlineToolbarVisibility(resultContainer.value)
  } else {
    showVisualFeedback(translateButton.value, 'error')
  }
}

// Helper function to convert language name to code
const getLanguageCodeByName = (name) => {
  if (name === 'Auto Detect') return AUTO_DETECT_VALUE
  const lang = allLanguages.value.find(l => l.name === name)
  return lang ? lang.code : name
}

// Handle language change
const handleSourceLanguageChange = () => {
  const newValue = sourceLanguageSelect.value?.value
  if (newValue) {
    const languageCode = getLanguageCodeByName(newValue)
    if (isValidLanguage(languageCode)) {
      setSourceLanguage(newValue) // Store the name, not code
    }
  }
}

const handleTargetLanguageChange = () => {
  const newValue = targetLanguageSelect.value?.value
  if (newValue) {
    const languageCode = getLanguageCodeByName(newValue)
    if (isValidLanguage(languageCode)) {
      setTargetLanguage(newValue) // Store the name, not code
    }
  }
}

// Handle language swap
const handleLanguageSwap = async () => {
  const swapped = await swapLanguages()
  if (swapped) {
    // Update dropdowns
    sourceLanguageSelect.value.value = sourceLanguage.value
    targetLanguageSelect.value.value = targetLanguage.value
    
    // Swap text content
    if (translationResult.value && sourceTextArea.value) {
      const currentSource = sourceTextArea.value.value
      const currentResult = translationResultDiv.value?.textContent || ''
      
      sourceTextArea.value.value = currentResult
      setSourceText(currentResult)
    }
    
    showVisualFeedback(document.querySelector('.swap-button'), 'success')
  }
}

// Handle copy operations
const handleCopySourceClick = async () => {
  const text = sourceTextArea.value?.value
  if (text) {
    const success = await handleCopySource(text)
    const element = document.getElementById('copySourceBtn')
    showVisualFeedback(element, success ? 'success' : 'error')
  }
}

const handleCopyTargetClick = async () => {
  const text = translationResultDiv.value?.textContent
  if (text) {
    const success = await handleCopyTarget(text)
    const element = document.getElementById('copyTargetBtn')
    showVisualFeedback(element, success ? 'success' : 'error')
  }
}

// Handle paste operation
const handlePasteClick = async () => {
  const pastedText = await pasteText()
  if (pastedText && sourceTextArea.value) {
    sourceTextArea.value.value = pastedText
    setSourceText(pastedText)
    
    const element = document.getElementById('pasteSourceBtn')
    showVisualFeedback(element, 'success')
    
    // Update toolbar visibility
    toggleInlineToolbarVisibility(sourceContainer.value)
  }
}

// Handle TTS operations
const handleSourceTTSClick = async () => {
  const text = sourceTextArea.value?.value
  if (text) {
    const success = await handleSourceTTS(text, sourceLanguage.value)
    const element = document.getElementById('voiceSourceIcon')
    showVisualFeedback(element, success ? 'success' : 'error')
  }
}

const handleTargetTTSClick = async () => {
  if (translationResultDiv.value) {
    const success = await handleTargetTTS(translationResultDiv.value, targetLanguage.value)
    const element = document.getElementById('voiceTargetIcon')
    showVisualFeedback(element, success ? 'success' : 'error')
  }
}

// Handle text input changes
const handleSourceTextInput = () => {
  const text = sourceTextArea.value?.value || ''
  setSourceText(text)
  toggleInlineToolbarVisibility(sourceContainer.value)
}

// Clear all content
const handleClearAll = () => {
  if (sourceTextArea.value) {
    sourceTextArea.value.value = ''
  }
  clearTranslation()
  
  // Update toolbar visibility
  toggleInlineToolbarVisibility(sourceContainer.value)
  toggleInlineToolbarVisibility(resultContainer.value)
}

// Setup event listeners
const setupEventListeners = () => {
  // Form submission
  const form = document.getElementById('translationForm')
  if (form) {
    form.addEventListener('submit', handleTranslationSubmit)
  }

  // Language dropdowns
  if (sourceLanguageSelect.value) {
    sourceLanguageSelect.value.addEventListener('change', handleSourceLanguageChange)
  }
  if (targetLanguageSelect.value) {
    targetLanguageSelect.value.addEventListener('change', handleTargetLanguageChange)
  }

  // Swap button
  const swapBtn = document.getElementById('swapLanguagesBtn')
  if (swapBtn) {
    swapBtn.addEventListener('click', handleLanguageSwap)
  }

  // Copy buttons
  const copySourceBtn = document.getElementById('copySourceBtn')
  if (copySourceBtn) {
    copySourceBtn.addEventListener('click', handleCopySourceClick)
  }

  const copyTargetBtn = document.getElementById('copyTargetBtn')
  if (copyTargetBtn) {
    copyTargetBtn.addEventListener('click', handleCopyTargetClick)
  }

  // Paste button
  const pasteBtn = document.getElementById('pasteSourceBtn')
  if (pasteBtn) {
    pasteBtn.addEventListener('click', handlePasteClick)
  }

  // TTS buttons
  const voiceSourceBtn = document.getElementById('voiceSourceIcon')
  if (voiceSourceBtn) {
    voiceSourceBtn.addEventListener('click', handleSourceTTSClick)
  }

  const voiceTargetBtn = document.getElementById('voiceTargetIcon')
  if (voiceTargetBtn) {
    voiceTargetBtn.addEventListener('click', handleTargetTTSClick)
  }

  // Source text input
  if (sourceTextArea.value) {
    sourceTextArea.value.addEventListener('input', handleSourceTextInput)
  }
}

// Cleanup event listeners
const cleanupEventListeners = () => {
  const form = document.getElementById('translationForm')
  if (form) {
    form.removeEventListener('submit', handleTranslationSubmit)
  }

  if (sourceLanguageSelect.value) {
    sourceLanguageSelect.value.removeEventListener('change', handleSourceLanguageChange)
  }
  if (targetLanguageSelect.value) {
    targetLanguageSelect.value.removeEventListener('change', handleTargetLanguageChange)
  }

  const swapBtn = document.getElementById('swapLanguagesBtn')
  if (swapBtn) {
    swapBtn.removeEventListener('click', handleLanguageSwap)
  }

  const copySourceBtn = document.getElementById('copySourceBtn')
  if (copySourceBtn) {
    copySourceBtn.removeEventListener('click', handleCopySourceClick)
  }

  const copyTargetBtn = document.getElementById('copyTargetBtn')
  if (copyTargetBtn) {
    copyTargetBtn.removeEventListener('click', handleCopyTargetClick)
  }

  const pasteBtn = document.getElementById('pasteSourceBtn')
  if (pasteBtn) {
    pasteBtn.removeEventListener('click', handlePasteClick)
  }

  const voiceSourceBtn = document.getElementById('voiceSourceIcon')
  if (voiceSourceBtn) {
    voiceSourceBtn.removeEventListener('click', handleSourceTTSClick)
  }

  const voiceTargetBtn = document.getElementById('voiceTargetIcon')
  if (voiceTargetBtn) {
    voiceTargetBtn.removeEventListener('click', handleTargetTTSClick)
  }

  if (sourceTextArea.value) {
    sourceTextArea.value.removeEventListener('input', handleSourceTextInput)
  }
}

// Initialize component
const initialize = async () => {
  try {
    await initializeLanguages()
    await nextTick()
    
    // Get template refs
    sourceTextArea.value = document.getElementById('sourceText')
    translationResultDiv.value = document.getElementById('translationResult')
    sourceLanguageSelect.value = document.getElementById('sourceLanguageInput')
    targetLanguageSelect.value = document.getElementById('targetLanguageInput')
    translateButton.value = document.getElementById('translateBtn')
    sourceContainer.value = document.querySelector('.source-container')
    resultContainer.value = document.querySelector('.result-container')
    
    // Load settings first
    await loadLanguageSettings()
    
    // Wait for DOM and then populate dropdowns
    await nextTick()
    populateLanguageDropdowns()
    
    // Small delay to ensure DOM is updated
    await new Promise(resolve => setTimeout(resolve, 50))
    
    // Set the selected values after population
    if (sourceLanguageSelect.value && targetLanguageSelect.value) {
      const finalSourceValue = sourceLanguage.value || 'Auto Detect'
      const finalTargetValue = targetLanguage.value || 'English'
      
      sourceLanguageSelect.value.value = finalSourceValue
      targetLanguageSelect.value.value = finalTargetValue
      
      // Force a refresh to ensure the selection is visible
      sourceLanguageSelect.value.dispatchEvent(new Event('change'))
      targetLanguageSelect.value.dispatchEvent(new Event('change'))
      
      console.log('[SidepanelMainContent] Final language selections applied:', {
        source: finalSourceValue,
        target: finalTargetValue,
        sourceElement: sourceLanguageSelect.value.value,
        targetElement: targetLanguageSelect.value.value,
        sourceFromComposable: sourceLanguage.value,
        targetFromComposable: targetLanguage.value
      })
    }
    
    setupEventListeners()
    setupGlobalListeners()
    
    isInitialized.value = true
    console.log('[SidepanelMainContent] Component initialized with', allLanguages.value.length, 'languages')
  } catch (error) {
    console.error('[SidepanelMainContent] Initialization error:', error)
  }
}

// Load language settings from store
const loadLanguageSettings = async () => {
  try {
    await settingsStore.loadSettings()
    const settings = settingsStore.settings
    
    // Set source language (default to Auto Detect)
    // Settings are stored as language names, not codes
    const sourceLang = settings.SOURCE_LANGUAGE || 'Auto Detect'
    setSourceLanguage(sourceLang)
    
    // Set target language (default to English)
    const targetLang = settings.TARGET_LANGUAGE || 'English'
    setTargetLanguage(targetLang)
    
    console.log('[SidepanelMainContent] Language settings loaded:', {
      source: sourceLang,
      target: targetLang,
      settingsFormat: 'name-based'
    })
  } catch (error) {
    console.error('[SidepanelMainContent] Error loading language settings:', error)
  }
}

// Watch for translation result changes
watch(translationResult, (newResult) => {
  if (translationResultDiv.value && newResult) {
    translationResultDiv.value.textContent = newResult
    toggleInlineToolbarVisibility(resultContainer.value)
  }
})

// Watch for translation error
watch(translationError, (error) => {
  if (error && translationResultDiv.value) {
    translationResultDiv.value.innerHTML = `<span class="error-message">${error}</span>`
  }
})

// Watch for loading state
watch(isTranslating, (loading) => {
  if (translateButton.value) {
    translateButton.value.disabled = loading
    translateButton.value.classList.toggle('loading', loading)
  }
  
  if (loading && translationResultDiv.value) {
    translationResultDiv.value.innerHTML = '<span class="loading-message">Translating...</span>'
  }
})

// Lifecycle
onMounted(() => {
  initialize()
})

onUnmounted(() => {
  cleanupEventListeners()
  cleanupGlobalListeners()
})
</script>

<style lang="scss" scoped>
@use "@/assets/styles/variables.scss" as *;

.main-content {
  flex-grow: 1;
  padding: $spacing-base;
  overflow-y: auto;
}

#translationForm {
  display: flex;
  flex-direction: column;
  gap: $spacing-base;
}

.language-controls {
  display: flex;
  gap: $spacing-xs;
  align-items: center;
}

.language-select {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid var(--color-border);
  border-radius: $border-radius-sm;
  background-color: var(--color-background);
  color: var(--color-text);
  font-size: $font-size-sm;
}

.swap-button {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;

  img {
    width: 18px;
    height: 18px;
    filter: var(--icon-filter);
  }
}

.textarea-container {
  position: relative;
  border: 1px solid var(--color-border);
  border-radius: $border-radius-sm;
  background-color: var(--color-surface);
  padding: $spacing-xs;
}

textarea {
  width: 100%;
  border: none;
  background: none;
  resize: vertical;
  min-height: 80px;
  font-size: $font-size-base;
  color: var(--color-text);
  padding: $spacing-xs;
  padding-top: $spacing-lg; /* Make space for inline toolbar */

  &:focus {
    outline: none;
  }
}

.result {
  min-height: 80px;
  padding: $spacing-xs;
  padding-top: $spacing-lg; /* Make space for inline toolbar */
  font-size: $font-size-base;
  color: var(--color-text);
  white-space: pre-wrap;
  word-wrap: break-word;
}

.inline-toolbar {
  position: absolute;
  top: $spacing-xs;
  right: $spacing-xs;
  display: flex;
  gap: $spacing-xs;
}

.inline-icon {
  width: 20px;
  height: 20px;
  cursor: pointer;
  filter: var(--icon-filter);
  transition: opacity $transition-fast;

  &:hover {
    opacity: 0.7;
  }
}

.paste-icon-separate {
  position: absolute;
  top: $spacing-xs;
  left: $spacing-xs;
}

.action-bar {
  display: flex;
  justify-content: center;
}

.translate-button-main {
  background-color: var(--color-primary);
  color: white;
  border: none;
  border-radius: $border-radius-sm;
  padding: $spacing-xs $spacing-base;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: $spacing-xs;
  font-size: $font-size-base;
  font-weight: $font-weight-medium;
  transition: background-color $transition-fast;

  &:hover {
    background-color: var(--color-primary-dark);
  }

  img {
    width: 18px;
    height: 18px;
    filter: invert(1);
  }

  &.loading {
    opacity: 0.6;
    cursor: not-allowed;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

// Loading and error states
.loading-message {
  color: var(--color-text-secondary);
  font-style: italic;
  opacity: 0.8;
}

.error-message {
  color: var(--color-error);
  font-size: $font-size-sm;
}

// Visual feedback states
.feedback-success {
  background-color: rgba(76, 175, 80, 0.1);
  transition: background-color $transition-fast;
}

.feedback-error {
  background-color: rgba(244, 67, 54, 0.1);
  transition: background-color $transition-fast;
}

// Toolbar visibility based on content
.textarea-container.has-content {
  .inline-toolbar {
    opacity: 1;
  }
}

.textarea-container:not(.has-content) {
  .inline-toolbar {
    opacity: 0.3;
  }
}
</style>
