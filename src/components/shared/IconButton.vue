<template>
  <img
    :src="iconSrc"
    :alt="alt"
    :title="title"
    :class="[
      'ti-icon-button',
      {
        'ti-revert-icon': isRevertIcon,
        'ti-toolbar-icon': isToolbarIcon,
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
import browser from 'webextension-polyfill'

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
  if (!props.icon) return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiBmaWxsPSIjY2NjIi8+Cjwvc3ZnPgo='

  if (props.icon.startsWith('@/')) {
    return props.icon.replace('@/', '/')
  }
  if (props.icon.startsWith('/')) {
    return props.icon
  }

  // Use runtime.getURL for extension icons
  if (browser && browser.runtime && browser.runtime.getURL) {
    if (props.icon.includes('/')) {
      // Provider icons like "providers/google.svg"
      return browser.runtime.getURL(`icons/${props.icon}`)
    } else {
      // UI icons like "side-panel.png"
      return browser.runtime.getURL(`icons/ui/${props.icon}`)
    }
  }

  // Fallback for when runtime API is not available
  if (props.icon.includes('/')) {
    return `/assets/icons/${props.icon}`
  } else {
    return `/assets/icons/ui/${props.icon}`
  }
})

const isRevertIcon = computed(() => props.variant === 'revert')
const isToolbarIcon = computed(() => props.type === 'toolbar')
const isInlineIcon = computed(() => props.type === 'inline')
const isPasteIconSeparate = computed(() => props.type === 'paste-separate')
const isVoiceTargetIcon = computed(() => props.type === 'voice-target')
</script>

<style scoped>
.ti-icon-button {
  cursor: pointer;
  transition: opacity 0.2s ease-in-out, filter 0.2s ease-in-out;
  filter: var(--icon-filter);
}

.ti-icon-button:hover {
  opacity: var(--icon-hover-opacity);
}


.ti-inline-icon {
  width: 16px;
  height: 16px;
  opacity: var(--icon-opacity, 0.6);
}

.ti-revert-icon {
  transition: transform 0.4s ease, opacity 0.2s ease-in-out, filter 0.2s ease-in-out;
}

.ti-revert-icon:hover {
  transform: rotate(360deg);
}

.ti-paste-icon-separate {
  position: absolute;
  top: 10px;
  right: 10px;
  direction: ltr; /* Force LTR to maintain consistent positioning */
  width: 16px;
  height: 16px;
}

.ti-voice-target-icon {
  width: 16px !important;
  height: 16px !important;
  max-width: 16px !important;
  max-height: 16px !important;
}

.ti-paste-icon-separate.ti-hidden-by-clipboard {
  display: none !important;
}
</style>