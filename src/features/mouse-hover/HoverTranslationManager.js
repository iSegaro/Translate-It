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

/**
 * HoverTranslationManager - Manages "Mouse on Hover" translation logic
 * Handles event listening, trigger conditions, delays, and coordination.
 */
export class HoverTranslationManager extends ResourceTracker {
  constructor() {
    super('hover-translation-manager');
    this.isActive = false;
    this.currentText = null;
    this.currentElement = null;
    this.hoverTimer = null;
    
    // Bind handlers
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseLeave = this.handleMouseLeave.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  /**
   * Activate the hover translation feature
   */
  async activate() {
    if (this.isActive) return true;

    // Use ResourceTracker to manage event listeners
    this.addEventListener(document, 'mousemove', this.handleMouseMove);
    this.addEventListener(document, 'keydown', this.handleKeyDown);
    
    this.isActive = true;
    logger.init('Hover translation manager activated');
    return true;
  }

  /**
   * Deactivate the hover translation feature
   */
  async deactivate() {
    if (!this.isActive) return true;

    this.cleanup(); // Clean up all listeners and timers
    this.isActive = false;
    
    // Notify UI to hide tooltip
    pageEventBus.emit('MOUSE_HOVER_HIDE_TOOLTIP');
    
    logger.debug('Hover translation manager deactivated');
    return true;
  }

  /**
   * Handle mouse move events with debouncing logic
   */
  handleMouseMove(event) {
    // Skip if mouse is over extension UI elements
    if (ElementDetectionService.getInstance().isUIElement(event.target)) {
      this._cancelPendingHover();
      return;
    }

    const trigger = settingsManager.get('MOUSE_HOVER_TRIGGER', 'hover');
    
    // Check modifier key if required
    if (trigger !== 'hover' && !this._isModifierPressed(event, trigger)) {
      this._cancelPendingHover();
      return;
    }

    // Identify if the mouse is over an element we already processed
    if (event.target === this.currentElement) {
      return;
    }

    this._cancelPendingHover();
    this.currentElement = event.target;

    const delay = settingsManager.get('MOUSE_HOVER_DELAY', 500);
    
    this.hoverTimer = setTimeout(() => {
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
      // If modifier is pressed, we might want to trigger immediately if mouse is already over text
      // But for now, we'll rely on mousemove + modifier check for simplicity and performance
    }
  }

  /**
   * Handle mouse leave to hide tooltip or cancel pending hover
   */
  handleMouseLeave(event) {
    const autoClose = settingsManager.get('MOUSE_HOVER_AUTO_CLOSE', 'mouseleave');
    if (autoClose === 'mouseleave') {
      pageEventBus.emit('MOUSE_HOVER_HIDE_TOOLTIP');
    }
    this._cancelPendingHover();
    this.currentElement = null;
  }

  /**
   * Process the hover event after delay
   * @private
   */
  async _processHover(event) {
    const scope = settingsManager.get('MOUSE_HOVER_SCOPE', 'sentence');
    const detection = HoverTextDetector.detect(event.clientX, event.clientY, scope);

    if (!detection || !detection.text || detection.text === this.currentText) {
      return;
    }

    this.currentText = detection.text;
    const element = detection.element;

    // Add visual feedback (border) if scope is container
    let originalStyle = '';
    if (scope === 'container' && settingsManager.get('MOUSE_HOVER_SHOW_CONTAINER_BORDER', true)) {
      originalStyle = element.style.outline;
      element.style.outline = '2px solid var(--ti-primary-color, #4285f4)';
      element.style.outlineOffset = '2px';
    }

    // Add leave listener to the specific element
    const leaveHandler = () => {
      if (originalStyle !== undefined) element.style.outline = originalStyle;
      this.handleMouseLeave();
      element.removeEventListener('mouseleave', leaveHandler);
    };
    element.addEventListener('mouseleave', leaveHandler);

    try {
      const result = await contentScriptIntegration.sendTranslationRequest({
        action: MessageActions.TRANSLATE,
        messageId: `hover-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        data: {
          text: detection.text,
          mode: TranslationMode.MouseHover
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
    }
  }

  /**
   * Cancel any pending hover timer
   * @private
   */
  _cancelPendingHover() {
    if (this.hoverTimer) {
      clearTimeout(this.hoverTimer);
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

export const hoverTranslationManager = new HoverTranslationManager();
