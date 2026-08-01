<template>
  <div class="pdf-message-notification">
    <p>{{ payload.message }}</p>
  </div>
</template>

<script setup>
/**
 * @typedef {object} MessageNotificationPayload
 * @property {string} message - Display text for the notification body.
 */
defineProps({
  payload: {
    type: Object,
    default: null
  }
})
</script>
