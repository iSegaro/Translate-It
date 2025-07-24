<template>
  <div class="textarea-wrapper" :class="{ disabled, loading }">
    <textarea
      :value="modelValue"
      :placeholder="placeholder"
      :rows="rows"
      :disabled="disabled || loading"
      :readonly="readonly"
      :class="textareaClasses"
      @input="handleInput"
      @focus="handleFocus"
      @blur="handleBlur"
    />
    
    <LoadingSpinner v-if="loading" size="sm" class="loading-overlay" />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import LoadingSpinner from './LoadingSpinner.vue'

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
  }
})

const emit = defineEmits(['update:modelValue', 'focus', 'blur', 'input'])

const isFocused = ref(false)

const textareaClasses = computed(() => [
  'base-textarea',
  {
    'focused': isFocused.value,
    'readonly': props.readonly,
    [`resize-${props.resize}`]: true
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
</script>

<style scoped>
.textarea-wrapper {
  position: relative;
  
  &.disabled {
    opacity: 0.6;
  }
  
  &.loading {
    .base-textarea {
      color: transparent;
    }
  }
}

.base-textarea {
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
  
  &.readonly {
    background-color: var(--color-surface);
    cursor: default;
  }
  
  &.resize-none {
    resize: none;
  }
  
  &.resize-both {
    resize: both;
  }
  
  &.resize-horizontal {
    resize: horizontal;
  }
  
  &.resize-vertical {
    resize: vertical;
  }
}

.loading-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 1;
}
</style>