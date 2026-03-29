<template>
  <div
    class="ti-textarea-container"
    :class="{ 'ti-has-content': hasContent }"
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
      class="ti-input-toolbar"
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
      class="ti-translation-textarea"
      autofocus
      @input="handleInput"
      @keydown="handleKeydown"
    />
  </div>
</template>

<script setup>
import './TranslationInputField.scss'
import { ref, computed, onMounted, nextTick } from 'vue'
import { useErrorHandler } from '@/composables/shared/useErrorHandler.js'
import { correctTextDirection } from '@/shared/utils/text/textAnalysis.js'
import ActionToolbar from '@/features/text-actions/components/ActionToolbar.vue'
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { AUTO_DETECT_VALUE } from '../../shared/config/constants';

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
    default: AUTO_DETECT_VALUE
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
    default: undefined
  },
  copyAlt: {
    type: String,
    default: 'Copy'
  },
  ttsTitle: {
    type: String,
    default: undefined
  },
  ttsAlt: {
    type: String,
    default: 'Play'
  },
  pasteTitle: {
    type: String,
    default: undefined
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