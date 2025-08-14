import { MessageFormat } from "../../messaging/core/MessagingCore.js";
import { ErrorTypes } from "../error-management/ErrorTypes.js";
import { CapturePreview } from "../capture/CapturePreview.js";
import { CaptureResult } from "../capture/CaptureResult.js";
import { ScreenSelector } from "../capture/ScreenSelector.js";
import { cropImageData } from "../utils/imageProcessing.js";

// Lazy logger to avoid initialization order issues
let _logger;
const getLogger = () => {
  if (!_logger) {
    _logger = createLogger(LOG_COMPONENTS.BACKGROUND, 'Capture');
  }
  return _logger;
};

import { MessagingContexts } from "../../messaging/core/MessagingCore.js";
import { MessageActions } from "../../messaging/core/MessageActions.js";
import browser from "webextension-polyfill";

import { createLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';


export class ContentCaptureHandler {
  constructor() {
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
      if (this.screenSelector) this.screenSelector.cleanup();
      this.screenSelector = new ScreenSelector({
        onSelectionComplete: (selectionData) => this.handleAreaSelectionComplete(selectionData, captureOptions),
        onCancel: () => this.cleanup(),
      });
      this.screenSelector.start();
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
      
      const fullCaptureResponse = await browser.runtime.sendMessage(fullCaptureMessage);
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
      
      await browser.runtime.sendMessage(ocrMessage);
      if (this.screenSelector) this.screenSelector.cleanup();
    } catch (error) {
      this.handleCaptureError(error, "area-completion");
    }
  }

  async showCapturePreview(previewData) {
    try {
      if (this.capturePreview) this.capturePreview.cleanup();
      this.capturePreview = new CapturePreview({
        ...previewData,
        onConfirm: (captureData) => this.handlePreviewConfirm(captureData, previewData.translationOptions),
        onCancel: this.handlePreviewCancel,
        onRetry: this.handlePreviewRetry,
      });
      await this.capturePreview.show();
    } catch (error) {
      this.handleCaptureError(error, "preview");
    }
  }

  async showCaptureResult(resultData) {
    try {
      if (this.captureResult) this.captureResult.cleanup();
      this.captureResult = new CaptureResult({ ...resultData, onClose: this.handleResultClose });
      await this.captureResult.show();
    } catch (error) {
      this.handleCaptureError(error, "result");
    }
  }

  async handlePreviewConfirm(captureData, translationOptions) {
    try {
      if (this.capturePreview) this.capturePreview.cleanup();
      await this.messenger.sendMessage({ action: "previewConfirmed", data: { captureData, translationOptions } });
    } catch (error) {
      this.handleCaptureError(error, "preview-confirm");
    }
  }

  handlePreviewCancel() {
    if (this.capturePreview) this.capturePreview.cleanup();
    this.messenger.sendMessage({ action: "previewCancelled" }).catch(err => getLogger().error('Error sending preview cancel', err));
  }

  handlePreviewRetry(captureType) {
    if (this.capturePreview) this.capturePreview.cleanup();
    this.messenger.sendMessage({ action: "previewRetry", data: { captureType } }).catch(err => getLogger().error('Error sending preview retry', err));
  }

  handleResultClose() {
    if (this.captureResult) this.captureResult.cleanup();
    this.messenger.sendMessage({ action: "resultClosed" }).catch(err => getLogger().error('Error sending result close', err));
  }

  handleCaptureError(error, context) {
    this.cleanup();
    this.messenger.sendMessage({
      action: "captureError",
      data: { error: error.message, context, type: error.type || ErrorTypes.SCREEN_CAPTURE },
    }).catch(err => getLogger().error('Error sending capture error', err));
    this._showErrorNotification(`Screen capture ${context} failed. Please try again.`, error);
  }

  cleanup() {
    if (this.screenSelector) this.screenSelector.cleanup();
    if (this.capturePreview) this.capturePreview.cleanup();
    if (this.captureResult) this.captureResult.cleanup();
    this.screenSelector = this.capturePreview = this.captureResult = null;
  }

  _showErrorNotification(message, error) {
    this.messenger.sendMessage({
      action: MessageActions.SHOW_ERROR_NOTIFICATION,
      data: { message, error: error.message, type: error.type || ErrorTypes.SCREEN_CAPTURE },
    }).catch(err => getLogger().error('Error sending error notification', err));
  }

  isActive() {
    return !!(this.screenSelector || this.capturePreview || this.captureResult);
  }

  getStatus() {
    return { ...this.isActive(), screenSelector: !!this.screenSelector, capturePreview: !!this.capturePreview, captureResult: !!this.captureResult };
  }
}
