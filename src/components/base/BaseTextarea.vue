<template>
  <div
    class="ti-textarea-wrapper"
    :class="{ 'ti-textarea-wrapper--disabled': disabled, 'ti-textarea-wrapper--loading': loading }"
  >
    <button
      v-if="passwordMask && !hideToggle"
      type="button"
      class="ti-textarea__toggle-visibility"
      :tabindex="-1"
      :title="toggleTitle || (visibilityVisible ? hideLabel : showLabel)"
      @click="toggleVisibility"
    >
      <img
        v-if="!visibilityVisible"
        :src="eyeIcon"
        :alt="showLabel || 'Show'"
        class="toggle-visibility-icon"
        width="16"
        height="16"
      >
      <img
        v-else
        :src="eyeHideIcon"
        :alt="hideLabel || 'Hide'"
        class="toggle-visibility-icon"
        width="16"
        height="16"
      >
    </button>

    <textarea
      ref="textareaRef"
      :value="displayValue"
      :placeholder="placeholder"
      :rows="rows"
      :disabled="disabled || loading"
      :readonly="readonly"
      :class="textareaClasses"
      :dir="dir"
      @beforeinput="handleBeforeInput"
      @input="handleInput"
      @focus="handleFocus"
      @blur="handleBlur"
    />

    <LoadingSpinner
      v-if="loading"
      size="sm"
      class="ti-textarea__loading"
    />
  </div>
</template>

<script setup>
import { computed, ref, nextTick } from 'vue'
import './BaseTextarea.scss'
import LoadingSpinner from './LoadingSpinner.vue'
import eyeIcon from '@/icons/ui/eye-open.svg?url'
import eyeHideIcon from '@/icons/ui/eye-hide.svg?url'

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  placeholder: {
    type: String,
    default: ''
  },
  rows: {
    type: Number,
    default: 3
  },
  disabled: {
    type: Boolean,
    default: false
  },
  readonly: {
    type: Boolean,
    default: false
  },
  loading: {
    type: Boolean,
    default: false
  },
  resize: {
    type: String,
    default: 'vertical',
    validator: (value) => ['none', 'both', 'horizontal', 'vertical'].includes(value)
  },
  passwordMask: {
    type: Boolean,
    default: false
  },
  hideToggle: {
    type: Boolean,
    default: false
  },
  showLabel: {
    type: String,
    default: 'Show'
  },
  hideLabel: {
    type: String,
    default: 'Hide'
  },
  toggleTitle: {
    type: String,
    default: null
  },
  dir: {
    type: String,
    default: null,
    validator: (value) => ['ltr', 'rtl', 'auto'].includes(value)
  }
})

const emit = defineEmits(['update:modelValue', 'focus', 'blur', 'input'])

const isFocused = ref(false)
const visibilityVisible = ref(false)

// Hybrid password masking approach:
// 1. Use CSS -webkit-text-security when available (modern browsers)
// 2. Fallback to bullet replacement for older browsers
const displayValue = computed(() => {
  // When not password mode, or when visibility is toggled on, show actual value
  if (!props.passwordMask || visibilityVisible.value) {
    return props.modelValue
  }

  // When masked, use bullet replacement as fallback
  // CSS will also apply -webkit-text-security for double-protection
  return props.modelValue ? '•'.repeat(Math.min(props.modelValue.length, 1000)) : ''
})

const toggleVisibility = () => {
  visibilityVisible.value = !visibilityVisible.value
}

const textareaClasses = computed(() => [
  'ti-textarea',
  {
    'ti-textarea--focused': isFocused.value,
    'ti-textarea--readonly': props.readonly,
    // Apply password masking class when masked (passwordMask on, visibilityVisible off)
    'ti-textarea--password': props.passwordMask && !visibilityVisible.value,
    [`ti-textarea--resize-${props.resize}`]: true
  }
])

// Ref to textarea element
const textareaRef = ref(null)

// Handle beforeinput when masked to prevent corruption
const handleBeforeInput = (event) => {
  // Only handle when masked (showing bullets)
  if (!props.passwordMask || visibilityVisible.value) {
    return // Let default behavior happen when unmasked
  }

  // Prevent default to avoid corruption when typing into bullets
  event.preventDefault()

  const target = event.target
  const currentValue = props.modelValue || ''
  const cursorStart = target.selectionStart
  const cursorEnd = target.selectionEnd

  let newValue = currentValue
  let newCursorPos = cursorStart

  // Handle main input types
  const inputType = event.inputType

  if (inputType === 'insertText' && event.data) {
    // Character insertion
    newValue = currentValue.slice(0, cursorStart) + event.data + currentValue.slice(cursorEnd)
    newCursorPos = cursorStart + event.data.length
  } else if (inputType === 'insertLineBreak' || inputType === 'insertParagraph') {
    // Enter key
    newValue = currentValue.slice(0, cursorStart) + '\n' + currentValue.slice(cursorEnd)
    newCursorPos = cursorStart + 1
  } else if (inputType === 'deleteContentBackward') {
    // Backspace
    if (cursorStart === cursorEnd && cursorStart > 0) {
      newValue = currentValue.slice(0, cursorStart - 1) + currentValue.slice(cursorEnd)
      newCursorPos = cursorStart - 1
    } else if (cursorStart !== cursorEnd) {
      newValue = currentValue.slice(0, cursorStart) + currentValue.slice(cursorEnd)
      newCursorPos = cursorStart
    }
  } else if (inputType === 'deleteContentForward') {
    // Delete key
    if (cursorStart === cursorEnd && cursorStart < currentValue.length) {
      newValue = currentValue.slice(0, cursorStart) + currentValue.slice(cursorEnd + 1)
      newCursorPos = cursorStart
    } else if (cursorStart !== cursorEnd) {
      newValue = currentValue.slice(0, cursorStart) + currentValue.slice(cursorEnd)
      newCursorPos = cursorStart
    }
  } else if (inputType === 'insertFromPaste') {
    // Paste
    const pastedText = event.data || ''
    newValue = currentValue.slice(0, cursorStart) + pastedText + currentValue.slice(cursorEnd)
    newCursorPos = cursorStart + pastedText.length
  } else {
    // For other input types, let it through
    return
  }

  // Emit the new value
  emit('update:modelValue', newValue)
  emit('input', event)

  // Restore cursor position
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.setSelectionRange(newCursorPos, newCursorPos)
    }
  })
}

// Handle input event for cases where beforeinput didn't handle
// (e.g., when unmasked or for edge cases)
const handleInput = (event) => {
  // Only emit when unmasked (when masked, beforeinput handles everything)
  if (!props.passwordMask || visibilityVisible.value) {
    emit('update:modelValue', event.target.value)
    emit('input', event)
  }
}

const handleFocus = (event) => {
  isFocused.value = true
  emit('focus', event)
}

const handleBlur = (event) => {
  isFocused.value = false
  emit('blur', event)
}

// Expose for external access
defineExpose({
  visibilityVisible,
  toggleVisibility
})
</script>
