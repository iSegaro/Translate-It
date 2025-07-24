<template>
  <div 
    class="loading-spinner"
    :class="{ 
      [`size-${size}`]: true,
      [`variant-${variant}`]: true 
    }"
  >
    <div class="spinner" />
  </div>
</template>

<script setup>
defineProps({
  size: {
    type: String,
    default: 'md',
    validator: (value) => ['xs', 'sm', 'md', 'lg', 'xl'].includes(value)
  },
  variant: {
    type: String,
    default: 'primary',
    validator: (value) => ['primary', 'secondary', 'neutral'].includes(value)
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
  border: 2px solid var(--color-border);
  border-top-color: var(--color-primary);
  animation: spin 1s linear infinite;
}

/* Sizes */
.size-xs .spinner {
  width: 12px;
  height: 12px;
  border-width: 1px;
}

.size-sm .spinner {
  width: 16px;
  height: 16px;
  border-width: 2px;
}

.size-md .spinner {
  width: 20px;
  height: 20px;
  border-width: 2px;
}

.size-lg .spinner {
  width: 24px;
  height: 24px;
  border-width: 3px;
}

.size-xl .spinner {
  width: 32px;
  height: 32px;
  border-width: 3px;
}

/* Variants */
.variant-primary .spinner {
  border-top-color: var(--color-primary);
}

.variant-secondary .spinner {
  border-top-color: var(--color-secondary);
}

.variant-neutral .spinner {
  border-top-color: var(--color-text);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>