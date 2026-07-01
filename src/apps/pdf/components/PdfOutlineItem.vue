<template>
  <li class="pdf-outline-item">
    <div
      class="pdf-outline-item__row"
      @click="handleClick"
    >
      <button
        v-if="hasChildren"
        class="pdf-outline-item__toggle"
        :class="{ 'pdf-outline-item__toggle--expanded': isExpanded }"
        type="button"
        @click.stop="toggle"
      >
        <span class="pdf-outline-item__chevron" />
      </button>
      <span
        v-else
        class="pdf-outline-item__spacer"
      />
      <span
        class="pdf-outline-item__label"
        :style="labelStyle"
      >{{ node.title }}</span>
    </div>
    <ul
      v-if="hasChildren && isExpanded"
      class="pdf-outline-item__children"
    >
      <PdfOutlineItem
        v-for="child in node.items"
        :key="nodeKey(child)"
        :node="child"
        @navigate="$emit('navigate', $event)"
      />
    </ul>
  </li>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  node: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['navigate'])

const isExpanded = ref(false)

const hasChildren = computed(() => {
  return Array.isArray(props.node.items) && props.node.items.length > 0
})

const labelStyle = computed(() => {
  const style = {}
  if (props.node.bold) style.fontWeight = '700'
  if (props.node.italic) style.fontStyle = 'italic'
  return style
})

function nodeKey(node) {
  if (node.dest) {
    return typeof node.dest === 'string' ? node.dest : JSON.stringify(node.dest)
  }
  if (node.url) return node.url
  return node.title
}

function toggle() {
  isExpanded.value = !isExpanded.value
}

function handleClick() {
  if (props.node.dest) {
    emit('navigate', props.node.dest)
  }
}
</script>

<script>
export default { name: 'PdfOutlineItem' }
</script>
