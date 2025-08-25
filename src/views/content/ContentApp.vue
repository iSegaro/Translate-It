<template>
  <div class="content-app-container">
    <!-- This will host all in-page UI components -->
    <Toaster rich-colors />
    <SelectModeToolbar v-if="isSelectModeActive" />
    <TextFieldIcon
      v-for="icon in activeIcons"
      :key="icon.id"
      :id="icon.id"
      :position="icon.position"
      @click="onIconClick"
    />
    
    <!-- WindowsManager Translation Windows -->
    <TranslationWindow
      v-for="window in translationWindows"
      :key="window.id"
      :id="window.id"
      :position="window.position"
      :selected-text="window.selectedText"
      @close="onTranslationWindowClose"
    />
    
    <!-- WindowsManager Translation Icons -->
    <TranslationIcon
      v-for="icon in translationIcons"
      :key="icon.id"
      :id="icon.id"
      :position="icon.position"
      :text="icon.text"
      @click="onTranslationIconClick"
      @close="onTranslationIconClose"
    />
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { Toaster, toast } from 'vue-sonner';
import { pageEventBus, WINDOWS_MANAGER_EVENTS } from '@/utils/core/PageEventBus.js';
import SelectModeToolbar from './components/SelectModeToolbar.vue';
import TextFieldIcon from './components/TextFieldIcon.vue';
import TranslationWindow from './components/TranslationWindow.vue';
import TranslationIcon from './components/TranslationIcon.vue';

const logger = {
  info: (msg, ...args) => console.log(`[ContentApp] ${msg}`, ...args),
  debug: (msg, ...args) => console.debug(`[ContentApp] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ContentApp] ${msg}`, ...args),
};

const isSelectModeActive = ref(false);
const activeIcons = ref([]); // Stores { id, position } for each icon
const translationWindows = ref([]); // Stores { id, position, selectedText } for each window
const translationIcons = ref([]); // Stores { id, position, text } for each translation icon

const onIconClick = (id) => {
  logger.info(`TextFieldIcon clicked: ${id}`);
  // Emit an event back to the content script to handle the click
  pageEventBus.emit('text-field-icon-clicked', { id });
};

const onTranslationIconClick = (detail) => {
  logger.info(`TranslationIcon clicked: ${detail.id}`);
  // Emit event for WindowsManager to handle
  pageEventBus.emit(WINDOWS_MANAGER_EVENTS.ICON_CLICKED, detail);
};

const onTranslationWindowClose = (id) => {
  logger.debug(`TranslationWindow closed: ${id}`);
  translationWindows.value = translationWindows.value.filter(window => window.id !== id);
};

const onTranslationIconClose = (id) => {
  logger.debug(`TranslationIcon closed: ${id}`);
  translationIcons.value = translationIcons.value.filter(icon => icon.id !== id);
};

logger.info('ContentApp script setup executed.');

onMounted(() => {
  logger.info('ContentApp component has been mounted into the Shadow DOM.');

  const toastMap = {
    error: toast.error,
    warning: toast.warning,
    success: toast.success,
    info: toast.info,
    status: toast.loading,
    revert: toast,
  };

  pageEventBus.on('show-notification', (detail) => {
    logger.info('Received show-notification event:', detail);
    const { id, message, type, duration } = detail;
    const toastFn = toastMap[type] || toast.info;
    toastFn(message, { id, duration });
  });

  pageEventBus.on('dismiss_notification', (detail) => {
    logger.info('Received dismiss_notification event:', detail);
    toast.dismiss(detail.id);
  });

  pageEventBus.on('dismiss_all_notifications', () => {
    logger.info('Received dismiss_all_notifications event');
    toast.dismiss();
  });

  // Test event to confirm communication
  pageEventBus.on('ui-host-mounted', () => {
    logger.info('Successfully received the ui-host-mounted test event!');
  });

  // Listen for Select Element Mode changes
  pageEventBus.on('select-mode-activated', () => {
    logger.info('Event: select-mode-activated');
    isSelectModeActive.value = true;
  });

  pageEventBus.on('select-mode-deactivated', () => {
    logger.info('Event: select-mode-deactivated');
    isSelectModeActive.value = false;
  });

  // Listen for TextFieldIcon events
  pageEventBus.on('add-field-icon', (detail) => {
    logger.info('Event: add-field-icon', detail);
    // Ensure no duplicate icons for the same ID
    if (!activeIcons.value.some(icon => icon.id === detail.id)) {
      activeIcons.value.push(detail);
    }
  });

  pageEventBus.on('remove-field-icon', (detail) => {
    logger.info('Event: remove-field-icon', detail);
    activeIcons.value = activeIcons.value.filter(icon => icon.id !== detail.id);
  });

  pageEventBus.on('remove-all-field-icons', () => {
    logger.info('Event: remove-all-field-icons');
    activeIcons.value = [];
  });

  // WindowsManager event listeners
  pageEventBus.on(WINDOWS_MANAGER_EVENTS.SHOW_WINDOW, (detail) => {
    logger.info('Event: windows-manager-show-window', detail);
    const { id, selectedText, position } = detail;
    
    // Ensure no duplicate windows for the same ID
    if (!translationWindows.value.some(window => window.id === id)) {
      translationWindows.value.push({
        id,
        selectedText,
        position: position || { x: 100, y: 100 }
      });
    }
  });

  pageEventBus.on(WINDOWS_MANAGER_EVENTS.SHOW_ICON, (detail) => {
    logger.info('Event: windows-manager-show-icon', detail);
    const { id, text, position } = detail;
    
    // Ensure no duplicate icons for the same ID
    if (!translationIcons.value.some(icon => icon.id === id)) {
      translationIcons.value.push({
        id,
        text,
        position: position || { top: 100, left: 100 }
      });
    }
  });

  pageEventBus.on(WINDOWS_MANAGER_EVENTS.DISMISS_WINDOW, (detail) => {
    logger.info('Event: windows-manager-dismiss-window', detail);
    const { id } = detail;
    translationWindows.value = translationWindows.value.filter(window => window.id !== id);
  });

  pageEventBus.on(WINDOWS_MANAGER_EVENTS.DISMISS_ICON, (detail) => {
    logger.info('Event: windows-manager-dismiss-icon', detail);
    const { id } = detail;
    translationIcons.value = translationIcons.value.filter(icon => icon.id !== id);
  });

  pageEventBus.on(WINDOWS_MANAGER_EVENTS.DISMISS_ALL, () => {
    logger.info('Event: windows-manager-dismiss-all');
    translationWindows.value = [];
    translationIcons.value = [];
  });

  pageEventBus.on(WINDOWS_MANAGER_EVENTS.UPDATE_POSITION, (detail) => {
    logger.debug('Event: windows-manager-update-position', detail);
    const { id, position } = detail;
    
    // Update window position if exists
    const windowIndex = translationWindows.value.findIndex(window => window.id === id);
    if (windowIndex !== -1) {
      translationWindows.value[windowIndex].position = position;
    }
    
    // Update icon position if exists
    const iconIndex = translationIcons.value.findIndex(icon => icon.id === id);
    if (iconIndex !== -1) {
      translationIcons.value[iconIndex].position = position;
    }
  });

  pageEventBus.on(WINDOWS_MANAGER_EVENTS.TRANSLATION_RESULT, (detail) => {
    logger.info('Event: windows-manager-translation-result', detail);
    // This will be handled by individual TranslationWindow components
  });

  pageEventBus.on(WINDOWS_MANAGER_EVENTS.TRANSLATION_ERROR, (detail) => {
    logger.info('Event: windows-manager-translation-error', detail);
    // This will be handled by individual TranslationWindow components
  });

  pageEventBus.on(WINDOWS_MANAGER_EVENTS.TRANSLATION_LOADING, (detail) => {
    logger.info('Event: windows-manager-translation-loading', detail);
    // This will be handled by individual TranslationWindow components
  });
});
</script>

<style>
/* Since this is in a Shadow DOM, these styles are completely isolated. */
.content-app-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 2147483647; /* Max z-index */
  pointer-events: none; /* Allow clicks to pass through the container */
}

/* Individual components inside will override this (e.g., toaster, toolbars) */
.content-app-container > * {
  pointer-events: auto; /* Re-enable pointer events for children */
}
</style>
