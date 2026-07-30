<template>
  <div class="pdf-message-notification">
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
