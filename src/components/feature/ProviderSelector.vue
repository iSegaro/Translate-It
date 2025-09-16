<template>
  <select
    :value="modelValue"
    class="ti-provider-select"
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
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getProvidersForDropdown } from '@/core/provider-registry.js'

defineProps({
  modelValue: {
    type: String,
    required: true
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
.ti-provider-select {
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