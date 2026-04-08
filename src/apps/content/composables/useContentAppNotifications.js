import { onMounted, h } from 'vue';
import { toast } from 'vue-sonner';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT_APP, 'useContentAppNotifications');

/**
 * Composable for managing toast notifications in the ContentApp.
 * Handles display, dismissal, duplication prevention, and RTL support.
 * 
 * @param {Object} options - Configuration options
 * @param {Object} options.shouldShowGlobalUI - Computed ref for showing UI
 * @param {Object} options.toastRTL - Ref for current RTL state
 * @param {Object} options.tracker - Resource tracker for event listeners
 * @returns {Object} Methods for notification management
 */
export function useContentAppNotifications({ shouldShowGlobalUI, toastRTL, tracker }) {
  const toastMap = {
    error: toast.error,
    warning: toast.warning,
    success: toast.success,
    info: toast.info,
    status: toast.loading,
    revert: toast,
    'select-element': toast.info,
  };

  /**
   * Initializes global notification tracking sets
   */
  const initializeGlobalTrackers = () => {
    // Use a global Set to prevent duplicate notifications
    if (!window.translateItShownNotifications) {
      window.translateItShownNotifications = new Set();
    }
    
    // Track dismissed notifications to prevent double dismissal
    if (!window.translateItDismissedNotifications) {
      window.translateItDismissedNotifications = new Set();
    }
  };

  /**
   * Main handler for showing notifications
   */
  const handleShowNotification = async (detail) => {
    // Only process notifications if this frame is responsible for showing global UI
    if (!shouldShowGlobalUI.value) return;

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

    // Skip duplicate check for updates
    if (isDuplicate && !detail.isUpdate) {
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

    // CRITICAL: Use reactive RTL value (SYNC - optimal performance)
    const detectedDirection = toastRTL.value ? 'rtl' : 'ltr';

    const toastOptions = {
      id,
      duration: persistent ? Infinity : duration,
      style: {
        direction: detectedDirection,
        textAlign: toastRTL.value ? 'right' : 'left'
      }
    };

    // Enhanced Multi-Action Support
    if (actions && actions.length > 0) {
      if (actions.length === 1) {
        // Standard single action
        toastOptions.action = {
          label: actions[0].label,
          onClick: (event) => {
            if (event) event.preventDefault();
            if (actions[0].handler) actions[0].handler();
            if (actions[0].onClick) actions[0].onClick();
            if (actions[0].eventName && window.pageEventBus) {
              window.pageEventBus.emit(actions[0].eventName);
            }
            toast.dismiss(id);
          }
        };
      } else {
        // Multi-action: Render custom VNode for actions
        // We use the 'description' slot to render additional buttons or a custom layout
        toastOptions.description = h('div', { 
          style: { 
            display: 'flex', 
            gap: '8px', 
            marginTop: '8px',
            justifyContent: toastRTL.value ? 'flex-end' : 'flex-start'
          } 
        }, actions.map(action => h('button', {
          style: {
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            cursor: 'pointer',
            border: '1px solid #ddd',
            backgroundColor: '#fff',
            color: '#333'
          },
          onClick: (event) => {
            if (event) event.preventDefault();
            if (action.handler) action.handler();
            if (action.onClick) action.onClick();
            if (action.eventName && window.pageEventBus) {
              window.pageEventBus.emit(action.eventName);
            }
            toast.dismiss(id);
          }
        }, action.label)));
      }
    }
    
    toastFn(message, toastOptions);
  };

  /**
   * Main handler for dismissing specific notifications
   */
  const handleDismissNotification = (detail) => {
    logger.info('Received dismiss_notification event:', detail);

    // Standardized dismissal for all types (including select-element)
    
    // Prevent double dismissal
    if (window.translateItDismissedNotifications.has(detail.id)) {
      logger.debug('Notification already dismissed, ignoring:', detail.id);
      return;
    }

    window.translateItDismissedNotifications.add(detail.id);

    // Force dismiss - try multiple methods to ensure cleanup
    toast.dismiss(detail.id);

    // Clean up after a delay
    setTimeout(() => {
      if (window.translateItDismissedNotifications) {
        window.translateItDismissedNotifications.delete(detail.id);
      }
    }, 2000);
  };

  onMounted(() => {
    initializeGlobalTrackers();
    
    const pageEventBus = window.pageEventBus;
    if (pageEventBus) {
      tracker.addEventListener(pageEventBus, 'show-notification', handleShowNotification);
      tracker.addEventListener(pageEventBus, 'dismiss_notification', handleDismissNotification);
      tracker.addEventListener(pageEventBus, 'dismiss_all_notifications', () => {
        logger.info('Received dismiss_all_notifications event');
        // Dismiss all notifications
        toast.dismiss();
      });
    }
  });

  return {
    handleShowNotification,
    handleDismissNotification
  };
}
