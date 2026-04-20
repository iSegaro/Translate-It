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
import './LanguageDropdown.scss'
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
