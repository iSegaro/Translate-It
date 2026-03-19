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
      :style="{ width: spinnerSize + 'px', height: spinnerSize + 'px' }"
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

const spinnerSize = computed(() => {
  switch (props.size) {
    case 'xs': return 12
    case 'sm': return 16
    case 'md': return 20
    case 'lg': return 24
    case 'xl': return 32
    default: return 20
  }
})
</script>

<style scoped>
.loading-spinner {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.spinner {
  border-radius: 50%;
  border: 2px solid var(--color-border, #dee2e6);
  border-top-color: var(--color-primary, #1967d2);
  animation: spin 1s linear infinite;
  width: 100%;
  height: 100%;
}

.loading-gif {
  object-fit: contain;
  display: block;
}

/* Sizes (for traditional spinner) */
.size-xs .spinner { width: 12px; height: 12px; border-width: 1px; }
.size-sm .spinner { width: 16px; height: 16px; border-width: 2px; }
.size-md .spinner { width: 20px; height: 20px; border-width: 2px; }
.size-lg .spinner { width: 24px; height: 24px; border-width: 3px; }
.size-xl .spinner { width: 32px; height: 32px; border-width: 3px; }

/* Variants */
.variant-primary .spinner { border-top-color: var(--color-primary, #1967d2); }
.variant-secondary .spinner { border-top-color: var(--color-secondary, #6c757d); }
.variant-neutral .spinner {
  border-top-color: currentColor;
  border-left-color: rgba(255, 255, 255, 0.1);
  border-right-color: rgba(255, 255, 255, 0.1);
  border-bottom-color: rgba(255, 255, 255, 0.1);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>