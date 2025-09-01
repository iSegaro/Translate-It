<template>
  <div
    class="textarea-container"
    :class="{ 'has-content': hasContent }"
  >
    <!-- Enhanced Text Actions Toolbar -->
    <ActionToolbar
      :text="modelValue"
      :language="sourceLanguage"
      mode="input"
      :show-copy="true"
      :show-tts="true"
      :show-paste="true"
      :copy-disabled="!hasContent"
      :tts-disabled="!hasContent"
      class="input-toolbar"
      @text-pasted="handlePaste"
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
import { useErrorHandler } from '@/composables/useErrorHandler.js'
import { correctTextDirection } from '@/utils/text/textDetection.js'
import ActionToolbar from '@/features/text-actions/components/ActionToolbar.vue'
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'TranslationInputField');


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
  // Language for TTS
  sourceLanguage: {
    type: String,
    default: 'auto'
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

// Composables
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
    if (hasContent.value) {
      emit('translate')
    }
  }
}

const handlePaste = async (data) => {
  try {
    const pastedText = data?.text || data // support both ActionToolbar format and direct string
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
      
      // Auto-translate if enabled (from ActionToolbar or prop)
      if (props.autoTranslateOnPaste || data?.autoTranslate) {
        await nextTick()
        emit('translate')
      }
      
      logger.debug('[TranslationInputField] Text pasted from clipboard')
    }
  } catch (error) {
    await handleError(error, 'translation-input-field-paste')
  }
}

// Lifecycle
onMounted(async () => {
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
  margin: 8px 12px;
}

.translation-textarea {
  width: 100%;
  padding: 28px 10px 10px 10px;
  /* border-radius: 3px; */
  font-family: inherit;
  font-size: 13px;
  resize: vertical;
  box-sizing: border-box;
  direction: ltr;
  text-align: left;
  background-color: var(--input-bg-color);
  color: var(--text-color);
  /* border: 1px solid var(--header-border-color); */
  line-height: 1.5;
  min-height: 50px;
  max-width: 100%;
  overflow-x: hidden;
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

/* Enhanced Text Actions Toolbar */
.input-toolbar {
  position: absolute;
  top: 6px;
  left: 12px;
  z-index: 10;
  opacity: 0.4;
  transition: opacity 0.2s ease;
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(4px);
  border-radius: 6px;
  padding: 2px;
}

.textarea-container:hover .input-toolbar {
  opacity: 1;
}

/* Standalone Paste Button */
.paste-standalone {
  position: absolute;
  top: 6px;
  right: 12px;
  z-index: 10;
}

/* Context-specific adjustments for sidepanel */
.sidepanel-wrapper .textarea-container {
  margin: 8px 0;
}

.sidepanel-wrapper .input-toolbar {
  top: 8px;
  background: rgba(0, 0, 0, 0.02);
}

.sidepanel-wrapper .paste-standalone {
  right: 18px;
}

.sidepanel-wrapper .translation-textarea {
  height: 140px;
  padding: 42px 14px 12px 14px;
  font-size: 15px;
  line-height: 1.7;
  border-radius: 5px;
  resize: none;
}

html[dir="rtl"] .sidepanel-wrapper .translation-textarea {
  padding: 42px 14px 12px 14px;
}

/* RTL adjustments */
html[dir="rtl"] .input-toolbar {
  left: auto;
  right: 12px;
}

html[dir="rtl"] .paste-standalone {
  right: auto;
  left: 12px;
}

html[dir="rtl"] .sidepanel-wrapper .input-toolbar {
  left: 18px;
  right: 18px;
}

html[dir="rtl"] .sidepanel-wrapper .paste-standalone {
  right: auto;
  left: 18px;
}
</style>