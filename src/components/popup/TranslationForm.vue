<template>
  <form @submit.prevent="handleTranslate" class="translation-form">
    <!-- Source Text Area -->
    <div class="textarea-container source-container" :class="{ 'has-content': sourceText.trim() }">
      <div class="inline-toolbar source-toolbar">
        <div class="toolbar-left-group">
          <IconButton
            icon="copy.png"
            @click="copySourceText"
            :title="$i18n('popup_copy_source_title_icon') || 'کپی'"
            :alt="$i18n('popup_copy_source_alt_icon') || 'Copy'"
            type="inline"
          />
          <IconButton
            icon="speaker.png"
            @click="playSourceTTS"
            :title="$i18n('popup_voice_source_title_icon') || 'خواندن متن مبدا'"
            :alt="$i18n('popup_voice_source_alt_icon') || 'Voice Source'"
            type="inline"
          />
        </div>
      </div>
      <IconButton
        icon="paste.png"
        @click="pasteText"
        :title="$i18n('popup_paste_source_title_icon') || 'چسباندن'"
        :alt="$i18n('popup_paste_source_alt_icon') || 'Paste'"
        type="paste-separate"
        :hidden-by-clipboard="!canPaste"
      />
      <textarea
        ref="sourceTextarea"
        v-model="sourceText"
        :placeholder="$i18n('popup_source_text_placeholder') || 'متن را اینجا وارد کنید...'"
        rows="2"
        tabindex="1"
        class="source-textarea"
        @input="handleSourceInput"
        @keydown="handleKeydown"
      ></textarea>
    </div>

    <!-- Result Area -->
    <div class="textarea-container result-container" :class="{ 'has-content': translatedText.trim() }">
      <div class="inline-toolbar target-toolbar">
        <IconButton
          icon="copy.png"
          @click="copyTargetText"
          :title="$i18n('popup_copy_target_title_icon') || 'کپی نتیجه'"
          :alt="$i18n('popup_copy_target_alt_icon') || 'Copy Result'"
          type="inline"
        />
        <IconButton
          icon="speaker.png"
          @click="playTargetTTS"
          :title="$i18n('popup_voice_target_title_icon') || 'خواندن متن مقصد'"
          :alt="$i18n('popup_voice_target_alt_icon') || 'Voice Target'"
          type="voice-target"
        />
      </div>
      
      <!-- Loading Spinner -->
      <div v-if="isTranslating" class="spinner-overlay">
        <div class="spinner-center">
          <div class="spinner"></div>
        </div>
      </div>
      
      <!-- Translation Result -->
      <div 
        v-else
        ref="translationResult"
        class="result aiwc-popup-markdown"
        v-html="formattedTranslatedText"
      ></div>
    </div>
  </form>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useSettingsStore } from '@/store/core/settings'
import { getBrowserAPI } from '@/utils/browser-unified.js'
import { renderMarkdown } from '@/utils/simpleMarkdown.js'
import IconButton from '@/components/shared/IconButton.vue'

// Stores
const settingsStore = useSettingsStore()

// Refs
const sourceTextarea = ref(null)
const translationResult = ref(null)

// State
const sourceText = ref('')
const translatedText = ref('')
const isTranslating = ref(false)
const canPaste = ref(true)
const lastTranslation = ref(null)

// Computed
const formattedTranslatedText = computed(() => {
  if (!translatedText.value) {
    const placeholder = 'نتیجه ترجمه اینجا نمایش داده می‌شود...'
    return `<div class="placeholder-text">${placeholder}</div>`
  }
  return renderMarkdown(translatedText.value)
})

// Methods
const handleSourceInput = () => {
  // Auto-resize textarea if needed
  if (sourceTextarea.value) {
    sourceTextarea.value.style.height = 'auto'
    sourceTextarea.value.style.height = sourceTextarea.value.scrollHeight + 'px'
  }
}

const handleKeydown = (event) => {
  // Handle Ctrl+Enter for translation
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    handleTranslate()
  }
}

const handleTranslate = async () => {
  if (!sourceText.value.trim() || isTranslating.value) return
  
  isTranslating.value = true
  translatedText.value = ''
  
  try {
    const browser = await getBrowserAPI()
    
    // Store last translation for revert functionality
    lastTranslation.value = {
      source: sourceText.value,
      target: translatedText.value,
      sourceLanguage: settingsStore.settings.SOURCE_LANGUAGE,
      targetLanguage: settingsStore.settings.TARGET_LANGUAGE
    }
    
    const response = await browser.runtime.sendMessage({
      action: 'translate',
      data: {
        text: sourceText.value,
        sourceLanguage: settingsStore.settings.SOURCE_LANGUAGE,
        targetLanguage: settingsStore.settings.TARGET_LANGUAGE,
        provider: settingsStore.settings.TRANSLATION_API,
        mode: 'popup'
      }
    })
    
    if (response?.success) {
      translatedText.value = response.translatedText || ''
      
      // Add fade-in animation
      await nextTick()
      if (translationResult.value) {
        translationResult.value.classList.add('fade-in')
        setTimeout(() => {
          translationResult.value?.classList.remove('fade-in')
        }, 400)
      }
    } else {
      throw new Error(response?.error || 'Translation failed')
    }
    
  } catch (error) {
    console.error('Translation error:', error)
    translatedText.value = `خطا در ترجمه: ${error.message}`
  } finally {
    isTranslating.value = false
  }
}

const copySourceText = async () => {
  if (!sourceText.value) return
  
  try {
    await navigator.clipboard.writeText(sourceText.value)
    // Could show a toast notification here
  } catch (error) {
    console.error('Failed to copy source text:', error)
  }
}

const copyTargetText = async () => {
  if (!translatedText.value) return
  
  try {
    // Strip HTML tags for clipboard
    const textOnly = translatedText.value.replace(/<[^>]*>/g, '')
    await navigator.clipboard.writeText(textOnly)
    // Could show a toast notification here
  } catch (error) {
    console.error('Failed to copy target text:', error)
  }
}

const pasteText = async () => {
  try {
    const text = await navigator.clipboard.readText()
    sourceText.value = text
    handleSourceInput()
  } catch (error) {
    console.error('Failed to paste text:', error)
  }
}

const playSourceTTS = async () => {
  if (!sourceText.value.trim()) return
  
  try {
    const browser = await getBrowserAPI()
    await browser.runtime.sendMessage({
      action: 'playTTS',
      data: {
        text: sourceText.value,
        language: settingsStore.settings.SOURCE_LANGUAGE
      }
    })
  } catch (error) {
    console.error('Failed to play source TTS:', error)
  }
}

const playTargetTTS = async () => {
  if (!translatedText.value.trim()) return
  
  try {
    const browser = await getBrowserAPI()
    // Strip HTML tags for TTS
    const textOnly = translatedText.value.replace(/<[^>]*>/g, '')
    await browser.runtime.sendMessage({
      action: 'playTTS',
      data: {
        text: textOnly,
        language: settingsStore.settings.TARGET_LANGUAGE
      }
    })
  } catch (error) {
    console.error('Failed to play target TTS:', error)
  }
}

const clearStorage = () => {
  sourceText.value = ''
  translatedText.value = ''
  lastTranslation.value = null
}

const revertTranslation = () => {
  if (lastTranslation.value) {
    sourceText.value = lastTranslation.value.target || ''
    translatedText.value = lastTranslation.value.source || ''
    
    // Swap languages too
    const tempSource = lastTranslation.value.targetLanguage
    const tempTarget = lastTranslation.value.sourceLanguage
    
    if (tempSource && tempTarget) {
      settingsStore.updateSettingAndPersist('SOURCE_LANGUAGE', tempSource)
      settingsStore.updateSettingAndPersist('TARGET_LANGUAGE', tempTarget)
    }
  }
}

// Event listeners
onMounted(() => {
  // Listen for global events from header component
  document.addEventListener('clear-storage', clearStorage)
  document.addEventListener('revert-translation', revertTranslation)
  document.addEventListener('translate-request', (event) => {
    if (sourceText.value.trim()) {
      handleTranslate()
    }
  })
  document.addEventListener('languages-swapped', () => {
    // Could trigger re-translation if text exists
    if (sourceText.value.trim() && translatedText.value.trim()) {
      // Swap the text content too
      const temp = sourceText.value
      sourceText.value = translatedText.value.replace(/<[^>]*>/g, '')
      translatedText.value = temp
    }
  })
  
  // Check clipboard permissions
  checkClipboardPermissions()
})

const checkClipboardPermissions = async () => {
  try {
    const result = await navigator.permissions.query({ name: 'clipboard-read' })
    canPaste.value = result.state === 'granted' || result.state === 'prompt'
  } catch (error) {
    // Fallback to true if permissions API not available
    canPaste.value = true
  }
}
</script>

<style scoped>
.translation-form {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.textarea-container {
  position: relative;
  margin: 10px 12px;
}

.source-textarea,
.result {
  width: 100%;
  padding: 28px 12px 12px 12px;
  border-radius: 4px;
  font-family: inherit;
  font-size: 15px;
  resize: vertical;
  box-sizing: border-box;
  direction: ltr;
  text-align: left;
  min-height: 60px;
  background-color: var(--bg-textbox-color);
  color: var(--text-color);
  border: 1px solid var(--header-border-color);
  line-height: 1.6;
}

.source-textarea:focus {
  border-color: #80bdff;
  outline: 0;
  box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
}

.result {
  min-height: 60px;
  white-space: normal !important;
  word-wrap: break-word;
  overflow-y: auto;
  background-color: var(--bg-result-color);
}

.placeholder-text {
  color: #6c757d;
  font-style: italic;
  opacity: 0.7;
}

/* Inline Toolbar */
.inline-toolbar {
  position: absolute;
  top: 5px;
  display: none;
  align-items: center;
  background: transparent;
  z-index: 10;
  padding: 2px;
}

.inline-toolbar.source-toolbar {
  left: 8px;
  right: auto;
  width: auto;
  justify-content: space-between;
}

.source-toolbar .toolbar-left-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.inline-toolbar.target-toolbar {
  left: 8px;
  right: auto;
  gap: 10px;
}

.textarea-container.has-content .inline-toolbar {
  display: flex;
}

.inline-icon {
  width: 16px;
  height: 16px;
  cursor: pointer;
  opacity: var(--icon-opacity, 0.6);
  transition: opacity 0.2s ease, filter 0.2s ease-in-out;
  filter: var(--icon-filter);
}

.inline-icon:hover {
  opacity: var(--icon-hover-opacity, 1);
}

.paste-icon-separate {
  position: absolute;
  top: 5px;
  right: 8px;
}

.paste-icon-separate.hidden-by-clipboard {
  display: none !important;
}

/* Spinner */
.spinner-overlay {
  position: relative;
  width: 100%;
  min-height: 60px;
}

.spinner-center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--header-border-color, #dee2e6);
  border-top: 3px solid #007bff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  margin: auto;
}

:root.theme-dark .spinner {
  border: 3px solid var(--header-border-color, #555);
  border-top: 3px solid var(--toolbar-link-color, #58a6ff);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

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