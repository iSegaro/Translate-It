import { MessageFormat } from "@/shared/messaging/core/MessagingCore.js";
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { ScreenSelector } from "../capture/ScreenSelector.js";
import { cropImageData } from "@/features/screen-capture/utils/imageProcessing.js";

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'Capture');

import { MessagingContexts } from "@/shared/messaging/core/MessagingCore.js";
import { MessageActions } from "@/shared/messaging/core/MessageActions.js";
import { sendMessage } from '@/shared/messaging/core/UnifiedMessaging.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';

/**
 * Handler for screen capture functionality.
 * Note: Legacy Preview and Result UI logic has been removed as results are now
 * routed directly to the WindowsManager translation UI.
 */
export class ContentCaptureHandler extends ResourceTracker {
  constructor() {
    super('content-capture-handler')
    this.screenSelector = null;
    this.handleAreaSelectionComplete = this.handleAreaSelectionComplete.bind(this);
  }

  startScreenAreaSelection(captureOptions) {
    try {
      if (this.screenSelector) this.screenSelector.cleanup();
      this.screenSelector = new ScreenSelector({
        onSelectionComplete: (selectionData) => this.handleAreaSelectionComplete(selectionData, captureOptions),
        onCancel: () => this.cleanup(),
      });
      this.screenSelector.start();
      logger.info('Screen area selection started');
    } catch (error) {
      this.handleCaptureError(error, "area-selection");
    }
  }

  async handleAreaSelectionComplete(selectionData, captureOptions) {
    try {
      const fullCaptureMessage = MessageFormat.create(
        MessageActions.CAPTURE_SCREEN,
        { mode: 'full' },
        MessagingContexts.CONTENT
      );

      const fullCaptureResponse = await sendMessage(fullCaptureMessage);
      if (!fullCaptureResponse || fullCaptureResponse.error) throw new Error(fullCaptureResponse.error || "Failed to capture full screen");

      const croppedImageData = await cropImageData(fullCaptureResponse.imageData, selectionData);

      const ocrMessage = MessageFormat.create(
        MessageActions.PROCESS_IMAGE_OCR,
        {
          imageData: croppedImageData,
          ...captureOptions,
          selectionData
        },
        MessagingContexts.CONTENT
      );

      await sendMessage(ocrMessage);
      if (this.screenSelector) this.screenSelector.cleanup();
      logger.info('Screen area selection and OCR processing completed');
    } catch (error) {
      this.handleCaptureError(error, "area-completion");
    }
  }

  handleCaptureError(error, context) {
    logger.error(`Capture error in context: ${context}`, error);
    this.cleanup();
    this.messenger.sendMessage({
      action: "captureError",
      data: { error: error.message, context, type: error.type || ErrorTypes.SCREEN_CAPTURE },
  }).catch(err => logger.error('Error sending capture error', err));
    this._showErrorNotification(`Screen capture ${context} failed. Please try again.`, error);
  }

  _showErrorNotification(message, error) {
    this.messenger.sendMessage({
      action: MessageActions.SHOW_ERROR_NOTIFICATION,
      data: { message, error: error.message, type: error.type || ErrorTypes.SCREEN_CAPTURE },
    }).catch(err => logger.error('Error sending error notification', err));
  }

  isActive() {
    return !!this.screenSelector;
  }

  getStatus() {
    return { isActive: this.isActive(), screenSelector: !!this.screenSelector };
  }

  cleanup() {
    if (this.screenSelector) {
      this.screenSelector.cleanup();
      this.screenSelector = null;
    }

    // Use ResourceTracker cleanup for automatic resource management
    super.cleanup();

    logger.info('ContentCaptureHandler cleanup completed');
  }
}
