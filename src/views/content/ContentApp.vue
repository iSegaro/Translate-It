<template>
  <div class="content-app-container">
    <!-- This will host all in-page UI components -->
    <Toaster rich-colors />
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
      :initial-translated-text="window.translatedText"
      :theme="window.theme"
      :is-loading="window.isLoading"
      @close="onTranslationWindowClose"
      @speak="onTranslationWindowSpeak"
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
    
    <!-- Select Element Overlays -->
    <ElementHighlightOverlay />
    <TranslationOverlay />
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { Toaster, toast } from 'vue-sonner';
import { useWindowsManager } from '@/composables/useWindowsManager.js';
import TextFieldIcon from './components/TextFieldIcon.vue';
import TranslationWindow from './components/TranslationWindow.vue';
import TranslationIcon from './components/TranslationIcon.vue';
import ElementHighlightOverlay from './components/ElementHighlightOverlay.vue';
import TranslationOverlay from './components/TranslationOverlay.vue';

const pageEventBus = window.pageEventBus;

const logger = {
  info: (msg, ...args) => console.log(`[ContentApp] ${msg}`, ...args),
  debug: (msg, ...args) => console.debug(`[ContentApp] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ContentApp] ${msg}`, ...args),
};

// Use WindowsManager composable
const {
  translationWindows,
  translationIcons,
  onTranslationIconClick,
  onTranslationWindowClose,
  onTranslationWindowSpeak,
  onTranslationIconClose,
  setupEventListeners,
  cleanupEventListeners
} = useWindowsManager();

// Text field icon state (separate from WindowsManager)
const isSelectModeActive = ref(false);
const activeIcons = ref([]); // Stores { id, position } for each icon

const onIconClick = (id) => {
  logger.info(`TextFieldIcon clicked: ${id}`);
  // Emit an event back to the content script to handle the click
  pageEventBus.emit('text-field-icon-clicked', { id });
};

const setupOutsideClickHandler = () => {
  // Listen for clicks on the host document
  document.addEventListener('click', (event) => {
    // Check if click is outside all Vue components
    const shadowHost = document.getElementById('translate-it-host');
    if (!shadowHost) return;
    
    // If click is not on the shadow host or its children, it's an outside click
    if (!shadowHost.contains(event.target)) {
      // Dismiss all active windows and icons
      if (translationWindows.value.length > 0) {
        translationWindows.value.forEach(window => {
          onTranslationWindowClose(window.id);
        });
      }
      
      if (translationIcons.value.length > 0) {
        translationIcons.value.forEach(icon => {
          onTranslationIconClose(icon.id);
        });
      }
    }
  }, true); // Use capture phase
};

logger.info('ContentApp script setup executed.');

onMounted(() => {
  logger.info('ContentApp component has been mounted into the Shadow DOM.');
  
  // Setup global click listener for outside click detection
  setupOutsideClickHandler();

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

  // Setup WindowsManager event listeners through composable
  setupEventListeners();
});

onUnmounted(() => {
  logger.info('ContentApp component is being unmounted.');
  
  // Cleanup WindowsManager event listeners
  cleanupEventListeners();
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
