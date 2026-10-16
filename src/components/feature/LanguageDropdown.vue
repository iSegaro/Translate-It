<template>
  <select
    :id="id"
    :value="modelValue"
    :disabled="disabled"
    :aria-invalid="error ? 'true' : undefined"
    :aria-describedby="error ? `${id}-error` : undefined"
    class="language-dropdown"
    @change="handleChange"
  >
    <option 
      v-for="language in languages" 
      :key="language.code" 
      :value="language.code"
    >
      {{ language.name }}{{ language.isBeta ? ` (${betaLabel})` : '' }}
    </option>
  </select>
  <span
    v-if="error"
    :id="`${id}-error`"
    class="language-dropdown-error"
    role="alert"
  >{{ error }}</span>
</template>

<script setup>
import './LanguageDropdown.scss'
defineProps({
  id: { type: String, default: undefined },
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
  },
  error: { type: String, default: '' },
  betaLabel: { type: String, default: 'Beta' }
})

const emit = defineEmits(['update:modelValue'])
const handleChange = (event) => {
  emit('update:modelValue', event.target.value)
}
</script>
