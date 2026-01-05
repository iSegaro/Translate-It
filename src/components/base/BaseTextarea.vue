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
      :title="visibilityVisible ? 'Hide' : 'Show'"
    >
      <img
        v-if="!visibilityVisible"
        :src="eyeIcon"
        alt="Show"
        class="toggle-visibility-icon"
        width="16"
        height="16"
      >
      <img
        v-else
        :src="eyeHideIcon"
        alt="Hide"
        class="toggle-visibility-icon"
        width="16"
        height="16"
      >
    </button>

    <textarea
      :value="displayValue"
      :placeholder="placeholder"
      :rows="rows"
      :disabled="disabled || loading"
      :readonly="readonly"
      :class="textareaClasses"
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
import { computed, ref, watch } from 'vue'
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
  }
})

const emit = defineEmits(['update:modelValue', 'focus', 'blur', 'input'])

const isFocused = ref(false)
const visibilityVisible = ref(false)

// For password masking, display bullets instead of actual text
const displayValue = computed(() => {
  if (!props.passwordMask) {
    return props.modelValue
  }

  if (visibilityVisible.value) {
    return props.modelValue
  }

  // Show bullet for each character
  return props.modelValue ? '•'.repeat(Math.min(props.modelValue.length, 100)) : ''
})

const toggleVisibility = () => {
  visibilityVisible.value = !visibilityVisible.value
}

const textareaClasses = computed(() => [
  'ti-textarea',
  {
    'ti-textarea--focused': isFocused.value,
    'ti-textarea--readonly': props.readonly,
    'ti-textarea--password': props.passwordMask,
    [`ti-textarea--resize-${props.resize}`]: true
  }
])

const handleInput = (event) => {
  emit('update:modelValue', event.target.value)
  emit('input', event)
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
    font-family: 'text-security-disc', sans-serif;
    /* Fallback for browsers that don't support text-security-disc */
    -webkit-text-security: disc;
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