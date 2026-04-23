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
        <div 
          v-else 
          class="shortcut-display"
        >
          <template 
            v-for="(key, index) in currentKeys" 
            :key="index"
          >
            <span class="kbd-key">{{ formatKey(key) }}</span>
            <span 
              v-if="index < currentKeys.length - 1" 
              class="shortcut-separator"
            >+</span>
          </template>
        </div>
      </template>
      <template v-else>
        <span 
          v-if="!shortcut" 
          class="recording-placeholder"
        >{{ placeholder || t('set_shortcut_placeholder') || 'Click to set shortcut' }}</span>
        <div 
          v-else 
          class="shortcut-display"
        >
          <template 
            v-for="(key, index) in shortcut.split('+')" 
            :key="index"
          >
            <span class="kbd-key">{{ formatKey(key) }}</span>
            <span 
              v-if="index < shortcut.split('+').length - 1" 
              class="shortcut-separator"
            >+</span>
          </template>
        </div>
      </template>
    </BaseButton>

    <!-- Inline Actions when recording (Placed after button to appear on the trailing side) -->
    <Transition name="actions-slide">
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
        <div class="actions-divider" />
        <button 
          class="action-btn cancel" 
          :title="t('cancel') || 'Cancel'"
          @click.stop="cancelRecording"
        >
          ✕
        </button>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'
import './ShortcutPicker.scss'
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

onUnmounted(() => {
  removeKeyListeners()
})
</script>
