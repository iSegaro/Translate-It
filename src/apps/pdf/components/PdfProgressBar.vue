<template>
  <Transition name="pdf-progress-bar">
    <div
      v-if="visible"
      class="pdf-progress-bar"
      role="progressbar"
      :aria-valuenow="ariaValueNow"
      :aria-valuemin="ariaValueMin"
      :aria-valuemax="ariaValueMax"
      :aria-label="operation.title || 'Operation in progress'"
    >
      <div class="pdf-progress-bar__track">
        <div
          class="pdf-progress-bar__fill"
          :class="{
            'pdf-progress-bar__fill--indeterminate': operation.indeterminate
          }"
          :style="fillStyle"
        />
      </div>
      <span
        v-if="operation.title"
        class="pdf-progress-bar__label"
      >{{ operation.title }}</span>
      <button
        v-if="operation.cancellable"
        class="pdf-progress-bar__cancel"
        type="button"
        aria-label="Cancel operation"
        @click="$emit('cancel')"
      >
        Cancel
      </button>
    </div>
  </Transition>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import './PdfProgressBar.scss'

const props = defineProps({
  operation: {
    type: Object,
    required: true
  }
})

defineEmits(['cancel'])

const visible = ref(false)
let hideTimer = null

function clearHideTimer() {
  if (hideTimer !== null) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
}

onBeforeUnmount(() => {
  clearHideTimer()
})

watch(() => props.operation.running, (running) => {
  if (running) {
    clearHideTimer()
    visible.value = true
  } else {
    clearHideTimer()
    hideTimer = setTimeout(() => {
      visible.value = false
      hideTimer = null
    }, 200)
  }
}, { immediate: true })

const fillStyle = computed(() => {
  if (props.operation.indeterminate) return {}
  const progress = Number(props.operation.progress)
  if (!Number.isFinite(progress)) return {}
  return { width: `${Math.max(0, Math.min(100, progress))}%` }
})

const ariaValueNow = computed(() => {
  if (props.operation.indeterminate) return undefined
  const progress = Number(props.operation.progress)
  if (!Number.isFinite(progress)) return undefined
  return Math.max(0, Math.min(100, progress))
})

const ariaValueMin = computed(() => {
  return props.operation.indeterminate ? undefined : 0
})

const ariaValueMax = computed(() => {
  return props.operation.indeterminate ? undefined : 100
})
</script>
