import { MessageActions } from '@/messaging/core/MessageActions.js';
import { MessagingContexts } from '@/messaging/core/MessagingCore.js';
import { TranslationMode } from '../../config.js';
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
import { RevertHandler } from './RevertHandler.js';

export class ContentMessageHandler {
  constructor() {
    this.handlers = new Map();
    this.initialized = false;
    this.context = MessagingContexts.CONTENT;
    this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'MessageHandler');
    this.selectElementManager = null;
  }

  setSelectElementManager(manager) {
    this.selectElementManager = manager;
  }

  initialize() {
    if (this.initialized) return;
    this.registerHandlers();
    this.initialized = true;
    this.logger.init('Content message handler initialized');
  }

  registerHandlers() {
    this.registerHandler(MessageActions.ACTIVATE_SELECT_ELEMENT_MODE, this.handleActivateSelectElementMode.bind(this));
    this.registerHandler(MessageActions.DEACTIVATE_SELECT_ELEMENT_MODE, this.handleDeactivateSelectElementMode.bind(this));
    this.registerHandler(MessageActions.TRANSLATION_RESULT_UPDATE, this.handleTranslationResult.bind(this));
    this.registerHandler(MessageActions.REVERT_SELECT_ELEMENT_MODE, this.handleRevertTranslation.bind(this));
  }

  registerHandler(action, handler) {
    if (this.handlers.has(action)) {
      this.logger.warn(`Overwriting handler for action: ${action}`);
    }
    this.handlers.set(action, handler);
  }

  async handleMessage(message, sender, sendResponse) {
    const handler = this.handlers.get(message.action);
    if (handler) {
      try {
        const result = await handler(message, sender);
        if (sendResponse) sendResponse({ success: true, data: result });
        return true; // Message was handled
      } catch (error) {
        this.logger.error(`Error handling ${message.action}`, error);
        if (sendResponse) sendResponse({ success: false, error: error.message });
        return true; // Error was handled
      }
    }
    return false; // Message not handled
  }

  async handleActivateSelectElementMode(message) {
    if (this.selectElementManager) {
      return this.selectElementManager.activate();
    }
  }

  async handleDeactivateSelectElementMode(message) {
    if (this.selectElementManager) {
      return this.selectElementManager.deactivate();
    }
  }

  async handleTranslationResult(message) {
    if (message.data?.translationMode === 'SelectElement' && this.selectElementManager) {
      return this.selectElementManager.handleTranslationResult(message);
    }
    // You can add routing for other translation modes here if needed
    return false;
  }

  async handleRevertTranslation() {
    this.logger.debug('Handling revertTranslation action');
    const revertHandler = new RevertHandler();
    return await revertHandler.executeRevert();
  }
}

export const contentMessageHandler = new ContentMessageHandler();
