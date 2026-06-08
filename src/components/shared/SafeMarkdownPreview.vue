<!-- eslint-disable vue/no-v-html -->
<template>
  <div
    class="safe-markdown-preview"
    v-bind="$attrs"
    :dir="props.dir"
    v-html="props.html"
  />
</template>

<script setup>
defineOptions({
  inheritAttrs: false,
});

// Trusted HTML must be produced by renderMarkdownPreview() before being passed here.
const props = defineProps({
  html: {
    type: String,
    default: "",
  },
  dir: {
    type: String,
    default: undefined,
  },
});
</script>
