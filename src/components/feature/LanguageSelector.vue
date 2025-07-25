<template>
  <div class="language-selector">
    <select
      :value="modelValue"
      :disabled="disabled"
      class="language-select"
      @change="handleChange"
    >
      <option 
        v-for="language in languages" 
        :key="language.code" 
        :value="language.name"
      >
        {{ language.name }}
      </option>
    </select>
  </div>
</template>

<script setup>
const props = defineProps({
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
.language-selector {
  flex: 1;
}

.language-select {
  width: 100%;
  padding: 6px 8px;
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
</style>