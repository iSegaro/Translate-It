<template>
  <BaseButton
    class="configure-shortcut-button"
    :disabled="disabled"
    @click="openShortcutSettings"
  >
    <div 
      v-if="shortcut" 
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
    <span 
      v-else 
      class="recording-placeholder"
    >
      {{ t('context_menu_shortcuts') || 'Keyboard Shortcut' }}
    </span>
  </BaseButton>
</template>

<script setup>
import './ConfigureShortcutButton.scss'
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useBrowserAPI } from '@/composables/core/useBrowserAPI.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import BaseButton from '@/components/base/BaseButton.vue'

const props = defineProps({
  commandName: {
    type: String,
    required: true
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'ConfigureShortcutButton')
const { t } = useUnifiedI18n()
const { api: browserAPI } = useBrowserAPI('ConfigureShortcutButton')
const shortcut = ref('')

const formatKey = (key) => {
  const keyMap = {
    'Ctrl': 'Ctrl',
    'Alt': 'Alt',
    'Shift': 'Shift',
    'Command': '⌘',
    'MacCtrl': '⌃',
    'Option': '⌥',
    'Space': 'Space'
  }
  return keyMap[key] || key
}

const fetchShortcuts = async () => {
  try {
    if (browserAPI.value?.commands) {
      const commands = await browserAPI.value.commands.getAll()
      const command = commands.find(c => c.name === props.commandName)
      if (command && command.shortcut) {
        shortcut.value = command.shortcut
      } else {
        shortcut.value = ''
      }
    }
  } catch (err) {
    logger.debug(`Failed to fetch shortcuts for ${props.commandName}:`, err)
  }
}

const openShortcutSettings = async () => {
  try {
    let url = "chrome://extensions/shortcuts";
    
    // Check if we are on Firefox
    if (browserAPI.value && typeof browserAPI.value.runtime?.getBrowserInfo === 'function') {
      try {
        const browserInfo = await browserAPI.value.runtime.getBrowserInfo();
        if (browserInfo.name === "Firefox") {
          url = browserAPI.value.runtime.getURL("src/html/options.html?tab=shortcuts");
        }
      } catch (e) {
        logger.debug("Failed to get browser info, using default shortcuts URL", e);
      }
    }
    
    if (browserAPI.value?.tabs) {
      await browserAPI.value.tabs.create({ url });
    } else {
      window.open(url, '_blank');
    }
  } catch (err) {
    logger.error("Failed to open shortcuts page:", err);
    const fallbackUrl = browserAPI.value?.runtime?.getURL 
      ? browserAPI.value.runtime.getURL("src/html/options.html?tab=shortcuts") 
      : "src/html/options.html?tab=shortcuts";
    window.open(fallbackUrl, '_blank');
  }
}

watch(browserAPI, (api) => {
  if (api) fetchShortcuts()
}, { immediate: true })

onMounted(() => {
  window.addEventListener('focus', fetchShortcuts)
})

onUnmounted(() => {
  window.removeEventListener('focus', fetchShortcuts)
})
</script>
