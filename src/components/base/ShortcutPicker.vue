<template>
  <div class="shortcut-picker">
    <BaseButton
      class="shortcut-button"
      :class="{ 'recording': isRecording }"
      :disabled="disabled"
      @click="toggleRecording"
    >
      <span v-if="!shortcut">{{ placeholder || 'Click to set shortcut' }}</span>
      <span v-else class="shortcut-display">{{ formatShortcut(shortcut) }}</span>
    </BaseButton>

    <div v-if="isRecording" class="recording-overlay">
      <div class="recording-dialog">
        <div class="dialog-header">
          <h4>{{ t('shortcut_recording_title') || 'Press Your Shortcut' }}</h4>
          <button
            class="clear-button"
            @click="clearCurrentKeys"
            :disabled="currentKeys.length === 0"
            :title="t('clear') || 'Clear'"
          >
            ✕
          </button>
        </div>
        <div class="current-keys">
          <span v-if="currentKeys.length === 0" class="placeholder">
            {{ t('shortcut_waiting') || 'Waiting for keys...' }}
          </span>
          <kbd v-else v-for="key in currentKeys" :key="key" class="key-display">
            {{ formatKey(key) }}
          </kbd>
        </div>
        <p>{{ t('shortcut_recording_instruction') || 'Press the keys you want to use for this shortcut.' }}</p>
        <div class="recording-actions">
          <BaseButton
            variant="secondary"
            @click="cancelRecording"
          >
            {{ t('cancel') || 'Cancel' }}
          </BaseButton>
          <BaseButton
            variant="primary"
            :disabled="currentKeys.length === 0"
            @click="confirmShortcut"
          >
            {{ t('confirm') || 'Confirm' }}
          </BaseButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  placeholder: {
    type: String,
    default: ''
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue'])

const { t } = useUnifiedI18n()
const isRecording = ref(false)
const currentKeys = ref([])
const shortcut = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const toggleRecording = () => {
  if (props.disabled || isRecording.value) return
  isRecording.value = true
  currentKeys.value = []
  document.addEventListener('keydown', handleKeyDown)
  document.addEventListener('keyup', handleKeyUp)
}

const cancelRecording = () => {
  isRecording.value = false
  currentKeys.value = []
  removeKeyListeners()
}

const clearCurrentKeys = () => {
  currentKeys.value = []
}

const confirmShortcut = () => {
  if (currentKeys.value.length > 0) {
    shortcut.value = currentKeys.value.join('+')
  }
  cancelRecording()
}

const handleKeyDown = (event) => {
  if (isRecording.value) {
    event.preventDefault()
    event.stopPropagation()

    // Handle Enter key to confirm
    if (event.key === 'Enter') {
      if (currentKeys.value.length > 0) {
        confirmShortcut()
      }
      return
    }

    // Handle Escape key to cancel
    if (event.key === 'Escape') {
      cancelRecording()
      return
    }

    // Handle Backspace as delete last key
    if (event.key === 'Backspace') {
      if (currentKeys.value.length > 0) {
        currentKeys.value.pop() // Remove last key
      }
      return
    }

    const key = normalizeKey(event.key)
    if (key) {
      const validModifiers = ['Ctrl', 'Alt', 'Shift', 'Cmd']

      // Only process non-modifier keys
      if (!validModifiers.includes(key)) {
        // Always start fresh for non-modifier keys
        currentKeys.value = []

        // Add the main key
        currentKeys.value.push(key)

        // Add any currently pressed modifier keys
        if (event.ctrlKey) {
          currentKeys.value.unshift('Ctrl')
        }
        if (event.altKey) {
          currentKeys.value.unshift('Alt')
        }
        if (event.shiftKey) {
          currentKeys.value.unshift('Shift')
        }
        if (event.metaKey) {
          currentKeys.value.unshift('Cmd')
        }
      }
      // Don't do anything for modifier keys alone
    }
  }
}

const handleKeyUp = (event) => {
  if (isRecording.value) {
    event.preventDefault()
    event.stopPropagation()
    // Don't auto-confirm - wait for user to click Confirm button
  }
}

const removeKeyListeners = () => {
  document.removeEventListener('keydown', handleKeyDown)
  document.removeEventListener('keyup', handleKeyUp)
}

const normalizeKey = (key) => {
  // Normalize modifier keys
  if (key === 'Control') return 'Ctrl'
  if (key === 'Meta') return 'Cmd'
  if (key === ' ') return 'Space'

  // Only allow valid modifier keys and printable characters
  const validModifiers = ['Ctrl', 'Alt', 'Shift', 'Cmd']
  const validKeys = /^[A-Za-z0-9`~!@#$%^&*()\-_=+\[\]{};:'",.<>\/\\|?]$/

  if (validModifiers.includes(key)) return key
  if (validKeys.test(key) && key.length === 1) return key.toUpperCase()
  if (key.length === 1) return key.toUpperCase()

  return null
}

const formatKey = (key) => {
  // Special formatting for better readability
  const keyMap = {
    'Ctrl': 'Ctrl',
    'Alt': 'Alt',
    'Shift': 'Shift',
    'Cmd': '⌘',
    'Space': 'Space'
  }
  return keyMap[key] || key
}

const formatShortcut = (shortcutString) => {
  if (!shortcutString) return ''
  return shortcutString.split('+').map(key => formatKey(key)).join(' + ')
}

onUnmounted(() => {
  removeKeyListeners()
})
</script>

<style lang="scss" scoped>
@use "@/assets/styles/base/variables" as *;

.shortcut-picker {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  max-width: 100%;
}

.shortcut-button {
  min-width: 120px;
  max-width: 180px;
  width: 100%;
  padding: $spacing-xs $spacing-sm;
  text-align: left;
  font-family: monospace;
  font-size: $font-size-xs;
  height: 32px;
  white-space: nowrap;
  overflow: hidden;

  &.recording {
    background-color: var(--color-primary);
    color: white;
  }

  &.inline-picker {
    min-width: 120px;
    max-width: 160px;
  }
}

.shortcut-display {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
  max-width: 100%;
}

.recording-overlay {
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
}

.recording-dialog {
  background-color: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: $border-radius-md;
  padding: $spacing-xl;
  box-shadow: $shadow-lg;
  max-width: 400px;
  width: 90%;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: $spacing-md;

  h4 {
    margin: 0;
    color: var(--color-text);
  }
}

.clear-button {
  background: none;
  border: none;
  font-size: 18px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--color-text-secondary);
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    background-color: var(--color-surface);
    color: var(--color-text);
  }

  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
}

.current-keys {
  min-height: 40px;
  margin-bottom: $spacing-md;
  display: flex;
  gap: $spacing-xs;
  flex-wrap: wrap;
  align-items: center;
}

.placeholder {
  color: var(--color-text-secondary);
  font-style: italic;
}

.recording-dialog p {
  margin-bottom: $spacing-lg;
  color: var(--color-text-secondary);
}

.key-display {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: $border-radius-sm;
  padding: $spacing-xs $spacing-sm;
  font-family: monospace;
  font-size: $font-size-sm;
  color: var(--color-text);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.recording-actions {
  display: flex;
  gap: $spacing-md;
  justify-content: flex-end;
}
</style>