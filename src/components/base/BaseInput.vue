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
        :dir="dir"
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
import './BaseInput.scss'
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
  },
  dir: {
    type: String,
    default: null,
    validator: (value) => ['ltr', 'rtl', 'auto'].includes(value)
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
