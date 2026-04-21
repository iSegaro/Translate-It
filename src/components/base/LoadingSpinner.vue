<template>
  <div 
    class="ti-base-loading-spinner"
    :class="[`size-${size}`]"
  >
    <img
      :src="loadingGifUrl"
      class="loading-gif"
      alt="Loading..."
    >
  </div>
</template>

<script setup>
import { computed } from 'vue'
import browser from 'webextension-polyfill'

// Import adjacent SCSS
import './LoadingSpinner.scss'

defineProps({
  size: {
    type: String,
    default: 'md',
    validator: (value) => ['xs', 'sm', 'md', 'lg', 'xl'].includes(value)
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
