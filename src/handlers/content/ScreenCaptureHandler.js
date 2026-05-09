import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { pageEventBus } from '@/core/PageEventBus.js';

const logger = getScopedLogger(LOG_COMPONENTS.SCREEN_CAPTURE, 'ScreenCaptureHandler');

export class ScreenCaptureHandler {
  constructor() {
    this.isActive = false;
  }

  async activate() {
    this.isActive = true;
    logger.info('ScreenCaptureHandler activated');
    return true;
  }

  async deactivate() {
    this.isActive = false;
    logger.info('ScreenCaptureHandler deactivated');
    return true;
  }

  /**
   * Handle START_SCREEN_CAPTURE message
   */
  async handleStartScreenCapture(message) {
    logger.info('START_SCREEN_CAPTURE received', message.data);

    try {
      // Ensure Vue is loaded
      if (window.translateItContentCore && !window.translateItContentCore.vueLoaded) {
        await window.translateItContentCore.loadVueApp();
      }

      // Emit event to ContentApp via pageEventBus
      pageEventBus.emit('screen-capture-activated', message.data || {});

      return { success: true };
    } catch (error) {
      logger.error('Failed to start screen capture UI:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle CAPTURE_SCREEN_AREA message (results)
   */
  async handleCaptureScreenArea(message) {
    logger.info('CAPTURE_SCREEN_AREA received', message.data);
    
    // This is usually sent from ContentApp to Background
    // If it's sent to Content, we might want to show the preview
    pageEventBus.emit('show-capture-preview', message.data);
    
    return { success: true };
  }
}

export const screenCaptureHandler = new ScreenCaptureHandler();
