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
    window.isScreenCaptureActive = false;

    // Cleanup OCR engine resources
    try {
      const { cleanupOCREngine } = await import('@/features/screen-capture/services/ocrEngine.js');
      await cleanupOCREngine();
    } catch (error) {
      logger.error('Failed to cleanup OCR engine:', error);
    }

    logger.info('ScreenCaptureHandler deactivated');
    return true;
  }

  /**
   * Handle START_SCREEN_CAPTURE message
   */
  async handleStartScreenCapture(message) {
    logger.info('START_SCREEN_CAPTURE received', message.data);

    try {
      // 1. FAST FAIL: Only handle screen capture UI in the top frame
      // Browser viewport capture always captures the whole visible tab area.
      if (window !== window.top) {
        logger.debug('Ignoring screen capture request in iframe');
        return { success: true, ignored: true };
      }

      this.isActive = true;
      window.isScreenCaptureActive = true;

      // Ensure Vue is loaded
      if (window.translateItContentCore && !window.translateItContentCore.vueLoaded) {
        logger.debug('Loading Vue App for screen capture');
        await window.translateItContentCore.loadVueApp();
        // Give Vue/Pinia/Components a moment to mount and setup event listeners
        await new Promise(resolve => setTimeout(resolve, 150));
      }

      logger.debug('Emitting screen-capture-activated event');
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

    // Results are now handled via SCREEN_CAPTURE_OCR_RESULT message and Coordinator
    return { success: true };
  }
}

export const screenCaptureHandler = new ScreenCaptureHandler();
