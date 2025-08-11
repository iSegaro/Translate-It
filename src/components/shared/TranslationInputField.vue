<template>
  <div
    class="textarea-container"
    :class="{ 'has-content': hasContent }"
  >
    <!-- Inline Toolbar (copy, tts) -->
    <div
      class="inline-toolbar"
      :class="{ 'visible': hasContent }"
    >
      <IconButton
        icon="copy.png"
        :title="copyTitle"
        :alt="copyAlt"
        type="inline"
        @click="handleCopy"
      />
      <IconButton
        icon="speaker.png"
        :title="ttsTitle"
        :alt="ttsAlt"
        type="inline"
        @click="handleTTS"
      />
    </div>
    
    <!-- Paste Button (separate positioning) -->
    <IconButton
      icon="paste.png"
      :title="pasteTitle"
      :alt="pasteAlt"
      type="paste-separate"
      :hidden-by-clipboard="!canPaste"
      @click="handlePaste"
    />
    
    <!-- Textarea -->
    <textarea
      ref="textareaRef"
      :value="modelValue"
      :placeholder="placeholder"
      :rows="rows"
      :tabindex="tabindex"
      :class="textareaClass"
      class="translation-textarea"
      @input="handleInput"
      @keydown="handleKeydown"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useClipboard } from '@/composables/useClipboard.js'
import { useTTSSimple } from '@/composables/useTTSSimple.js'
import { useSettingsStore } from '@/store/core/settings.js'
import { useErrorHandler } from '@/composables/useErrorHandler.js'
import { getLanguageCodeForTTS } from '@/utils/i18n/languages.js'
import { correctTextDirection } from '@/utils/text/textDetection.js'
import IconButton from '@/components/shared/IconButton.vue'
import { createLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
const logger = createLogger(LOG_COMPONENTS.UI, 'TranslationInputField');

// Props
const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  placeholder: {
    type: String,
    default: 'Enter text here...'
  },
  language: {
    type: String,
    default: 'Auto-Detect'
  },
  rows: {
    type: Number,
    default: 4
  },
  tabindex: {
    type: Number,
    default: 1
  },
  textareaClass: {
    type: String,
    default: ''
  },
  // i18n titles
  copyTitle: {
    type: String,
    default: 'Copy text'
  },
  copyAlt: {
    type: String,
    default: 'Copy'
  },
  ttsTitle: {
    type: String,
    default: 'Play text'
  },
  ttsAlt: {
    type: String,
    default: 'Play'
  },
  pasteTitle: {
    type: String,
    default: 'Paste from clipboard'
  },
  pasteAlt: {
    type: String,
    default: 'Paste'
  },
  // Auto-translate on paste
  autoTranslateOnPaste: {
    type: Boolean,
    default: false
  }
})

// Emits
const emit = defineEmits([
  'update:modelValue',
  'translate',
  'input',
  'keydown'
])

// Refs
const textareaRef = ref(null)
const canPaste = ref(true)

// Composables
const clipboard = useClipboard()
const tts = useTTSSimple()
const settingsStore = useSettingsStore()
const { handleError } = useErrorHandler()

// Computed
const hasContent = computed(() => props.modelValue.trim().length > 0)

// Methods
const handleInput = (event) => {
  const value = event.target.value
  emit('update:modelValue', value)
  emit('input', event)
  
  // Auto-resize textarea if needed
  if (textareaRef.value) {
    textareaRef.value.style.height = 'auto'
    textareaRef.value.style.height = textareaRef.value.scrollHeight + 'px'
  }
  
  // Text direction correction
  nextTick(() => {
    if (textareaRef.value) {
      correctTextDirection(textareaRef.value, value)
    }
  })
}

const handleKeydown = (event) => {
  emit('keydown', event)
  
  // Handle Ctrl+Enter for translation
  if ((event.ctrlKey || event.metaKey) && (event.key === 'Enter' || event.key === '/')) {
    event.preventDefault()
    emit('translate')
  }
}

const handleCopy = async () => {
  if (!hasContent.value) return
  
  try {
    const success = await clipboard.copyToClipboard(props.modelValue)
    if (success) {
      logger.debug('[TranslationInputField] Text copied to clipboard')
    }
  } catch (error) {
    await handleError(error, 'translation-input-field-copy')
  }
}

const handlePaste = async () => {
  try {
    const pastedText = await clipboard.pasteFromClipboard()
    if (pastedText) {
      emit('update:modelValue', pastedText)
      
      // Auto-resize and correct direction
      nextTick(() => {
        if (textareaRef.value) {
          textareaRef.value.style.height = 'auto'
          textareaRef.value.style.height = textareaRef.value.scrollHeight + 'px'
          correctTextDirection(textareaRef.value, pastedText)
        }
      })
      
      // Auto-translate if enabled
      if (props.autoTranslateOnPaste || settingsStore.settings.AUTO_TRANSLATE_ON_PASTE) {
        await nextTick()
        emit('translate')
      }
      
      logger.debug('[TranslationInputField] Text pasted from clipboard')
    }
  } catch (error) {
    await handleError(error, 'translation-input-field-paste')
  }
}

const handleTTS = async () => {
  if (!hasContent.value) return
  
  try {
    const langCode = getLanguageCodeForTTS(props.language)
    await tts.speak(props.modelValue, langCode)
    logger.debug('[TranslationInputField] Playing TTS for text')
  } catch (error) {
    await handleError(error, 'translation-input-field-tts')
  }
}

const checkClipboardPermissions = async () => {
  try {
    const text = await navigator.clipboard.readText()
    canPaste.value = text && text.trim().length > 0
  } catch (error) {
    canPaste.value = false
  }
}

// Lifecycle
onMounted(async () => {
  // Check clipboard permissions initially
  await checkClipboardPermissions()
  
  // Set up clipboard monitoring
  setInterval(checkClipboardPermissions, 2000)
  
  // Auto-resize initial content
  if (textareaRef.value && props.modelValue) {
    nextTick(() => {
      if (textareaRef.value) {
        textareaRef.value.style.height = 'auto'
        textareaRef.value.style.height = textareaRef.value.scrollHeight + 'px'
        correctTextDirection(textareaRef.value, props.modelValue)
      }
    })
  }
});
</script>

<style scoped>
.textarea-container {
  position: relative;
  margin: 10px 12px;
}

.translation-textarea {
  width: 100%;
  padding: 28px 12px 12px 12px;
  border-radius: 4px;
  font-family: inherit;
  font-size: 15px;
  resize: vertical;
  box-sizing: border-box;
  direction: ltr;
  text-align: left;
  background-color: var(--bg-textbox-color);
  color: var(--text-color);
  border: 1px solid var(--header-border-color);
  line-height: 1.6;
}

.translation-textarea:focus {
  border-color: #80bdff;
  outline: 0;
  box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
}

.translation-textarea::placeholder {
  color: var(--text-secondary, #6c757d);
  opacity: 0.7;
}

/* Inline Toolbar */
.inline-toolbar {
  position: absolute;
  top: 5px;
  left: 8px;
  display: none;
  align-items: center;
  gap: 10px;
  background: transparent;
  z-index: 10;
  padding: 2px;
  direction: ltr; /* Force LTR to maintain consistent positioning */
}

.textarea-container.has-content .inline-toolbar {
  display: flex;
}

.inline-toolbar.visible {
  display: flex;
}
</style>