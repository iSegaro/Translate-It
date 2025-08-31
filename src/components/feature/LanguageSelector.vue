<template>
  <select
    :value="modelValue"
    :disabled="disabled"
    class="language-select"
    @change="handleChange"
  >
    <option 
      v-for="language in languages" 
      :key="language.code" 
      :value="language.code"
    >
      {{ language.name }}
    </option>
  </select>
</template>

<script setup>
defineProps({
  modelValue: {
    type: String,
    required: true
  },
  languages: {
    type: Array,
    required: true
  },
  type: {
    type: String,
    default: 'source',
    validator: (value) => ['source', 'target'].includes(value)
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue'])

const handleChange = (event) => {
  emit('update:modelValue', event.target.value)
}
</script>

<style scoped>
.language-select {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-sm);
  font-size: var(--font-size-sm);
  background-color: var(--color-background);
  color: var(--color-text);
  cursor: pointer;
  
  /* Custom dropdown arrow for better RTL support */
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 8L2 4h8z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  padding-right: 30px;
  
  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background-color: var(--color-surface);
  }
}

/* RTL support for dropdown arrow */
:global(.extension-options.rtl) .language-select {
  background-position: left 8px center;
  padding-right: 8px;
  padding-left: 30px;
  direction: rtl;
}
</style>