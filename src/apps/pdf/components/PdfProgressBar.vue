<template>
  <div
    v-if="operation.running"
    class="pdf-progress-bar"
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
      @click="$emit('cancel')"
    >
      Cancel
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import './PdfProgressBar.scss'

const props = defineProps({
  operation: {
    type: Object,
    required: true
  }
})

defineEmits(['cancel'])

const fillStyle = computed(() => {
  if (props.operation.indeterminate) return {}
  const progress = Number(props.operation.progress)
  if (!Number.isFinite(progress)) return {}
  return { width: `${Math.max(0, Math.min(100, progress))}%` }
})
</script>
