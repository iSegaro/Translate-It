<template>
  <div 
    ref="pickerRef"
    class="shortcut-picker"
    :class="{ 'is-recording': isRecording }"
  >
    <BaseButton
      class="shortcut-button"
      :class="{ 'recording': isRecording }"
      :disabled="disabled"
      @click="toggleRecording"
    >
      <template v-if="isRecording">
        <span 
          v-if="currentKeys.length === 0" 
          class="recording-placeholder"
        >
          {{ t('shortcut_waiting') || 'Press keys...' }}
        </span>
        <span 
          v-else 
          class="shortcut-display"
        >
          {{ formatShortcut(currentKeys.join('+')) }}
        </span>
      </template>
      <template v-else>
        <span v-if="!shortcut">{{ placeholder || 'Set shortcut' }}</span>
        <span 
          v-else 
          class="shortcut-display"
        >{{ formatShortcut(shortcut) }}</span>
      </template>
    </BaseButton>

    <!-- Inline Actions when recording -->
    <div 
      v-if="isRecording" 
      class="recording-actions-inline"
    >
      <button 
        class="action-btn confirm" 
        :disabled="currentKeys.length === 0"
        :title="t('confirm') || 'Confirm'"
        @click.stop="confirmShortcut"
      >
        ✓
      </button>
      <button 
        class="action-btn cancel" 
        :title="t('cancel') || 'Cancel'"
        @click.stop="cancelRecording"
      >
        ✕
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'
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
const pickerRef = ref(null)

const shortcut = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const toggleRecording = () => {
  if (props.disabled) return
  
  if (isRecording.value) {
    cancelRecording()
  } else {
    isRecording.value = true
    currentKeys.value = []
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('mousedown', handleOutsideClick)
  }
}

const cancelRecording = () => {
  isRecording.value = false
  currentKeys.value = []
  removeKeyListeners()
}

const confirmShortcut = () => {
  if (currentKeys.value.length > 0) {
    shortcut.value = currentKeys.value.join('+')
  }
  cancelRecording()
}

const handleOutsideClick = (event) => {
  if (pickerRef.value && !pickerRef.value.contains(event.target)) {
    cancelRecording()
  }
}

const handleKeyDown = (event) => {
  if (isRecording.value) {
    event.preventDefault()
    event.stopPropagation()

    // Handle Enter key to confirm only if we have keys (and it's not the only key)
    if (event.key === 'Enter') {
      const nonModifiers = currentKeys.value.filter(k => !['Ctrl', 'Alt', 'Shift', 'Cmd'].includes(k))
      if (nonModifiers.length > 0) {
        confirmShortcut()
        return
      }
    }

    // Handle Escape key to cancel
    if (event.key === 'Escape') {
      cancelRecording()
      return
    }

    // Build the current combination
    const keys = []
    
    // Modifiers first
    if (event.ctrlKey) keys.push('Ctrl')
    if (event.altKey) keys.push('Alt')
    if (event.shiftKey) keys.push('Shift')
    if (event.metaKey) keys.push('Cmd')

    const key = normalizeKey(event.key)
    const validModifiers = ['Ctrl', 'Alt', 'Shift', 'Cmd']
    
    if (key && !validModifiers.includes(key)) {
      keys.push(key)
    }

    if (keys.length > 0) {
      currentKeys.value = keys
    }
  }
}

const handleKeyUp = (event) => {
  if (isRecording.value) {
    event.preventDefault()
    event.stopPropagation()
    
    // Live update when keys are released
    const keys = []
    if (event.ctrlKey) keys.push('Ctrl')
    if (event.altKey) keys.push('Alt')
    if (event.shiftKey) keys.push('Shift')
    if (event.metaKey) keys.push('Cmd')
    
    // If we were holding a non-modifier key, it stays in currentKeys until we release everything 
    // or press a new combination. This is a common pattern for shortcut pickers.
    const nonModifiers = currentKeys.value.filter(k => !['Ctrl', 'Alt', 'Shift', 'Cmd'].includes(k))
    
    if (keys.length === 0 && nonModifiers.length === 0) {
      // Everything released
      // We don't clear currentKeys here to allow user to see what they just pressed 
      // before hitting Confirm or a new key
    } else if (keys.length > 0) {
      // Some modifiers still held
      if (nonModifiers.length > 0) {
        currentKeys.value = [...keys, ...nonModifiers]
      } else {
        currentKeys.value = keys
      }
    }
  }
}

const removeKeyListeners = () => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
  window.removeEventListener('mousedown', handleOutsideClick)
}

const normalizeKey = (key) => {
  if (key === 'Control') return 'Ctrl'
  if (key === 'Meta') return 'Cmd'
  if (key === ' ') return 'Space'
  if (key === 'Enter' || key === 'Escape' || key === 'Tab' || key === 'Backspace') return null

  // F1-F12
  if (/^F[1-9][0-2]?$/.test(key)) return key

  if (key.length === 1) return key.toUpperCase()

  return null
}

const formatKey = (key) => {
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
  align-items: center;
  gap: $spacing-xs;
  flex-shrink: 0;
  max-width: 100%;
  transition: all 0.2s ease;

  &.is-recording {
    z-index: 10;
  }
}

.shortcut-button {
  min-width: 130px;
  max-width: 200px;
  padding: $spacing-xs $spacing-sm;
  text-align: center;
  font-family: monospace;
  font-size: $font-size-xs;
  height: 32px;
  white-space: nowrap;
  overflow: hidden;
  border: 1px solid var(--color-border);
  background-color: var(--color-background);
  color: var(--color-text);
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    border-color: var(--color-primary);
    background-color: var(--color-surface);
  }

  &.recording {
    border-color: var(--color-primary);
    background-color: var(--color-active-background);
    color: var(--color-primary);
    box-shadow: 0 0 0 3px var(--color-primary-alpha);
    min-width: 150px;
  }
}

.shortcut-display {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recording-placeholder {
  font-style: italic;
  opacity: 0.7;
  animation: pulse 1.5s infinite;
}

.recording-actions-inline {
  display: flex;
  gap: 2px;
  background-color: var(--color-surface);
  padding: 2px;
  border-radius: $border-radius-sm;
  border: 1px solid var(--color-border);
  box-shadow: $shadow-sm;
  animation: slideIn 0.2s ease-out;

  .action-btn {
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: $border-radius-xs;
    font-size: 14px;
    transition: all 0.2s ease;

    &.confirm {
      color: var(--color-success, #28a745);
      &:hover:not(:disabled) {
        background-color: var(--color-success-alpha, rgba(40, 167, 69, 0.1));
      }
      &:disabled {
        opacity: 0.3;
        cursor: not-allowed;
      }
    }

    &.cancel {
      color: var(--color-error, #dc3545);
      &:hover {
        background-color: var(--color-error-alpha, rgba(220, 53, 69, 0.1));
      }
    }
  }
}

@keyframes pulse {
  0% { opacity: 0.5; }
  50% { opacity: 1; }
  100% { opacity: 0.5; }
}

@keyframes slideIn {
  from { transform: translateX(-5px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
</style>
