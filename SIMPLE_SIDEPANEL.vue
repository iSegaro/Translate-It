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
          <span>⇄</span>
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

      <div class="textarea-container source-container">
        <textarea
          id="sourceText"
          rows="6"
          placeholder="Enter text to translate..."
          v-model="sourceText"
        ></textarea>
      </div>

      <button
        type="submit"
        class="translate-button"
        :disabled="isTranslating || !sourceText.trim()"
      >
        {{ isTranslating ? 'Translating...' : 'Translate' }}
      </button>

      <div class="textarea-container result-container">
        <div
          id="translationResult"  
          class="translation-result"
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

// browser API
const browserAPI = useBrowserAPI()

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
    
    console.log('[SidepanelMainContent] Sending translation request:', {
      sourceText: sourceText.value.substring(0, 50) + '...',
      targetLanguage
    })

    const response = await browserAPI.safeSendMessage({
      action: 'fetchTranslation',
      payload: {
        promptText: sourceText.value,
        sourceLanguage: 'auto',
        targetLanguage: targetLanguage,
        translateMode: 'sidepanel'
      }
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
</script>

<style scoped>
.main-content {
  flex-grow: 1;
  padding: 16px;
  overflow-y: auto;
}

form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.language-controls {
  display: flex;
  gap: 8px;
  align-items: center;
}

.language-select {
  flex: 1;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
}

.swap-button {
  padding: 8px 12px;
  background: #f0f0f0;
  border: 1px solid #ccc;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  min-width: 40px;
}

.swap-button:hover {
  background: #e0e0e0;
}

.textarea-container {
  position: relative;
}

textarea, .translation-result {
  width: 100%;
  min-height: 120px;
  padding: 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
}

.translation-result {
  background: #f9f9f9;
  color: #333;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.translation-result.has-error {
  background: #ffe6e6;
  color: #d32f2f;
}

.translate-button {
  padding: 12px 24px;
  background: #1976d2;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
}

.translate-button:hover:not(:disabled) {
  background: #1565c0;
}

.translate-button:disabled {
  background: #ccc;
  cursor: not-allowed;
}
</style>