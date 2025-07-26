<template>
  <div class="main-content">
    <form @submit.prevent="handleTranslationSubmit">
      <div class="language-controls">
        <select
          id="sourceLanguageInput"
          class="language-select"
          title="Source Language"
        >
          <option value="auto">Auto-Detect</option>
          <option value="English">English</option>
          <option value="Persian">Persian</option>
          <option value="Arabic">Arabic</option>
          <option value="French">French</option>
          <option value="German">German</option>
          <option value="Spanish">Spanish</option>
        </select>
        
        <button
          type="button"
          id="swapLanguagesBtn"
          class="swap-button"
          title="Swap Languages"
          @click="handleSwapLanguages"
        >
          <img src="@/assets/icons/swap.png" alt="Swap" />
        </button>

        <select
          id="targetLanguageInput"
          class="language-select"
          title="Target Language"
        >
          <option value="English">English</option>
          <option value="Persian" selected>Persian</option>
          <option value="Arabic">Arabic</option>
          <option value="French">French</option>
          <option value="German">German</option>
          <option value="Spanish">Spanish</option>
        </select>
      </div>

      <!-- Select Element Status -->
      <div v-if="isSelecting" class="selection-status">
        <div class="selection-indicator">
          <div class="selection-spinner"></div>
          <span>{{ t('SELECT_ELEMENT_ACTIVE_MESSAGE', 'Click on any element on the webpage to translate...') }}</span>
        </div>
      </div>

      <!-- Source Text Area with Toolbar -->
      <div 
        class="textarea-container source-container" 
        :class="{ 'has-content': hasSourceContent, 'selection-mode': isSelecting }"
      >
        <div class="inline-toolbar source-toolbar">
          <img
            src="@/assets/icons/copy.png"
            id="copySourceBtn"
            class="inline-icon"
            title="Copy Source Text"
            @click="copySourceText"
          />
          <img
            src="@/assets/icons/speaker.png"
            id="voiceSourceIcon"
            class="inline-icon"
            title="Speak Source Text"
            @click="speakSourceText"
          />
        </div>
        <img
          src="@/assets/icons/paste.png"
          id="pasteSourceBtn"
          class="inline-icon paste-icon-separate"
          title="Paste Source Text"
          v-show="showPasteButton"
          @click="pasteSourceText"
        />
        <textarea
          id="sourceText"
          rows="6"
          placeholder="Enter text to translate..."
          v-model="sourceText"
          @input="handleSourceTextInput"
        ></textarea>
      </div>

      <!-- Action Bar -->
      <div class="action-bar">
        <button
          type="submit"
          class="translate-button-main"
          :disabled="!sourceText.trim()"
        >
          <span>{{ showSpinner ? 'Translating...' : 'Translate' }}</span>
          <img src="@/assets/icons/translate.png" alt="Translate" />
        </button>
      </div>

      <!-- Result Area with Toolbar -->
      <div 
        class="textarea-container result-container"
        :class="{ 'has-content': hasTranslationContent }"
      >
        <div class="inline-toolbar target-toolbar">
          <img
            src="@/assets/icons/copy.png"
            id="copyTargetBtn"
            class="inline-icon"
            title="Copy Translation"
            @click="copyTranslationText"
          />
          <img
            src="@/assets/icons/speaker.png"
            id="voiceTargetIcon"
            class="inline-icon"
            title="Speak Translation"
            @click="speakTranslationText"
          />
        </div>
        <div
          id="translationResult"  
          class="result"
          :class="{ 'has-error': translationError, 'fade-in': translationResult && !showSpinner }"
          data-i18n-placeholder="Translation will appear here..."
        >
          <div v-if="showSpinner" class="spinner-center">
            <div class="spinner"></div>
          </div>
          <template v-else>
            {{ translationError || translationResult || '' }}
          </template>
        </div>
      </div>
    </form>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useBrowserAPI } from '@/composables/useBrowserAPI.js'
import { useTTSSmart } from '@/composables/useTTSSmart.js'
import { useBackgroundWarmup } from '@/composables/useBackgroundWarmup.js'
import { useDirectMessage } from '@/composables/useDirectMessage.js'
import { useSelectElementTranslation } from '@/composables/useSelectElementTranslation.js'
import { getSourceLanguageAsync, getTargetLanguageAsync } from '@/config.js'
import { useI18n } from '@/composables/useI18n.js'

// Browser API, TTS, Background Warmup, Direct Message, Select Element, and i18n
const browserAPI = useBrowserAPI()
const tts = useTTSSmart()
const backgroundWarmup = useBackgroundWarmup()
const directMessage = useDirectMessage()
const selectElement = useSelectElementTranslation()
const { t } = useI18n()

// Simple state
const sourceText = ref('')
const translationResult = ref('')
const translationError = ref('')
const isTranslating = ref(false)
const showPasteButton = ref(true)
const showSpinner = ref(false)
const currentAbortController = ref(null)

// Computed properties for UI state
const hasSourceContent = computed(() => {
  return sourceText.value.trim().length > 0
})

const hasTranslationContent = computed(() => {
  return (translationResult.value || translationError.value || '').trim().length > 0
})

// Select Element computed properties
const isSelecting = computed(() => selectElement.isSelecting.value)
const isSelectElementActivating = computed(() => selectElement.isActivating.value)

// Handle form submission with request cancellation
const handleTranslationSubmit = async () => {
  console.log('[SidepanelMainContent] Translation submit started')
  
  if (!sourceText.value.trim()) {
    console.warn('[SidepanelMainContent] No source text provided')
    return
  }

  const targetLanguage = document.getElementById('targetLanguageInput')?.value
  if (!targetLanguage) {
    console.warn('[SidepanelMainContent] No target language selected')
    return
  }

  // Cancel previous request if exists
  if (currentAbortController.value) {
    console.log('[SidepanelMainContent] Cancelling previous translation request')
    currentAbortController.value.abort()
  }

  // Create new abort controller for this request
  currentAbortController.value = new AbortController()
  const abortSignal = currentAbortController.value.signal

  try {
    isTranslating.value = true
    translationError.value = ''
    translationResult.value = ''
    showSpinner.value = true
    
    console.log('[SidepanelMainContent] Ensuring background script is ready...')
    await backgroundWarmup.ensureWarmedUp()
    
    // Check if request was cancelled during warmup
    if (abortSignal.aborted) {
      console.log('[SidepanelMainContent] Request aborted during warmup')
      return
    }
    
    console.log('[SidepanelMainContent] Sending translation request:', {
      sourceText: sourceText.value.substring(0, 50) + '...',
      targetLanguage
    })

    // Send translation request with abort signal
    const response = await directMessage.sendTranslation({
      promptText: sourceText.value,
      sourceLanguage: 'auto',
      targetLanguage: targetLanguage,
      translateMode: 'sidepanel'
    }, abortSignal)

    // Check if request was cancelled before processing response
    if (abortSignal.aborted) {
      console.log('[SidepanelMainContent] Request aborted before processing response')
      return
    }

    console.log('[SidepanelMainContent] Translation response:', response)

    if (response._isConnectionError) {
      throw new Error('Translation service temporarily unavailable')
    }

    if (response.success && response.data?.translatedText) {
      translationResult.value = response.data.translatedText
      console.log('[SidepanelMainContent] Translation displayed successfully')
    } else {
      throw new Error(response.error || 'Translation failed')
    }

  } catch (error) {
    // Don't show error if request was cancelled
    if (error.name === 'AbortError' || abortSignal.aborted) {
      console.log('[SidepanelMainContent] Translation request was cancelled')
      return
    }
    
    console.error('[SidepanelMainContent] Translation failed:', error)
    translationError.value = error.message || 'Translation failed'
  } finally {
    // Only cleanup if this is still the current request
    if (currentAbortController.value?.signal === abortSignal) {
      showSpinner.value = false
      isTranslating.value = false
      currentAbortController.value = null
    }
  }
}

// Copy source text to clipboard
const copySourceText = async () => {
  try {
    await navigator.clipboard.writeText(sourceText.value)
    console.log('[SidepanelMainContent] Source text copied to clipboard')
  } catch (error) {
    console.error('[SidepanelMainContent] Failed to copy source text:', error)
  }
}

// Copy translation text to clipboard
const copyTranslationText = async () => {
  try {
    await navigator.clipboard.writeText(translationResult.value)
    console.log('[SidepanelMainContent] Translation copied to clipboard')
  } catch (error) {
    console.error('[SidepanelMainContent] Failed to copy translation:', error)
  }
}

// Paste text into source textarea
const pasteSourceText = async () => {
  try {
    const text = await navigator.clipboard.readText()
    sourceText.value = text
    // Trigger input event to update reactive properties
    handleSourceTextInput()
    console.log('[SidepanelMainContent] Text pasted from clipboard')
  } catch (error) {
    console.error('[SidepanelMainContent] Failed to paste text:', error)
  }
}

// Handle source text input to update toolbar visibility
const handleSourceTextInput = () => {
  // Reactive hasSourceContent will automatically handle toolbar visibility
  // This is called on input events
}

// Check clipboard for paste button visibility
const checkClipboard = async () => {
  try {
    console.log('[SidepanelMainContent] Checking clipboard...')
    const text = await navigator.clipboard.readText()
    const hasContent = text.trim().length > 0
    console.log('[SidepanelMainContent] Clipboard content exists:', hasContent, 'Length:', text.length)
    showPasteButton.value = hasContent
    console.log('[SidepanelMainContent] showPasteButton set to:', showPasteButton.value)
  } catch (error) {
    console.log('[SidepanelMainContent] Clipboard check failed:', error.message)
    // Fallback: show button always if permission denied
    showPasteButton.value = true
    console.log('[SidepanelMainContent] Fallback: showPasteButton set to true')
  }
}

// Listen for focus events to update paste button
const handleFocus = () => {
  checkClipboard()
}

// Helper function to convert language name to simple language code for Google TTS
const getLanguageCode = (languageName) => {
  const languageMap = {
    'English': 'en',
    'Persian': 'fa', 
    'Arabic': 'ar',
    'French': 'fr',
    'German': 'de',
    'Spanish': 'es',
    'Chinese': 'zh',
    'Hindi': 'hi',
    'Portuguese': 'pt',
    'Russian': 'ru',
    'Japanese': 'ja',
    'Korean': 'ko',
    'Italian': 'it',
    'Dutch': 'nl',
    'Turkish': 'tr',
    'auto': 'en'
  }
  
  return languageMap[languageName] || 'en'
}

// Speak source text using TTS
const speakSourceText = async () => {
  const sourceLanguage = document.getElementById('sourceLanguageInput')?.value || 'auto'
  const langCode = getLanguageCode(sourceLanguage)
  await tts.speak(sourceText.value, langCode)
  console.log('[SidepanelMainContent] Source text TTS started with language:', langCode)
}

// Speak translation text using TTS  
const speakTranslationText = async () => {
  const targetLanguage = document.getElementById('targetLanguageInput')?.value || 'auto'
  const langCode = getLanguageCode(targetLanguage)
  await tts.speak(translationResult.value, langCode)
  console.log('[SidepanelMainContent] Translation TTS started with language:', langCode)
}

// Handle language swap functionality
const handleSwapLanguages = async () => {
  try {
    const sourceSelect = document.getElementById('sourceLanguageInput')
    const targetSelect = document.getElementById('targetLanguageInput')
    
    if (!sourceSelect || !targetSelect) {
      console.error('[SidepanelMainContent] Language select elements not found')
      return
    }

    let sourceVal = sourceSelect.value
    let targetVal = targetSelect.value
    
    // Get language codes - for simplification we use the values directly
    let sourceCode = getLanguageCode(sourceVal)
    let targetCode = getLanguageCode(targetVal)
    
    let resolvedSourceCode = sourceCode
    let resolvedTargetCode = targetCode
    
    // If source is "auto-detect", try to get actual source language from settings
    if (sourceCode === 'auto' || sourceVal === 'auto') {
      try {
        resolvedSourceCode = await getSourceLanguageAsync()
        console.log('[SidepanelMainContent] Resolved source language from settings:', resolvedSourceCode)
      } catch (err) {
        console.error('[SidepanelMainContent] Failed to load source language from settings:', err)
        resolvedSourceCode = null
      }
    }
    
    // In case target is somehow auto (shouldn't happen but for robustness)
    if (targetCode === 'auto' || targetVal === 'auto') {
      try {
        resolvedTargetCode = await getTargetLanguageAsync()
        console.log('[SidepanelMainContent] Resolved target language from settings:', resolvedTargetCode)
      } catch (err) {
        console.error('[SidepanelMainContent] Failed to load target language from settings:', err)
        resolvedTargetCode = null
      }
    }
    
    // Only proceed if both languages are valid and source is not auto-detect
    if (
      resolvedSourceCode &&
      resolvedTargetCode &&
      resolvedSourceCode !== 'auto'
    ) {
      // Get display names for the resolved languages
      const newSourceDisplay = getLanguageDisplayName(resolvedTargetCode)
      const newTargetDisplay = getLanguageDisplayName(resolvedSourceCode)
      
      // Swap the language values
      sourceSelect.value = newSourceDisplay || targetVal
      targetSelect.value = newTargetDisplay || sourceVal
      
      console.log('[SidepanelMainContent] Languages swapped successfully')
      
    } else {
      // Cannot swap - provide feedback
      console.log('[SidepanelMainContent] Cannot swap - invalid language selection', {
        resolvedSourceCode,
        resolvedTargetCode
      })
      // Could add visual feedback here like in the OLD implementation
    }
    
  } catch (error) {
    console.error('[SidepanelMainContent] Error swapping languages:', error)
  }
}

// Helper function to get display name for language code
const getLanguageDisplayName = (langCode) => {
  const languageMap = {
    'en': 'English',
    'fa': 'Persian', 
    'ar': 'Arabic',
    'fr': 'French',
    'de': 'German',
    'es': 'Spanish',
    'zh': 'Chinese',
    'hi': 'Hindi',
    'pt': 'Portuguese',
    'ru': 'Russian',
    'ja': 'Japanese',
    'ko': 'Korean',
    'it': 'Italian',
    'nl': 'Dutch',
    'tr': 'Turkish'
  }
  
  return languageMap[langCode] || langCode
}

// Select Element integration - auto-populate form
const handleTextExtracted = (extractedText, elementData) => {
  console.log('[SidepanelMainContent] Text extracted from element:', extractedText)
  
  // Populate source text
  sourceText.value = extractedText
  
  // Clear previous translation and error
  translationResult.value = ''
  translationError.value = ''
  
  // Optional: Auto-trigger translation
  // You can add a setting for this later
  // if (settings.autoTranslateOnSelection) {
  //   handleTranslationSubmit()
  // }
}

// Lifecycle - setup event listeners
onMounted(() => {
  // Initial clipboard check
  checkClipboard()
  
  // Add focus listener for clipboard updates
  document.addEventListener('focus', handleFocus, true)
  window.addEventListener('focus', handleFocus)
  
  // Setup Select Element text extraction handler
  selectElement.onTextExtracted.value = handleTextExtracted
  
  console.log('[SidepanelMainContent] Component mounted with Select Element integration')
})

onUnmounted(() => {
  // Clean up event listeners
  document.removeEventListener('focus', handleFocus, true)
  window.removeEventListener('focus', handleFocus)
  
  // Cancel any pending translation request
  if (currentAbortController.value) {
    currentAbortController.value.abort()
    currentAbortController.value = null
  }
})
</script>

<style scoped>
.main-content {
  width: 100%;
  height: 100%;
  padding: 12px;
  display: flex;
  flex-direction: column;
  overflow-y: hidden;
  box-sizing: border-box;
}

/* Select Element Status Styling */
.selection-status {
  background: var(--accent-primary);
  color: var(--text-on-accent);
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 12px;
  animation: pulse 2s ease-in-out infinite;
}

.selection-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  font-size: 14px;
  font-weight: 500;
}

.selection-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--text-on-accent);
  border-top: 2px solid transparent;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.8; }
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* Selection Mode Styling */
.textarea-container.selection-mode {
  opacity: 0.7;
  pointer-events: none;
}

.textarea-container.selection-mode textarea {
  background: var(--bg-secondary);
  border-color: var(--border-color);
}

form {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  width: 100%;
}

/* Language Controls */
.language-controls {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-bottom: 12px;
  flex-shrink: 0;
  flex-wrap: wrap;
  width: 100%;
  box-sizing: border-box;
}

.language-select {
  flex-grow: 1;
  flex-basis: 120px;
  min-width: 0;
  padding: 8px 10px;
  font-size: 14px;
  border: 1px solid var(--border-color, #dee2e6);
  border-radius: 4px;
  background-color: var(--bg-secondary, #ffffff);
  color: var(--text-color, #212529);
  box-sizing: border-box;
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
  background-image: url('data:image/svg+xml;charset=US-ASCII,<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>');
  background-repeat: no-repeat;
  background-position: right 10px center;
  background-size: 16px;
  padding-right: 30px;
  filter: var(--icon-filter, none);
}

html[dir="rtl"] .language-select {
  background-position: left 10px center;
  padding-right: 10px;
  padding-left: 30px;
}

.swap-button {
  background: none;
  border: none;
  cursor: pointer;
  padding: 5px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.swap-button:hover {
  background-color: var(--toolbar-button-hover-bg, #dcdfe2);
}

.swap-button img {
  width: 16px;
  height: 16px;
  filter: var(--icon-filter, none);
}

/* Textarea Container */
.textarea-container {
  position: relative;
  display: flex;
  width: 100%;
  box-sizing: border-box;
}

.textarea-container.source-container {
  margin-bottom: 10px;
  flex-shrink: 0;
}

/* Source textarea - Match OLD implementation */
textarea#sourceText {
  width: 100%;
  height: 140px;
  resize: none;
  box-sizing: border-box;
  padding-top: 32px;
  padding-bottom: 12px;
  padding-inline-start: 14px;
  padding-inline-end: 14px;
  border: 1px solid var(--border-color, #dee2e6);
  border-radius: 5px;
  background-color: var(--bg-secondary, #ffffff);
  color: var(--text-color, #212529);
  font-family: inherit;
  font-size: 15px;
  line-height: 1.7;
  direction: ltr;
  text-align: left;
  min-width: 0;
}

/* Action Bar */
.action-bar {
  display: flex;
  justify-content: center;
  margin-bottom: 10px;
  flex-shrink: 0;
}

.translate-button-main {
  background-color: var(--primary-color, #007bff);
  color: white;
  border: none;
  border-radius: 5px;
  padding: 10px 20px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: background-color 0.2s ease;
}

.translate-button-main:hover:not(:disabled) {
  background-color: var(--primary-color-hover, #0056b3);
}

.translate-button-main:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

.translate-button-main img {
  width: 18px;
  height: 18px;
}

/* Result container */
.textarea-container.result-container {
  flex-grow: 1;
  min-height: 0;
  border: 1px solid var(--border-color, #dee2e6);
  border-radius: 5px;
  background-color: var(--bg-secondary, #ffffff);
  display: flex;
  flex-direction: column;
  width: 100%;
  box-sizing: border-box;
  overflow: hidden;
}

.result {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding-top: 32px;
  padding-bottom: 12px;
  padding-inline-start: 14px;
  padding-inline-end: 14px;
  color: var(--text-color, #212529);
  font-family: inherit;
  font-size: 15px;
  line-height: 1.7;
  direction: ltr;
  text-align: left;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-y: auto;
  overflow-x: hidden;
  position: relative;
  min-width: 0;
}

/* Result placeholder - Match OLD implementation */
.result:empty::before {
  content: attr(data-i18n-placeholder);
  color: #6c757d;
  pointer-events: none;
  position: absolute;
  top: 32px;
  left: 10px;
  right: 10px;
}

html[dir="rtl"] .result:empty::before {
  text-align: right;
}

.result.has-error {
  color: #d32f2f;
  background: #ffe6e6;
}

/* Inline Toolbar Styles - Match OLD implementation */
.inline-toolbar {
  position: absolute;
  top: 5px;
  left: 18px;
  display: none;
  align-items: center;
  gap: 12px;
  z-index: 10;
}

/* Show toolbar only when container has content */
.textarea-container.has-content .inline-toolbar {
  display: flex;
}

.inline-icon {
  width: 16px;
  height: 16px;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.2s ease, filter 0.2s ease;
  filter: var(--icon-filter, none);
}

.inline-icon:hover {
  opacity: 1;
}

/* Force paste button to right side with high specificity */
.textarea-container.source-container .paste-icon-separate {
  position: absolute !important;
  top: 5px !important;
  right: 8px !important;
  left: auto !important;
  z-index: 10;
  opacity: 0.6;
  cursor: pointer;
  width: 16px;
  height: 16px;
  filter: var(--icon-filter, none);
  transition: opacity 0.2s ease;
}

.paste-icon-separate:hover {
  opacity: 1;
}

/* RTL support for paste button - Match OLD implementation */
html[dir="rtl"] .textarea-container.source-container .paste-icon-separate {
  left: 18px !important;
  right: auto !important;
}

/* Spinner styles - Match OLD implementation */
.spinner-center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  min-height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--border-color, #dee2e6);
  border-top: 3px solid var(--primary-color, #007bff);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Result fade-in animation */
.result.fade-in {
  animation: fadeIn 0.4s ease-in-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>