<template>
  <span
    class="svg-icon"
    :style="maskStyle"
    :role="ariaLabel ? 'img' : undefined"
    :aria-label="ariaLabel || undefined"
    :aria-hidden="ariaLabel ? undefined : 'true'"
  />
</template>

<script setup>
import { computed } from 'vue'
import './SvgIcon.scss'

const props = defineProps({
  src: {
    type: String,
    required: true
  },
  size: {
    type: [String, Number],
    default: '1em'
  },
  ariaLabel: {
    type: String,
    default: ''
  }
})

const iconSize = computed(() => {
  return typeof props.size === 'number' ? `${props.size}px` : props.size
})

const maskStyle = computed(() => ({
  width: iconSize.value,
  height: iconSize.value,
  maskImage: `url("${props.src}")`,
  WebkitMaskImage: `url("${props.src}")`
}))
</script>
