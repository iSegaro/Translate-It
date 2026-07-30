<template>
  <div class="pdf-error-notification">
    <p>{{ payload.message }}</p>
  </div>
</template>

<script setup>
defineProps({
  payload: {
    type: Object,
    default: null
  }
})
</script>
