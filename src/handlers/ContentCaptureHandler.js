import { MessagingCore } from "../messaging/core/MessagingCore.js";
import { ErrorTypes } from "../error-management/ErrorTypes.js";
import { CapturePreview } from "../capture/CapturePreview.js";
import { CaptureResult } from "../capture/CaptureResult.js";
import { ScreenSelector } from "../capture/ScreenSelector.js";
import { cropImageData } from "../utils/imageProcessing.js";
import { logME } from "../utils/helpers.js";

export class ContentCaptureHandler {
  constructor() {
    this.screenSelector = null;
    this.capturePreview = null;
    this.captureResult = null;
    this.messenger = MessagingCore.getMessenger('content');
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
      const fullCaptureResponse = await this.messenger.specialized.capture.captureScreen({ mode: 'full' });
      if (!fullCaptureResponse || fullCaptureResponse.error) throw new Error(fullCaptureResponse.error || "Failed to capture full screen");
      const croppedImageData = await cropImageData(fullCaptureResponse.imageData, selectionData);
      await this.messenger.specialized.capture.processImageOCR(croppedImageData, { ...captureOptions, selectionData });
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
    this.messenger.sendMessage({ action: "previewCancelled" }).catch(err => logME('Error sending preview cancel', err));
  }

  handlePreviewRetry(captureType) {
    if (this.capturePreview) this.capturePreview.cleanup();
    this.messenger.sendMessage({ action: "previewRetry", data: { captureType } }).catch(err => logME('Error sending preview retry', err));
  }

  handleResultClose() {
    if (this.captureResult) this.captureResult.cleanup();
    this.messenger.sendMessage({ action: "resultClosed" }).catch(err => logME('Error sending result close', err));
  }

  handleCaptureError(error, context) {
    this.cleanup();
    this.messenger.sendMessage({
      action: "captureError",
      data: { error: error.message, context, type: error.type || ErrorTypes.SCREEN_CAPTURE },
    }).catch(err => logME('Error sending capture error', err));
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
      action: "SHOW_ERROR_NOTIFICATION",
      data: { message, error: error.message, type: error.type || ErrorTypes.SCREEN_CAPTURE },
    }).catch(err => logME('Error sending error notification', err));
  }

  isActive() {
    return !!(this.screenSelector || this.capturePreview || this.captureResult);
  }

  getStatus() {
    return { ...this.isActive(), screenSelector: !!this.screenSelector, capturePreview: !!this.capturePreview, captureResult: !!this.captureResult };
  }
}
