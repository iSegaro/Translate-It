<template>
  <div
    class="operation-status"
    role="status"
    aria-live="polite"
  >
    <span class="operation-status__title">{{ title }}</span>
    <button
      v-if="cancellable"
      class="operation-status__cancel"
      type="button"
      aria-label="Cancel operation"
      @click="$emit('cancel')"
    >
      Cancel
    </button>
  </div>
</template>

<script setup>
import './OperationStatus.scss'

defineProps({
  title: {
    type: String,
    default: ''
  },
  cancellable: {
    type: Boolean,
    default: false
  }
})

defineEmits(['cancel'])
</script>
