// src/capture/CaptureResult.js

import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { createSafeElement, safeSetText } from "../utils/ui/html-sanitizer.js";
import { SimpleMarkdown } from "../utils/text/markdown.js";
import { getTranslationString } from "../utils/i18n/i18n.js";

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.CAPTURE, 'CaptureResult');


/**
 * Screen capture translation result display system
 * Shows translated text overlay on the captured area
 */
export class CaptureResult {
  constructor(options = {}) {
    this.originalCapture = options.originalCapture;
    this.translationText = options.translationText;
    this.position = options.position || { x: 100, y: 100 };

    this.onClose = options.onClose || (() => {});

    this.isVisible = false;
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };

    // DOM elements
    this.resultOverlay = null;
    this.dragHandle = null;
    this.contentContainer = null;
    this.closeButton = null;

    // Auto-fade timer
    this.autoFadeTimer = null;
    this.autoFadeDelay = 10000; // 10 seconds

    // Bound event handlers
    this._boundMouseDown = this._handleMouseDown.bind(this);
    this._boundMouseMove = this._handleMouseMove.bind(this);
    this._boundMouseUp = this._handleMouseUp.bind(this);
    this._boundKeyDown = this._handleKeyDown.bind(this);
  }

  /**
   * Show the result overlay
   * @returns {Promise<void>}
   */
  async show() {
    try {
  logger.info('Showing translation result');

      if (this.isVisible) {
        this.hide();
      }

      await this._createResultOverlay();
      this._addEventListeners();
      this._startAutoFadeTimer();

      this.isVisible = true;

  logger.init('Result shown successfully');
    } catch (error) {
  logger.error('Error showing result:', error);
      throw this._createError(
        ErrorTypes.UI,
        `Failed to show capture result: ${error.message}`,
      );
    }
  }

  /**
   * Hide the result overlay
   */
  hide() {
    if (!this.isVisible) return;

  logger.info('Hiding result');

    this._clearAutoFadeTimer();
    this._removeEventListeners();

    if (this.resultOverlay && this.resultOverlay.parentNode) {
      this.resultOverlay.parentNode.removeChild(this.resultOverlay);
    }

    this.isVisible = false;
  }

  /**
   * Create result overlay UI
   * @private
   */
  async _createResultOverlay() {
    try {
      // Create main overlay
      this.resultOverlay = createSafeElement("div", "", {
        id: "translate-it-capture-result",
        style: `
          position: fixed;
          left: ${this.position.x}px;
          top: ${this.position.y}px;
          min-width: 200px;
          max-width: 500px;
          background: white;
          border: 1px solid #d0d0d0;
          border-radius: 8px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
          z-index: 2147483647;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          opacity: 0.95;
          transition: opacity 0.3s ease;
        `,
      });

      // Create drag handle header
      this.dragHandle = createSafeElement("div", "", {
        style: `
          background: linear-gradient(135deg, #007acc, #0066b3);
          color: white;
          padding: 8px 12px;
          border-radius: 8px 8px 0 0;
          cursor: move;
          user-select: none;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 12px;
          font-weight: 600;
        `,
      });

      // Create title
      const title = createSafeElement("span", "", {});
      safeSetText(
        title,
        await getTranslationString(
          "CAPTURE_RESULT_TITLE",
          "Translation Result",
        ),
      );

      // Create close button
      this.closeButton = createSafeElement("button", "", {
        style: `
          background: none;
          border: none;
          color: white;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          font-size: 16px;
          line-height: 1;
          transition: background-color 0.2s ease;
        `,
      });
      safeSetText(this.closeButton, "×");

      // Add close button hover effect
      this.closeButton.addEventListener("mouseenter", () => {
        this.closeButton.style.backgroundColor = "rgba(255, 255, 255, 0.2)";
      });

      this.closeButton.addEventListener("mouseleave", () => {
        this.closeButton.style.backgroundColor = "transparent";
      });

      this.closeButton.addEventListener(
        "click",
        this._handleCloseClick.bind(this),
      );

      this.dragHandle.appendChild(title);
      this.dragHandle.appendChild(this.closeButton);

      // Create content container
      this.contentContainer = createSafeElement("div", "", {
        style: `
          padding: 16px;
          max-height: 300px;
          overflow-y: auto;
          line-height: 1.5;
          font-size: 14px;
          color: #333;
        `,
      });

      // Extract actual translation text (handle both string and object cases)
      let actualTranslationText = "";
      if (typeof this.translationText === "string") {
        actualTranslationText = this.translationText;
      } else if (
        this.translationText &&
        typeof this.translationText === "object"
      ) {
        // If it's an object, try to extract translatedText property
        actualTranslationText =
          this.translationText.translatedText ||
          this.translationText.text ||
          JSON.stringify(this.translationText);
      }

      logger.info('Processing translation text:', {
        originalType: typeof this.translationText,
        extractedText: actualTranslationText,
        original: this.translationText,
      });

      // Render translation content with markdown support
      const translationContent = SimpleMarkdown.render(
        actualTranslationText || "",
      );

      // Clear existing content
      this.contentContainer.innerHTML = "";

      // SimpleMarkdown.render() returns a DOM element, so append it directly
      if (
        translationContent &&
        translationContent.nodeType === Node.ELEMENT_NODE
      ) {
        this.contentContainer.appendChild(translationContent);
      } else {
        // Fallback: if it's not a DOM element, set as text
        safeSetText(this.contentContainer, actualTranslationText || "");
      }

      // Create footer with info
      const footer = createSafeElement("div", "", {
        style: `
          padding: 8px 12px;
          border-top: 1px solid #e0e0e0;
          background: #f8f9fa;
          border-radius: 0 0 8px 8px;
          font-size: 11px;
          color: #666;
          text-align: center;
        `,
      });

      const footerText = await getTranslationString(
        "CAPTURE_RESULT_FOOTER",
        "Drag to move • Auto-fade in 10s • Click × to close",
      );
      safeSetText(footer, footerText);

      // Assemble overlay
      this.resultOverlay.appendChild(this.dragHandle);
      this.resultOverlay.appendChild(this.contentContainer);
      this.resultOverlay.appendChild(footer);

      // Inject into page
      document.body.appendChild(this.resultOverlay);

      logger.init('Result overlay created successfully');
    } catch (error) {
      logger.error('Error creating result overlay:', error);
      throw error;
    }
  }

  /**
   * Add event listeners
   * @private
   */
  _addEventListeners() {
    if (this.dragHandle) {
      this.dragHandle.addEventListener("mousedown", this._boundMouseDown);
    }

    document.addEventListener("mousemove", this._boundMouseMove);
    document.addEventListener("mouseup", this._boundMouseUp);
    document.addEventListener("keydown", this._boundKeyDown);
  }

  /**
   * Remove event listeners
   * @private
   */
  _removeEventListeners() {
    if (this.dragHandle) {
      this.dragHandle.removeEventListener("mousedown", this._boundMouseDown);
    }

    document.removeEventListener("mousemove", this._boundMouseMove);
    document.removeEventListener("mouseup", this._boundMouseUp);
    document.removeEventListener("keydown", this._boundKeyDown);
  }

  /**
   * Handle mouse down - start dragging
   * @param {MouseEvent} event
   * @private
   */
  _handleMouseDown(event) {
    if (event.button !== 0) return; // Only left click

    logger.info('Starting drag');

    this.isDragging = true;

    // Calculate drag offset
    const rect = this.resultOverlay.getBoundingClientRect();
    this.dragOffset = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };

    // Clear auto-fade while dragging
    this._clearAutoFadeTimer();

    // Change cursor
    this.dragHandle.style.cursor = "grabbing";

    event.preventDefault();
    event.stopPropagation();
  }

  /**
   * Handle mouse move - update position
   * @param {MouseEvent} event
   * @private
   */
  _handleMouseMove(event) {
    if (!this.isDragging) return;

    // Calculate new position
    const newX = event.clientX - this.dragOffset.x;
    const newY = event.clientY - this.dragOffset.y;

    // Constrain to viewport
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const rect = this.resultOverlay.getBoundingClientRect();

    const constrainedX = Math.max(
      0,
      Math.min(newX, viewportWidth - rect.width),
    );
    const constrainedY = Math.max(
      0,
      Math.min(newY, viewportHeight - rect.height),
    );

    // Update position
    this.resultOverlay.style.left = constrainedX + "px";
    this.resultOverlay.style.top = constrainedY + "px";

    // Store new position
    this.position = { x: constrainedX, y: constrainedY };
  }

  /**
   * Handle mouse up - stop dragging
   * @param {MouseEvent} event
   * @private
   */
  _handleMouseUp(event) {
    if (!this.isDragging) return;

    logger.info('Ending drag');

    this.isDragging = false;

    // Reset cursor
    this.dragHandle.style.cursor = "move";

    // Restart auto-fade timer
    this._startAutoFadeTimer();

    event.preventDefault();
    event.stopPropagation();
  }

  /**
   * Handle keyboard input
   * @param {KeyboardEvent} event
   * @private
   */
  _handleKeyDown(event) {
    if (event.key === "Escape") {
      this._handleCloseClick();
      event.preventDefault();
    }
  }

  /**
   * Handle close button click
   * @private
   */
  _handleCloseClick() {
    logger.info('Close clicked');

    try {
      this.hide();
      this.onClose();
    } catch (error) {
      logger.error('Error in close callback:', error);
    }
  }

  /**
   * Start auto-fade timer
   * @private
   */
  _startAutoFadeTimer() {
    this._clearAutoFadeTimer();

    this.autoFadeTimer = setTimeout(() => {
      if (this.isVisible && !this.isDragging) {
        logger.info('Auto-fading result');
        this.resultOverlay.style.opacity = "0.3";

        // Complete auto-close after fade
        setTimeout(() => {
          if (this.isVisible) {
            this._handleCloseClick();
          }
        }, 2000);
      }
    }, this.autoFadeDelay);
  }

  /**
   * Clear auto-fade timer
   * @private
   */
  _clearAutoFadeTimer() {
    if (this.autoFadeTimer) {
      clearTimeout(this.autoFadeTimer);
      this.autoFadeTimer = null;
    }

    // Reset opacity if overlay exists
    if (this.resultOverlay) {
      this.resultOverlay.style.opacity = "0.95";
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
    error.context = "capture-result";
    return error;
  }

  /**
   * Clean up result and remove from DOM
   */
  cleanup() {
    logger.info('Cleaning up');

    this._clearAutoFadeTimer();
    this.hide();

    // Reset references
    this.resultOverlay = null;
    this.dragHandle = null;
    this.contentContainer = null;
    this.closeButton = null;
  }

  /**
   * Check if result is currently visible
   * @returns {boolean} True if visible
   */
  isResultVisible() {
    return this.isVisible;
  }

  /**
   * Update translation text content
   * @param {string|Object} newText - New translation text
   */
  updateTranslation(newText) {
    this.translationText = newText;

    if (this.contentContainer) {
      // Extract actual translation text (handle both string and object cases)
      let actualTranslationText = "";
      if (typeof newText === "string") {
        actualTranslationText = newText;
      } else if (newText && typeof newText === "object") {
        actualTranslationText =
          newText.translatedText || newText.text || JSON.stringify(newText);
      }

      const translationContent = SimpleMarkdown.render(
        actualTranslationText || "",
      );

      // Clear existing content
      this.contentContainer.innerHTML = "";

      // SimpleMarkdown.render() returns a DOM element, so append it directly
      if (
        translationContent &&
        translationContent.nodeType === Node.ELEMENT_NODE
      ) {
        this.contentContainer.appendChild(translationContent);
      } else {
        // Fallback: if it's not a DOM element, set as text
        safeSetText(this.contentContainer, actualTranslationText || "");
      }
    }
  }

  /**
   * Set new position
   * @param {Object} newPosition - New position {x, y}
   */
  setPosition(newPosition) {
    this.position = newPosition;

    if (this.resultOverlay) {
      this.resultOverlay.style.left = newPosition.x + "px";
      this.resultOverlay.style.top = newPosition.y + "px";
    }
  }
}
