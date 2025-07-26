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

      <!-- Source Text Area with Toolbar -->
      <div class="textarea-container source-container">
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
          @click="pasteSourceText"
        />
        <textarea
          id="sourceText"
          rows="6"
          placeholder="Enter text to translate..."
          v-model="sourceText"
        ></textarea>
      </div>

      <!-- Action Bar -->
      <div class="action-bar">
        <button
          type="submit"
          class="translate-button-main"
          :disabled="isTranslating || !sourceText.trim()"
        >
          <span>{{ isTranslating ? 'Translating...' : 'Translate' }}</span>
          <img src="@/assets/icons/translate.png" alt="Translate" />
        </button>
      </div>

      <!-- Result Area with Toolbar -->
      <div class="textarea-container result-container">
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
          :class="{ 'has-error': translationError }"
        >
          {{ translationError || translationResult || '' }}
        </div>
      </div>
    </form>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useBrowserAPI } from '@/composables/useBrowserAPI.js'
import { useTTSSmart } from '@/composables/useTTSSmart.js'
import { useBackgroundWarmup } from '@/composables/useBackgroundWarmup.js'
import { useDirectMessage } from '@/composables/useDirectMessage.js'

// Browser API, TTS, Background Warmup, and Direct Message
const browserAPI = useBrowserAPI()
const tts = useTTSSmart()
const backgroundWarmup = useBackgroundWarmup()
const directMessage = useDirectMessage()

// Simple state
const sourceText = ref('')
const translationResult = ref('')
const translationError = ref('')
const isTranslating = ref(false)

// Handle form submission
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

  try {
    isTranslating.value = true
    translationError.value = ''
    translationResult.value = ''
    
    console.log('[SidepanelMainContent] Ensuring background script is ready...')
    await backgroundWarmup.ensureWarmedUp()
    
    console.log('[SidepanelMainContent] Sending translation request:', {
      sourceText: sourceText.value.substring(0, 50) + '...',
      targetLanguage
    })

    // Try direct message first for debugging
    const response = await directMessage.sendTranslation({
      promptText: sourceText.value,
      sourceLanguage: 'auto',
      targetLanguage: targetLanguage,
      translateMode: 'sidepanel'
    })

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
    console.error('[SidepanelMainContent] Translation failed:', error)
    translationError.value = error.message || 'Translation failed'
  } finally {
    isTranslating.value = false
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
    console.log('[SidepanelMainContent] Text pasted from clipboard')
  } catch (error) {
    console.error('[SidepanelMainContent] Failed to paste text:', error)
  }
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
  border: 1px solid var(--border-color, #ccc);
  border-radius: 4px;
  background-color: var(--bg-secondary, white);
  color: var(--text-color, black);
  box-sizing: border-box;
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
  background-image: url('data:image/svg+xml;charset=US-ASCII,<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>');
  background-repeat: no-repeat;
  background-position: right 10px center;
  background-size: 16px;
  padding-right: 30px;
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

/* Source textarea */
textarea#sourceText {
  width: 100%;
  height: 140px;
  resize: none;
  box-sizing: border-box;
  padding-top: 32px;
  padding-bottom: 12px;
  padding-left: 14px;
  padding-right: 14px;
  border: 1px solid var(--border-color, #ccc);
  border-radius: 5px;
  background-color: var(--bg-secondary, white);
  color: var(--text-color, black);
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
  border: 1px solid var(--border-color, #ccc);
  border-radius: 5px;
  background-color: var(--bg-secondary, white);
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
  padding-left: 14px;
  padding-right: 14px;
  color: var(--text-color, black);
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

.result.has-error {
  color: #d32f2f;
  background: #ffe6e6;
}

/* Inline Toolbar Styles */
.inline-toolbar {
  position: absolute;
  top: 5px;
  left: 18px;
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 10;
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

.paste-icon-separate {
  position: absolute;
  top: 5px;
  right: 8px;
  display: block !important;
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
</style>