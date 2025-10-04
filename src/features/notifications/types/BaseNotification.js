// BaseNotification - Base class for all notification types
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

export class BaseNotification {
  constructor(type, options = {}) {
    this.type = type;
    this.id = options.id || this.generateId();
    this.message = options.message || '';
    this.duration = options.duration || 4000;
    this.persistent = options.persistent || false;
    this.actions = options.actions || [];
    this.isActive = false;
    this.logger = getScopedLogger(LOG_COMPONENTS.NOTIFICATIONS, `${type}Notification`);
  }
  
  /**
   * Generate unique notification ID
   * @returns {string} Unique ID
   */
  generateId() {
    return `${this.type}-${Date.now()}`;
  }
  
  /**
   * Get notification data for display
   * @returns {Object} Notification data
   */
  getData() {
    return {
      id: this.id,
      message: this.message,
      type: this.type,
      duration: this.persistent ? Infinity : this.duration,
      persistent: this.persistent,
      actions: this.actions
    };
  }
  
  /**
   * Update notification message
   * @param {string} message - New message
   */
  updateMessage(message) {
    this.message = message;
    this.logger.debug(`[Notification] Message updated for ${this.id}: ${message}`);
  }
  
  /**
   * Add action to notification
   * @param {Object} action - Action object {label, eventName}
   */
  addAction(action) {
    this.actions.push(action);
    this.logger.debug(`[Notification] Action added to ${this.id}: ${action.label}`);
  }
  
  /**
   * Set notification as active
   */
  setActive() {
    this.isActive = true;
    this.logger.info(`[Notification] Activated: ${this.id} (${this.type})`);
    this.logger.debug('Activation details', {
      id: this.id,
      type: this.type,
      message: this.message,
      duration: this.duration
    });
  }
  
  /**
   * Set notification as inactive
   */
  setInactive() {
    this.isActive = false;
    this.logger.info(`[Notification] Deactivated: ${this.id}`);
    this.logger.debug('Deactivation details', {
      id: this.id,
      type: this.type,
      wasActive: this.isActive
    });
  }
  
  /**
   * Get current state
   * @returns {Object} Current state
   */
  getState() {
    return {
      id: this.id,
      type: this.type,
      message: this.message,
      duration: this.duration,
      persistent: this.persistent,
      actionsCount: this.actions.length,
      isActive: this.isActive
    };
  }
}