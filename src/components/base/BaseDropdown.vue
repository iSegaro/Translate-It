<template>
  <div
    ref="dropdownRef"
    class="dropdown-wrapper"
  >
    <div
      class="dropdown-trigger"
      :class="{ active: isOpen }"
      tabindex="0"
      @click="toggle"
      @keydown.enter.prevent="toggle"
      @keydown.space.prevent="toggle"
      @keydown.escape="close"
      @keydown.arrow-down.prevent="openAndFocusFirst"
      @keydown.arrow-up.prevent="openAndFocusLast"
    >
      <slot
        name="trigger"
        :open="isOpen"
        :toggle="toggle"
      />
    </div>
    
    <Transition name="dropdown">
      <div
        v-if="isOpen"
        class="dropdown-menu"
        :class="[`position-${position}`, `size-${size}`]"
        :dir="props.dir"
        @keydown.escape="close"
        @keydown.arrow-down.prevent="focusNext"
        @keydown.arrow-up.prevent="focusPrevious"
        @keydown.home.prevent="focusFirst"
        @keydown.end.prevent="focusLast"
      >
        <slot
          :close="close"
          :is-open="isOpen"
        />
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useResourceTracker } from '@/composables/core/useResourceTracker.js'

const props = defineProps({
  position: {
    type: String,
    default: 'bottom-start',
    validator: (value) => [
      'top-start', 'top-end', 'bottom-start', 'bottom-end',
      'left-start', 'left-end', 'right-start', 'right-end'
    ].includes(value)
  },
  size: {
    type: String,
    default: 'md',
    validator: (value) => ['sm', 'md', 'lg'].includes(value)
  },
  closeOnSelect: {
    type: Boolean,
    default: true
  },
  disabled: {
    type: Boolean,
    default: false
  },
  dir: {
    type: String,
    default: 'ltr',
    validator: (value) => ['ltr', 'rtl', 'auto'].includes(value)
  }
})

const emit = defineEmits(['open', 'close', 'toggle'])

// Resource tracker for automatic cleanup
const tracker = useResourceTracker('base-dropdown')

const dropdownRef = ref(null)
const isOpen = ref(false)

const open = async () => {
  if (props.disabled) return
  
  isOpen.value = true
  emit('open')
  emit('toggle', true)
  
  await nextTick()
  // Focus first focusable element in dropdown
  focusFirst()
}

const close = () => {
  isOpen.value = false
  emit('close')
  emit('toggle', false)
  
  // Return focus to trigger
  const trigger = dropdownRef.value?.querySelector('.dropdown-trigger')
  trigger?.focus()
}

const toggle = () => {
  if (isOpen.value) {
    close()
  } else {
    open()
  }
}

const openAndFocusFirst = () => {
  if (!isOpen.value) {
    open()
  } else {
    focusFirst()
  }
}

const openAndFocusLast = () => {
  if (!isOpen.value) {
    open().then(() => focusLast())
  } else {
    focusLast()
  }
}

const getFocusableElements = () => {
  if (!dropdownRef.value) return []
  
  const menu = dropdownRef.value.querySelector('.dropdown-menu')
  if (!menu) return []
  
  return Array.from(
    menu.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])'
    )
  )
}

const focusFirst = () => {
  const elements = getFocusableElements()
  if (elements.length > 0) {
    elements[0].focus()
  }
}

const focusLast = () => {
  const elements = getFocusableElements()
  if (elements.length > 0) {
    elements[elements.length - 1].focus()
  }
}

const focusNext = () => {
  const elements = getFocusableElements()
  const currentIndex = elements.indexOf(document.activeElement)
  
  if (currentIndex < elements.length - 1) {
    elements[currentIndex + 1].focus()
  } else {
    elements[0].focus() // Wrap to first
  }
}

const focusPrevious = () => {
  const elements = getFocusableElements()
  const currentIndex = elements.indexOf(document.activeElement)
  
  if (currentIndex > 0) {
    elements[currentIndex - 1].focus()
  } else {
    elements[elements.length - 1].focus() // Wrap to last
  }
}

const handleClickOutside = (event) => {
  if (isOpen.value && dropdownRef.value && !dropdownRef.value.contains(event.target)) {
    close()
  }
}

const handleSelect = () => {
  if (props.closeOnSelect) {
    close()
  }
}

// Expose select handler for child components
defineExpose({
  close,
  open,
  toggle,
  handleSelect
})

onMounted(() => {
  // Add click and focus listeners with automatic cleanup
  tracker.addEventListener(document, 'click', handleClickOutside)
  tracker.addEventListener(document, 'focusin', handleClickOutside)
})

onUnmounted(() => {
  // Event listeners cleanup is now handled automatically by useResourceTracker
  // No manual cleanup needed!
})
</script>

<style scoped>
.dropdown-wrapper {
  position: relative;
  display: inline-block;
  z-index: 1001;
}

.dropdown-trigger {
  cursor: pointer;
  outline: none;
  display: block;
  
  &:focus {
    box-shadow: 0 0 0 2px var(--color-primary), 0 0 0 4px rgba(25, 118, 210, 0.1);
    border-radius: var(--border-radius-base);
  }
  
  &.active {
    z-index: 1002;
  }
}

/* Scoped styles for dropdown menu */
.dropdown-menu {
  position: absolute;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  padding: 5px;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.dropdown-menu :deep(.dropdown-item) {
  width: 100%;
  text-align: start;
  background: none;
  border: none;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 14px;
  color: var(--color-text);
  border-radius: 4px;
  transition: background-color 0.2s;
  display: block;
  white-space: nowrap;

  &:hover {
    background-color: var(--color-background);
    color: var(--color-primary);
  }
}

/* Positioning */
.position-top-start {
  bottom: 100%;
  left: 0 !important;
  margin-bottom: 4px;
}

.position-top-end {
  bottom: 100%;
  right: 0 !important;
  margin-bottom: 4px;
}

.position-bottom-start {
  top: 100%;
  left: 0 !important;
  margin-top: 4px;
}

.position-bottom-end {
  top: 100%;
  right: 0 !important;
  margin-top: 4px;
}

.position-left-start {
  top: 0;
  right: 100%;
  margin-right: 4px;
}

.position-left-end {
  bottom: 0;
  right: 100%;
  margin-right: 4px;
}

.position-right-start {
  top: 0;
  left: 100%;
  margin-left: 4px;
}

.position-right-end {
  bottom: 0;
  left: 100%;
  margin-left: 4px;
}

/* Sizes */
.size-sm {
  min-width: 120px;
  max-height: 200px;
}

.size-md {
  min-width: 180px;
  max-height: 300px;
}

.size-lg {
  min-width: 240px;
  max-height: 400px;
}

/* Transitions */
.dropdown-enter-active, .dropdown-leave-active {
  transition: all 0.2s ease;
  transform-origin: top;
}

.dropdown-enter-from {
  opacity: 0;
  transform: scale(0.95) translateY(-4px);
}

.dropdown-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(-4px);
}

/* Positioning adjustments for different directions */
.position-top-start.dropdown-enter-from,
.position-top-end.dropdown-enter-from {
  transform: scale(0.95) translateY(4px);
  transform-origin: bottom;
}

.position-left-start.dropdown-enter-from,
.position-left-end.dropdown-enter-from {
  transform: scale(0.95) translateX(4px);
  transform-origin: right;
}

.position-right-start.dropdown-enter-from,
.position-right-end.dropdown-enter-from {
  transform: scale(0.95) translateX(-4px);
  transform-origin: left;
}

/* Responsive adjustments */
@media (max-width: 480px) {
  .dropdown-menu {
    max-width: calc(100vw - 32px);
    max-height: 50vh;
  }
  
  .position-top-start, .position-top-end,
  .position-bottom-start, .position-bottom-end {
    left: 0;
    right: auto;
  }
}

/* Custom scrollbar for dropdown menu */
.dropdown-menu::-webkit-scrollbar {
  width: 6px;
}

.dropdown-menu::-webkit-scrollbar-track {
  background: transparent;
}

.dropdown-menu::-webkit-scrollbar-thumb {
  background-color: var(--color-border);
  border-radius: 3px;
}

.dropdown-menu::-webkit-scrollbar-thumb:hover {
  background-color: var(--color-text-muted);
}
</style>