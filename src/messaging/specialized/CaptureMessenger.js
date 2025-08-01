/**
 * Specialized Capture Messenger
 * Handles all screen capture related messaging operations
 */

import { MessageActions } from '../core/MessageActions.js';

export class CaptureMessenger {
  constructor(context, parentMessenger) {
    this.context = context;
    this.messenger = parentMessenger;
  }

  /**
   * Capture screen with specified options
   * @param {Object} options - Capture options (mode, format, quality)
   * @returns {Promise<Object>} Capture result with image data
   */
  async captureScreen(options = {}) {
    const captureOptions = {
      mode: options.mode || 'selection', // 'selection', 'visible', 'full'
      format: options.format || 'png',
      quality: options.quality || 0.9,
      ...options
    };

    return this.messenger.sendMessage({
      action: MessageActions.SCREEN_CAPTURE,
      target: 'offscreen', // Chrome uses offscreen for capture
      data: captureOptions,
      timestamp: Date.now()
    });
  }

  /**
   * Capture visible tab content
   * @param {Object} options - Capture options
   * @returns {Promise<Object>} Capture result
   */
  async captureVisibleTab(options = {}) {
    return this.captureScreen({
      ...options,
      mode: 'visible'
    });
  }

  /**
   * Start selection mode for screen capture
   * @param {Object} options - Selection options
   * @returns {Promise<Object>} Selection activation result
   */
  async startSelectionMode(options = {}) {
    return this.messenger.sendMessage({
      action: MessageActions.START_CAPTURE_SELECTION,
      data: options,
      timestamp: Date.now()
    });
  }

  /**
   * Process captured image for OCR translation
   * @param {string} imageData - Base64 image data
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} OCR and translation result
   */
  async processImageOCR(imageData, options = {}) {
    if (!imageData) {
      throw new Error('Image data is required for OCR processing');
    }

    return this.messenger.sendMessage({
      action: MessageActions.PROCESS_IMAGE_OCR,
      data: {
        imageData,
        targetLanguage: options.targetLanguage || 'fa',
        sourceLanguage: options.sourceLanguage || 'auto',
        ...options
      },
      timestamp: Date.now()
    });
  }
}

export default CaptureMessenger;