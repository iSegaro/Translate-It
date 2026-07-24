<template>
  <div
    ref="rootRef"
    class="toolbar-menu"
  >
    <slot
      name="trigger"
      :trigger-attrs="triggerAttrs"
      :trigger-ref="setTriggerRef"
      :on-toggle="toggle"
      :open="isOpen"
      :toggle="toggle"
      :close="close"
    />

    <div
      v-if="isOpen"
      class="toolbar-menu__backdrop"
      aria-hidden="true"
      @click="close"
    />

    <div
      v-if="isOpen"
      ref="menuRef"
      class="toolbar-menu__panel"
      role="menu"
      @keydown.escape="close"
    >
      <slot
        :close="close"
        :is-open="isOpen"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref, nextTick } from 'vue'
import { useResourceTracker } from '@/composables/core/useResourceTracker.js'

const emit = defineEmits(['open', 'close'])

const tracker = useResourceTracker('toolbar-menu')
const rootRef = ref(null)
const menuRef = ref(null)
const isOpen = ref(false)
const triggerEl = ref(null)

const triggerAttrs = computed(() => ({
  'aria-expanded': isOpen.value,
  'aria-haspopup': 'menu'
}))

function setTriggerRef(el) {
  triggerEl.value = el instanceof HTMLElement ? el : null
}

function open() {
  isOpen.value = true
  emit('open')
  nextTick(() => {
    const first = menuRef.value?.querySelector(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    first?.focus({ preventScroll: true })
  })
}

function close() {
  isOpen.value = false
  emit('close')
  triggerEl.value?.focus()
}

function toggle() {
  if (isOpen.value) {
    close()
  } else {
    open()
  }
}

function handleOutsidePointer(event) {
  if (!isOpen.value) return
  if (rootRef.value && !rootRef.value.contains(event.target)) {
    close()
  }
}

function handleEscKey(event) {
  if (event.key === 'Escape' && isOpen.value) {
    close()
  }
}

function handleFocusOutside(event) {
  if (!isOpen.value) return
  if (rootRef.value && !rootRef.value.contains(event.target)) {
    close()
  }
}

defineExpose({ open, close, toggle, isOpen })

onMounted(() => {
  tracker.addEventListener(document, 'pointerdown', handleOutsidePointer, true)
  tracker.addEventListener(document, 'keydown', handleEscKey)
  tracker.addEventListener(document, 'focusin', handleFocusOutside)
})

onBeforeUnmount(() => {
  if (isOpen.value) {
    isOpen.value = false
  }
})
</script>

<style lang="scss" scoped>
@use './ToolbarMenu.scss';
</style>
