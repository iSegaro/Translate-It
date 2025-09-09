import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { SelectElementManagerNew } from '../managers/SelectElementManager.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { storageManager } from '@/shared/storage/core/StorageCore.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import browser from 'webextension-polyfill';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'SelectElementHandler');

export class SelectElementHandler extends ResourceTracker {
  constructor() {
    super('select-element-handler');
    
    this.isActive = false;
    this.selectElementManager = null;
    this.messageListener = null;
  }

  async activate() {
    if (this.isActive) {
      logger.debug('SelectElementHandler already active');
      return;
    }

    try {
      logger.debug('Activating SelectElementHandler');
      
      // Create and initialize SelectElementManager
      this.selectElementManager = new SelectElementManagerNew();
      await this.selectElementManager.initialize();
      
      // Track the manager for cleanup
      this.trackResource('select-element-manager', () => {
        if (this.selectElementManager) {
          this.selectElementManager.cleanup();
          this.selectElementManager = null;
        }
      });
      
      // Register handlers with central message handler will be done by FeatureManager
      
      this.isActive = true;
      logger.info('SelectElementHandler activated successfully');
      return true;
      
    } catch (error) {
      const handler = ErrorHandler.getInstance();
      handler.handle(error, {
        type: ErrorTypes.SERVICE,
        context: 'SelectElementHandler-activate',
        showToast: false
      });
      return false;
    }
  }

  async deactivate() {
    if (!this.isActive) {
      logger.debug('SelectElementHandler not active');
      return true;
    }

    try {
      logger.debug('Deactivating SelectElementHandler');
      
      // Deactivate select element mode if active
      if (this.selectElementManager && this.selectElementManager.isActive) {
        await this.selectElementManager.deactivate({ fromBackground: true });
      }
      
      // ResourceTracker cleanup will handle all tracked resources
      this.cleanup();
      
      this.isActive = false;
      logger.info('SelectElementHandler deactivated successfully');
      return true;
      
    } catch (error) {
      logger.error('Error deactivating SelectElementHandler:', error);
      // Continue with cleanup even if error occurs
      try {
        this.cleanup();
        this.isActive = false;
        return true;
      } catch (cleanupError) {
        logger.error('Critical: SelectElementHandler cleanup failed:', cleanupError);
        return false;
      }
    }
  }

  /**
   * Get handler for central message handler registration
   * This replaces the direct listener setup
   */
  getCentralHandler() {
    return (message, sender, sendResponse) => {
      // Only handle messages relevant to select element
      if (!this.isSelectElementMessage(message.action)) {
        return false; // Let other handlers process
      }

      logger.debug('SelectElementHandler received message via central handler:', message.action);
      
      // Handle the message
      this.handleMessage(message, sender, sendResponse);
      
      // Return true for async response
      return true;
    };
  }

  isSelectElementMessage(action) {
    const selectElementActions = [
      MessageActions.ACTIVATE_SELECT_ELEMENT_MODE,
      MessageActions.SET_SELECT_ELEMENT_STATE,
      MessageActions.GET_SELECT_ELEMENT_STATE,
      MessageActions.CANCEL_SELECT_ELEMENT_TRANSLATION
    ];
    
    return selectElementActions.includes(action);
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      switch (message.action) {
        case MessageActions.ACTIVATE_SELECT_ELEMENT_MODE:
          await this.handleActivateSelectElement(message, sendResponse);
          break;

        case MessageActions.SET_SELECT_ELEMENT_STATE:
          await this.handleSetSelectElementState(message, sendResponse);
          break;

        case MessageActions.GET_SELECT_ELEMENT_STATE:
          await this.handleGetSelectElementState(message, sendResponse);
          break;

        case MessageActions.CANCEL_SELECT_ELEMENT_TRANSLATION:
          await this.handleCancelTranslation(message, sendResponse);
          break;

        default:
          logger.warn('Unhandled select element message:', message.action);
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      logger.error('Error handling select element message:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleActivateSelectElement(message, sendResponse) {
    if (!this.selectElementManager) {
      sendResponse({ success: false, error: 'SelectElementManager not available' });
      return;
    }

    try {
      await this.selectElementManager.activate();
      sendResponse({ success: true });
    } catch (error) {
      logger.error('Failed to activate select element mode:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleSetSelectElementState(message, sendResponse) {
    if (!this.selectElementManager) {
      sendResponse({ success: false, error: 'SelectElementManager not available' });
      return;
    }

    try {
      const { active } = message.data;
      
      if (active) {
        await this.selectElementManager.activate();
      } else {
        await this.selectElementManager.deactivate({ fromBackground: true });
      }
      
      sendResponse({ success: true, active: this.selectElementManager.isActive });
    } catch (error) {
      logger.error('Failed to set select element state:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleGetSelectElementState(message, sendResponse) {
    if (!this.selectElementManager) {
      sendResponse({ 
        success: true, 
        active: false,
        available: false
      });
      return;
    }

    try {
      sendResponse({ 
        success: true, 
        active: this.selectElementManager.isActive,
        available: true,
        processing: this.selectElementManager.isProcessingClick
      });
    } catch (error) {
      logger.error('Failed to get select element state:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleCancelTranslation(message, sendResponse) {
    if (!this.selectElementManager) {
      sendResponse({ success: false, error: 'SelectElementManager not available' });
      return;
    }

    try {
      await this.selectElementManager.cancelInProgressTranslation();
      sendResponse({ success: true });
    } catch (error) {
      logger.error('Failed to cancel select element translation:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  // Public API methods
  getSelectElementManager() {
    return this.selectElementManager;
  }

  isSelectElementActive() {
    return this.selectElementManager?.isActive || false;
  }

  getStatus() {
    return {
      handlerActive: this.isActive,
      selectElementActive: this.isSelectElementActive(),
      managerAvailable: !!this.selectElementManager
    };
  }
}

export default SelectElementHandler;