<template>
  <div
    class="provider-selector"
    :class="{ compact: mode === 'compact' }"
  >
    <label
      v-if="mode !== 'compact'"
      class="provider-label"
    >
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
import { ref, onMounted } from 'vue'
import { getProvidersForDropdown } from '@/core/provider-registry.js'

defineProps({
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

// Available providers from central registry
const availableProviders = ref([])

onMounted(() => {
  availableProviders.value = getProvidersForDropdown().map(provider => ({
    id: provider.id,
    name: provider.name
  }))
})

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