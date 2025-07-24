<template>
  <div class="input-wrapper" :class="{ disabled, error: !!error }">
    <label v-if="label" :for="inputId" class="input-label">
      {{ label }}
      <span v-if="required" class="required-mark">*</span>
    </label>
    
    <div class="input-container">
      <input
        :id="inputId"
        :type="type"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :readonly="readonly"
        :required="required"
        :class="inputClasses"
        @input="handleInput"
        @focus="handleFocus"
        @blur="handleBlur"
      >
      
      <BaseButton
        v-if="clearable && modelValue && !disabled"
        variant="ghost"
        size="xs"
        icon="clear"
        class="clear-button"
        @click="handleClear"
      />
    </div>
    
    <div v-if="error || hint" class="input-help">
      <span v-if="error" class="error-text">{{ error }}</span>
      <span v-else-if="hint" class="hint-text">{{ hint }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import BaseButton from './BaseButton.vue'

const props = defineProps({
  modelValue: {
    type: [String, Number],
    default: ''
  },
  type: {
    type: String,
    default: 'text',
    validator: (value) => ['text', 'password', 'email', 'number', 'url', 'search'].includes(value)
  },
  label: {
    type: String,
    default: null
  },
  placeholder: {
    type: String,
    default: null
  },
  hint: {
    type: String,
    default: null
  },
  error: {
    type: String,
    default: null
  },
  size: {
    type: String,
    default: 'md',
    validator: (value) => ['sm', 'md', 'lg'].includes(value)
  },
  disabled: {
    type: Boolean,
    default: false
  },
  readonly: {
    type: Boolean,
    default: false
  },
  required: {
    type: Boolean,
    default: false
  },
  clearable: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue', 'focus', 'blur', 'clear'])

const inputId = ref(`input-${Math.random().toString(36).substr(2, 9)}`)

const inputClasses = computed(() => [
  'base-input',
  `size-${props.size}`,
  {
    'has-error': !!props.error,
    'readonly': props.readonly,
    'disabled': props.disabled,
    'clearable': props.clearable && props.modelValue && !props.disabled
  }
])

const handleInput = (event) => {
  emit('update:modelValue', event.target.value)
}

const handleFocus = (event) => {
  emit('focus', event)
}

const handleBlur = (event) => {
  emit('blur', event)
}

const handleClear = () => {
  emit('update:modelValue', '')
  emit('clear')
}
</script>

<style scoped>
.input-wrapper {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.input-label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
  margin-bottom: 4px;
}

.required-mark {
  color: var(--color-error);
  margin-left: 2px;
}

.input-container {
  position: relative;
  display: flex;
  align-items: center;
}

.base-input {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-base);
  font-family: inherit;
  font-size: var(--font-size-base);
  color: var(--color-text);
  background-color: var(--color-input-background);
  transition: all var(--transition-base);
  outline: none;
  
  &:focus {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.1);
  }
  
  &.has-error {
    border-color: var(--color-error);
    
    &:focus {
      border-color: var(--color-error);
      box-shadow: 0 0 0 2px rgba(244, 67, 54, 0.1);
    }
  }
  
  &.readonly {
    background-color: var(--color-surface);
    cursor: default;
  }
  
  &.disabled {
    background-color: var(--color-surface);
    color: var(--color-text-muted);
    cursor: not-allowed;
    opacity: 0.6;
  }
  
  &.clearable {
    padding-right: 32px;
  }
  
  &::placeholder {
    color: var(--color-text-muted);
  }
}

/* Sizes */
.size-sm {
  padding: 6px 12px;
  font-size: var(--font-size-sm);
  
  &.clearable {
    padding-right: 28px;
  }
}

.size-md {
  padding: 8px 16px;
  font-size: var(--font-size-base);
  
  &.clearable {
    padding-right: 32px;
  }
}

.size-lg {
  padding: 12px 16px;
  font-size: var(--font-size-md);
  
  &.clearable {
    padding-right: 36px;
  }
}

.clear-button {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1;
}

.input-help {
  font-size: var(--font-size-xs);
  margin-top: 4px;
}

.error-text {
  color: var(--color-error);
}

.hint-text {
  color: var(--color-text-muted);
}

.input-wrapper.disabled {
  opacity: 0.6;
}

.input-wrapper.error .input-label {
  color: var(--color-error);
}

/* Responsive adjustments */
@media (max-width: 480px) {
  .base-input {
    min-height: 44px; /* Touch target size */
  }
}
</style>