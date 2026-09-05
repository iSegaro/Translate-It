// SelectElementNotificationManager - Unified notification management for Select Element
// Single responsibility: Manage Select Element notification lifecycle using central NotificationManager

import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import { utilsFactory } from '@/utils/UtilsFactory.js';
import { deviceDetector } from '@/utils/browser/compatibility.js';
import { TRANSLATION_STATUS } from '@/shared/constants/translation.js';
import { getScopedLogger } from '../../shared/logging/logger.js';
import { LOG_COMPONENTS } from '../../shared/logging/logConstants';

class SelectElementNotificationManager extends ResourceTracker {
  constructor(notificationManager) {
    super('select-element-notification-manager');
    
    this.notificationManager = notificationManager;
    this.toastId = null;
    this.toastGeneration = null;
    this.notificationGeneration = 0;
    this.isStatusToast = false;
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
    this.addEventListener(pageEventBus, 'show-select-element-info', (data) => this.showInfoNotification(data));
  }

  _startNotificationLifecycle() {
    this.notificationGeneration += 1;

    if (this.toastId) {
      this.notificationManager.dismiss(this.toastId);
    }

    this.toastId = null;
    this.toastGeneration = null;
    this.isStatusToast = false;

    return {
      generation: this.notificationGeneration,
      toastId: `select-element-toast-${this.notificationGeneration}`
    };
  }

  _isCurrentGeneration(generation) {
    return generation === this.notificationGeneration;
  }

  _ownsStatusToast(generation, toastId) {
    return this.isStatusToast
      && this.toastGeneration === generation
      && this.toastId === toastId
      && this._isCurrentGeneration(generation);
  }
  
  async showNotification(data = {}) {
    // Safety check for null data from events
    if (!data) data = {};

    // Only show in top frame
    const isTopFrame = window === window.top;
    if (!isTopFrame) return;

    const { generation, toastId } = this._startNotificationLifecycle();
    try {
      const { getTranslationString } = await utilsFactory.getI18nUtils();
      if (!this._isCurrentGeneration(generation)) return;

      const cancelLabel = await getTranslationString('SELECT_ELEMENT_CANCEL') || 'Cancel';
      if (!this._isCurrentGeneration(generation)) return;

      const isMobile = deviceDetector.isMobile();
      const messageKey = isMobile ? 'SELECT_ELEMENT_MODE_ACTIVATED_MOBILE' : 'SELECT_ELEMENT_MODE_ACTIVATED';
      const message = await getTranslationString(messageKey) || (isMobile ? 'Drag over text to translate.' : 'Click text to translate.');
      if (!this._isCurrentGeneration(generation)) return;

      const actions = [
        {
          label: cancelLabel,
          onClick: data.actions?.cancel || (() => pageEventBus.emit('cancel-select-element-mode'))
        }
      ];

      // Status IDs must remain feature-owned across rapid activation cycles.
      this.notificationManager.show(message, 'status', 0, {
        id: toastId,
        persistent: true,
        actions
      });
      if (!this._isCurrentGeneration(generation)) return;

      this.toastId = toastId;
      this.toastGeneration = generation;
      this.isStatusToast = true;
    } catch (error) {
      if (this._isCurrentGeneration(generation)) {
        this.logger.error('Error showing Select Element notification:', error);
      }
    }
  }
  
  async updateNotification(data = {}) {
    // Safety check for null data from events
    if (!data) data = {};

    const isTopFrame = window === window.top;
    const generation = this.notificationGeneration;
    const toastId = this.toastId;
    if (!this._ownsStatusToast(generation, toastId) || !isTopFrame) {
      this.logger.debug(`[SelectElementNotificationManager] Skip update - toastId: ${this.toastId}, isTopFrame: ${isTopFrame}`);
      return;
    }

    try {
      if (data.status === TRANSLATION_STATUS.TRANSLATING) {
        const i18n = await utilsFactory.getI18nUtils();
        if (!this._ownsStatusToast(generation, toastId)) return;

        let translatingMessage = await i18n.getTranslationString('SELECT_ELEMENT_TRANSLATING') || 'Translating...';
        if (!this._ownsStatusToast(generation, toastId)) return;

        // Show progress based on API requests
        if (data.progress && data.progress.completed !== undefined && data.progress.total !== undefined) {
          // Remove the dots from the localized message to add progress in the middle
          const baseMessage = translatingMessage.replace('...', '').trim();
          translatingMessage = `${baseMessage} (${data.progress.completed}/${data.progress.total})...`;

          this.logger.debug(`[SelectElementNotificationManager] Updating toast with: ${translatingMessage}`);
        }

        const cancelLabel = await i18n.getTranslationString('SELECT_ELEMENT_CANCEL') || 'Cancel';
        if (!this._ownsStatusToast(generation, toastId)) return;

        this.notificationManager.update(toastId, translatingMessage, {
          id: toastId,
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
    this.notificationGeneration += 1;
    const toastId = this.toastId;

    this.toastId = null;
    this.toastGeneration = null;
    this.isStatusToast = false;

    if (toastId) {
      this.notificationManager.dismiss(toastId);
    }
  }

  /**
   * Shows a non-error informational Select Element message (e.g. no
   * translatable content). Replaces any in-flight select-element toast so the
   * activation/progress notification is never left stuck.
   * @param {Object} [data={}] - Event payload.
   * @param {string} [data.message] - Localized informational message.
   */
  showInfoNotification(data = {}) {
    if (!data) data = {};

    const isTopFrame = window === window.top;
    if (!isTopFrame) return;

    const { toastId } = this._startNotificationLifecycle();

    const message = data.message || 'No translatable text was found in this element.';
    this.notificationManager.show(message, 'info', 4000, { id: toastId });
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
