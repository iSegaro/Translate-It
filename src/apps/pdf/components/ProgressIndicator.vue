<template>
  <div
    class="progress-indicator"
    role="progressbar"
    :aria-valuenow="ariaValueNow"
    :aria-valuemin="ariaValueMin"
    :aria-valuemax="ariaValueMax"
    :aria-busy="indeterminate"
    :style="fillStyle"
  />
</template>

<script setup>
import { computed } from 'vue'
import './ProgressIndicator.scss'

const props = defineProps({
  progress: {
    type: Number,
    default: null
  },
  indeterminate: {
    type: Boolean,
    default: false
  }
})

const fillStyle = computed(() => {
  if (props.indeterminate) return {}
  const value = Number(props.progress)
  if (!Number.isFinite(value)) return {}
  return { width: `${Math.max(0, Math.min(100, value))}%` }
})

const ariaValueNow = computed(() => {
  if (props.indeterminate) return undefined
  const value = Number(props.progress)
  if (!Number.isFinite(value)) return undefined
  return Math.max(0, Math.min(100, value))
})

const ariaValueMin = computed(() => {
  return props.indeterminate ? undefined : 0
})

const ariaValueMax = computed(() => {
  return props.indeterminate ? undefined : 100
})
</script>
