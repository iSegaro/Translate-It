import ResourceTracker from '@/core/memory/ResourceTracker.js';
import browser from 'webextension-polyfill';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { HoverTextDetector } from './HoverTextDetector.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import { registerTranslation, contentScriptIntegration } from '@/shared/messaging/core/ContentScriptIntegration.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { CONFIG, TranslationMode } from '@/shared/config/config.js';
import { settingsManager } from '@/shared/managers/SettingsManager.js';
import { MessageContexts, MessageFormat } from '@/shared/messaging/core/MessagingCore.js';
import { ElementDetectionService } from '@/shared/services/ElementDetectionService.js';
import { ExtensionContextManager } from '@/core/extensionContext.js';
import { isEditable } from '@/core/helpers.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { mapCanonicalTranslationError } from '@/shared/error-management/PublicTranslationErrorPolicy.js';
import { createLegacyDisplayError } from '@/shared/error-management/PublicTranslationErrorAdapter.js';
import { ModifierTriggerController } from './ModifierTriggerController.js';

// Import CSS as inline string
import hoverStyles from './HoverHighlight.scss?inline';

import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';

const logger = getScopedLogger(LOG_COMPONENTS.ON_HOVER, 'HoverTranslationManager');

// Constants for magic numbers
const MOUSE_MOVEMENT_THRESHOLD = 2; // pixels
const MODIFIER_TRIGGER_DELAY = 50; // ms
const COORDINATE_TOLERANCE = 10; // pixels - buffer to handle line-height gaps and jitter
const EXIT_GRACE_MS = 350;

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
    this.activeHoverId = null;
    this.displayedHoverId = null;
    this.displayedFrameId = 0;
    this.exitTimer = null;
    this.tooltipHeldHoverId = null;
    this.sourceInside = false;
    this.sourceLeaveElement = null;
    this.sourceLeaveHandler = null;
    this.modifierTriggerController = new ModifierTriggerController();
    
    // Bind handlers
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseLeave = this.handleMouseLeave.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handleWheel = this.handleWheel.bind(this);
    this.handleWindowBlur = this.handleWindowBlur.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.handleTooltipHidden = this.handleTooltipHidden.bind(this);
    this.handleTranslationHide = this.handleTranslationHide.bind(this);
    this.handleTooltipPointerEnter = this.handleTooltipPointerEnter.bind(this);
    this.handleTooltipPointerLeave = this.handleTooltipPointerLeave.bind(this);
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
      this.addEventListener(document, 'keyup', this.handleKeyUp, { passive: true });
      this.addEventListener(document, 'mousedown', this.handlePointerDown, { passive: true });
      this.addEventListener(document, 'pointerdown', this.handlePointerDown, { passive: true });
      this.addEventListener(document, 'wheel', this.handleWheel, { passive: true });
      this.addEventListener(document, 'mouseleave', this.handleMouseLeave, { passive: true });
      this.addEventListener(window, 'blur', this.handleWindowBlur, { passive: true });
      this.addEventListener(document, 'visibilitychange', this.handleVisibilityChange, { passive: true });
      
      this.isActive = true;
      logger.info('Hover translation manager activated and listening');
      
      // Listen for when tooltip is hidden (could be via timer or other means)
      this.addEventListener(pageEventBus, 'MOUSE_HOVER_TOOLTIP_HIDDEN', this.handleTooltipHidden);
      this.addEventListener(pageEventBus, 'MOUSE_HOVER_TOOLTIP_POINTER_ENTER', this.handleTooltipPointerEnter);
      this.addEventListener(pageEventBus, 'MOUSE_HOVER_TOOLTIP_POINTER_LEAVE', this.handleTooltipPointerLeave);
      this.addEventListener(pageEventBus, 'hide-translation', this.handleTranslationHide);

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
    const wasActive = this.isActive;
    const hoverIds = this._getHoverHideTargets();
    this.cleanup(); // Clean up all listeners and timers
    this.isActive = false;

    // Hide both an in-flight source and any different display it replaced.
    if (wasActive) this._emitHoverHideFor(hoverIds);
    this.displayedHoverId = null;
    this.displayedFrameId = 0;
    
    logger.debug('Hover translation manager deactivated');
    return true;
  }

  /**
   * Handle mouse move events with debouncing logic
   */
  handleMouseMove(event) {
    // Store last mouse event for modifier release trigger
    this.lastMouseEvent = event;

    const isTooltipTarget = this._isTooltipEvent(event);
    if (isTooltipTarget) {
      this.tooltipHeldHoverId = this.activeHoverId;
      this.sourceInside = false;
      this._cancelExitGrace();
      this._cancelPendingDetection();
      return;
    }

    const activeTrigger = this.activeHoverId
      ? settingsManager.get('MOUSE_HOVER_TRIGGER', CONFIG.MOUSE_HOVER_TRIGGER)
      : null;
    const activeTargetBlocked = Boolean(this.activeHoverId && (
      ElementDetectionService.getInstance().isUIElement(event.target)
      || isEditable(event.target)
    ));
    if (activeTargetBlocked) this._cancelPendingDetection();

    // Check if mouse actually moved significantly to avoid noise
    const dist = Math.hypot(event.clientX - this.lastPosition.x, event.clientY - this.lastPosition.y);
    if (dist < MOUSE_MOVEMENT_THRESHOLD) {
      if (this.currentRect && this._isInsideCurrentRect(event)) {
        this.sourceInside = true;
        this.tooltipHeldHoverId = null;
        this._cancelExitGrace();
        if (activeTrigger === 'hover' || !this.activeHoverId) this._cancelPendingDetection();
      }
      return;
    }
    
    this.lastPosition = { x: event.clientX, y: event.clientY };
    // 1. PROACTIVE CHECK: If we have an active rectangle, check if we've left it.
    // This MUST run before any modifier or editable checks to ensure the tooltip
    // closes correctly when moving away, even if the trigger key is released.
    if (this.currentRect && settingsManager.get('MOUSE_HOVER_AUTO_CLOSE', 'mouseleave') === 'mouseleave') {
      const isStillInside = this._isInsideCurrentRect(event);

      if (!isStillInside) {
        this.tooltipHeldHoverId = null;
        this.sourceInside = false;
        this._scheduleExit();
      } else {
        this.sourceInside = true;
        this.tooltipHeldHoverId = null;
        this._cancelExitGrace();
        if (activeTrigger === 'hover' || !this.activeHoverId) this._cancelPendingDetection();
        // Optimization: If we are still inside the active area, skip new detection
        return;
      }
    }

    if (this.activeHoverId) {
      if (activeTrigger === 'hover' && !activeTargetBlocked) {
        this._scheduleHoverDetection(event);
      }
      return;
    }

    // Skip if mouse is over extension UI elements (like the tooltip itself)
    if (ElementDetectionService.getInstance().isUIElement(event.target)) {
      this._cancelPendingHover();
      return;
    }

    // Skip if mouse is over editable elements (inputs, textareas, etc.)
    if (isEditable(event.target)) {
      this.modifierTriggerController.reset();
      this._cancelPendingHover();
      this._handleMouseOut();
      return;
    }

    const trigger = settingsManager.get('MOUSE_HOVER_TRIGGER', CONFIG.MOUSE_HOVER_TRIGGER);
    
    // Modifier modes trigger only from the modifier release lifecycle.
    if (trigger !== 'hover') {
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
   * Handle key down for modifier trigger gesture recognition
   */
  handleKeyDown(event) {
    const trigger = settingsManager.get('MOUSE_HOVER_TRIGGER', CONFIG.MOUSE_HOVER_TRIGGER);
    if (trigger === 'hover') {
      this.modifierTriggerController.reset();
      return;
    }

    // Ignore modifier keys if user is typing in a field (focused on an editable element)
    if (isEditable(document.activeElement)) {
      this.modifierTriggerController.reset();
      return;
    }

    this.modifierTriggerController.handleKeyDown(event, trigger);
  }

  /**
   * Handle modifier release and schedule one hover check for valid gestures.
   */
  handleKeyUp(event) {
    const trigger = settingsManager.get('MOUSE_HOVER_TRIGGER', CONFIG.MOUSE_HOVER_TRIGGER);
    if (trigger === 'hover') {
      this.modifierTriggerController.reset();
      return;
    }

    if (isEditable(document.activeElement)) {
      this.modifierTriggerController.reset();
      return;
    }

    if (!this.modifierTriggerController.handleKeyUp(event, trigger)) return;

    const mouseEvent = this.lastMouseEvent;
    if (!mouseEvent?.target || isEditable(mouseEvent.target)) return;
    if (ElementDetectionService.getInstance().isUIElement(mouseEvent.target)) return;

    logger.debug(`Modifier key ${trigger} released while mouse over element, scheduling hover check`);
    this._cancelPendingHover();
    this.hoverTimer = this.setTimeout(() => {
      this._processHover(mouseEvent);
    }, MODIFIER_TRIGGER_DELAY);
  }

  /**
   * Invalidate modifier gesture when pointer interaction begins.
   */
  handlePointerDown() {
    this.modifierTriggerController.invalidate();
  }

  /**
   * Invalidate modifier gesture when wheel interaction begins.
   */
  handleWheel() {
    this.modifierTriggerController.invalidate();
  }

  /**
   * Clear modifier gesture when page focus is lost.
   */
  handleWindowBlur() {
    this.modifierTriggerController.reset();
  }

  /**
   * Clear modifier gesture on document visibility changes.
   */
  handleVisibilityChange() {
    this.modifierTriggerController.reset();
  }

  /**
   * Reset hover state after the UI confirms that its tooltip is hidden.
   * @private
   */
  handleTooltipHidden(detail) {
    if (!detail?.hoverId) return;
    if (detail.hoverId === this.displayedHoverId) {
      this.displayedHoverId = null;
      this.displayedFrameId = 0;
    }
    if (detail.hoverId !== this.activeHoverId) return;
    this._resetHoverState();
  }

  handleTooltipPointerEnter(detail) {
    if (detail?.hoverId !== this.activeHoverId) return;
    this.tooltipHeldHoverId = detail.hoverId;
    this.sourceInside = false;
    this._cancelExitGrace();
    this._cancelPendingDetection();
  }

  handleTooltipPointerLeave(detail) {
    if (detail?.hoverId !== this.activeHoverId) return;
    this.tooltipHeldHoverId = null;
    if (this.sourceInside) return;
    this._scheduleExit();
  }

  /**
   * Hide hover UI when an existing translation lifecycle changes its target.
   * @param {Object} detail - Existing hide-translation event detail
   * @private
   */
  handleTranslationHide(detail) {
    if (!this._hasHoverState() && !this.displayedHoverId) return;
    const hoverIds = this._getHoverHideTargets();

    const element = detail?.element;
    if (
      element
      && this.currentElement
      && element !== this.currentElement
      && !element.contains?.(this.currentElement)
      && !this.currentElement.contains?.(element)
    ) return;

    this._resetHoverState();
    this._emitHoverHideFor(hoverIds);
  }

  /**
   * Handle mouse leave to hide tooltip or cancel pending hover
   */
  handleMouseLeave() {
    if (this.activeHoverId && this.tooltipHeldHoverId === this.activeHoverId) return;
    this.sourceInside = false;
    if (this.activeHoverId && settingsManager.get('MOUSE_HOVER_AUTO_CLOSE', 'mouseleave') === 'mouseleave') {
      this._scheduleExit();
    } else {
      this._handleMouseOut();
    }
  }

  _handleSourceElementLeave() {
    if (this.activeHoverId && this.tooltipHeldHoverId === this.activeHoverId) return;
    this.sourceInside = false;
    this._scheduleExit();
  }

  _isTooltipEvent(event) {
    const path = event.composedPath?.() || [];
    return path.some((node) => node?.classList?.contains('ti-mouse-hover-tooltip'))
      || Boolean(event.target?.closest?.('.ti-mouse-hover-tooltip'));
  }

  _isInsideCurrentRect(event) {
    const tolerance = COORDINATE_TOLERANCE;
    return event.clientX >= this.currentRect.left - tolerance
      && event.clientX <= this.currentRect.right + tolerance
      && event.clientY >= this.currentRect.top - tolerance
      && event.clientY <= this.currentRect.bottom + tolerance;
  }

  _cancelExitGrace() {
    if (this.exitTimer) this.clearTimer(this.exitTimer);
    this.exitTimer = null;
  }

  _scheduleExit() {
    if (!this.activeHoverId) {
      this._cancelPendingHover();
      return;
    }
    if (settingsManager.get('MOUSE_HOVER_AUTO_CLOSE', 'mouseleave') !== 'mouseleave') {
      this._handleMouseOut();
      return;
    }
    if (this.exitTimer) return;
    this.exitTimer = this.setTimeout(() => {
      this.exitTimer = null;
      const pendingHoverTimer = this.hoverTimer;
      this.hoverTimer = null;
      this._handleMouseOut();
      if (pendingHoverTimer) this.hoverTimer = pendingHoverTimer;
    }, EXIT_GRACE_MS);
  }

  _cancelPendingDetection() {
    if (!this.hoverTimer) return;
    this.clearTimer(this.hoverTimer);
    this.hoverTimer = null;
  }

  _scheduleHoverDetection(event) {
    this._cancelPendingDetection();
    const delay = settingsManager.get('MOUSE_HOVER_DELAY', 500);
    this.hoverTimer = this.setTimeout(() => {
      this.hoverTimer = null;
      this._processHover(event);
    }, delay);
  }

  /**
   * Reset transient hover state and cancel any active request.
   * @private
   */
  _resetHoverState({ cancelRequest = true } = {}) {
    this._cancelExitGrace();
    if (cancelRequest) {
      this._cancelPendingHover();
    } else {
      if (this.hoverTimer) {
        this.clearTimer(this.hoverTimer);
        this.hoverTimer = null;
      }
      this.currentMessageId = null;
    }

    this.currentText = null;
    this.currentRect = null;
    this.currentElement = null;
    this._removeBorder();
    this.activeHoverId = null;
    this.tooltipHeldHoverId = null;
    this.sourceInside = false;
    if (this.sourceLeaveElement && this.sourceLeaveHandler) {
      this.removeEventListener(this.sourceLeaveElement, 'mouseleave', this.sourceLeaveHandler, { once: true });
      this.sourceLeaveElement = null;
      this.sourceLeaveHandler = null;
    }
  }

  _hasHoverState() {
    return Boolean(
      this.currentText
      || this.currentElement
      || this.currentRect
      || this.borderedElement
      || this.currentMessageId
      || this.hoverTimer
    );
  }

  /**
   * Internal helper to handle mouse leaving text area
   * @private
   */
  _handleMouseOut() {
    const hoverIds = this._getHoverHideTargets();
    const hadHoverState = this._hasHoverState();
    this._resetHoverState();

    const autoClose = settingsManager.get('MOUSE_HOVER_AUTO_CLOSE', 'mouseleave');
    if (autoClose === 'mouseleave') {
      this._emitHoverHideFor(hoverIds);
    } else if (!hadHoverState) {
      this._cancelPendingHover();
    }
  }

  _getHoverHideTargets() {
    const targets = new Map();
    if (this.activeHoverId) targets.set(this.activeHoverId, 0);
    if (this.displayedHoverId) targets.set(this.displayedHoverId, this.displayedFrameId);
    return [...targets].map(([hoverId, frameId]) => ({ hoverId, frameId }));
  }

  _emitHoverHideFor(targets) {
    for (const { hoverId, frameId } of targets) {
      this._emitPageEvent('MOUSE_HOVER_HIDE_TOOLTIP', { hoverId, frameId });
    }
  }

  /**
   * Clean up the active hover state only if the request belongs to the current messageId.
   * @private
   */
  _cleanupActiveHoverRequest(messageId) {
    if (this.currentMessageId === messageId) {
      const hoverIds = this._getHoverHideTargets();
      this._resetHoverState({ cancelRequest: false });

      const autoClose = settingsManager.get('MOUSE_HOVER_AUTO_CLOSE', 'mouseleave');
      if (autoClose === 'mouseleave') {
        this._emitHoverHideFor(hoverIds);
      }
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
      if (this.activeHoverId && this.exitTimer) return;
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

    this.sourceInside = true;
    this.currentElement = detection.element;
    this._cancelExitGrace();

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

    this._cancelExitGrace();

    // Clean up any previous border before applying new one
    this._removeBorder();

    // Add visual feedback (border) if scope is container
    if (scope === 'container' && settingsManager.get('MOUSE_HOVER_SHOW_CONTAINER_BORDER', true)) {
      this.borderedElement = element;
      element.classList.add('ti-hover-container-highlight');
    }

    // Replace the previous source listener so rapid hover changes do not accumulate handlers.
    const leaveHandler = (leaveEvent) => {
      const relatedTarget = leaveEvent.relatedTarget;

      // 2. If we are leaving the element but moving into another part of the same container
      // (e.g. moving between nested spans), keep it open.
      if (relatedTarget && element.contains(relatedTarget)) {
        return;
      }

      // 3. Since 'element' is now always a stable block container (from HoverTextDetector),
      // we can trust its 'mouseleave' event to signal a clear exit from the text block.
      this._handleSourceElementLeave();
    };
    
    // Track listener on specific element; ResourceTracker handles removal of the old one if re-added
    if (this.sourceLeaveElement && this.sourceLeaveHandler) {
      this.removeEventListener(this.sourceLeaveElement, 'mouseleave', this.sourceLeaveHandler, { once: true });
    }
    this.sourceLeaveElement = element;
    this.sourceLeaveHandler = leaveHandler;
    this.addEventListener(element, 'mouseleave', leaveHandler, { once: true });

    // Cancel any previous active request
    if (this.currentMessageId) {
      contentScriptIntegration.cancelTranslationRequest(this.currentMessageId, 'New hover triggered');
    }

    const messageId = `hover-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    this.currentMessageId = messageId;
    const hoverId = `hover-display-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.activeHoverId = hoverId;
    this.tooltipHeldHoverId = null;
    if (window !== window.top) {
      try {
        window.top.postMessage({ source: 'translate-it-iframe', type: 'MOUSE_HOVER_POSITION_HINT', hoverId }, '*');
      } catch (error) {
        logger.debug('Failed to send hover position hint:', error);
      }
    }
    const accumulatedResults = new Map();

    try {
      // Register for streaming updates
      registerTranslation(messageId, {
        onStreamUpdate: (data) => {
          if (this.currentMessageId !== messageId) return;

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
              isStreaming: true,
              hoverId,
              frameId: 0
            });
            this.displayedHoverId = hoverId;
            this.displayedFrameId = 0;
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
          isStreaming: false,
          hoverId,
          frameId: 0
        });
        this.displayedHoverId = hoverId;
        this.displayedFrameId = 0;

        this.currentMessageId = null;
      }
    } catch (error) {
      if (this.currentMessageId !== messageId) return;
      if (ExtensionContextManager.isContextError(error)
        || [ErrorTypes.CONTEXT, ErrorTypes.EXTENSION_CONTEXT_INVALIDATED].includes(error?.type)) {
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

      const publicError = mapCanonicalTranslationError(error);
      const displayError = await createLegacyDisplayError(error, publicError);
      if (this.currentMessageId !== messageId) return;
      if (displayError) {
        // Keep canonical action available through legacy display error cause.
        ErrorHandler.getInstance().handle(displayError, {
          context: 'hover',
          showToast: false
        }).catch(() => {});
        if (this.currentMessageId === messageId) {
          this._emitPageEvent('MOUSE_HOVER_TRANSLATION_ERROR', { error: displayError, hoverId, frameId: 0 });
          this.displayedHoverId = hoverId;
          this.displayedFrameId = 0;
        }
      }
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

    // 2. If in an iframe, send hover UI events through runtime messaging only.
    if (window !== window.top) {
      try {
        const transportData = type === 'MOUSE_HOVER_TRANSLATION_ERROR' && data?.error
          ? {
              ...data,
              error: data.error.message || String(data.error),
              errorDetails: MessageFormat.serializeTranslationError(data.error)
            }
          : data;
        if (type.startsWith('MOUSE_HOVER_')) {
          browser.runtime.sendMessage({
            action: MessageActions.MOUSE_HOVER_FRAME_EVENT,
            data: { type, detail: transportData },
            context: 'mouse-hover-frame-event'
          }).catch((error) => logger.debug('Failed to send hover event to top frame:', error));
        }
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
   * Clean up resources
   */
  cleanup() {
    this._cancelExitGrace();
    this._resetHoverState();
    this.modifierTriggerController.reset();
    this.lastPosition = { x: 0, y: 0 };
    this.lastMouseEvent = null;
    super.cleanup();
  }
}

export const hoverTranslationManager = HoverTranslationManager.getInstance();
