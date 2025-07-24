<template>
  <div class="provider-selector" :class="{ compact: mode === 'compact' }">
    <label v-if="mode !== 'compact'" class="provider-label">
      Translation Provider
    </label>
    
    <select
      :value="modelValue"
      class="provider-select"
      @change="handleChange"
    >
      <option 
        v-for="provider in availableProviders" 
        :key="provider.id" 
        :value="provider.id"
      >
        {{ provider.name }}
      </option>
    </select>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  modelValue: {
    type: String,
    required: true
  },
  mode: {
    type: String,
    default: 'normal',
    validator: (value) => ['normal', 'compact'].includes(value)
  }
})

const emit = defineEmits(['update:modelValue', 'change'])

// Mock providers - will be replaced with real provider registry
const availableProviders = ref([
  { id: 'google', name: 'Google Translate' },
  { id: 'openai', name: 'OpenAI GPT' },
  { id: 'gemini', name: 'Google Gemini' },
  { id: 'deepseek', name: 'DeepSeek' },
  { id: 'bing', name: 'Bing Translator' },
  { id: 'yandex', name: 'Yandex Translate' }
])

const handleChange = (event) => {
  const value = event.target.value
  emit('update:modelValue', value)
  emit('change', value)
}
</script>

<style scoped>
.provider-selector {
  padding: 8px 16px;
  border-top: 1px solid var(--color-border);
  
  &.compact {
    padding: 8px 16px 16px;
  }
}

.provider-label {
  display: block;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin-bottom: 4px;
}

.provider-select {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-base);
  font-size: var(--font-size-sm);
  background-color: var(--color-background);
  color: var(--color-text);
  cursor: pointer;
  
  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }
}
</style>