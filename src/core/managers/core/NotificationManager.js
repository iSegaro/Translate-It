// src/managers/core/NotificationManager.js

import { pageEventBus } from '@/core/PageEventBus.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';

/**
 * NotificationManager (v2)
 * A lightweight wrapper for showing in-page notifications via the UI Host.
 * This class provides a clean API for other content-script modules.
 * It determines the correct way to show a notification based on the context.
 */
export default class NotificationManager extends ResourceTracker {
  constructor() {
    super('notification-manager')
  }
  /**
   * Shows a notification.
   *
   * @param {string} message The message to display.
   * @param {('error'|'warning'|'success'|'info'|'status'|'revert')} [type='info'] The type of notification.
   * @param {number|null} [duration=4000] The duration in ms.
   * @returns {string} A unique ID for the notification.
   */
  show(message, type = 'info', duration = 4000) {
    const toastId = `${type}-${Date.now()}`;
    
    const detail = {
      id: toastId,
      message,
      type,
      duration,
      // onClick cannot be passed through the event bus, this would need a more complex implementation
      // if click handlers are required from non-Vue modules.
    };

    pageEventBus.emit('show-notification', detail);

    return toastId;
  }

  /**
   * Dismisses a notification by its ID.
   * @param {string} toastId The ID of the notification to dismiss.
   */
  dismiss(toastId) {
    pageEventBus.emit('dismiss_notification', { id: toastId });
  }

  /**
   * Dismisses all currently visible notifications.
   */
  dismissAll() {
    pageEventBus.emit('dismiss_all_notifications');
  }

  cleanup() {
    // Use ResourceTracker cleanup for automatic resource management
    super.cleanup();
  }
}
