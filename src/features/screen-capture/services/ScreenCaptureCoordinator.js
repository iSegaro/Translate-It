import { pageEventBus } from '@/core/PageEventBus.js';
import { SELECTION_EVENTS } from '@/features/text-selection/events/SelectionEvents.js';
import { TranslationMode } from '@/shared/config/config.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.SCREEN_CAPTURE, 'ScreenCaptureCoordinator');

/**
 * Coordinator for handling screen capture (OCR) results.
 * Responsible for routing the extracted text to WindowsManager.
 */
export class ScreenCaptureCoordinator {
  constructor() {
    // Current target for OCR results.
    // Future values could include 'sidepanel' or 'mobilesheet'
    this.target = 'window'; 
    this.activeSessionId = null;
  }

  /**
   * Start a new capture session to track results.
   * @param {number} sessionId - Unique session ID (e.g. Date.now())
   */
  startSession(sessionId) {
    this.activeSessionId = sessionId;
    logger.debug(`Started new OCR session: ${sessionId}`);
  }

  /**
   * Cancel the current session. Results with this ID will be ignored.
   */
  cancelSession() {
    logger.debug(`Cancelled OCR session: ${this.activeSessionId}`);
    this.activeSessionId = null;
  }

  /**
   * Handle the OCR result by routing it to the configured target.
   * @param {Object} data - The OCR result data
   * @param {string} data.text - Extracted text
   * @param {string} data.imageData - Base64 image data (optional)
   * @param {Object} data.coordinates - Captured area coordinates (device pixels)
   * @param {string} data.captureType - 'area' | 'fullscreen'
   * @param {number} data.timestamp - Unix timestamp
   * @param {number} data.captureId - The session ID this result belongs to
   */
  async handleResult(data) {
    const { text, coordinates, captureType = 'area', captureId } = data;
    
    // Validate session
    if (captureId && this.activeSessionId && captureId !== this.activeSessionId) {
      logger.debug(`Ignoring OCR result from stale session: ${captureId} (Current: ${this.activeSessionId})`);
      return;
    }

    if (!this.activeSessionId && captureId) {
      logger.debug(`Ignoring OCR result as session was cancelled: ${captureId}`);
      return;
    }

    if (!text || text.trim().length === 0) {
      logger.debug('No text extracted, skipping dispatch. Text was empty or null.');
      return;
    }

    logger.info(`Routing OCR result to: ${this.target}`, { 
      textLength: text.length,
      captureType,
      hasCoordinates: !!coordinates,
      captureId
    });

    try {
      switch (this.target) {
        case 'window':
          await this.dispatchToWindowsManager(text, coordinates, captureType);
          break;
        default:
          logger.warn(`Unknown routing target: ${this.target}, falling back to window`);
          await this.dispatchToWindowsManager(text, coordinates, captureType);
      }
    } catch (error) {
      logger.error(`Failed to route OCR result to ${this.target}:`, error);
    } finally {
      // Clear session after processing (or if it was a one-off result)
      if (captureId === this.activeSessionId) {
        this.activeSessionId = null;
      }
    }
  }

  /**
   * Dispatch text to WindowsManager for translation display.
   * Uses decoupled event-based communication via PageEventBus.
   * @param {string} text - Extracted text
   * @param {Object} coordinates - Captured area coordinates (device pixels)
   * @param {string} captureType - Type of capture ('area' | 'fullscreen')
   */
  async dispatchToWindowsManager(text, coordinates, captureType) {
    // 1. Ensure WindowsManager feature is loaded
    try {
      const { loadFeature } = await import('@/core/content-scripts/chunks/lazy-features.js');
      await loadFeature('windowsManager');
    } catch (e) {
      logger.error('Failed to load windowsManager feature', e);
      return;
    }

    // 2. Convert device pixels to CSS pixels for position calculation
    const dpr = window.devicePixelRatio || 1;
    
    // Normalized check for coordinates
    const hasCoords = coordinates && typeof coordinates === 'object' && 'x' in coordinates;
    
    // Default to center if no coordinates
    const cssCoords = {
      x: hasCoords ? coordinates.x / dpr : (window.innerWidth / 2) - 100,
      y: hasCoords ? coordinates.y / dpr : (window.innerHeight / 2) - 50,
      width: hasCoords ? coordinates.width / dpr : 200,
      height: hasCoords ? coordinates.height / dpr : 100
    };

    // 3. Calculate anchor position
    // For fullscreen: Use the center of the viewport
    // For area: Use the bottom-center of the area
    const position = {
      x: cssCoords.x + (cssCoords.width / 2),
      y: hasCoords ? cssCoords.y + cssCoords.height + 10 : cssCoords.y + (cssCoords.height / 2),
      _isViewportRelative: true, // CRITICAL: Position is relative to viewport
      _sourceCoordinates: coordinates, // Keep original coordinates for reference
      _coordinateSpace: 'device-pixel',
      _captureType: captureType
    };

    logger.debug('Dispatching GLOBAL_SELECTION_TRIGGER with options', { position });

    // 4. Trigger via Event Bus (Decoupled Architecture)
    pageEventBus.emit(SELECTION_EVENTS.GLOBAL_SELECTION_TRIGGER, {
      text,
      position,
      options: {
        immediate: true,               // Bypass icon/ctrl settings
        mode: TranslationMode.ScreenCapture, // Use specialized OCR prompts
        _isViewportRelative: true,      // Fix positioning
        _sourceCaptureType: captureType,
        _sourceCoordinates: coordinates,
        _coordinateSpace: 'device-pixel'
      }
    });
  }
}

// Export singleton instance
export const screenCaptureCoordinator = new ScreenCaptureCoordinator();
