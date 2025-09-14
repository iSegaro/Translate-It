// SelectElementNotificationManager - Unified notification management for Select Element
// Single responsibility: Manage Select Element notification lifecycle

import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import { getTranslationString } from '@/utils/i18n/i18n.js';
import { getScopedLogger } from '../../shared/logging/logger.js';
import { LOG_COMPONENTS } from '../../shared/logging/logConstants';

class SelectElementNotificationManager extends ResourceTracker {
  constructor(notificationManager) {
    super('select-element-notification-manager');
    
    this.notificationManager = notificationManager;
    this.currentNotification = null;
    this.isInitialized = false;
    
    this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'SelectElementNotificationManager');
    
    this.logger.debug('SelectElementNotificationManager created');
  }
  
  // Singleton pattern
  static instance = null;
  static initializing = false;
  
  static async getInstance(notificationManager) {
    if (!SelectElementNotificationManager.instance) {
      if (SelectElementNotificationManager.initializing) {
        // Wait for initialization to complete
        while (SelectElementNotificationManager.initializing) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        return SelectElementNotificationManager.instance;
      }
      
      SelectElementNotificationManager.initializing = true;
      try {
        SelectElementNotificationManager.instance = new SelectElementNotificationManager(notificationManager);
        await SelectElementNotificationManager.instance.initialize();
      } catch (error) {
        SelectElementNotificationManager.instance = null;
        throw error;
      } finally {
        SelectElementNotificationManager.initializing = false;
      }
    }
    return SelectElementNotificationManager.instance;
  }
  
  static clearInstance() {
    if (SelectElementNotificationManager.instance) {
      SelectElementNotificationManager.instance.cleanup();
      SelectElementNotificationManager.instance = null;
    }
  }
  
  async initialize() {
    if (this.isInitialized) {
      this.logger.debug('SelectElementNotificationManager already initialized');
      return;
    }
    
    this.logger.debug('Initializing SelectElementNotificationManager');
    
    // Setup event listeners for direct communication with SelectElementManager
    this.setupEventListeners();
    
    this.isInitialized = true;
    this.logger.info('SelectElementNotificationManager initialized successfully');
  }
  
  setupEventListeners() {
    // Listen for show notification request
    pageEventBus.on('show-select-element-notification', async (data) => {
      await this.showNotification(data);
    });

    // Listen for update notification request
    pageEventBus.on('update-select-element-notification', async (data) => {
      await this.updateNotification(data);
    });

    // Listen for dismiss notification request
    pageEventBus.on('dismiss-select-element-notification', (data) => {
      this.dismissNotification(data);
    });

    this.logger.debug('Event listeners setup for notification manager');
  }
  
  async showNotification(data = {}) {
    if (!this.isInitialized) {
      this.logger.warn('SelectElementNotificationManager not initialized, cannot show notification');
      return null;
    }

    // Check if we already have an active notification
    if (this.currentNotification && this.currentNotification.isActive) {
      this.logger.debug('Select Element notification already exists, returning existing ID:', this.currentNotification.id);
      return this.currentNotification.id;
    }

    // Clean up any existing notification first
    if (this.currentNotification) {
      this.dismissNotification();
    }

    try {
      // Only show notifications in the main frame (top window)
      // This prevents duplicate notifications in iframes
      if (window !== window.top) {
        this.logger.debug('Select Element notification requested from iframe, ignoring (will be handled by main frame)');
        return 'iframe-notification-skipped';
      }

      // Create notification data (now async)
      const notificationData = await this.createNotificationData(data);

      // Show the notification through notification manager
      const notificationId = this.notificationManager.show(
        notificationData.message,
        notificationData.type,
        notificationData.duration,
        {
          persistent: notificationData.persistent,
          actions: notificationData.actions
        }
      );

      // Store notification reference
      this.currentNotification = {
        id: notificationId,
        isActive: true,
        managerId: data.managerId,
        data: notificationData
      };

      this.logger.debug('Select Element notification shown', {
        notificationId,
        managerId: data.managerId
      });

      return notificationId;

    } catch (error) {
      this.logger.error('Error showing Select Element notification:', error);
      return null;
    }
  }
  
  async updateNotification(data = {}) {
    if (!this.currentNotification || !this.currentNotification.isActive) {
      this.logger.debug('No active notification to update');
      return null;
    }

    // Only update notifications in the main frame
    if (window !== window.top) {
      this.logger.debug('Select Element notification update requested from iframe, ignoring');
      return null;
    }

    try {
      // Update notification based on status
      if (data.status === 'translating') {
        // Update the current notification with translation status but keep cancel button
        const cancelLabel = await getTranslationString('SELECT_ELEMENT_CANCEL') || 'Cancel';
        const translatingMessage = await getTranslationString('SELECT_ELEMENT_TRANSLATING') || 'Translating...';

        const cancelAction = {
          label: cancelLabel,
          eventName: 'cancel-select-element-mode',
          handler: () => {
            // Emit cancel event through pageEventBus
            pageEventBus.emit('cancel-select-element-mode', {
              managerId: this.currentNotification?.data?.managerId
            });
          }
        };

        // Show updated notification with cancel button
        const updatedNotificationId = this.notificationManager.show(
          translatingMessage,
          'info',
          0, // Persistent
          {
            persistent: true,
            actions: [cancelAction] // Keep cancel action during translation
          }
        );

        // Dismiss the old notification
        this.notificationManager.dismiss(this.currentNotification.id);

        // Update notification reference
        this.currentNotification.id = updatedNotificationId;
        this.currentNotification.data.message = translatingMessage;
        this.currentNotification.data.actions = [cancelAction];
        
        this.logger.debug('Select Element notification updated for translation', {
          oldNotificationId: this.currentNotification.id,
          newNotificationId: updatedNotificationId,
          hasCancelAction: true
        });
      }
      
      return this.currentNotification.id;
      
    } catch (error) {
      this.logger.error('Error updating Select Element notification:', error);
      return null;
    }
  }
  
  dismissNotification(data = {}) {
    if (!this.currentNotification) {
      this.logger.debug('No notification to dismiss');
      return;
    }
    
    const notificationId = this.currentNotification.id;
    const { managerId } = data;
    
    // Verify this is the correct manager dismissing the notification
    if (managerId && this.currentNotification.managerId !== managerId) {
      this.logger.debug('Notification dismissal requested by different manager, ignoring', {
        requestedManagerId: managerId,
        notificationManagerId: this.currentNotification.managerId
      });
      return;
    }

    // Only dismiss notifications in the main frame
    // Skip if this is an iframe or if the notification was skipped (iframe notification)
    if (window !== window.top || notificationId === 'iframe-notification-skipped') {
      this.logger.debug('Notification dismissal requested from iframe or for skipped notification, ignoring');
      this.currentNotification = null;
      return;
    }

    try {
      // Mark as inactive first
      this.currentNotification.isActive = false;

      // Dismiss through notification manager
      this.notificationManager.dismiss(notificationId);
      
      // Clear current notification reference
      this.currentNotification = null;
      
      this.logger.debug('Select Element notification dismissed', { 
        notificationId,
        managerId 
      });
      
    } catch (error) {
      this.logger.warn('Error during notification dismissal:', error);
      
      // Fallback: clear references even if dismiss fails
      this.currentNotification = null;
    }
  }
  
  async createNotificationData(data = {}) {
    // Get localized strings
    const cancelLabel = await getTranslationString('SELECT_ELEMENT_CANCEL') || 'Cancel';
    const revertLabel = await getTranslationString('SELECT_ELEMENT_REVERT') || 'Revert';
    const message = await getTranslationString('SELECT_ELEMENT_MODE_ACTIVATED') || 'Element selection mode activated. Click on any text element to translate.';

    const baseActions = [
      {
        label: cancelLabel,
        onClick: data.actions?.cancel || (() => {
          this.logger.debug('Cancel action triggered');
          pageEventBus.emit('cancel-select-element-mode');
        })
      },
      {
        label: revertLabel,
        onClick: data.actions?.revert || (() => {
          this.logger.debug('Revert action triggered');
          pageEventBus.emit('revert-translations');
        })
      }
    ];

    return {
      message: message,
      type: 'info',
      duration: 0, // Persistent
      persistent: true,
      actions: baseActions
    };
  }
  
  // Public API
  getNotificationId() {
    return this.currentNotification ? this.currentNotification.id : null;
  }
  
  isNotificationActive() {
    return this.currentNotification?.isActive || false;
  }
  
  getState() {
    return {
      isInitialized: this.isInitialized,
      hasNotificationManager: !!this.notificationManager,
      hasCurrentNotification: !!this.currentNotification,
      currentNotification: this.currentNotification ? {
        id: this.currentNotification.id,
        isActive: this.currentNotification.isActive,
        managerId: this.currentNotification.managerId
      } : null
    };
  }
  
  async cleanup() {
    this.logger.info("Cleaning up SelectElement notification manager");
    
    try {
      // Dismiss any active notification
      this.dismissNotification();
      
      // Clean up tracked resources
      super.cleanup();
      
      this.isInitialized = false;
      
      this.logger.info("SelectElement notification manager cleanup completed successfully");
      
    } catch (error) {
      this.logger.error("Error during SelectElement notification manager cleanup:", error);
      throw error;
    }
  }
}

// Export class and singleton getter
export { SelectElementNotificationManager };
export const getSelectElementNotificationManager = (notificationManager) => 
  SelectElementNotificationManager.getInstance(notificationManager);