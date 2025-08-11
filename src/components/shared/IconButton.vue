<template>
  <img
    :src="iconSrc"
    :alt="alt"
    :title="title"
    :class="[
      'icon-button',
      {
        'revert-icon': isRevertIcon,
        'toolbar-icon': isToolbarIcon,
        'inline-icon': isInlineIcon,
        'paste-icon-separate': isPasteIconSeparate,
        'voice-target-icon': isVoiceTargetIcon,
        'hidden-by-clipboard': hiddenByClipboard
      }
    ]"
    @click="$emit('click')"
  >
</template>

<script setup>
import { computed } from 'vue'

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
  }
})

// Emits
defineEmits(['click'])

// Computed
const iconSrc = computed(() => {
  if (props.icon.startsWith('/') || props.icon.startsWith('@/')) {
    return props.icon.replace('@/', '/')
  }
  // Icons are copied to /icons/ directory in build output 
  return `/icons/${props.icon}`
})

const isRevertIcon = computed(() => props.variant === 'revert')
const isToolbarIcon = computed(() => props.type === 'toolbar')
const isInlineIcon = computed(() => props.type === 'inline')
const isPasteIconSeparate = computed(() => props.type === 'paste-separate')
const isVoiceTargetIcon = computed(() => props.type === 'voice-target')
</script>

<style scoped>
.icon-button {
  cursor: pointer;
  transition: opacity 0.2s ease-in-out, filter 0.2s ease-in-out;
  filter: var(--icon-filter);
}

.icon-button:hover {
  opacity: var(--icon-hover-opacity);
}

.toolbar-icon {
  width: 20px;
  height: 20px;
  opacity: var(--icon-opacity);
}

.inline-icon {
  width: 16px;
  height: 16px;
  opacity: var(--icon-opacity, 0.6);
}

.revert-icon {
  transition: transform 0.4s ease, opacity 0.2s ease-in-out, filter 0.2s ease-in-out;
}

.revert-icon:hover {
  transform: rotate(360deg);
}

.paste-icon-separate {
  position: absolute;
  top: 10px;
  right: 10px;
  direction: ltr; /* Force LTR to maintain consistent positioning */
  width: 16px;
  height: 16px;
}

.voice-target-icon {
  width: 16px !important;
  height: 16px !important;
  max-width: 16px !important;
  max-height: 16px !important;
}

.paste-icon-separate.hidden-by-clipboard {
  display: none !important;
}
</style>