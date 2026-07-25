<template>
  <div
    ref="rootRef"
    class="toolbar-menu"
    :class="rootClasses"
    :style="rootStyle"
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

    <!-- Desktop: inline anchored popover -->
    <template v-if="!isMobile">
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
    </template>

    <!-- Mobile: teleported full-height drawer -->
    <Teleport
      v-else
      to="body"
    >
      <Transition name="toolbar-menu-backdrop">
        <div
          v-if="isOpen"
          class="toolbar-menu__backdrop"
          aria-hidden="true"
          @click="close"
        />
      </Transition>

      <Transition name="toolbar-menu--drawer">
        <div
          v-if="isOpen"
          ref="menuRef"
          class="toolbar-menu__drawer"
          role="menu"
          @keydown.escape="close"
        >
          <div class="toolbar-menu__drawer-header">
            <span class="toolbar-menu__drawer-title">More</span>
            <button
              class="toolbar-menu__drawer-close"
              type="button"
              aria-label="Close menu"
              @click="close"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <div class="toolbar-menu__drawer-body">
            <slot
              :close="close"
              :is-open="isOpen"
            />
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref, nextTick } from 'vue'
import { useResourceTracker } from '@/composables/core/useResourceTracker.js'

const props = defineProps({
  variant: {
    type: String,
    default: null
  },
  placement: {
    type: String,
    default: 'end',
    validator: (v) => ['start', 'end'].includes(v)
  },
  offset: {
    type: Number,
    default: 8
  }
})

const emit = defineEmits(['open', 'close'])

const rootClasses = computed(() => {
  const classes = []
  if (props.variant) classes.push(`toolbar-menu--${props.variant}`)
  classes.push(`toolbar-menu--placement-${props.placement}`)
  return classes
})

const rootStyle = computed(() => ({
  '--tm-offset': `${props.offset}px`
}))

const tracker = useResourceTracker('toolbar-menu')
const rootRef = ref(null)
const menuRef = ref(null)
const isOpen = ref(false)
const isMobile = ref(false)
const triggerEl = ref(null)

let mediaQuery = null

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
  if (rootRef.value?.contains(event.target)) return
  if (menuRef.value?.contains(event.target)) return
  close()
}

function handleEscKey(event) {
  if (event.key === 'Escape' && isOpen.value) {
    close()
  }
}

function handleFocusOutside(event) {
  if (!isOpen.value) return
  if (rootRef.value?.contains(event.target)) return
  if (menuRef.value?.contains(event.target)) return
  close()
}

defineExpose({ open, close, toggle, isOpen })

onMounted(() => {
  if (typeof window.matchMedia === 'function') {
    mediaQuery = window.matchMedia('(max-width: 749px)')
    isMobile.value = mediaQuery.matches
    mediaQuery.addEventListener('change', (e) => { isMobile.value = e.matches })
  }

  tracker.addEventListener(document, 'pointerdown', handleOutsidePointer, true)
  tracker.addEventListener(document, 'keydown', handleEscKey)
  tracker.addEventListener(document, 'focusin', handleFocusOutside)
})

onBeforeUnmount(() => {
  if (mediaQuery) {
    mediaQuery.removeEventListener('change', () => {})
    mediaQuery = null
  }
  if (isOpen.value) {
    isOpen.value = false
  }
})
</script>

<style lang="scss" scoped>
@use './ToolbarMenu.scss';
</style>
