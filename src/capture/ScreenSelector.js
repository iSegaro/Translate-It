// src/capture/ScreenSelector.js

import { handleUIError } from "../error-management/ErrorService.js";
import { ErrorTypes } from "../error-management/ErrorTypes.js";
import { createSafeElement } from "../utils/ui/html-sanitizer.js";

import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.CAPTURE, 'ScreenSelector');


/**
 * Screen area selection overlay system
 * Provides visual interface for users to select screen areas for capture
 */
export class ScreenSelector {
  constructor(options = {}) {
    this.mode = options.mode || "area"; // "area" or "fullscreen"
    this.onSelectionComplete = options.onSelectionComplete || (() => {});
    this.onCancel = options.onCancel || (() => {});

    this.isActive = false;
    this.isSelecting = false;

    // Selection state
    this.startPoint = null;
    this.currentSelection = null;

    // DOM elements
    this.overlay = null;
    this.selectionBox = null;
    this.instructions = null;

    // Bound event handlers
    this._boundMouseDown = this._handleMouseDown.bind(this);
    this._boundMouseMove = this._handleMouseMove.bind(this);
    this._boundMouseUp = this._handleMouseUp.bind(this);
    this._boundKeyDown = this._handleKeyDown.bind(this);
  }

  /**
   * Start area selection process
   * @returns {Promise<void>}
   */
  async start() {
    try {
  logger.debug('Starting area selection');

      if (this.isActive) {
        this.cleanup();
      }

      this.isActive = true;

      // Create and inject overlay
      await this._createOverlay();

      // Add event listeners
      this._addEventListeners();

  logger.init('Area selection started successfully');
    } catch (error) {
  logger.error('Error starting selection:', error);
      this.cleanup();
      throw this._createError(
        ErrorTypes.SCREEN_CAPTURE,
        `Failed to start screen selection: ${error.message}`,
      );
    }
  }

  /**
   * Create selection overlay UI
   * @private
   */
  async _createOverlay() {
    try {
      // Create main overlay
      this.overlay = createSafeElement("div", "", {
        id: "translate-it-screen-selector",
        style: `
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(0, 0, 0, 0.3);
          cursor: crosshair;
          z-index: 2147483647;
          user-select: none;
          pointer-events: all;
        `,
      });

      // Create selection box
      this.selectionBox = createSafeElement("div", "", {
        id: "translate-it-selection-box",
        style: `
          position: absolute;
          border: 2px solid #007acc;
          background: rgba(0, 122, 204, 0.1);
          pointer-events: none;
          display: none;
        `,
      });

      // Create instructions
      this.instructions = createSafeElement("div", "", {
        id: "translate-it-selection-instructions",
        style: `
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(0, 0, 0, 0.8);
          color: white;
          padding: 12px 20px;
          border-radius: 6px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 14px;
          z-index: 2147483648;
          pointer-events: none;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        `,
      });

      this.instructions.textContent =
        "Drag to select area • Press Escape to cancel";

      // Assemble overlay
      this.overlay.appendChild(this.selectionBox);
      this.overlay.appendChild(this.instructions);

      // Inject into page
      document.body.appendChild(this.overlay);

      // Apply styles for fullscreen mode
      this.overlay.style.cursor = 'crosshair';
      this._createInstructions();
      
      logger.init('Overlay created successfully');
    } catch (error) {
      logger.error('Error creating overlay:', error);
      throw error;
    }
  }

  /**
   * Add event listeners for selection interaction
   * @private
   */
  _addEventListeners() {
    if (!this.overlay) return;

    this.overlay.addEventListener("mousedown", this._boundMouseDown);
    document.addEventListener("mousemove", this._boundMouseMove);
    document.addEventListener("mouseup", this._boundMouseUp);
    document.addEventListener("keydown", this._boundKeyDown);
  }

  /**
   * Remove event listeners
   * @private
   */
  _removeEventListeners() {
    if (this.overlay) {
      this.overlay.removeEventListener("mousedown", this._boundMouseDown);
    }

    document.removeEventListener("mousemove", this._boundMouseMove);
    document.removeEventListener("mouseup", this._boundMouseUp);
    document.removeEventListener("keydown", this._boundKeyDown);
  }

  /**
   * Convert viewport coordinates to capture coordinates
   * browser capture API captures visible viewport, so we need viewport-relative coordinates
   * @param {MouseEvent} event - Mouse event with clientX/clientY
   * @returns {Object} Capture coordinates {x, y}
   * @private
   */
  _getCaptureCoordinates(event) {
    // For screen capture, we need viewport-relative coordinates
    // browser.tabs.captureVisibleTab() captures what's currently visible in viewport
    return {
      x: Math.round(event.clientX),
      y: Math.round(event.clientY),
    };
  }

  /**
   * Handle mouse down - start selection
   * @param {MouseEvent} event
   * @private
   */
  _handleMouseDown(event) {
    if (event.button !== 0) return; // Only left click

    logger.debug('Mouse down, starting selection');

    this.isSelecting = true;

    // Use viewport coordinates for capture (since browser captures viewport)
    const captureCoords = this._getCaptureCoordinates(event);
    this.startPoint = {
      x: captureCoords.x,
      y: captureCoords.y,
    };

    // Show selection box using same coordinates
    this.selectionBox.style.display = "block";
    this.selectionBox.style.left = event.clientX + "px";
    this.selectionBox.style.top = event.clientY + "px";
    this.selectionBox.style.width = "0px";
    this.selectionBox.style.height = "0px";

    event.preventDefault();
    event.stopPropagation();
  }

  /**
   * Handle mouse move - update selection
   * @param {MouseEvent} event
   * @private
   */
  _handleMouseMove(event) {
    if (!this.isSelecting || !this.startPoint) return;

    // Get capture coordinates (viewport-relative)
    const captureCoords = this._getCaptureCoordinates(event);
    const currentX = captureCoords.x;
    const currentY = captureCoords.y;

    // Calculate selection rectangle using viewport coordinates
    const left = Math.min(this.startPoint.x, currentX);
    const top = Math.min(this.startPoint.y, currentY);
    const width = Math.abs(currentX - this.startPoint.x);
    const height = Math.abs(currentY - this.startPoint.y);

    // Update selection box using same coordinates
    this.selectionBox.style.left = left + "px";
    this.selectionBox.style.top = top + "px";
    this.selectionBox.style.width = width + "px";
    this.selectionBox.style.height = height + "px";

    // Store current selection using capture coordinates
    this.currentSelection = {
      left: left,
      top: top,
      width: width,
      height: height,
    };
  }

  /**
   * Handle mouse up - complete selection
   * @param {MouseEvent} event
   * @private
   */
  _handleMouseUp(event) {
    if (!this.isSelecting) return;

    logger.debug('Mouse up, completing selection');

    this.isSelecting = false;

    // Validate selection
    if (
      !this.currentSelection ||
      this.currentSelection.width < 10 ||
      this.currentSelection.height < 10
    ) {
      logger.debug('Selection too small, ignoring');
      this._resetSelection();
      return;
    }

    // Complete selection
    this._completeSelection();

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
      logger.debug('Escape pressed, cancelling selection');
      this._cancelSelection();
      event.preventDefault();
      event.stopPropagation();
    }
  }

  /**
   * Complete the selection process
   * @private
   */
  _completeSelection() {
    if (!this.currentSelection) return;

    // Debug logging for coordinate analysis
    const debugInfo = {
      selection: this.currentSelection,
      coordinateSystem: "viewport-relative",
      devicePixelRatio: window.devicePixelRatio || 1,
      scrollOffset: {
        x: window.pageXOffset || document.documentElement.scrollLeft || 0,
        y: window.pageYOffset || document.documentElement.scrollTop || 0,
      },
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      documentSize: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      },
      note: "Using viewport coordinates because browser capture API captures visible viewport only",
    };

    logger.info('Completing selection with debug info:', debugInfo);

    const selectionData = {
      x: this.currentSelection.left,
      y: this.currentSelection.top,
      width: this.currentSelection.width,
      height: this.currentSelection.height,
      timestamp: Date.now(),
      // Add debug info for troubleshooting
      debug: debugInfo,
    };

    // Clean up before callback
    this.cleanup();

    // Notify completion
    try {
      this.onSelectionComplete(selectionData);
    } catch (error) {
      logger.error('Error in selection completion callback:', error);
      handleUIError(
        this._createError(
          ErrorTypes.SCREEN_CAPTURE,
          `Selection completion failed: ${error.message}`,
        ),
      );
    }
  }

  /**
   * Cancel the selection process
   * @private
   */
  _cancelSelection() {
    logger.debug('Cancelling selection');

    // Clean up before callback
    this.cleanup();

    // Notify cancellation
    try {
      this.onCancel();
    } catch (error) {
      logger.error('Error in cancellation callback:', error);
    }
  }

  /**
   * Reset current selection
   * @private
   */
  _resetSelection() {
    this.startPoint = null;
    this.currentSelection = null;
    this.isSelecting = false;

    if (this.selectionBox) {
      this.selectionBox.style.display = "none";
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
    error.context = "screen-selector";
    return error;
  }

  /**
   * Clean up selector and remove from DOM
   */
  cleanup() {
    logger.debug('Cleaning up');

    this.isActive = false;
    this.isSelecting = false;

    // Remove event listeners
    this._removeEventListeners();

    // Remove DOM elements
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }

    // Reset state
    this.overlay = null;
    this.selectionBox = null;
    this.instructions = null;
    this.startPoint = null;
    this.currentSelection = null;
  }

  /**
   * Check if selector is currently active
   * @returns {boolean} True if active
   */
  isSelectionActive() {
    return this.isActive;
  }
}
