import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { HoverTextDetector } from './HoverTextDetector.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import { registerTranslation, contentScriptIntegration } from '@/shared/messaging/core/ContentScriptIntegration.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { TranslationMode } from '@/shared/config/config.js';
import { settingsManager } from '@/shared/managers/SettingsManager.js';
import { MessageContexts } from '@/shared/messaging/core/MessagingCore.js';
import { ElementDetectionService } from '@/shared/services/ElementDetectionService.js';
import { ExtensionContextManager } from '@/core/extensionContext.js';
import { isEditable } from '@/core/helpers.js';

// Import CSS as inline string
import hoverStyles from './HoverHighlight.scss?inline';

import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';

const logger = getScopedLogger(LOG_COMPONENTS.ON_HOVER, 'HoverTranslationManager');

// Constants for magic numbers
const MOUSE_MOVEMENT_THRESHOLD = 2; // pixels
const MODIFIER_TRIGGER_DELAY = 50; // ms
const COORDINATE_TOLERANCE = 10; // pixels - buffer to handle line-height gaps and jitter

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
    this.currentMessageId = null; // Tracking active translation request
    
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
      await this._ensureStylesInjected();

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
    this._emitPageEvent('MOUSE_HOVER_HIDE_TOOLTIP');
    
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

    // 1. PROACTIVE CHECK: If we have an active rectangle, check if we've left it.
    // This MUST run before any modifier or editable checks to ensure the tooltip
    // closes correctly when moving away, even if the trigger key is released.
    if (this.currentRect && settingsManager.get('MOUSE_HOVER_AUTO_CLOSE', 'mouseleave') === 'mouseleave') {
      const tolerance = COORDINATE_TOLERANCE;
      const isStillInside = (
        event.clientX >= this.currentRect.left - tolerance &&
        event.clientX <= this.currentRect.right + tolerance &&
        event.clientY >= this.currentRect.top - tolerance &&
        event.clientY <= this.currentRect.bottom + tolerance
      );

      if (!isStillInside) {
        this._handleMouseOut();
      } else {
        // Optimization: If we are still inside the active area, skip new detection
        return;
      }
    }

    // Skip if mouse is over extension UI elements (like the tooltip itself)
    if (ElementDetectionService.getInstance().isUIElement(event.target)) {
      this._cancelPendingHover();
      return;
    }

    // Skip if mouse is over editable elements (inputs, textareas, etc.)
    if (isEditable(event.target)) {
      this._cancelPendingHover();
      this._handleMouseOut();
      return;
    }

    const trigger = settingsManager.get('MOUSE_HOVER_TRIGGER', 'hover');
    
    // Check modifier key if required
    if (trigger !== 'hover' && !this._isModifierPressed(event, trigger)) {
      this._cancelPendingHover();
      
      // If we don't have a tooltip, we can stop here. 
      // If we DO have one, we let it stay until the coordinate check above or mouseleave closes it.
      if (!this.currentRect) {
        this._handleMouseOut();
      }
      return;
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

    // Ignore modifier keys if user is typing in a field (focused on an editable element)
    if (isEditable(document.activeElement)) {
      return;
    }

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
      this._emitPageEvent('MOUSE_HOVER_HIDE_TOOLTIP');
    }
  }

  /**
   * Clean up the active hover state only if the request belongs to the current messageId.
   * @private
   */
  _cleanupActiveHoverRequest(messageId) {
    if (this.currentMessageId === messageId) {
      this._handleMouseOut();
    }
  }

  /**
   * Remove the visual border from the current element
   * @private
   */
  _removeBorder() {
    if (this.borderedElement) {
      this.borderedElement.classList.remove('ti-hover-container-highlight');
      this.borderedElement = null;
    }
  }

  /**
   * Process the hover event after delay
   * @private
   */
  async _processHover(event) {
    const scope = settingsManager.get('MOUSE_HOVER_SCOPE', 'sentence');
    const detection = HoverTextDetector.detect(event.clientX, event.clientY, scope);

    if (!detection || !detection.text) {
      // If we are over a "dead zone", we only close if we are actually outside the tolerance 
      // of our last valid rectangle. This prevents flickering in gaps.
      if (this.currentRect) {
        const tolerance = COORDINATE_TOLERANCE;
        const isStillInside = (
          event.clientX >= this.currentRect.left - tolerance &&
          event.clientX <= this.currentRect.right + tolerance &&
          event.clientY >= this.currentRect.top - tolerance &&
          event.clientY <= this.currentRect.bottom + tolerance
        );
        if (isStillInside) return;
      }

      this._handleMouseOut();
      return;
    }

    if (detection.text === this.currentText) {
      // Refresh rectangle cache based on scope
      this.currentRect = scope === 'container' 
        ? detection.element.getBoundingClientRect()
        : detection.rect;
      return;
    }

    logger.info(`Hover translation triggered for: "${detection.text.substring(0, 50)}..."`);
    this.currentText = detection.text;
    
    // Cache rectangle based on scope:
    // - Word/Sentence: Use specific text rectangle for responsive closing.
    // - Container: Use block container rectangle for stable viewing of large blocks.
    this.currentRect = scope === 'container' 
      ? detection.element.getBoundingClientRect()
      : detection.rect;

    const element = detection.element;

    // Clean up any previous border before applying new one
    this._removeBorder();

    // Add visual feedback (border) if scope is container
    if (scope === 'container' && settingsManager.get('MOUSE_HOVER_SHOW_CONTAINER_BORDER', true)) {
      this.borderedElement = element;
      element.classList.add('ti-hover-container-highlight');
    }

    // Use ResourceTracker to manage the element's mouseleave listener
    // This ensures cleanup if multiple hovers happen quickly or if the feature is deactivated
    const leaveHandler = (leaveEvent) => {
      const relatedTarget = leaveEvent.relatedTarget;
      const elementDetection = ElementDetectionService.getInstance();

      // 1. If we're moving into a UI element (like the tooltip), don't close
      if (relatedTarget && elementDetection.isUIElement(relatedTarget)) {
        return;
      }

      // 2. If we are leaving the element but moving into another part of the same container
      // (e.g. moving between nested spans), keep it open.
      if (relatedTarget && element.contains(relatedTarget)) {
        return;
      }

      // 3. Since 'element' is now always a stable block container (from HoverTextDetector),
      // we can trust its 'mouseleave' event to signal a clear exit from the text block.
      this._removeBorder();
      this.handleMouseLeave();
    };
    
    // Track listener on specific element; ResourceTracker handles removal of the old one if re-added
    this.addEventListener(element, 'mouseleave', leaveHandler, { once: true });

    // Cancel any previous active request
    if (this.currentMessageId) {
      contentScriptIntegration.cancelTranslationRequest(this.currentMessageId, 'New hover triggered');
    }

    const messageId = `hover-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    this.currentMessageId = messageId;
    const accumulatedResults = new Map();

    try {
      // Register for streaming updates
      registerTranslation(messageId, {
        onStreamUpdate: (data) => {
          if (data.data) {
            const batchText = Array.isArray(data.data) ? data.data.join('') : String(data.data);
            const index = typeof data.batchIndex === 'number' ? data.batchIndex : accumulatedResults.size;
            accumulatedResults.set(index, batchText);
            
            const partialText = Array.from(accumulatedResults.keys())
              .sort((a, b) => a - b)
              .map(i => accumulatedResults.get(i))
              .join('');

            // Emit progressive result
            this._emitPageEvent('MOUSE_HOVER_TRANSLATION_READY', {
              originalText: detection.text,
              translatedText: partialText,
              position: { x: event.clientX, y: event.clientY },
              direction: data.direction || 'ltr',
              isStreaming: true
            });
          }
        }
      });

      const targetLanguage = settingsManager.get('TARGET_LANGUAGE', 'en');
      const result = await contentScriptIntegration.sendTranslationRequest({
        action: MessageActions.TRANSLATE,
        messageId: messageId,
        data: {
          text: detection.text,
          mode: TranslationMode.MouseHover,
          sourceLanguage: 'auto',
          targetLanguage: targetLanguage
        },
        context: MessageContexts.CONTENT
      });

      // Defensive result check (consistent with other features)
      const translatedText = result?.translatedText ?? result?.data?.translatedText ?? result?.result?.translatedText;
      const direction = result?.direction ?? result?.data?.direction ?? result?.result?.direction ?? 'ltr';

      if (translatedText && this.currentMessageId === messageId) {
        // Check if translation is redundant (same as original text)
        const isRedundant = translatedText.trim() === detection.text.trim();

        if (isRedundant) {
          logger.debug('Redundant translation detected (same as original), skipping tooltip display');
          this._handleMouseOut();
          return;
        }

        this._emitPageEvent('MOUSE_HOVER_TRANSLATION_READY', {
          originalText: detection.text,
          translatedText: translatedText,
          position: { x: event.clientX, y: event.clientY },
          direction: direction,
          isStreaming: false
        });

        this.currentMessageId = null;
      }
    } catch (error) {
      if (ExtensionContextManager.isContextError(error)) {
        logger.debug('Hover translation skipped: Extension context invalidated');
        this._cleanupActiveHoverRequest(messageId);
        return;
      }

      // Ignore intentional cancellations
      if (error.message === 'Handler cancelled' || 
          error.type === 'HANDLER_CANCELLED' || 
          error.type === 'USER_CANCELLED' || 
          error.isCancelled) {
        return;
      }

      // Standard error handling via the Golden Chain architecture
      ErrorHandler.getInstance().handle(error, {
        context: 'hover',
        showToast: false
      }).catch(() => {});

      this._emitPageEvent('MOUSE_HOVER_TRANSLATION_ERROR', { error });
      this._cleanupActiveHoverRequest(messageId);
    }
  }

  /**
   * Emit a page event, with cross-frame support for iframes.
   * @private
   */
  _emitPageEvent(type, data) {
    // 1. Always emit locally for any listeners in the current frame
    if (data !== undefined) {
      pageEventBus.emit(type, data);
    } else {
      pageEventBus.emit(type);
    }

    // 2. If in an iframe, notify the top frame
    if (window !== window.top) {
      try {
        window.top.postMessage({
          source: 'translate-it-iframe',
          type: type,
          data: data,
          timestamp: Date.now()
        }, '*');
      } catch (error) {
        logger.debug('Failed to send hover event to top frame:', error);
      }
    }
  }

  /**
   * Ensure necessary CSS styles are injected for hover highlighting
   * @private
   */
  async _ensureStylesInjected() {
    const contentCore = window.translateItContentCore;
    if (contentCore && typeof contentCore.injectMainDOMStyles === 'function') {
      contentCore.injectMainDOMStyles(hoverStyles, 'translate-it-hover-highlight-styles');
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

    if (this.currentMessageId) {
      contentScriptIntegration.cancelTranslationRequest(this.currentMessageId, 'Hover cancelled by user');
      this.currentMessageId = null;
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

