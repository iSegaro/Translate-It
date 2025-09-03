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

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
  backdrop-filter: blur(2px);
}

.modal-container {
  background-color: var(--color-background);
  border-radius: var(--border-radius-lg);
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  max-height: calc(100vh - 32px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  
  &.fullscreen {
    width: 100vw;
    height: 100vh;
    max-height: 100vh;
    border-radius: 0;
    margin: 0;
  }
}

/* Sizes */
.size-sm {
  width: 100%;
  max-width: 400px;
}

.size-md {
  width: 100%;
  max-width: 500px;
}

.size-lg {
  width: 100%;
  max-width: 700px;
}

.size-xl {
  width: 100%;
  max-width: 900px;
}

.modal-header {
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.modal-title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text);
}

.close-button {
  margin-left: 16px;
}

.modal-body {
  padding: 24px;
  flex: 1;
  overflow-y: auto;
}

.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--color-border);
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  flex-shrink: 0;
}

/* Transitions */
.modal-enter-active, .modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-from, .modal-leave-to {
  opacity: 0;
}

.modal-enter-active .modal-container,
.modal-leave-active .modal-container {
  transition: transform 0.3s ease;
}

.modal-enter-from .modal-container,
.modal-leave-to .modal-container {
  transform: scale(0.9) translateY(-20px);
}

/* Responsive adjustments */
@media (max-width: 640px) {
  .modal-overlay {
    padding: 8px;
  }
  
  .modal-container {
    max-height: calc(100vh - 16px);
  }
  
  .size-sm, .size-md, .size-lg, .size-xl {
    max-width: 100%;
  }
  
  .modal-header {
    padding: 16px 20px;
  }
  
  .modal-body {
    padding: 20px;
  }
  
  .modal-footer {
    padding: 12px 20px;
    flex-direction: column-reverse;
  }
  
  .modal-footer > * {
    width: 100%;
  }
}

@media (max-width: 480px) {
  .modal-overlay {
    align-items: flex-end;
    padding: 0;
  }
  
  .modal-container {
    border-radius: var(--border-radius-lg) var(--border-radius-lg) 0 0;
    max-height: 90vh;
    width: 100%;
  }
  
  .modal-enter-from .modal-container,
  .modal-leave-to .modal-container {
    transform: translateY(100%);
  }
}
</style>