<template>
  <component
    :is="component"
    v-if="component"
    :payload="body?.payload"
  />
</template>

<script setup>
import { computed } from 'vue'
import { resolvePdfNotificationBody } from './PdfNotificationBodyResolver.js'

const props = defineProps({
  body: {
    type: Object,
    default: null
  }
})

const component = computed(() => resolvePdfNotificationBody(props.body?.type))
</script>
