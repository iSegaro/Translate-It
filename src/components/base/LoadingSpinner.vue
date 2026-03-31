<template>
  <div 
    class="loading-spinner"
    :class="{ 
      [`size-${size}`]: true,
      [`variant-${variant}`]: true,
      'is-animated': type === 'animated'
    }"
  >
    <img
      v-if="type === 'animated'"
      :src="loadingGifUrl"
      class="loading-gif"
      alt="Loading..."
    >
    <div 
      v-else
      class="spinner" 
    />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import browser from 'webextension-polyfill'

// Import adjacent SCSS
import './LoadingSpinner.scss'

const props = defineProps({
  size: {
    type: String,
    default: 'md',
    validator: (value) => ['xs', 'sm', 'md', 'lg', 'xl'].includes(value)
  },
  variant: {
    type: String,
    default: 'primary',
    validator: (value) => ['primary', 'secondary', 'neutral'].includes(value)
  },
  type: {
    type: String,
    default: 'spinner', // spinner, animated
    validator: (value) => ['spinner', 'animated'].includes(value)
  }
})

// Loading GIF URL using browser extension API
const loadingGifUrl = computed(() => {
  try {
    return browser.runtime.getURL('icons/ui/loading.gif')
  } catch {
    return ''
  }
})
</script>
