<template>
  <div class="content-app-container">
    <!-- نمونه استفاده از ترجمه -->
    <!--{{ $t('app_welcome') }} -->
    
    <!-- This will host all in-page UI components -->
    <Toaster 
      rich-colors 
      position="bottom-right"
      expand
      :toastOptions="{ 
        style: { 
          pointerEvents: 'auto',
          cursor: 'auto',
          zIndex: 2147483647
        }
      }"
    />
    <TextFieldIcon
      v-for="icon in activeIcons"
      :key="icon.id"
      :ref="el => setIconRef(icon.id, el)"
      :id="icon.id"
      :position="icon.position"
      :visible="icon.visible !== false"
      :target-element="icon.targetElement"
      :attachment-mode="icon.attachmentMode || 'smart'"
      @click="onIconClick"
      @position-updated="onIconPositionUpdated"
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
      :initial-size="window.initialSize"
      :target-language="window.targetLanguage || 'auto'"
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
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { Toaster, toast } from 'vue-sonner';
import { useWindowsManager } from '@/features/windows/composables/useWindowsManager.js';
import { useResourceTracker } from '@/composables/core/useResourceTracker.js';
import TextFieldIcon from '@/features/text-field-interaction/components/TextFieldIcon.vue';
import TranslationWindow from '@/features/windows/components/TranslationWindow.vue';
import TranslationIcon from '@/features/windows/components/TranslationIcon.vue';
import ElementHighlightOverlay from './components/ElementHighlightOverlay.vue';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ToastIntegration } from '@/shared/toast/ToastIntegration.js';

const pageEventBus = window.pageEventBus;

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'ContentApp');

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

// Resource tracker for automatic cleanup
const tracker = useResourceTracker('content-app')

// Toast integration
let toastIntegration = null;

// Debounce cancel requests to prevent event loops
let isCancelInProgress = false;
let cancelTimeout = null;

// Text field icon state (separate from WindowsManager)
const isSelectModeActive = ref(false);
const activeIcons = ref([]); // Stores { id, position, visible, targetElement, attachmentMode } for each icon
const iconRefs = ref(new Map()); // Stores Vue component references

// Icon reference management
const setIconRef = (iconId, el) => {
  if (el) {
    iconRefs.value.set(iconId, el);
  } else {
    iconRefs.value.delete(iconId);
  }
};

const getIconRef = (iconId) => {
  return iconRefs.value.get(iconId);
};

const onIconClick = (id) => {
  logger.info(`TextFieldIcon clicked: ${id}`);
  // Emit an event back to the content script to handle the click
  pageEventBus.emit('text-field-icon-clicked', { id });
};

const onIconPositionUpdated = (data) => {
  logger.debug(`TextFieldIcon position updated:`, data);
  // Optionally notify about position changes
};

const setupOutsideClickHandler = () => {
  // NOTE: Outside click handling is now managed by TextSelectionManager
  // to avoid conflicts and ensure proper iframe support.
  // This avoids double handling of outside clicks which was causing
  // translation windows to close when clicked inside them.
};

logger.info('ContentApp script setup executed.');

onMounted(() => {
  const isInIframe = window !== window.top;
  const executionMode = isInIframe ? 'iframe' : 'main-frame';
  
  logger.info(`ContentApp component has been mounted into the Shadow DOM (${executionMode})`, {
    isInIframe,
    frameLocation: window.location.href,
    hasPageEventBus: !!window.pageEventBus
  });
  
  // Setup global click listener for outside click detection
  setupOutsideClickHandler();

  // Initialize Toast Integration System
  let toastIntegration = null;
  try {
    toastIntegration = ToastIntegration.createSingleton(pageEventBus);
    toastIntegration.initialize({
      onCancelClick: (event) => {
        logger.info('Cancel button clicked via ToastIntegration');
        
        // Prevent multiple cancel requests in quick succession
        if (isCancelInProgress) {
          logger.debug('Cancel already in progress, ignoring duplicate request');
          return;
        }
        
        isCancelInProgress = true;
        
        // Emit event only once with proper error handling
        try {
          if (pageEventBus) {
            pageEventBus.emit('cancel-select-element-mode');
            logger.debug('cancel-select-element-mode event emitted successfully');
          }
        } catch (error) {
          logger.warn('Error emitting cancel-select-element-mode event:', error);
        }
        
        // Reset flag after a delay to prevent event loops
        if (cancelTimeout) clearTimeout(cancelTimeout);
        cancelTimeout = setTimeout(() => {
          isCancelInProgress = false;
          cancelTimeout = null;
          logger.debug('Cancel request flag reset');
        }, 1000); // 1 second debounce
      }
    });
    logger.debug('ToastIntegration initialized successfully');
  } catch (error) {
    logger.warn('ToastIntegration initialization failed:', error);
    // Continue without toast integration if it fails
  }

  const toastMap = {
    error: toast.error,
    warning: toast.warning,
    success: toast.success,
    info: toast.info,
    status: toast.loading,
    revert: toast,
    'select-element': toast.info,
  };

  // Use a global Set to prevent duplicate notifications
  if (!window.translateItShownNotifications) {
    window.translateItShownNotifications = new Set();
  }
  
  // Track dismissed notifications to prevent double dismissal
  if (!window.translateItDismissedNotifications) {
    window.translateItDismissedNotifications = new Set();
  }
  
    
  
  pageEventBus.on('show-notification', (detail) => {
    // Create a unique key for this notification
    const notificationKey = `${detail.message}-${detail.type}-${Date.now()}`;
    
    // Check if this notification was already shown recently (within 1 second)
    const recentKeys = Array.from(window.translateItShownNotifications).filter(key => {
      const timestamp = parseInt(key.split('-').pop());
      return Date.now() - timestamp < 1000; // 1 second window
    });
    
    const isDuplicate = recentKeys.some(key => 
      key.startsWith(`${detail.message}-${detail.type}`)
    );
    
    if (isDuplicate) {
      return;
    }
    
    // Add to set and show notification
    window.translateItShownNotifications.add(notificationKey);
    
    // Clean up old entries (keep only last 10)
    if (window.translateItShownNotifications.size > 10) {
      const entries = Array.from(window.translateItShownNotifications);
      entries.slice(0, -10).forEach(key => {
        window.translateItShownNotifications.delete(key);
      });
    }
    
        
        
    const { id, message, type, duration, actions, persistent } = detail;
    const toastFn = toastMap[type] || toast.info;
    
    const toastOptions = { 
      id, 
      duration: persistent ? Infinity : duration
    };
    
    // Add action buttons if provided
    if (actions && actions.length > 0) {
      // Create the action handler
      const actionHandler = (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        
        logger.debug('Toast action clicked:', actions[0].eventName);
        pageEventBus.emit(actions[0].eventName);
        toast.dismiss(id);
      };
      
      toastOptions.action = {
        label: actions[0].label,
        onClick: actionHandler
      };
    }
    
    toastFn(message, toastOptions);
  });

  pageEventBus.on('dismiss_notification', (detail) => {
    logger.info('Received dismiss_notification event:', detail);
    
    // Prevent double dismissal
    if (window.translateItDismissedNotifications.has(detail.id)) {
      logger.debug('Notification already dismissed, ignoring:', detail.id);
      return;
    }
    
    window.translateItDismissedNotifications.add(detail.id);
    
    // Force dismiss - try multiple methods to ensure cleanup
    toast.dismiss(detail.id);
    
    // If it's a select-element notification, also force dismiss all select-element toasts
    if (detail.id.startsWith('select-element-')) {
      logger.debug('Force dismissing all select-element toasts');
      
      // Use timeout to ensure the first dismiss has time to process
      setTimeout(() => {
        // Find all select-element notifications and dismiss them
        const selectElementKeys = Array.from(window.translateItShownNotifications || [])
          .filter(key => key.includes('select-element-'));
        
        selectElementKeys.forEach(key => {
          const parts = key.split('-');
          if (parts.length >= 3) {
            const id = `${parts[0]}-${parts[1]}-${parts[2]}`;
            toast.dismiss(id);
          }
        });
        
        // Also try dismissing by type pattern
        toast.dismiss((t) => t.type === 'select-element' || (t.id && t.id.includes('select-element')));
      }, 50);
    }
    
    // Clean up after a delay
    setTimeout(() => {
      window.translateItDismissedNotifications.delete(detail.id);
    }, 2000);
  });

  pageEventBus.on('dismiss_all_notifications', () => {
    logger.info('Received dismiss_all_notifications event');
    toast.dismiss();
  });

  // Handle select element notification dismissal for backward compatibility
  pageEventBus.on('dismiss-select-element-notification', () => {
    logger.info('Received dismiss-select-element-notification event');
    // Dismiss all select-element type notifications
    const selectElementNotifications = Array.from(window.translateItShownNotifications || [])
      .filter(key => key.startsWith('select-element-'));
    selectElementNotifications.forEach(key => {
      const id = key.split('-').slice(0, 3).join('-'); // Extract the ID part
      
      // Prevent double dismissal
      if (window.translateItDismissedNotifications.has(id)) {
        logger.debug('Select element notification already dismissed, ignoring:', id);
        return;
      }
      
      window.translateItDismissedNotifications.add(id);
      toast.dismiss(id);
      
      // Clean up after a delay
      setTimeout(() => {
        window.translateItDismissedNotifications.delete(id);
      }, 2000);
    });
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
      activeIcons.value.push({
        id: detail.id,
        position: detail.position,
        visible: detail.visible !== false,
        targetElement: detail.targetElement,
        attachmentMode: detail.attachmentMode || 'smart'
      });
    }
  });

  pageEventBus.on('remove-field-icon', (detail) => {
    logger.info('Event: remove-field-icon', detail);
    const iconIndex = activeIcons.value.findIndex(icon => icon.id === detail.id);
    if (iconIndex !== -1) {
      // Clean up component reference
      iconRefs.value.delete(detail.id);
      // Remove from active icons
      activeIcons.value.splice(iconIndex, 1);
    }
  });

  pageEventBus.on('remove-all-field-icons', () => {
    logger.info('Event: remove-all-field-icons');
    // Clear all component references
    iconRefs.value.clear();
    // Clear all icons
    activeIcons.value = [];
  });

  // Listen for enhanced TextFieldIcon events
  pageEventBus.on('update-field-icon-position', (detail) => {
    logger.debug('Event: update-field-icon-position', detail);
    const icon = activeIcons.value.find(icon => icon.id === detail.id);
    if (icon) {
      icon.position = detail.position;
      icon.visible = detail.visible !== false;
      
      // Update the component directly
      const iconComponent = getIconRef(detail.id);
      if (iconComponent && iconComponent.updatePosition) {
        iconComponent.updatePosition(detail.position);
      }
    }
  });

  pageEventBus.on('update-field-icon-visibility', (detail) => {
    logger.debug('Event: update-field-icon-visibility', detail);
    const icon = activeIcons.value.find(icon => icon.id === detail.id);
    if (icon) {
      icon.visible = detail.visible;
      
      // Update the component directly
      const iconComponent = getIconRef(detail.id);
      if (iconComponent) {
        if (detail.visible && iconComponent.show) {
          iconComponent.show();
        } else if (!detail.visible && iconComponent.hide) {
          iconComponent.hide();
        }
      }
    }
  });

  // Setup WindowsManager event listeners through composable
  setupEventListeners();
  
  // Listen for navigation events to clean up UI state
  pageEventBus.on('navigation-detected', (detail) => {
    logger.info('Navigation detected, cleaning up UI state:', detail);
    
    // Close all translation windows
    if (translationWindows.value.length > 0) {
      translationWindows.value.forEach(window => {
        onTranslationWindowClose(window.id);
      });
    }
    
    // Close all translation icons  
    if (translationIcons.value.length > 0) {
      translationIcons.value.forEach(icon => {
        onTranslationIconClose(icon.id);
      });
    }
    
    // Clear all field icons
    activeIcons.value = [];
    
    // Reset select mode state
    isSelectModeActive.value = false;
    
    // Dismiss all notifications
    pageEventBus.emit('dismiss_all_notifications');
  });
});

onUnmounted(() => {
  logger.info('ContentApp component is being unmounted.');
  
  // Clear cancel timeout if exists
  if (cancelTimeout) {
    clearTimeout(cancelTimeout);
    cancelTimeout = null;
  }
  
  // Shutdown toast integration if it was initialized
  try {
    if (toastIntegration) {
      toastIntegration.shutdown();
    }
  } catch (error) {
    logger.warn('Error shutting down ToastIntegration:', error);
  }
  
    
  
  // Event listeners cleanup is now handled automatically by useResourceTracker
  // No manual cleanup needed!
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