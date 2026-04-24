<template>
  <div
    ref="dropdownRef"
    class="dropdown-wrapper"
  >
    <div
      class="dropdown-trigger"
      :class="{ active: isOpen, disabled: props.disabled }"
      :tabindex="props.disabled ? -1 : 0"
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
import './BaseDropdown.scss'
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
    elements[0].focus({ preventScroll: true })
  }
}

const focusLast = () => {
  const elements = getFocusableElements()
  if (elements.length > 0) {
    elements[elements.length - 1].focus({ preventScroll: true })
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
