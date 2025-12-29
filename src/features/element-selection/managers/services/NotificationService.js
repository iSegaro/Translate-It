import { getScopedLogger } from "../../../../shared/logging/logger.js";
import { LOG_COMPONENTS } from "../../../../shared/logging/logConstants.js";
import { getTranslationString } from "../../../../utils/i18n/i18n.js";
import { pageEventBus } from '@/core/PageEventBus.js';

/**
 * NotificationService - Manages UI notifications and status updates
 * Handles status notifications, toast notifications, and SelectElement notification dismissal
 *
 * Responsibilities:
 * - Status notifications for translation progress
 * - Toast notifications for timeouts and errors
 * - SelectElement notification dismissal
 *
 * @memberof module:features/element-selection/managers/services
 */
export class NotificationService {
  constructor(uiManager) {
    this.uiManager = uiManager;
    this.logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'NotificationService');

    // UI state tracking
    this.statusNotification = null;
  }

  /**
   * Initialize the notification service
   */
  initialize() {
    this.logger.debug('NotificationService initialized');
  }

  /**
   * Show status notification for translation progress
   * @param {string} messageId - Message ID
   * @param {string} context - Translation context
   * @returns {Promise<string|null>} Notification ID or null
   */
  async showStatusNotification(messageId, context = 'select-element') {
    // Only show status notification if not for SelectElement mode
    // SelectElement mode has its own notification management
    if (context === 'select-element') {
      this.statusNotification = null;
      return null;
    }

    const statusMessage = await getTranslationString("SELECT_ELEMENT_TRANSLATING") || "Translating...";
    this.statusNotification = `status-${messageId}`;

    pageEventBus.emit('show-notification', {
      id: this.statusNotification,
      message: statusMessage,
      type: "status",
    });

    return this.statusNotification;
  }

  /**
   * Dismiss active status notification
   */
  dismissStatusNotification() {
    if (this.statusNotification) {
      pageEventBus.emit('dismiss_notification', { id: this.statusNotification });
      this.statusNotification = null;
    }
  }

  /**
   * Dismiss SelectElement notification
   * @param {Object} options - Dismissal options
   */
  dismissSelectElementNotification(options = {}) {
    pageEventBus.emit('dismiss-select-element-notification', {
      reason: 'translation-complete',
      ...options
    });
  }

  /**
   * Show timeout notification to user
   * @param {string} messageId - Message ID
   */
  async showTimeoutNotification(messageId) {
    const timeoutMessage = await getTranslationString('ERRORS_TRANSLATION_TIMEOUT');

    pageEventBus.emit('show-notification', {
      type: 'warning',
      title: 'Translation Timeout',
      message: timeoutMessage || 'Translation is taking longer than expected. Please wait or try again.',
      duration: 10000,
      id: `timeout-${messageId}`
    });
  }

  /**
   * Get notification state statistics
   * @returns {Object} Notification statistics
   */
  getStats() {
    return {
      activeStatusNotification: this.statusNotification !== null
    };
  }

  /**
   * Cleanup notification service
   */
  cleanup() {
    this.dismissStatusNotification();
    this.statusNotification = null;

    this.logger.debug('NotificationService cleanup completed');
  }
}
