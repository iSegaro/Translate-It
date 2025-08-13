// src/managers/content/windows/crossframe/CrossFrameManager.js

import { createLogger } from "../../../../utils/core/logger.js";
import { FrameRegistry } from "./FrameRegistry.js";
import { MessageRouter } from "./MessageRouter.js";

/**
 * Manages all cross-frame communication for WindowsManager
 */
export class CrossFrameManager {
  constructor(options = {}) {
    this.logger = createLogger('Content', 'CrossFrameManager');
    this.debugCrossFrame = options.debugCrossFrame === true;
    
    // Initialize registry and router
    this.frameRegistry = new FrameRegistry();
    this.messageRouter = new MessageRouter(this.frameRegistry);
    
    // Set debug mode
    if (this.debugCrossFrame) {
      this.frameRegistry.enableDebug();
    }
    
    // Click broadcasting state
    this._globalClickHandler = null;
    this._relayClickHandler = null;
    this._broadcastEnabled = false;
    this._relayEnabled = false;
    this._relayRequested = false;
    
    this._setupHandlers();
  }

  /**
   * Setup message router handlers
   */
  _setupHandlers() {
    this.messageRouter.setHandlers({
      onOutsideClick: this._handleOutsideClick.bind(this),
      onWindowCreationRequest: this._handleWindowCreationRequest.bind(this),
      onWindowCreatedResponse: this._handleWindowCreatedResponse.bind(this),
      onBroadcastStateChange: this._handleBroadcastStateChange.bind(this)
    });
  }

  /**
   * Handle outside click from other frames
   */
  _handleOutsideClick(event) {
    if (this.onOutsideClick) {
      this.onOutsideClick(event);
    }
  }

  /**
   * Handle window creation request
   */
  _handleWindowCreationRequest(data, sourceWindow) {
    if (this.onWindowCreationRequest) {
      this.onWindowCreationRequest(data, sourceWindow);
    }
  }

  /**
   * Handle window creation response
   */
  _handleWindowCreatedResponse(data) {
    if (this.onWindowCreatedResponse) {
      this.onWindowCreatedResponse(data);
    }
  }

  /**
   * Handle broadcast state change
   */
  _handleBroadcastStateChange(enabled) {
    this._applyGlobalClickRelay(enabled);
  }

  /**
   * Enable global click broadcasting for this frame
   */
  enableGlobalClickBroadcast() {
    if (this._broadcastEnabled) return;
    
    this._globalClickHandler = (e) => this._broadcastOutsideClick(e);
    document.addEventListener('click', this._globalClickHandler, { capture: true });
    this._broadcastEnabled = true;
    
    this._logXF('Global click broadcast enabled');
  }

  /**
   * Disable global click broadcasting for this frame
   */
  disableGlobalClickBroadcast() {
    if (!this._broadcastEnabled) return;
    
    if (this._globalClickHandler) {
      document.removeEventListener('click', this._globalClickHandler, { capture: true });
      this._globalClickHandler = null;
    }
    this._broadcastEnabled = false;
    
    this._logXF('Global click broadcast disabled');
  }

  /**
   * Apply or remove lightweight relay click handler
   */
  _applyGlobalClickRelay(enable) {
    try {
      if (enable) {
        if (this._relayEnabled) return;
        
        // Avoid duplicate broadcast if this frame already owns an active UI broadcast
        if (this._broadcastEnabled) {
          this._relayEnabled = false;
          return;
        }
        
        this._relayClickHandler = (e) => {
          // Tag the event as relay
          try { 
            Object.defineProperty(e, '__translateItRelay', { value: true, enumerable: false }); 
          } catch {}
          this._broadcastOutsideClick(e);
        };
        
        document.addEventListener('click', this._relayClickHandler, { capture: true });
        this._relayEnabled = true;
        this._logXF('Relay click enabled');
      } else {
        if (!this._relayEnabled) return;
        
        if (this._relayClickHandler) {
          document.removeEventListener('click', this._relayClickHandler, { capture: true });
          this._relayClickHandler = null;
        }
        this._relayEnabled = false;
        this._logXF('Relay click disabled');
      }
    } catch (error) {
      this._logXF('Failed to apply relay state', { error: error?.message });
    }
  }

  /**
   * Broadcast outside click to other frames
   */
  _broadcastOutsideClick(originalEvent) {
    this.messageRouter.broadcastOutsideClick(originalEvent);
  }

  /**
   * Request global click relay across all frames
   */
  requestGlobalClickRelay(enable) {
    this._relayRequested = !!enable;
    this.messageRouter.requestBroadcastChange(enable);
  }

  /**
   * Request window creation in main document (for iframes)
   */
  requestWindowCreation(selectedText, position) {
    if (!this.frameRegistry.isInIframe) {
      this.logger.warn('requestWindowCreation called from main document');
      return;
    }
    
    this.logger.debug('Requesting window creation in main document', {
      originalPosition: position,
      frameId: this.frameRegistry.frameId
    });
    
    this.messageRouter.requestWindowCreation(selectedText, position);
  }

  /**
   * Notify iframe that window was created
   */
  notifyWindowCreated(frameId, success, windowId = null, error = null) {
    this.messageRouter.notifyWindowCreated(frameId, success, windowId, error);
  }

  /**
   * Get iframe element by frame ID
   */
  getIframeByFrameId(frameId) {
    return this.frameRegistry.getIframeByFrameId(frameId);
  }

  /**
   * Set event handlers
   */
  setEventHandlers(handlers) {
    this.onOutsideClick = handlers.onOutsideClick;
    this.onWindowCreationRequest = handlers.onWindowCreationRequest;
    this.onWindowCreatedResponse = handlers.onWindowCreatedResponse;
  }

  /**
   * Scoped cross-frame debug logger
   */
  _logXF(message, meta) {
    if (this.debugCrossFrame) {
      try {
        this.logger.debug(`[XF] ${message}`, meta || {});
      } catch {}
    }
  }

  /**
   * Get current frame info
   */
  getFrameInfo() {
    return {
      frameId: this.frameRegistry.frameId,
      isInIframe: this.frameRegistry.isInIframe,
      isMainDocument: this.frameRegistry.isMainDocument,
      broadcastEnabled: this._broadcastEnabled,
      relayEnabled: this._relayEnabled,
      relayRequested: this._relayRequested
    };
  }

  /**
   * Clean up cross-frame manager
   */
  cleanup() {
    this.disableGlobalClickBroadcast();
    this._applyGlobalClickRelay(false);
    this.messageRouter.cleanup();
    this.frameRegistry.cleanup();
    
    // Clear handlers
    this.onOutsideClick = null;
    this.onWindowCreationRequest = null;
    this.onWindowCreatedResponse = null;
  }

  // Getters for compatibility
  get frameId() {
    return this.frameRegistry.frameId;
  }

  get isInIframe() {
    return this.frameRegistry.isInIframe;
  }
}