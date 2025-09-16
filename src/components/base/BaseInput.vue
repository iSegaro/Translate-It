<template>
  <div
    class="ti-input-wrapper"
    :class="{ 'ti-input-wrapper--disabled': disabled, 'ti-input-wrapper--error': !!error }"
  >
    <label
      v-if="label"
      :for="inputId"
      class="ti-input__label"
    >
      {{ label }}
      <span
        v-if="required"
        class="ti-input__required"
      >*</span>
    </label>
    
    <div class="ti-input__container">
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
        class="ti-input__clear"
        @click="handleClear"
      />
    </div>
    
    <div
      v-if="error || hint"
      class="ti-input__help"
    >
      <span
        v-if="error"
        class="ti-input__error"
      >{{ error }}</span>
      <span
        v-else-if="hint"
        class="ti-input__hint"
      >{{ hint }}</span>
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
  'ti-input',
  `ti-input--${props.size}`,
  {
    'ti-input--has-error': !!props.error,
    'ti-input--readonly': props.readonly,
    'ti-input--disabled': props.disabled,
    'ti-input--clearable': props.clearable && props.modelValue && !props.disabled
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
.ti-input-wrapper {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ti-input__label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
  margin-bottom: 4px;
}

.ti-input__required {
  color: var(--color-error);
  margin-left: 2px;
}

.ti-input__container {
  position: relative;
  display: flex;
  align-items: center;
}

.ti-input {
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
  
  &--has-error {
    border-color: var(--color-error);
    
    &:focus {
      border-color: var(--color-error);
      box-shadow: 0 0 0 2px rgba(244, 67, 54, 0.1);
    }
  }
  
  &--readonly {
    background-color: var(--color-surface);
    cursor: default;
  }
  
  &--disabled {
    background-color: var(--color-surface);
    color: var(--color-text-muted);
    cursor: not-allowed;
    opacity: 0.6;
  }
  
  &--clearable {
    padding-right: 32px;
  }
  
  &::placeholder {
    color: var(--color-text-muted);
  }
}

/* Sizes */
.ti-input--sm {
  padding: 6px 12px;
  font-size: var(--font-size-sm);
}

.ti-input--sm.ti-input--clearable {
  padding-right: 28px;
}

.ti-input--md {
  padding: 8px 16px;
  font-size: var(--font-size-base);
}

.ti-input--md.ti-input--clearable {
  padding-right: 32px;
}

.ti-input--lg {
  padding: 12px 16px;
  font-size: var(--font-size-md);
}

.ti-input--lg.ti-input--clearable {
  padding-right: 36px;
}

.ti-input__clear {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1;
}

.ti-input__help {
  font-size: var(--font-size-xs);
  margin-top: 4px;
}

.ti-input__error {
  color: var(--color-error);
}

.ti-input__hint {
  color: var(--color-text-muted);
}

.ti-input-wrapper--disabled {
  opacity: 0.6;
}

.ti-input-wrapper--error .ti-input__label {
  color: var(--color-error);
}

/* Responsive adjustments */
@media (max-width: 480px) {
  .ti-input {
    min-height: 44px; /* Touch target size */
  }
}
</style>