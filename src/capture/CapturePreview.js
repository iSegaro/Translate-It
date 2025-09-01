// src/capture/CapturePreview.js

import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { createSafeElement, safeSetText } from "../utils/ui/html-sanitizer.js";
import { getTranslationString } from "../utils/i18n/i18n.js";

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.CAPTURE, 'CapturePreview');


/**
 * Screen capture preview and confirmation system
 * Shows captured image preview and allows user to confirm or retry
 */
export class CapturePreview {
  constructor(options = {}) {
    this.captureData = options.captureData;
    this.captureType = options.captureType || "area";
    this.selectionData = options.selectionData;

    this.onConfirm = options.onConfirm || (() => {});
    this.onCancel = options.onCancel || (() => {});
    this.onRetry = options.onRetry || (() => {});

    this.isVisible = false;

    // DOM elements
    this.modal = null;
    this.previewImage = null;
    this.confirmButton = null;
    this.cancelButton = null;
    this.retryButton = null;

    // Bound event handlers
    this._boundKeyDown = this._handleKeyDown.bind(this);
    this._boundClickOutside = this._handleClickOutside.bind(this);
  }

  /**
   * Show the preview modal
   * @returns {Promise<void>}
   */
  async show() {
    try {
  logger.debug('Showing capture preview');

      if (this.isVisible) {
        this.hide();
      }

      await this._createModal();
      this._addEventListeners();

      this.isVisible = true;

  logger.init('Preview shown successfully');
    } catch (error) {
  logger.error('Error showing preview:', error);
      throw this._createError(
        ErrorTypes.UI,
        `Failed to show capture preview: ${error.message}`,
      );
    }
  }

  /**
   * Hide the preview modal
   */
  hide() {
    if (!this.isVisible) return;

  logger.debug('Hiding preview');

    this._removeEventListeners();

    if (this.modal && this.modal.parentNode) {
      this.modal.parentNode.removeChild(this.modal);
    }

    this.isVisible = false;
  }

  /**
   * Create preview modal UI
   * @private
   */
  async _createModal() {
    try {
      // Create modal backdrop
      this.modal = createSafeElement("div", "", {
        id: "translate-it-capture-preview",
        style: `
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(0, 0, 0, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2147483647;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        `,
      });

      // Create modal content
      const modalContent = createSafeElement("div", "", {
        style: `
          background: white;
          border-radius: 12px;
          padding: 24px;
          max-width: 90vw;
          max-height: 90vh;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
          display: flex;
          flex-direction: column;
          align-items: center;
          position: relative;
        `,
      });

      // Create header
      const header = createSafeElement("div", "", {
        style: `
          text-align: center;
          margin-bottom: 20px;
        `,
      });

      const title = createSafeElement("h3", "", {
        style: `
          margin: 0 0 8px 0;
          font-size: 18px;
          font-weight: 600;
          color: #333;
        `,
      });

      safeSetText(
        title,
        await getTranslationString("CAPTURE_PREVIEW_TITLE", "Capture Preview"),
      );

      const subtitle = createSafeElement("p", "", {
        style: `
          margin: 0;
          font-size: 14px;
          color: #666;
        `,
      });

      safeSetText(
        subtitle,
        await getTranslationString(
          "CAPTURE_PREVIEW_SUBTITLE",
          "Review your capture and confirm to translate",
        ),
      );

      header.appendChild(title);
      header.appendChild(subtitle);

      // Create preview container
      const previewContainer = createSafeElement("div", "", {
        style: `
          border: 2px solid #e0e0e0;
          border-radius: 8px;
          overflow: hidden;
          margin-bottom: 20px;
          max-width: 600px;
          max-height: 400px;
          background: #f5f5f5;
          display: flex;
          align-items: center;
          justify-content: center;
        `,
      });

      // Create preview image
      this.previewImage = createSafeElement("img", "", {
        style: `
          max-width: 100%;
          max-height: 100%;
          display: block;
          object-fit: contain;
        `,
        src: this.captureData.imageData,
        alt: "Capture Preview",
      });

      previewContainer.appendChild(this.previewImage);

      // Create capture info
      const captureInfo = createSafeElement("div", "", {
        style: `
          text-align: center;
          margin-bottom: 20px;
          font-size: 12px;
          color: #666;
        `,
      });

      const captureTypeText =
        this.captureType === "area"
          ? await getTranslationString("CAPTURE_TYPE_AREA", "Selected Area")
          : await getTranslationString(
              "CAPTURE_TYPE_FULLSCREEN",
              "Full Screen",
            );

      let infoText = `${captureTypeText}`;

      if (this.selectionData) {
        infoText += ` • ${this.selectionData.width} × ${this.selectionData.height}`;
      }

      safeSetText(captureInfo, infoText);

      // Create button container
      const buttonContainer = createSafeElement("div", "", {
        style: `
          display: flex;
          gap: 12px;
          align-items: center;
        `,
      });

      // Create buttons
      this.cancelButton = this._createButton(
        await getTranslationString("BUTTON_CANCEL", "Cancel"),
        "secondary",
        this._handleCancelClick.bind(this),
      );

      this.retryButton = this._createButton(
        await getTranslationString("BUTTON_RETRY", "Retry"),
        "secondary",
        this._handleRetryClick.bind(this),
      );

      this.confirmButton = this._createButton(
        await getTranslationString("BUTTON_TRANSLATE", "Translate"),
        "primary",
        this._handleConfirmClick.bind(this),
      );

      // Assemble buttons
      buttonContainer.appendChild(this.cancelButton);
      buttonContainer.appendChild(this.retryButton);
      buttonContainer.appendChild(this.confirmButton);

      // Assemble modal
      modalContent.appendChild(header);
      modalContent.appendChild(previewContainer);
      modalContent.appendChild(captureInfo);
      modalContent.appendChild(buttonContainer);
      this.modal.appendChild(modalContent);

      // Inject into page
      document.body.appendChild(this.modal);

      // Focus confirm button
      this.confirmButton.focus();

      logger.init('Modal created successfully');
    } catch (error) {
      logger.error('Error creating modal:', error);
      throw error;
    }
  }

  /**
   * Create a button element
   * @param {string} text - Button text
   * @param {string} type - Button type (primary/secondary)
   * @param {Function} onClick - Click handler
   * @returns {HTMLElement} Button element
   * @private
   */
  _createButton(text, type, onClick) {
    const isPrimary = type === "primary";

    const button = createSafeElement("button", "", {
      style: `
        padding: 10px 20px;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        min-width: 80px;
        ${
          isPrimary
            ? `
          background: #007acc;
          color: white;
        `
            : `
          background: #f0f0f0;
          color: #333;
        `
        }
      `,
    });

    safeSetText(button, text);

    // Add hover effects
    button.addEventListener("mouseenter", () => {
      if (isPrimary) {
        button.style.background = "#0066b3";
      } else {
        button.style.background = "#e0e0e0";
      }
    });

    button.addEventListener("mouseleave", () => {
      if (isPrimary) {
        button.style.background = "#007acc";
      } else {
        button.style.background = "#f0f0f0";
      }
    });

    button.addEventListener("click", onClick);

    return button;
  }

  /**
   * Add event listeners
   * @private
   */
  _addEventListeners() {
    document.addEventListener("keydown", this._boundKeyDown);
    this.modal.addEventListener("click", this._boundClickOutside);
  }

  /**
   * Remove event listeners
   * @private
   */
  _removeEventListeners() {
    document.removeEventListener("keydown", this._boundKeyDown);
    if (this.modal) {
      this.modal.removeEventListener("click", this._boundClickOutside);
    }
  }

  /**
   * Handle keyboard input
   * @param {KeyboardEvent} event
   * @private
   */
  _handleKeyDown(event) {
    if (event.key === "Escape") {
      this._handleCancelClick();
      event.preventDefault();
    } else if (event.key === "Enter") {
      this._handleConfirmClick();
      event.preventDefault();
    }
  }

  /**
   * Handle click outside modal
   * @param {MouseEvent} event
   * @private
   */
  _handleClickOutside(event) {
    if (event.target === this.modal) {
      this._handleCancelClick();
    }
  }

  /**
   * Handle confirm button click
   * @private
   */
  _handleConfirmClick() {
    logger.debug('Confirm clicked');

    try {
      this.hide();
      this.onConfirm(this.captureData);
    } catch (error) {
      logger.error('Error in confirm callback:', error);
    }
  }

  /**
   * Handle cancel button click
   * @private
   */
  _handleCancelClick() {
    logger.debug('Cancel clicked');

    try {
      this.hide();
      this.onCancel();
    } catch (error) {
      logger.error('Error in cancel callback:', error);
    }
  }

  /**
   * Handle retry button click
   * @private
   */
  _handleRetryClick() {
    logger.debug('Retry clicked');

    try {
      this.hide();
      this.onRetry(this.captureType);
    } catch (error) {
      logger.error('Error in retry callback:', error);
    }
  }

  /**
   * Create normalized error
   * @param {string} type - Error type
   * @param {string} message - Error message
   * @returns {Error} Normalized error
   * @private
   */
  _createError(type, message) {
    const error = new Error(message);
    error.type = type;
    error.context = "capture-preview";
    return error;
  }

  /**
   * Clean up preview and remove from DOM
   */
  cleanup() {
    logger.debug('Cleaning up');

    this.hide();

    // Reset references
    this.modal = null;
    this.previewImage = null;
    this.confirmButton = null;
    this.cancelButton = null;
    this.retryButton = null;
  }

  /**
   * Check if preview is currently visible
   * @returns {boolean} True if visible
   */
  isPreviewVisible() {
    return this.isVisible;
  }
}
