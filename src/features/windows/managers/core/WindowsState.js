// src/managers/content/windows/core/WindowsState.js

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

/**
 * Manages state for WindowsManager
 */
export class WindowsState {
  constructor(frameId) {
  this.logger = getScopedLogger(LOG_COMPONENTS.WINDOWS, 'WindowsState');
    this.frameId = frameId;
    this.isInIframe = window !== window.top;
    this.reset();
  }

  reset() {
    // Visibility states
    this.isVisible = false;
    this.isIconMode = false;
    this.pendingTranslationWindow = false;
    
    // Translation states
    this.isTranslationCancelled = false;
    this.originalText = null;
    
    // Drag states
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };
    
    // Cross-frame states
    this.isInIframe = window !== window.top;
    this._relayRequested = false;
    this._broadcastEnabled = false;
    this._relayEnabled = false;
    
    // Context states
    this.iconClickContext = null;
    this.requestingFrameId = null;
    this.mainDocumentWindowId = null;
    this.activeWindowId = null;
    this.isProcessing = false;

    this.logger.debug('WindowsState reset', { frameId: this.frameId });
  }

  // Visibility management
  setVisible(visible) {
    const wasVisible = this.isVisible;
    this.isVisible = visible;
    if (wasVisible !== visible) {
      this.logger.debug('Visibility changed', { from: wasVisible, to: visible });
    }
  }

  setIconMode(iconMode) {
    const wasIconMode = this.isIconMode;
    this.isIconMode = iconMode;
    if (wasIconMode !== iconMode) {
      this.logger.debug('Icon mode changed', { from: wasIconMode, to: iconMode });
    }
  }

  setPendingTranslationWindow(pending) {
    this.pendingTranslationWindow = pending;
    this.logger.debug('Pending translation window', { pending });
  }

  // Translation management
  setOriginalText(text) {
    this.originalText = text;
  }

  setTranslationCancelled(cancelled) {
    this.isTranslationCancelled = cancelled;
    if (cancelled) {
      this.logger.debug('Translation cancelled');
    }
  }

  // Drag management
  startDragging(dragOffset) {
    this.isDragging = true;
    this.dragOffset = { ...dragOffset };
    this.logger.debug('Started dragging', { dragOffset });
  }

  stopDragging() {
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };
    this.logger.debug('Stopped dragging');
  }

  // Context management
  setIconClickContext(context) {
    this.iconClickContext = context;
  }

  clearIconClickContext() {
    this.iconClickContext = null;
  }

  setRequestingFrameId(frameId) {
    this.requestingFrameId = frameId;
  }

  setActiveWindowId(id) {
    this.activeWindowId = id;
    this.logger.debug('Active window ID set', { id });
  }

  setProcessing(isProcessing) {
    this.isProcessing = isProcessing;
    this.logger.debug('Processing state changed', { isProcessing });
  }

  // Cross-frame state management
  setBroadcastEnabled(enabled) {
    this._broadcastEnabled = enabled;
  }

  setRelayEnabled(enabled) {
    this._relayEnabled = enabled;
  }

  setRelayRequested(requested) {
    this._relayRequested = requested;
  }

  // Getters for read-only access
  get canShowWindow() {
    return !this.isTranslationCancelled && !this.pendingTranslationWindow;
  }

  get hasActiveElements() {
    return this.isVisible || this.isIconMode;
  }

  get shouldPreventDismissal() {
    return this.pendingTranslationWindow;
  }

  // State validation
  validateState() {
    const issues = [];
    
    if (this.isVisible && this.isIconMode) {
      issues.push('Cannot be both visible and in icon mode');
    }
    
    if (this.isDragging && !this.isVisible) {
      issues.push('Cannot be dragging when not visible');
    }
    
    if (this.pendingTranslationWindow && !this.originalText) {
      issues.push('Pending translation without original text');
    }
    
    if (issues.length > 0) {
      this.logger.warn('State validation issues found', { issues, state: this.getSnapshot() });
    }
    
    return issues.length === 0;
  }

  // Debug helpers
  getSnapshot() {
    return {
      frameId: this.frameId,
      isVisible: this.isVisible,
      isIconMode: this.isIconMode,
      pendingTranslationWindow: this.pendingTranslationWindow,
      isTranslationCancelled: this.isTranslationCancelled,
      hasOriginalText: !!this.originalText,
      isDragging: this.isDragging,
      isInIframe: this.isInIframe,
      hasIconClickContext: !!this.iconClickContext,
      _broadcastEnabled: this._broadcastEnabled,
      _relayEnabled: this._relayEnabled,
      _relayRequested: this._relayRequested
    };
  }

  logCurrentState(context = '') {
    this.logger.debug(`Current state${context ? ` (${context})` : ''}`, this.getSnapshot());
  }
}