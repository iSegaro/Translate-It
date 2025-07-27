<template>
  <select
    :value="modelValue"
    @change="$emit('update:modelValue', $event.target.value)"
    class="language-select"
    :title="title"
    :disabled="disabled"
  >
    <option v-if="showAutoDetect" value="auto">
      {{ $i18n('auto_detect') || 'تشخیص خودکار' }}
    </option>
    <option
      v-for="language in availableLanguages"
      :key="language.code"
      :value="language.name"
    >
      {{ language.name }}
    </option>
  </select>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getAvailableLanguages } from '@/utils/languages.js'

// Props
defineProps({
  modelValue: {
    type: String,
    required: true
  },
  title: {
    type: String,
    default: ''
  },
  showAutoDetect: {
    type: Boolean,
    default: false
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

// Emits
defineEmits(['update:modelValue'])

// State
const availableLanguages = ref([])

// Initialize
onMounted(async () => {
  try {
    availableLanguages.value = await getAvailableLanguages()
  } catch (error) {
    console.error('Error loading available languages:', error)
    // Fallback to basic languages
    availableLanguages.value = [
      { code: 'en', name: 'English' },
      { code: 'fa', name: 'Persian' },
      { code: 'ar', name: 'Arabic' },
      { code: 'fr', name: 'French' },
      { code: 'de', name: 'German' },
      { code: 'es', name: 'Spanish' }
    ]
  }
})
</script>

<style scoped>
.language-select {
  flex: 1;
  min-width: 100px;
  padding: 7px 8px;
  font-size: 14px;
  border: 1px solid var(--language-select-border-color);
  border-radius: 4px;
  background-color: var(--language-select-bg-color);
  color: var(--language-select-text-color);
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  background-image: url('data:image/svg+xml;charset=US-ASCII,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="5" viewBox="0 0 10 5"><path fill="%236c757d" d="M0 0l5 5 5-5z"/></svg>');
  background-repeat: no-repeat;
  background-position: left 8px center;
  background-size: 10px 5px;
  padding-left: 25px;
  filter: var(--icon-filter);
}

.language-select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>