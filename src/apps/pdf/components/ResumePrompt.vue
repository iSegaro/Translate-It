<template>
  <div class="resume-prompt">
    <p class="resume-prompt__title">{{ descriptor.title }}</p>
    <p class="resume-prompt__subtitle">
      {{ descriptor.pageLabel }} · {{ descriptor.viewLabel }}
    </p>
    <button
      class="resume-prompt__action"
      type="button"
      @click="$emit('resume')"
    >
      Resume Previous PDF
    </button>
  </div>
</template>

<script setup>
defineProps({
  descriptor: {
    type: Object,
    required: true,
  },
})

defineEmits(['resume'])
</script>
