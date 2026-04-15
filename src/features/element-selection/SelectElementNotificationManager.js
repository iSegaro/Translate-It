// SelectElementNotificationManager - Unified notification management for Select Element
// Single responsibility: Manage Select Element notification lifecycle using central NotificationManager

import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import { utilsFactory } from '@/utils/UtilsFactory.js';
import { deviceDetector } from '@/utils/browser/compatibility.js';
import { TRANSLATION_STATUS } from '@/shared/config/constants.js';
import { getScopedLogger } from '../../shared/logging/logger.js';
import { LOG_COMPONENTS } from '../../shared/logging/logConstants';

class SelectElementNotificationManager extends ResourceTracker {
  constructor(notificationManager) {
    super('select-element-notification-manager');
    
    this.notificationManager = notificationManager;
    this.toastId = null;
    this.isInitialized = false;
    
    this.logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'SelectElementNotificationManager');
  }
  
  // Singleton pattern
  static instance = null;
  
  static async getInstance(notificationManager) {
    if (!SelectElementNotificationManager.instance) {
      SelectElementNotificationManager.instance = new SelectElementNotificationManager(notificationManager);
      await SelectElementNotificationManager.instance.initialize();
    } else if (notificationManager) {
      SelectElementNotificationManager.instance.notificationManager = notificationManager;
    }
    return SelectElementNotificationManager.instance;
  }
  
  async initialize() {
    if (this.isInitialized) return;
    
    // Listen for cross-module events
    this.setupEventListeners();
    this.isInitialized = true;
  }
  
  setupEventListeners() {
    this.addEventListener(pageEventBus, 'show-select-element-notification', (data) => this.showNotification(data));
    this.addEventListener(pageEventBus, 'update-select-element-notification', (data) => this.updateNotification(data));
    this.addEventListener(pageEventBus, 'dismiss-select-element-notification', () => this.dismissNotification());
    this.addEventListener(pageEventBus, 'cancel-select-element-mode', () => this.dismissNotification());
  }
  
  async showNotification(data = {}) {
    // Only show in top frame
    const isTopFrame = window === window.top;
    if (!isTopFrame) return;

    try {
      const { getTranslationString } = await utilsFactory.getI18nUtils();
      
      const cancelLabel = await getTranslationString('SELECT_ELEMENT_CANCEL') || 'Cancel';
      const isMobile = deviceDetector.isMobile();
      const messageKey = isMobile ? 'SELECT_ELEMENT_MODE_ACTIVATED_MOBILE' : 'SELECT_ELEMENT_MODE_ACTIVATED';
      const message = await getTranslationString(messageKey) || (isMobile ? 'Drag over text to translate.' : 'Click text to translate.');

      const actions = [
        {
          label: cancelLabel,
          onClick: data.actions?.cancel || (() => pageEventBus.emit('cancel-select-element-mode'))
        }
      ];

      // Use central showStatus for a consistent experience
      this.toastId = this.notificationManager.showStatus(message, {
        id: 'select-element-toast',
        actions
      });

    } catch (error) {
      this.logger.error('Error showing Select Element notification:', error);
    }
  }
  
  async updateNotification(data = {}) {
    const isTopFrame = window === window.top;
    if (!this.toastId || !isTopFrame) return;

    try {
      if (data.status === TRANSLATION_STATUS.TRANSLATING) {
        const { getTranslationString } = await utilsFactory.getI18nUtils();
        const cancelLabel = await getTranslationString('SELECT_ELEMENT_CANCEL') || 'Cancel';
        const translatingMessage = await getTranslationString('SELECT_ELEMENT_TRANSLATING') || 'Translating...';

        // Update existing notification with new message but keep cancel button
        this.notificationManager.update(this.toastId, translatingMessage, {
          type: 'status',
          persistent: true,
          actions: [{
            label: cancelLabel,
            onClick: () => pageEventBus.emit('cancel-select-element-mode')
          }]
        });
      }
    } catch (error) {
      this.logger.error('Error updating Select Element notification:', error);
    }
  }
  
  dismissNotification() {
    if (this.toastId) {
      this.notificationManager.dismiss(this.toastId);
      this.toastId = null;
    }
  }
  
  async cleanup() {
    this.dismissNotification();
    super.cleanup();
    this.isInitialized = false;
  }
}

export { SelectElementNotificationManager };
export const getSelectElementNotificationManager = (notificationManager) => 
  SelectElementNotificationManager.getInstance(notificationManager);