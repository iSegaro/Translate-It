<template>
  <div
    class="ti-textarea-wrapper"
    :class="{ 'ti-textarea-wrapper--disabled': disabled, 'ti-textarea-wrapper--loading': loading }"
  >
    <button
      v-if="passwordMask && !hideToggle"
      type="button"
      class="ti-textarea__toggle-visibility"
      @click="toggleVisibility"
      :tabindex="-1"
      :title="toggleTitle || (visibilityVisible ? hideLabel : showLabel)"
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
      @beforeinput="handleBeforeInput"
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

<style scoped>
.ti-textarea-wrapper {
  position: relative;
  display: flex;
  flex-direction: column;

  &--disabled {
    opacity: 0.6;
  }

  &--loading {
    .ti-textarea {
      color: transparent;
    }
  }
}

.ti-textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-base);
  font-family: inherit;
  font-size: var(--font-size-base);
  line-height: 1.5;
  color: var(--color-text);
  background-color: var(--color-background);
  transition: all var(--transition-base);

  &::placeholder {
    color: var(--color-text-disabled);
  }

  &:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.1);
  }

  &:disabled {
    background-color: var(--color-surface);
    cursor: not-allowed;
  }

  &--readonly {
    background-color: var(--color-surface);
    cursor: default;
  }

  &--password {
    /* CSS-only password masking - supported in all modern browsers */
    /* Chrome/Edge: native, Firefox 119+, Safari: native */
    -webkit-text-security: disc;
    /* Standard property (future-proof when standardized) */
    text-security: disc;
  }

  &--resize-none {
    resize: none;
  }

  &--resize-both {
    resize: both;
  }

  &--resize-horizontal {
    resize: horizontal;
  }

  &--resize-vertical {
    resize: vertical;
  }
}

.ti-textarea__toggle-visibility {
  position: relative;
  align-self: flex-end;
  margin-bottom: 4px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.6;
  transition: opacity var(--transition-base);

  &:hover {
    opacity: 1;
  }

  &:disabled {
    cursor: not-allowed;
  }

  .toggle-visibility-icon {
    display: block;
    pointer-events: none;
    width: 16px;
    height: 16px;
    object-fit: contain;
  }
}

.ti-textarea__loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 1;
}
</style>