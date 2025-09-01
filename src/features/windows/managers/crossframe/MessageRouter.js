// src/managers/content/windows/crossframe/MessageRouter.js

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { WindowsConfig } from "../core/WindowsConfig.js";

/**
 * Routes and handles cross-frame messages for WindowsManager
 */
export class MessageRouter {
  constructor(frameRegistry, options = {}) {
  this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'MessageRouter');
    this.frameRegistry = frameRegistry;
    this.onOutsideClick = options.onOutsideClick;
    this.onWindowCreationRequest = options.onWindowCreationRequest;
    this.onWindowCreatedResponse = options.onWindowCreatedResponse;
    
    this._boundHandleMessage = this._handleCrossFrameMessage.bind(this);
    window.addEventListener('message', this._boundHandleMessage);
  }

  /**
   * Main message handler for cross-frame communication
   */
  _handleCrossFrameMessage(event) {
    if (!event.data || !event.data.type) return;

    const { data } = event;

    switch (data.type) {
      case WindowsConfig.CROSS_FRAME.REGISTER_FRAME:
        this._handleFrameRegistration(event);
        break;
        
      case WindowsConfig.CROSS_FRAME.SET_BROADCAST_REQUEST:
        this._handleBroadcastRequest(event);
        break;
        
      case WindowsConfig.CROSS_FRAME.SET_BROADCAST_APPLY:
        this._handleBroadcastApply(event);
        break;
        
      case WindowsConfig.CROSS_FRAME.OUTSIDE_CLICK:
        this._handleOutsideClick(event);
        break;
        
      case WindowsConfig.CROSS_FRAME.CREATE_WINDOW_REQUEST:
        this._handleWindowCreationRequest(event);
        break;
        
      case WindowsConfig.CROSS_FRAME.WINDOW_CREATED:
        this._handleWindowCreatedResponse(event);
        break;
        
      default:
        // Unknown message type, ignore silently
        break;
    }
  }

  /**
   * Handle iframe registration
   */
  _handleFrameRegistration(event) {
    this.frameRegistry.handleFrameRegistration(event);
  }

  /**
   * Handle broadcast request (main document only)
   */
  _handleBroadcastRequest(event) {
    if (this.frameRegistry.isInIframe) return;

    try {
      // Initialize ref counter on top window
      if (typeof window.translateItBroadcastCount !== 'number') {
        window.translateItBroadcastCount = 0;
      }

      const enable = !!event.data.enabled;
      
      // Update counter
      if (enable) {
        window.translateItBroadcastCount += 1;
      } else {
        window.translateItBroadcastCount -= 1;
        if (window.translateItBroadcastCount < 0) {
          window.translateItBroadcastCount = 0;
        }
      }

      const shouldEnable = window.translateItBroadcastCount > 0;
      
      // Apply locally on main document
      if (this.onBroadcastStateChange) {
        this.onBroadcastStateChange(shouldEnable);
      }

      // Fan out apply message to all iframes
      this._broadcastToAllIframes({
        type: WindowsConfig.CROSS_FRAME.SET_BROADCAST_APPLY,
        enabled: shouldEnable,
        timestamp: Date.now()
      });
    } catch (error) {
      this.logger.error('Failed broadcast request handling', error);
    }
  }

  /**
   * Handle broadcast apply (all frames)
   */
  _handleBroadcastApply(event) {
    const enabled = !!event.data.enabled;
    
    if (this.onBroadcastStateChange) {
      this.onBroadcastStateChange(enabled);
    }

    // Forward to child iframes
    this._broadcastToAllIframes({
      type: WindowsConfig.CROSS_FRAME.SET_BROADCAST_APPLY,
      enabled,
      timestamp: Date.now()
    });
  }

  /**
   * Handle outside click message
   */
  _handleOutsideClick(event) {
    // Don't process our own messages
    if (event.data.frameId === this.frameRegistry.frameId || 
        event.data.forwardedFrom === this.frameRegistry.frameId) {
      return;
    }

    // Forward from main document to other iframes
    if (!this.frameRegistry.isInIframe && event.data.isInIframe && !event.data.forwardedFrom) {
      this._forwardMessageToIframes(event.data);
    }

    // Notify handler
    if (this.onOutsideClick) {
      this.onOutsideClick(event);
    }
  }

  /**
   * Handle window creation request (main document only)
   */
  _handleWindowCreationRequest(event) {
    if (this.frameRegistry.isInIframe) return;

    if (this.onWindowCreationRequest) {
      this.onWindowCreationRequest(event.data, event.source);
    }
  }

  /**
   * Handle window creation response (iframe only)
   */
  _handleWindowCreatedResponse(event) {
    if (!this.frameRegistry.isInIframe) return;
    if (event.data.targetFrameId !== this.frameRegistry.frameId) return;

    if (this.onWindowCreatedResponse) {
      this.onWindowCreatedResponse(event.data);
    }
  }

  /**
   * Broadcast outside click to other frames
   */
  broadcastOutsideClick(originalEvent) {
    try {
      const message = {
        type: WindowsConfig.CROSS_FRAME.OUTSIDE_CLICK,
        frameId: this.frameRegistry.frameId,
        targetFrame: 'all',
        timestamp: Date.now(),
        isInIframe: this.frameRegistry.isInIframe,
        relayed: !!originalEvent?.__translateItRelay,
        target: {
          tagName: originalEvent.target.tagName,
          className: originalEvent.target.className?.substring(0, 50) || ''
        }
      };

      // Broadcast to parent/top if in iframe
      if (this.frameRegistry.isInIframe) {
        this._sendToParent(message);
      }

      // Broadcast to all child frames
      this._broadcastToAllIframes(message);
    } catch {
      // Silently ignore errors in cross-frame communication
    }
  }

  /**
   * Request window creation in main document
   */
  requestWindowCreation(selectedText, position) {
    const message = {
      type: WindowsConfig.CROSS_FRAME.CREATE_WINDOW_REQUEST,
      frameId: this.frameRegistry.frameId,
      selectedText: selectedText,
      position: position,
      timestamp: Date.now()
    };

    this._sendToParent(message);
  }

  /**
   * Notify about window creation
   */
  notifyWindowCreated(frameId, success, windowId = null, error = null) {
    const message = {
      type: WindowsConfig.CROSS_FRAME.WINDOW_CREATED,
      targetFrameId: frameId,
      success: success,
      windowId: windowId,
      error: error,
      timestamp: Date.now()
    };

    this._broadcastToAllIframes(message);
  }

  /**
   * Request broadcast state change
   */
  requestBroadcastChange(enable) {
    const message = {
      type: WindowsConfig.CROSS_FRAME.SET_BROADCAST_REQUEST,
      enabled: !!enable,
      timestamp: Date.now()
    };

    if (this.frameRegistry.isInIframe) {
      this._sendToParent(message);
    } else {
      // Handle directly if we're main document
      this._handleBroadcastRequest({ data: message, source: window });
    }
  }

  /**
   * Send message to parent frames
   */
  _sendToParent(message) {
    try {
      if (window.parent) {
        window.parent.postMessage(message, '*');
      }
      if (window.top && window.top !== window.parent) {
        window.top.postMessage(message, '*');
      }
    } catch {
      // Silently ignore CORS errors
    }
  }

  /**
   * Broadcast message to all iframe children
   */
  _broadcastToAllIframes(message) {
    const frames = document.querySelectorAll('iframe');
    frames.forEach((frame) => {
      try {
        frame.contentWindow?.postMessage(message, '*');
      } catch {
        // Silently ignore CORS errors
      }
    });
  }

  /**
   * Forward message to all iframes with forwarding marker
   */
  _forwardMessageToIframes(originalMessage) {
    const forwardedMessage = {
      ...originalMessage,
      type: WindowsConfig.CROSS_FRAME.OUTSIDE_CLICK,
      forwardedFrom: this.frameRegistry.frameId,
      originalSender: originalMessage.frameId
    };

    this._broadcastToAllIframes(forwardedMessage);
  }

  /**
   * Set callback handlers
   */
  setHandlers(handlers) {
    this.onOutsideClick = handlers.onOutsideClick;
    this.onWindowCreationRequest = handlers.onWindowCreationRequest;
    this.onWindowCreatedResponse = handlers.onWindowCreatedResponse;
    this.onBroadcastStateChange = handlers.onBroadcastStateChange;
  }

  /**
   * Clean up message router
   */
  cleanup() {
    window.removeEventListener('message', this._boundHandleMessage);
    this.onOutsideClick = null;
    this.onWindowCreationRequest = null;
    this.onWindowCreatedResponse = null;
    this.onBroadcastStateChange = null;
  }
}