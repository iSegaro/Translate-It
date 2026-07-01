<template>
  <li class="pdf-outline-item">
    <div
      class="pdf-outline-item__row"
      :class="{ 'pdf-outline-item__row--active': isActive }"
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
        :active-dest="activeDest"
        :expanded-dests="expandedDests"
        @navigate="$emit('navigate', $event)"
      />
    </ul>
  </li>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { destKey } from '@/features/pdf-translation/core/NavigationModels.js'

const props = defineProps({
  node: {
    type: Object,
    required: true
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

const emit = defineEmits(['navigate'])

const userState = ref(null)

const hasChildren = computed(() => {
  return Array.isArray(props.node.items) && props.node.items.length > 0
})

const isExpanded = computed(() => {
  if (userState.value !== null) return userState.value
  if (!props.expandedDests || !props.node.dest) return false
  return props.expandedDests.has(destKey(props.node.dest))
})

watch(() => props.activeDest, () => {
  userState.value = null
})

const isActive = computed(() => {
  if (!props.activeDest || !props.node.dest) return false
  return props.activeDest === props.node.dest
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
  userState.value = !isExpanded.value
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
