<template>
  <nav
    v-show="visible"
    class="pdf-outline"
  >
    <div class="pdf-outline__header">
      <span class="pdf-outline__title">Outline</span>
      <button
        class="pdf-outline__close"
        type="button"
        aria-label="Close outline"
        @click="$emit('close')"
      >
        <span class="pdf-outline__close-icon" />
      </button>
    </div>
    <ul class="pdf-outline__tree">
      <PdfOutlineItem
        v-for="node in outline"
        :key="nodeKey(node)"
        :node="node"
        :active-dest="activeDest"
        :expanded-dests="expandedDests"
        @navigate="handleNavigate"
      />
    </ul>
  </nav>
</template>

<script setup>
import PdfOutlineItem from './PdfOutlineItem.vue'
import './PdfOutline.scss'

defineProps({
  outline: {
    type: Array,
    default: null
  },
  visible: {
    type: Boolean,
    default: false
  },
  activeDest: {
    type: [String, Array, null],
    default: null
  },
  expandedDests: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'navigate'])

function nodeKey(node) {
  if (node.dest) {
    return typeof node.dest === 'string' ? node.dest : JSON.stringify(node.dest)
  }
  if (node.url) return node.url
  return node.title
}

function handleNavigate(dest) {
  emit('navigate', dest)
}
</script>
