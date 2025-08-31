<template>
  <select
    :value="modelValue"
    :disabled="disabled"
    class="language-dropdown"
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
.language-dropdown {
  width: 100%;
  padding: 6px 24px 6px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-sm);
  font-size: var(--font-size-sm);
  background-color: var(--color-background);
  color: var(--color-text);
  cursor: pointer;
  
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

/* RTL support - reverse padding and text alignment */
:global(.extension-options.rtl) .language-dropdown {
  text-align: right;
  padding: 6px 8px 6px 24px;
}
</style>