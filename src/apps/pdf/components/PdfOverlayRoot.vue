<template>
  <div
    :ref="setRoot"
    class="pdf-overlay-root"
  />
</template>

<script setup>
defineProps({
  setRoot: {
    type: Function,
    default: () => {}
  }
})
</script>

<style lang="scss" scoped>
.pdf-overlay-root {
  position: relative;
  z-index: 0;
  pointer-events: none;

  > * {
    pointer-events: auto;
  }
}
</style>
