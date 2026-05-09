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
  }

  /**
   * Handle the OCR result by routing it to the configured target.
   * @param {Object} data - The OCR result data.
   * @param {string} data.text - Extracted text.
   * @param {Object} data.coordinates - Viewport coordinates of captured area.
   */
  async handleResult(data) {
    const { text, coordinates } = data;
    
    if (!text) {
      logger.warn('No text extracted, skipping dispatch');
      return;
    }

    logger.info(`Routing OCR result to: ${this.target}`, { textLength: text.length });

    try {
      switch (this.target) {
        case 'window':
          await this.dispatchToWindowsManager(text, coordinates);
          break;
        default:
          logger.warn(`Unknown routing target: ${this.target}, falling back to window`);
          await this.dispatchToWindowsManager(text, coordinates);
      }
    } catch (error) {
      logger.error(`Failed to route OCR result to ${this.target}:`, error);
    }
  }

  /**
   * Dispatch text to WindowsManager for translation display.
   * Uses decoupled event-based communication via PageEventBus.
   */
  async dispatchToWindowsManager(text, coordinates) {
    // 1. Ensure WindowsManager feature is loaded
    try {
      const { loadFeature } = await import('@/core/content-scripts/chunks/lazy-features.js');
      await loadFeature('windowsManager', true);
    } catch (e) {
      logger.error('Failed to load windowsManager feature', e);
    }

    // 2. Calculate anchor position (bottom-center of captured area)
    const dpr = window.devicePixelRatio || 1;
    const cssCoords = {
      x: coordinates ? coordinates.x / dpr : window.innerWidth / 2,
      y: coordinates ? coordinates.y / dpr : window.innerHeight / 2,
      width: coordinates ? coordinates.width / dpr : 0,
      height: coordinates ? coordinates.height / dpr : 0
    };

    const position = {
      x: cssCoords.x + (cssCoords.width / 2),
      y: cssCoords.y + cssCoords.height + 10,
      _isViewportRelative: true // CRITICAL: Position is relative to viewport
    };

    logger.debug('Dispatching GLOBAL_SELECTION_TRIGGER with options', { position });

    // 3. Trigger via Event Bus (Decoupled Architecture)
    pageEventBus.emit(SELECTION_EVENTS.GLOBAL_SELECTION_TRIGGER, {
      text,
      position,
      options: {
        immediate: true,               // Bypass icon/ctrl settings
        mode: TranslationMode.ScreenCapture, // Use specialized OCR prompts
        _isViewportRelative: true      // Fix positioning
      }
    });
  }
}

// Export singleton instance
export const screenCaptureCoordinator = new ScreenCaptureCoordinator();
