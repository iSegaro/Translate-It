<template>
  <select
    :value="modelValue"
    class="ti-provider-select"
    :class="{ 'variant-activation': variant === 'activation' }"
    :disabled="disabled"
    @change="handleChange"
  >
    <option 
      v-if="allowDefault"
      value="default"
    >
      {{ t('provider_default') || 'Default' }}
    </option>
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
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps({
  modelValue: {
    type: String,
    required: true
  },
  allowDefault: {
    type: Boolean,
    default: false
  },
  disabled: {
    type: Boolean,
    default: false
  },
  variant: {
    type: String,
    default: 'default' // 'default' or 'activation'
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

<style lang="scss" scoped>
.ti-provider-select {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-base);
  font-size: var(--font-size-sm);
  background-color: var(--color-background);
  color: var(--color-text);
  cursor: pointer;
  transition: all 0.2s ease;

  // Dark Mode support - explicit override for select element
  :root.theme-dark &,
  .theme-dark & {
    background-color: #2d2d2d !important;
    color: #e0e0e0 !important;
    border-color: #444 !important;
    
    option {
      background-color: #2d2d2d !important;
      color: #e0e0e0 !important;
    }
  }

  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background-color: var(--color-background-soft);
  }

  // Custom styles for Activation tab
  &.variant-activation {
    background-color: var(--color-background-soft);
    
    &:disabled {
      background-color: var(--color-background);
    }
  }
}
</style>
