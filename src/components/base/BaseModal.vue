<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="modelValue"
        class="modal-overlay"
        @click="handleOverlayClick"
      >
        <div
          class="modal-container"
          :class="[`size-${size}`, { fullscreen }]"
          @click.stop
        >
          <header
            v-if="title || $slots.header"
            class="modal-header"
          >
            <slot name="header">
              <h3 class="modal-title">
                {{ title }}
              </h3>
            </slot>
            <BaseButton
              v-if="closable"
              variant="ghost"
              size="sm"
              icon="close"
              class="close-button"
              @click="handleClose"
            />
          </header>
          
          <div class="modal-body">
            <slot />
          </div>
          
          <footer
            v-if="$slots.footer"
            class="modal-footer"
          >
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { onMounted, onUnmounted, watch } from 'vue'
import BaseButton from './BaseButton.vue'
import { useResourceTracker } from '@/composables/core/useResourceTracker.js'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: null
  },
  size: {
    type: String,
    default: 'md',
    validator: (value) => ['sm', 'md', 'lg', 'xl'].includes(value)
  },
  closable: {
    type: Boolean,
    default: true
  },
  closeOnOverlay: {
    type: Boolean,
    default: true
  },
  closeOnEscape: {
    type: Boolean,
    default: true
  },
  fullscreen: {
    type: Boolean,
    default: false
  },
  scrollLock: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['update:modelValue', 'close', 'open'])

// Resource tracker for automatic cleanup
const tracker = useResourceTracker('base-modal')

const handleClose = () => {
  emit('update:modelValue', false)
  emit('close')
}

const handleOverlayClick = () => {
  if (props.closeOnOverlay && props.closable) {
    handleClose()
  }
}

const handleEscapeKey = (event) => {
  if (event.key === 'Escape' && props.closeOnEscape && props.closable && props.modelValue) {
    handleClose()
  }
}

const lockScroll = () => {
  if (props.scrollLock) {
    document.body.style.overflow = 'hidden'
    document.body.style.paddingRight = `${window.innerWidth - document.documentElement.clientWidth}px`
  }
}

const unlockScroll = () => {
  if (props.scrollLock) {
    document.body.style.overflow = ''
    document.body.style.paddingRight = ''
  }
}

watch(() => props.modelValue, (newValue) => {
  if (newValue) {
    lockScroll()
    emit('open')
  } else {
    unlockScroll()
  }
}, { immediate: true })

onMounted(() => {
  // Add escape key listener with automatic cleanup
  tracker.addEventListener(document, 'keydown', handleEscapeKey)
})

onUnmounted(() => {
  // Event listener cleanup is now handled automatically by useResourceTracker
  // No manual cleanup needed!
  unlockScroll()
})
</script>
