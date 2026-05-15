import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { HoverTextDetector } from './HoverTextDetector.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import { contentScriptIntegration } from '@/shared/messaging/core/ContentScriptIntegration.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { TranslationMode } from '@/shared/config/config.js';
import { settingsManager } from '@/shared/managers/SettingsManager.js';
import { MessageContexts } from '@/shared/messaging/core/MessagingCore.js';
import { ElementDetectionService } from '@/shared/services/ElementDetectionService.js';

const logger = getScopedLogger(LOG_COMPONENTS.ON_HOVER, 'HoverTranslationManager');

// Constants for magic numbers
const MOUSE_MOVEMENT_THRESHOLD = 2; // pixels
const MODIFIER_TRIGGER_DELAY = 50; // ms

/**
 * HoverTranslationManager - Manages "Mouse on Hover" translation logic
 * Handles event listening, trigger conditions, delays, and coordination.
 */
export class HoverTranslationManager extends ResourceTracker {
  static instance = null;

  static getInstance() {
    if (!HoverTranslationManager.instance) {
      HoverTranslationManager.instance = new HoverTranslationManager();
    }
    return HoverTranslationManager.instance;
  }

  constructor() {
    super('hover-translation-manager');
    this.isActive = false;
    this.currentText = null;
    this.currentElement = null;
    this.hoverTimer = null;
    this.lastPosition = { x: 0, y: 0 };
    this.lastMouseEvent = null;
    this.currentRect = null; // Rectangle Cache for performance optimization
    this.borderedElement = null; // Tracking element with active border
    this.originalOutline = null; // Storing original style to restore later
    
    // Bind handlers
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseLeave = this.handleMouseLeave.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  /**
   * Activate the hover translation feature
   */
  async activate() {
    logger.debug('HoverTranslationManager.activate() called');
    if (this.isActive) {
      logger.debug('HoverTranslationManager already active');
      return true;
    }

    try {
      // Use ResourceTracker to manage event listeners
      this.addEventListener(document, 'mousemove', this.handleMouseMove, { passive: true });
      this.addEventListener(document, 'keydown', this.handleKeyDown, { passive: true });
      this.addEventListener(document, 'mouseleave', this.handleMouseLeave, { passive: true });
      
      this.isActive = true;
      logger.info('Hover translation manager activated and listening');
      
      // Listen for when tooltip is hidden (could be via timer or other means)
      this.addEventListener(pageEventBus, 'MOUSE_HOVER_TOOLTIP_HIDDEN', () => {
        this.currentText = null;
        this.currentRect = null;
        this.currentElement = null;
        this._removeBorder();
      });

      return true;
    } catch (error) {
      logger.error('Failed to activate HoverTranslationManager:', error);
      return false;
    }
  }

  /**
   * Deactivate the hover translation feature
   */
  async deactivate() {
    if (!this.isActive) return true;

    this.cleanup(); // Clean up all listeners and timers
    this.isActive = false;
    this.lastMouseEvent = null;
    
    // Notify UI to hide tooltip
    pageEventBus.emit('MOUSE_HOVER_HIDE_TOOLTIP');
    
    logger.debug('Hover translation manager deactivated');
    return true;
  }

  /**
   * Handle mouse move events with debouncing logic
   */
  handleMouseMove(event) {
    // Store last mouse event for keydown trigger
    this.lastMouseEvent = event;

    // Check if mouse actually moved significantly to avoid noise
    const dist = Math.hypot(event.clientX - this.lastPosition.x, event.clientY - this.lastPosition.y);
    if (dist < MOUSE_MOVEMENT_THRESHOLD) return;
    
    this.lastPosition = { x: event.clientX, y: event.clientY };

    // Skip if mouse is over extension UI elements (like the tooltip itself)
    if (ElementDetectionService.getInstance().isUIElement(event.target)) {
      this._cancelPendingHover();
      // DO NOT call _handleMouseOut here, as we want to keep the tooltip open
      // while the user is interacting with it (e.g., scrolling).
      return;
    }

    const trigger = settingsManager.get('MOUSE_HOVER_TRIGGER', 'hover');
    
    // Check modifier key if required
    if (trigger !== 'hover' && !this._isModifierPressed(event, trigger)) {
      this._cancelPendingHover();
      this._handleMouseOut();
      return;
    }

    // Proactive check: If we're already showing a tooltip or have a detected area, 
    // check if we've left the bounds to improve responsiveness.
    if (this.currentRect && settingsManager.get('MOUSE_HOVER_AUTO_CLOSE', 'mouseleave') === 'mouseleave') {
      const isStillInside = (
        event.clientX >= this.currentRect.left &&
        event.clientX <= this.currentRect.right &&
        event.clientY >= this.currentRect.top &&
        event.clientY <= this.currentRect.bottom
      );

      if (isStillInside) {
        // We are still within the same word/sentence area, NO NEED to recalculate anything
        return;
      }
      
      // We left the previously detected rectangle
      this._handleMouseOut();
    }

    this._cancelPendingHover();
    this.currentElement = event.target;

    const delay = settingsManager.get('MOUSE_HOVER_DELAY', 500);
    
    this.hoverTimer = this.setTimeout(() => {
      this._processHover(event);
    }, delay);
  }

  /**
   * Handle key down for modifier triggers
   */
  handleKeyDown(event) {
    const trigger = settingsManager.get('MOUSE_HOVER_TRIGGER', 'hover');
    if (trigger === 'hover') return;

    if (this._isModifierPressed(event, trigger)) {
      // If we have a stored mouse event and we're over an element
      if (this.lastMouseEvent && this.lastMouseEvent.target) {
        logger.debug(`Modifier key ${trigger} pressed while mouse over element, triggering immediate hover check`);
        this._cancelPendingHover();
        
        // Trigger check with a very small safety delay
        this.hoverTimer = this.setTimeout(() => {
          this._processHover(this.lastMouseEvent);
        }, MODIFIER_TRIGGER_DELAY);
      }
    }
  }

  /**
   * Handle mouse leave to hide tooltip or cancel pending hover
   */
  handleMouseLeave() {
    this._handleMouseOut();
  }

  /**
   * Internal helper to handle mouse leaving text area
   * @private
   */
  _handleMouseOut() {
    this.currentText = null; // Reset text cache
    this.currentRect = null; // Reset rectangle cache
    this.currentElement = null;
    this._removeBorder();
    this._cancelPendingHover();

    const autoClose = settingsManager.get('MOUSE_HOVER_AUTO_CLOSE', 'mouseleave');
    if (autoClose === 'mouseleave') {
      pageEventBus.emit('MOUSE_HOVER_HIDE_TOOLTIP');
    }
  }

  /**
   * Remove the visual border from the current element
   * @private
   */
  _removeBorder() {
    if (this.borderedElement) {
      this.borderedElement.style.outline = this.originalOutline || '';
      this.borderedElement = null;
      this.originalOutline = null;
    }
  }

  /**
   * Process the hover event after delay
   * @private
   */
  async _processHover(event) {
    const scope = settingsManager.get('MOUSE_HOVER_SCOPE', 'sentence');
    const detection = HoverTextDetector.detect(event.clientX, event.clientY, scope);

    if (!detection) {
      logger.debug('No text detected at cursor position during processing');
      // If we've moved to empty space, ensure tooltip is hidden
      this._handleMouseOut();
      return;
    }

    if (!detection.text) {
      this._handleMouseOut();
      return;
    }

    if (detection.text === this.currentText) {
      logger.debug('Detected text is the same as current, skipping');
      return;
    }

    logger.info(`Hover translation triggered for: "${detection.text.substring(0, 50)}..."`);
    this.currentText = detection.text;
    this.currentRect = detection.rect; // Cache the rectangle for future movement checks
    const element = detection.element;

    // Clean up any previous border before applying new one
    this._removeBorder();

    // Add visual feedback (border) if scope is container
    if (scope === 'container' && settingsManager.get('MOUSE_HOVER_SHOW_CONTAINER_BORDER', true)) {
      this.borderedElement = element;
      this.originalOutline = element.style.outline;
      element.style.outline = '2px solid var(--ti-primary-color, #4285f4)';
      element.style.outlineOffset = '2px';
    }

    // Use ResourceTracker to manage the element's mouseleave listener
    // This ensures cleanup if multiple hovers happen quickly or if the feature is deactivated
    const leaveHandler = (leaveEvent) => {
      // If we're moving into a UI element (like the tooltip), don't close
      if (leaveEvent.relatedTarget && ElementDetectionService.getInstance().isUIElement(leaveEvent.relatedTarget)) {
        return;
      }

      this._removeBorder();
      this.handleMouseLeave();
    };
    
    // Track listener on specific element; ResourceTracker handles removal of the old one if re-added
    this.addEventListener(element, 'mouseleave', leaveHandler, { once: true });

    try {
      const targetLanguage = settingsManager.get('TARGET_LANGUAGE', 'en');
      const result = await contentScriptIntegration.sendTranslationRequest({
        action: MessageActions.TRANSLATE,
        messageId: `hover-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        data: {
          text: detection.text,
          mode: TranslationMode.MouseHover,
          sourceLanguage: 'auto',
          targetLanguage: targetLanguage
        },
        context: MessageContexts.CONTENT
      });

      if (result && result.translatedText) {
        pageEventBus.emit('MOUSE_HOVER_TRANSLATION_READY', {
          originalText: detection.text,
          translatedText: result.translatedText,
          position: { x: event.clientX, y: event.clientY },
          direction: result.direction || 'ltr'
        });
      }
    } catch (error) {
      logger.error('Hover translation failed:', error);
      pageEventBus.emit('MOUSE_HOVER_TRANSLATION_ERROR', { error });
    }
  }

  /**
   * Cancel any pending hover timer
   * @private
   */
  _cancelPendingHover() {
    if (this.hoverTimer) {
      this.clearTimer(this.hoverTimer);
      this.hoverTimer = null;
    }
  }

  /**
   * Check if the required modifier key is pressed
   * @private
   */
  _isModifierPressed(event, modifier) {
    switch (modifier) {
      case 'ctrl': return event.ctrlKey || event.metaKey;
      case 'alt': return event.altKey;
      case 'shift': return event.shiftKey;
      default: return true;
    }
  }

  /**
   * Clean up resources
   */
  cleanup() {
    this._cancelPendingHover();
    super.cleanup();
  }
}

export const hoverTranslationManager = HoverTranslationManager.getInstance();

