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
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { Toaster, toast } from 'vue-sonner';
import { pageEventBus } from '@/utils/core/PageEventBus.js';
import SelectModeToolbar from './components/SelectModeToolbar.vue';
import TextFieldIcon from './components/TextFieldIcon.vue';

const logger = {
  info: (msg, ...args) => console.log(`[ContentApp] ${msg}`, ...args),
};

const isSelectModeActive = ref(false);
const activeIcons = ref([]); // Stores { id, position } for each icon

const onIconClick = (id) => {
  logger.info(`TextFieldIcon clicked: ${id}`);
  // Emit an event back to the content script to handle the click
  pageEventBus.emit('text-field-icon-clicked', { id });
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
