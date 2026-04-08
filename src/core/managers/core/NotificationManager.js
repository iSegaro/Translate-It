// src/managers/core/NotificationManager.js

import { pageEventBus } from '@/core/PageEventBus.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

/**
 * NotificationManager (v2)
 * A lightweight wrapper for showing in-page notifications via the UI Host.
 * This class provides a clean API for other content-script modules.
 * It determines the correct way to show a notification based on the context.
 */
export default class NotificationManager extends ResourceTracker {
  constructor() {
    super('notification-manager');
    this.logger = getScopedLogger(LOG_COMPONENTS.NOTIFICATIONS, 'NotificationManager');
    this.activeStatusId = null;
  }

  /**
   * Shows a notification.
   *
   * @param {string} message The message to display.
   * @param {('error'|'warning'|'success'|'info'|'status'|'revert'|'select-element')} [type='info'] The type of notification.
   * @param {number|null} [duration=4000] The duration in ms. Use Infinity for persistent notifications.
   * @param {Object} [options={}] Additional options for the notification.
   * @param {boolean} [options.persistent=false] Whether the notification should be persistent.
   * @param {Array} [options.actions=[]] Array of action objects {label, eventName, onClick, handler}.
   * @param {string} [options.id] Optional specific ID for the notification.
   * @returns {string} A unique ID for the notification.
   */
  show(message, type = 'info', duration = 4000, options = {}) {
    const toastId = options.id || `${type}-${Date.now()}`;

    const detail = {
      id: toastId,
      message,
      type,
      duration: options.persistent || duration === Infinity || duration === 0 ? Infinity : duration,
      persistent: options.persistent || duration === Infinity || duration === 0 || false,
      actions: options.actions || []
    };

    const logLevel = type === 'error' ? 'error' : 'info';
    this.logger[logLevel](`[Notification] Showing ${type} notification: ${message}`);
    
    pageEventBus.emit('show-notification', detail);

    return toastId;
  }

  /**
   * Shows a status/loading notification. 
   * If a status notification is already showing, it updates it.
   * 
   * @param {string} message The status message.
   * @param {Object} [options={}] Additional options.
   * @returns {string} The notification ID.
   */
  showStatus(message, options = {}) {
    if (this.activeStatusId) {
      return this.update(this.activeStatusId, message, { type: 'status', ...options });
    }

    this.activeStatusId = this.show(message, 'status', 0, { 
      persistent: true, 
      ...options 
    });
    
    return this.activeStatusId;
  }

  /**
   * Updates an existing notification.
   * 
   * @param {string} toastId The ID of the notification to update.
   * @param {string} message New message.
   * @param {Object} [options={}] New options.
   * @returns {string} The notification ID.
   */
  update(toastId, message, options = {}) {
    this.logger.debug(`[Notification] Updating notification ${toastId}: ${message}`);
    
    const detail = {
      id: toastId,
      message,
      type: options.type || 'info',
      duration: options.persistent || options.duration === Infinity ? Infinity : (options.duration || 4000),
      persistent: options.persistent || false,
      actions: options.actions || [],
      isUpdate: true
    };

    pageEventBus.emit('show-notification', detail);
    return toastId;
  }

  /**
   * Dismisses a notification by its ID.
   * @param {string} toastId The ID of the notification to dismiss.
   */
  dismiss(toastId) {
    if (!toastId) return;
    
    if (toastId === this.activeStatusId) {
      this.activeStatusId = null;
    }

    this.logger.info(`[Notification] Dismissing notification: ${toastId}`);
    pageEventBus.emit('dismiss_notification', { id: toastId });
  }

  /**
   * Dismisses all currently visible notifications.
   */
  dismissAll() {
    this.activeStatusId = null;
    this.logger.info('[Notification] Dismissing all notifications');
    pageEventBus.emit('dismiss_all_notifications');
  }

  cleanup() {
    this.activeStatusId = null;
    super.cleanup();
  }
}
