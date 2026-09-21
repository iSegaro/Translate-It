<template>
  <button
    v-if="isToolbarIcon"
    class="ti-toolbar-button"
    :class="{ 'ti-active': active }"
    :title="title"
    :aria-label="maskAriaLabel"
    @click="$emit('click')"
  >
    <MaskIcon
      v-if="useMaskIcon"
      :src="iconSrc"
      :size="20"
      :class="[
        'ti-toolbar-icon',
        {
          'ti-revert-icon': isRevertIcon,
        }
      ]"
    />
    <img
      v-else
      :src="iconSrc"
      :alt="alt"
      :class="[
        'ti-icon-button',
        'ti-toolbar-icon',
        {
          'ti-revert-icon': isRevertIcon,
        }
      ]"
    >
  </button>
  <img
    v-else
    :src="iconSrc"
    :alt="alt"
    :title="title"
    :class="[
      'ti-icon-button',
      {
        'ti-revert-icon': isRevertIcon,
        'ti-inline-icon': isInlineIcon,
        'ti-paste-icon-separate': isPasteIconSeparate,
        'ti-voice-target-icon': isVoiceTargetIcon,
        'ti-hidden-by-clipboard': hiddenByClipboard
      }
    ]"
    @click="$emit('click')"
  >
</template>

<script setup>
import { computed } from 'vue'
import './IconButton.scss'
import MaskIcon from './MaskIcon.vue'
import ExtensionContextManager from '@/core/extensionContext.js'

// Props
const props = defineProps({
  icon: {
    type: String,
    required: true
  },
  alt: {
    type: String,
    default: ''
  },
  title: {
    type: String,
    default: ''
  },
  type: {
    type: String,
    default: 'toolbar', // toolbar, inline, paste-separate, voice-target
    validator: (value) => ['toolbar', 'inline', 'paste-separate', 'voice-target'].includes(value)
  },
  variant: {
    type: String,
    default: 'default', // default, revert
    validator: (value) => ['default', 'revert'].includes(value)
  },
  hiddenByClipboard: {
    type: Boolean,
    default: false
  },
  active: {
    type: Boolean,
    default: false
  },
  mask: {
    type: Boolean,
    default: false
  }
})

// Emits
defineEmits(['click'])

// Computed
const iconSrc = computed(() => {
  if (!props.icon) return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiBmaWxsPSIjY2NjIi8+Cjwvc3ZnPgo='

  if (props.icon.startsWith('@/')) {
    return props.icon.replace('@/', '/')
  }
  if (props.icon.startsWith('/')) {
    return props.icon
  }

  // Use ExtensionContextManager.safeGetURL for extension icons
  // to avoid context invalidation errors during render
  if (props.icon.includes('/')) {
    // Provider icons like "providers/google.svg"
    return ExtensionContextManager.safeGetURL(`icons/${props.icon}`, `/assets/icons/${props.icon}`)
  } else {
    // UI icons like "side-panel.png"
    return ExtensionContextManager.safeGetURL(`icons/ui/${props.icon}`, `/assets/icons/ui/${props.icon}`)
  }
})

const isRevertIcon = computed(() => props.variant === 'revert')
const isToolbarIcon = computed(() => props.type === 'toolbar')
// Mask opt-in: toolbar buttons only. The native <button> root is preserved
// (no nested buttons, $el/click/active/title unchanged); the inner <img> is
// replaced by a decorative MaskIcon and the button owns the accessible name
// from the existing alt value (title fallback). MaskIcon deliberately omits
// the `ti-icon-button` class so image-only filters (e.g. --icon-filter
// inversion) never apply to it — its color comes only from currentColor.
const useMaskIcon = computed(() => props.mask === true && props.type === 'toolbar')
const maskAriaLabel = computed(() => {
  if (!useMaskIcon.value) return undefined
  return props.alt || props.title || undefined
})
const isInlineIcon = computed(() => props.type === 'inline')
const isPasteIconSeparate = computed(() => props.type === 'paste-separate')
const isVoiceTargetIcon = computed(() => props.type === 'voice-target')
</script>
