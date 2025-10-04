import { MessageFormat } from "@/shared/messaging/core/MessagingCore.js";
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { CapturePreview } from "../capture/CapturePreview.js";
import { CaptureResult } from "../capture/CaptureResult.js";
import { ScreenSelector } from "../capture/ScreenSelector.js";
import { cropImageData } from "@/features/screen-capture/utils/imageProcessing.js";

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'Capture');

import { MessagingContexts } from "@/shared/messaging/core/MessagingCore.js";
import { MessageActions } from "@/shared/messaging/core/MessageActions.js";
import { sendMessage } from '@/shared/messaging/core/UnifiedMessaging.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';

// removed legacy createLogger import


export class ContentCaptureHandler extends ResourceTracker {
  constructor() {
    super('content-capture-handler')
    // logger.trace('ContentCaptureHandler constructor initialized');
    this.screenSelector = null;
    this.capturePreview = null;
    this.captureResult = null;
    this.handleAreaSelectionComplete = this.handleAreaSelectionComplete.bind(this);
    this.handlePreviewConfirm = this.handlePreviewConfirm.bind(this);
    this.handlePreviewCancel = this.handlePreviewCancel.bind(this);
    this.handlePreviewRetry = this.handlePreviewRetry.bind(this);
    this.handleResultClose = this.handleResultClose.bind(this);
  }

  startScreenAreaSelection(captureOptions) {
    try {
      // logger.trace('Starting screen area selection with options:', captureOptions);
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
      // logger.trace('Area selection completed:', selectionData);
      const fullCaptureMessage = MessageFormat.create(
        MessageActions.CAPTURE_SCREEN,
        { mode: 'full' },
        MessagingContexts.CONTENT
      );

      const fullCaptureResponse = await sendMessage(fullCaptureMessage);
      if (!fullCaptureResponse || fullCaptureResponse.error) throw new Error(fullCaptureResponse.error || "Failed to capture full screen");

      // logger.trace('Full screen captured, cropping to selection');
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

      // logger.trace('Sending OCR processing request');
      await sendMessage(ocrMessage);
      if (this.screenSelector) this.screenSelector.cleanup();
      logger.info('Screen area selection and OCR processing completed');
    } catch (error) {
      this.handleCaptureError(error, "area-completion");
    }
  }

  async showCapturePreview(previewData) {
    try {
      // logger.trace('Showing capture preview with data:', previewData);
      if (this.capturePreview) this.capturePreview.cleanup();
      this.capturePreview = new CapturePreview({
        ...previewData,
        onConfirm: (captureData) => this.handlePreviewConfirm(captureData, previewData.translationOptions),
        onCancel: this.handlePreviewCancel,
        onRetry: this.handlePreviewRetry,
      });
      await this.capturePreview.show();
      logger.info('Capture preview displayed successfully');
    } catch (error) {
      this.handleCaptureError(error, "preview");
    }
  }

  async showCaptureResult(resultData) {
    try {
      // logger.trace('Showing capture result with data:', resultData);
      if (this.captureResult) this.captureResult.cleanup();
      this.captureResult = new CaptureResult({ ...resultData, onClose: this.handleResultClose });
      await this.captureResult.show();
      logger.info('Capture result displayed successfully');
    } catch (error) {
      this.handleCaptureError(error, "result");
    }
  }

  async handlePreviewConfirm(captureData, translationOptions) {
    try {
      // logger.trace('Preview confirmed with data:', { captureData, translationOptions });
      if (this.capturePreview) this.capturePreview.cleanup();
      logger.info('Capture preview confirmed by user');
      await this.messenger.sendMessage({ action: "previewConfirmed", data: { captureData, translationOptions } });
    } catch (error) {
      this.handleCaptureError(error, "preview-confirm");
    }
  }

  handlePreviewCancel() {
    if (this.capturePreview) this.capturePreview.cleanup();
    logger.info('Capture preview cancelled by user');
  this.messenger.sendMessage({ action: "previewCancelled" }).catch(err => logger.error('Error sending preview cancel', err));
  }

  handlePreviewRetry(captureType) {
    if (this.capturePreview) this.capturePreview.cleanup();
    logger.info(`Capture preview retry requested for type: ${captureType}`);
  this.messenger.sendMessage({ action: "previewRetry", data: { captureType } }).catch(err => logger.error('Error sending preview retry', err));
  }

  handleResultClose() {
    if (this.captureResult) this.captureResult.cleanup();
    logger.info('Capture result closed by user');
  this.messenger.sendMessage({ action: "resultClosed" }).catch(err => logger.error('Error sending result close', err));
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
    // logger.trace('Showing error notification:', { message, error: error.message });
    this.messenger.sendMessage({
      action: MessageActions.SHOW_ERROR_NOTIFICATION,
      data: { message, error: error.message, type: error.type || ErrorTypes.SCREEN_CAPTURE },
    }).catch(err => logger.error('Error sending error notification', err));
  }

  isActive() {
    return !!(this.screenSelector || this.capturePreview || this.captureResult);
  }

  getStatus() {
    return { ...this.isActive(), screenSelector: !!this.screenSelector, capturePreview: !!this.capturePreview, captureResult: !!this.captureResult };
  }

  cleanup() {
    // logger.trace('ContentCaptureHandler cleanup initiated');
    if (this.screenSelector) {
      this.screenSelector.cleanup();
      this.screenSelector = null;
    }
    if (this.capturePreview) {
      this.capturePreview.cleanup();
      this.capturePreview = null;
    }
    if (this.captureResult) {
      this.captureResult.cleanup();
      this.captureResult = null;
    }

    // Use ResourceTracker cleanup for automatic resource management
    super.cleanup();

    logger.info('ContentCaptureHandler cleanup completed');
  }
}
