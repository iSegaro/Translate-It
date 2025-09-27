// src/managers/content/windows/crossframe/FrameRegistry.js

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

/**
 * Manages frame registration and mapping for cross-frame communication
 */
export class FrameRegistry {
  constructor() {
  this.logger = getScopedLogger(LOG_COMPONENTS.WINDOWS, 'FrameRegistry');
    this.frameId = Math.random().toString(36).substring(7);
    this.isInIframe = window !== window.top;
    this.debugCrossFrame = false;
    
    this._setupRegistry();
  }

  /**
   * Setup frame registry and register current frame
   */
  _setupRegistry() {
    // Initialize registry on current window
    if (!window.translateItFrameRegistry) {
      window.translateItFrameRegistry = new Set();
    }
    
    // Defensive check - ensure it's still a Set
    if (window.translateItFrameRegistry && typeof window.translateItFrameRegistry.add === 'function') {
      window.translateItFrameRegistry.add(this.frameId);
    } else {
      // Reinitialize if corrupted
      window.translateItFrameRegistry = new Set();
      window.translateItFrameRegistry.add(this.frameId);
      this.logger.warn('[FrameRegistry] Registry corrupted, reinitialized');
    }

    // Register with parent/top frames if in iframe
    if (this.isInIframe) {
      this._registerWithParent();
    }
  }

  /**
   * Register current frame with parent/top frames
   */
  _registerWithParent() {
    try {
      const msg = { 
        type: 'translateit-register-frame', 
        frameId: this.frameId, 
        timestamp: Date.now() 
      };

      if (window.parent) {
        window.parent.postMessage(msg, '*');
      }
      
      if (window.top && window.top !== window.parent) {
        window.top.postMessage(msg, '*');
      }
      
      this.logger.info(`[FrameRegistry] Registered with parent (frame: ${this.frameId})`);
      this._logXF('Registration details', {
        frameId: this.frameId,
        hasParent: !!window.parent,
        hasTop: !!(window.top && window.top !== window.parent)
      });
    } catch (error) {
      this.logger.warn('[FrameRegistry] Failed to register with parent', {
        error: error.message,
        frameId: this.frameId
      });
      this._logXF('Parent registration failed', { error: error?.message });
    }
  }

  /**
   * Handle iframe registration (main document only)
   */
  handleFrameRegistration(event) {
    if (this.isInIframe) return; // Only main document handles registration

    try {
      // Create map store if not present
      if (!window.translateItFrameMap) {
        window.translateItFrameMap = new Map();
      }

      // Find the iframe element that posted this message
      const frames = document.querySelectorAll('iframe');
      for (const frame of frames) {
        if (frame.contentWindow === event.source) {
          window.translateItFrameMap.set(event.data.frameId, frame);
          this.logger.info(`[FrameRegistry] Mapped frame: ${event.data.frameId}`);
          this._logXF('Frame mapping details', {
            frameId: event.data.frameId,
            iframeSrc: frame.src?.substring(0, 100) || 'no src'
          });
          break;
        }
      }
    } catch (error) {
      this.logger.warn('[FrameRegistry] Failed to register frame', {
        error: error.message,
        frameId: event.data?.frameId
      });
      this._logXF('Frame registration failed', { error: error?.message });
    }
  }

  /**
   * Get iframe element by frame ID
   */
  getIframeByFrameId(frameId) {
    if (this.isInIframe || !window.translateItFrameMap) {
      return null;
    }
    return window.translateItFrameMap.get(frameId);
  }

  /**
   * Get all registered frames
   */
  getAllFrames() {
    return window.translateItFrameRegistry ? Array.from(window.translateItFrameRegistry) : [];
  }

  /**
   * Clean up registry
   */
  cleanup() {
    try {
      const totalFrames = window.translateItFrameRegistry?.size || 0;
      if (window.translateItFrameRegistry) {
        window.translateItFrameRegistry.delete(this.frameId);
      }

      let cleanedCount = 0;
      if (!this.isInIframe && window.translateItFrameMap) {
        // Clean up mapping entries that reference this frame
        for (const [id, element] of window.translateItFrameMap.entries()) {
          if (!element.isConnected) {
            window.translateItFrameMap.delete(id);
            cleanedCount++;
          }
        }
      }

      this.logger.info(`[FrameRegistry] Cleanup completed (removed: ${cleanedCount}, remaining: ${totalFrames - 1})`);
      this._logXF('Cleanup details', {
        frameId: this.frameId,
        totalFramesBefore: totalFrames,
        disconnectedCleaned: cleanedCount
      });
    } catch (error) {
      this.logger.warn('[FrameRegistry] Error during cleanup', {
        error: error.message,
        frameId: this.frameId
      });
    }
  }

  /**
   * Enable debug logging
   */
  enableDebug() {
    this.debugCrossFrame = true;
  }

  /**
   * Disable debug logging
   */
  disableDebug() {
    this.debugCrossFrame = false;
  }

  /**
   * Scoped cross-frame debug logger
   */
  _logXF(message, meta) {
    if (this.debugCrossFrame) {
      try {
        this.logger.debug(`[XF] ${message}`, meta || {});
      } catch {
        // Ignore logging errors
      }
    }
  }

  // Getters
  get currentFrameId() {
    return this.frameId;
  }

  get isMainDocument() {
    return !this.isInIframe;
  }
}