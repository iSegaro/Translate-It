// IFrameManager - Advanced iframe management with ResourceTracker integration
import browser from 'webextension-polyfill';
import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import ExtensionContextManager from '@/core/extensionContext.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import SmartCache from '@/core/memory/SmartCache.js';
import { sendMessage } from '@/shared/messaging/core/UnifiedMessaging.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';

/**
 * Enhanced IFrame Manager with full integration to existing systems
 * 
 * Features:
 * - Automatic resource management with ResourceTracker
 * - Cross-frame communication with UnifiedMessaging  
 * - Error handling with ExtensionContextManager
 * - Intelligent caching with SmartCache
 * - Memory leak prevention with Memory Garbage Collector
 */
export class IFrameManager extends ResourceTracker {
  constructor() {
    super('iframe-manager');
    
    this.logger = getScopedLogger(LOG_COMPONENTS.IFRAME, 'IFrameManager');
    this.errorHandler = ErrorHandler.getInstance();
    
    // Frame detection and registry
    this.isInIframe = window !== window.top;
    this.isMainDocument = !this.isInIframe;
    this.frameId = this._generateFrameId();
    
    // Frame registry with intelligent caching
    this.frameCache = new SmartCache({
      ttl: 300000, // 5 minutes
      maxSize: 100,
      cleanupInterval: 60000
    });
    this.trackCache(this.frameCache);
    
    // Communication channels
    this.messageQueue = [];
    this.communicationReady = false;
    
    // Initialize manager
    this.initialize();
    
    this.logger.info('IFrameManager initialized', {
      frameId: this.frameId,
      isInIframe: this.isInIframe,
      isMainDocument: this.isMainDocument
    });
  }

  /**
   * Initialize iframe manager with all integrations
   */
  async initialize() {
    try {
      // Check extension context safety
      if (!ExtensionContextManager.isValidSync()) {
        this.logger.debug('Extension context invalid, skipping initialization');
        return;
      }

      // Setup cross-frame communication
      this._setupCommunication();
      
      // Setup frame registry
      this._setupFrameRegistry();
      
      // Setup event listeners with ResourceTracker
      this._setupEventListeners();
      
      // Register this frame
      await this._registerFrame();
      
      // Setup cleanup hooks
      this._setupCleanupHooks();
      
      this.communicationReady = true;
      this._processMessageQueue();
      
      this.logger.debug('IFrameManager initialization completed');
      
    } catch (error) {
      await this.errorHandler.handle(error, {
        context: 'iframe-manager-init',
        showToast: false
      });
    }
  }

  /**
   * Setup cross-frame communication system
   */
  _setupCommunication() {
    // Listen for messages from other frames
    this.addEventListener(window, 'message', this._handleCrossFrameMessage.bind(this), {
      capture: true,
      passive: true
    });

    // Listen for frame load/unload events
    if (this.isMainDocument) {
      this.addEventListener(window, 'beforeunload', this._handleMainFrameUnload.bind(this));
    } else {
      this.addEventListener(window, 'beforeunload', this._handleIFrameUnload.bind(this));
    }
  }

  /**
   * Setup frame registry system
   */
  _setupFrameRegistry() {
    if (!window.translateItFrameRegistry) {
      window.translateItFrameRegistry = new Map();
    }
    
    // Add this frame to registry
    window.translateItFrameRegistry.set(this.frameId, {
      window: window,
      isInIframe: this.isInIframe,
      url: window.location.href,
      origin: window.location.origin,
      timestamp: Date.now()
    });
    
    this.trackResource('frame-registry-entry', () => {
      if (window.translateItFrameRegistry) {
        window.translateItFrameRegistry.delete(this.frameId);
      }
    });
  }

  /**
   * Setup event listeners for iframe detection
   */
  _setupEventListeners() {
    // Listen for new iframe creation (main document only)
    if (this.isMainDocument) {
      const observer = new MutationObserver(this._handleDOMChanges.bind(this));
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      
      this.trackResource('mutation-observer', () => {
        observer.disconnect();
      });
    }

    // Listen for extension messages
    this.addEventListener(browser.runtime.onMessage, 'message', this._handleExtensionMessage.bind(this));
  }

  /**
   * Register frame with parent/children
   */
  async _registerFrame() {
    const registrationMessage = {
      type: 'TRANSLATE_IT_FRAME_REGISTER',
      frameId: this.frameId,
      isInIframe: this.isInIframe,
      url: window.location.href,
      timestamp: Date.now()
    };

    if (this.isInIframe) {
      // Register with parent frames
      this._sendToParent(registrationMessage);
    } else {
      // Broadcast to existing iframes
      this._broadcastToIframes(registrationMessage);
    }
  }

  /**
   * Setup cleanup hooks for memory management
   */
  _setupCleanupHooks() {
    // Track cleanup for page visibility changes
    this.addEventListener(document, 'visibilitychange', () => {
      if (document.hidden) {
        this._performMaintenance();
      }
    });

    // Setup periodic maintenance
    this.trackInterval(() => {
      this._performMaintenance();
    }, 300000); // 5 minutes
  }

  /**
   * Handle cross-frame messages
   */
  async _handleCrossFrameMessage(event) {
    try {
      if (!event.data || typeof event.data !== 'object') return;
      
      const { type, data } = event.data;
      
      switch (type) {
        case 'TRANSLATE_IT_FRAME_REGISTER':
          await this._handleFrameRegistration(event);
          break;
          
        case 'TRANSLATE_IT_SELECT_ELEMENT':
          await this._handleSelectElementRequest(data);
          break;
          
        case 'TRANSLATE_IT_TEXT_FIELD':
          await this._handleTextFieldRequest(data);
          break;
          
        case 'TRANSLATE_IT_WINDOW_REQUEST':
          await this._handleWindowRequest(data);
          break;
          
        default:
          // Forward to existing CrossFrameManager if available
          if (window.crossFrameManager && typeof window.crossFrameManager._handleCrossFrameMessage === 'function') {
            window.crossFrameManager._handleCrossFrameMessage(event);
          }
          break;
      }
      
    } catch (error) {
      await this.errorHandler.handle(error, {
        context: 'iframe-cross-frame-message',
        showToast: false
      });
    }
  }

  /**
   * Handle extension messages
   */
  async _handleExtensionMessage(message, _sender, _sendResponse) { // eslint-disable-line no-unused-vars
    try {
      if (!ExtensionContextManager.isValidSync()) {
        return false;
      }

      switch (message.action) {
        case MessageActions.IFRAME_ACTIVATE_SELECT_ELEMENT:
          return await this._activateSelectElementMode(message.data);
          
        case MessageActions.IFRAME_TRANSLATE_SELECTION:
          return await this._handleTranslationRequest(message.data);
          
        case MessageActions.IFRAME_GET_FRAME_INFO:
          return this._getFrameInfo();
          
        default:
          return false;
      }
      
    } catch (error) {
      await this.errorHandler.handle(error, {
        context: 'iframe-extension-message',
        showToast: false
      });
      return false;
    }
  }

  /**
   * Handle frame registration from other frames
   */
  async _handleFrameRegistration(event) {
    const frameData = event.data;
    
    // Cache frame information
    this.frameCache.set(frameData.frameId, {
      window: event.source,
      ...frameData
    });
    
    this.logger.info(`[IFrame] New frame registered: ${frameData.frameId} (total: ${this.frameCache.size})`);
    this.logger.debug('Frame registration details', {
      frameId: frameData.frameId,
      isInIframe: frameData.isInIframe,
      url: frameData.url,
      totalFrames: this.frameCache.size
    });
    
    // Broadcast to other frames about new registration
    if (this.isMainDocument) {
      this._broadcastToIframes({
        type: 'TRANSLATE_IT_FRAME_REGISTERED',
        frameId: frameData.frameId,
        totalFrames: this.frameCache.size
      }, [frameData.frameId]);
    }
  }

  /**
   * Handle DOM changes for iframe detection
   */
  _handleDOMChanges(mutations) {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.tagName === 'IFRAME') {
          this._handleNewIframe(node);
        }
      }
    }
  }

  /**
   * Handle new iframe detection
   */
  async _handleNewIframe(iframe) {
    try {
      // Check basic iframe properties first
      if (!iframe || !iframe.tagName || iframe.tagName.toLowerCase() !== 'iframe') {
        this.logger.debug('Invalid iframe element passed to _handleNewIframe');
        return;
      }

      this.logger.debug('Handling new iframe', {
        src: iframe.src || 'no src',
        id: iframe.id || 'no id',
        className: iframe.className || 'no class'
      });

      // Try to access iframe properties safely
      let canAccessContent = false;
      let contentWindow = null;
      let contentDocument = null;
      
      try {
        contentWindow = iframe.contentWindow;
        contentDocument = iframe.contentDocument;
        canAccessContent = !!(contentDocument && contentWindow);
      } catch (accessError) {
        this.logger.debug('Cannot access iframe content (cross-origin or security restriction)', {
          src: iframe.src,
          error: accessError.message
        });
        return; // Exit early if we can't access content
      }

      if (!canAccessContent) {
        this.logger.debug('Iframe content not accessible, skipping injection', {
          src: iframe.src
        });
        return;
      }

      // Wait for iframe to load
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Iframe load timeout after 5 seconds'));
        }, 5000);

        if (contentDocument && contentDocument.readyState === 'complete') {
          clearTimeout(timeout);
          resolve();
        } else {
          const onLoad = () => {
            clearTimeout(timeout);
            iframe.removeEventListener('load', onLoad);
            resolve();
          };
          iframe.addEventListener('load', onLoad);
        }
      });
      
      // Check if content script needs to be injected
      try {
        if (contentWindow && !contentWindow.translateItContentScriptLoaded) {
          await this._injectContentScriptToIframe(iframe);
        } else {
          this.logger.debug('Content script already loaded or window not accessible', {
            src: iframe.src,
            hasWindow: !!contentWindow,
            scriptLoaded: contentWindow?.translateItContentScriptLoaded
          });
        }
      } catch (injectionError) {
        this.logger.debug('Content script injection failed', {
          error: injectionError.message,
          name: injectionError.name,
          src: iframe.src,
          isSecurityError: injectionError.name === 'SecurityError'
        });
        // Don't throw - injection failure is not critical
      }
      
    } catch (error) {
      this.logger.debug('Failed to handle new iframe', {
        error: error.message,
        name: error.name,
        src: iframe?.src || 'unknown',
        stack: error.stack?.substring(0, 200) + '...'
      });
    }
  }

  /**
   * Inject content script to iframe (if possible and needed)
   */
  async _injectContentScriptToIframe(iframe) {
    try {
      // Check if we can access iframe content (same-origin policy)
      const iframeDoc = iframe.contentDocument;
      const iframeWindow = iframe.contentWindow;
      
      if (!iframeDoc || !iframeWindow) {
        this.logger.debug('Cannot access iframe content or window (cross-origin)', {
          src: iframe.src,
          hasDoc: !!iframeDoc,
          hasWindow: !!iframeWindow
        });
        return;
      }
      
      // Check if browser.scripting API is available
      if (!browser.scripting || !browser.scripting.executeScript) {
        this.logger.debug('browser.scripting API not available, skipping script injection');
        return;
      }

      // Get frameId for script injection
      let frameId;
      try {
        // Try to get frameId from contentWindow or generate one
        frameId = iframeWindow.frameId || Math.floor(Math.random() * 1000000);
      } catch (frameIdError) {
        this.logger.debug('Could not get iframe frameId', {
          error: frameIdError.message,
          src: iframe.src
        });
        return;
      }

      this.logger.debug('Attempting to inject content script to iframe', {
        src: iframe.src,
        frameId: frameId,
        hasScriptingAPI: !!(browser.scripting && browser.scripting.executeScript)
      });

      // Use browser.scripting.executeScript for MV3 compliance
      await browser.scripting.executeScript({
        target: { 
          frameIds: [frameId] 
        },
        files: ['src/core/content-scripts/index.js']
      });

      this.logger.info(`[IFrame] Script injected successfully to iframe: ${frameId}`);
      
    } catch {
      // Content script injection failed details logged at DEBUG level

      // Don't re-throw - script injection failure is not critical for iframe functionality
    }
  }

  /**
   * Activate select element mode across frames
   */
  async _activateSelectElementMode(data) {
    try {
      // Activate in current frame
      if (window.selectElementManagerInstance) {
        await window.selectElementManagerInstance.activate();
      }
      
      // Broadcast to other frames
      this._broadcastToAllFrames({
        type: 'TRANSLATE_IT_SELECT_ELEMENT',
        action: 'activate',
        data
      });
      
      return { success: true, frameId: this.frameId };
      
    } catch (error) {
      await this.errorHandler.handle(error, {
        context: 'iframe-activate-select-element',
        showToast: false
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle translation requests across frames
   */
  async _handleTranslationRequest(data) {
    try {
      // Use existing translation system
      const response = await sendMessage({
        action: MessageActions.TRANSLATE,
        data: {
          text: data.text,
          sourceLang: data.sourceLang || 'auto',
          targetLang: data.targetLang,
          frameId: this.frameId,
          ...data
        }
      });
      
      return response;
      
    } catch (error) {
      await this.errorHandler.handle(error, {
        context: 'iframe-translation-request',
        showToast: false
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Get current frame information
   */
  _getFrameInfo() {
    return {
      frameId: this.frameId,
      isInIframe: this.isInIframe,
      isMainDocument: this.isMainDocument,
      url: window.location.href,
      origin: window.location.origin,
      registeredFrames: this.frameCache.size,
      communicationReady: this.communicationReady
    };
  }

  /**
   * Send message to parent frames
   */
  _sendToParent(message) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(message, '*');
      }
      if (window.top && window.top !== window && window.top !== window.parent) {
        window.top.postMessage(message, '*');
      }
    } catch (error) {
      this.logger.debug('Failed to send message to parent', error);
    }
  }

  /**
   * Broadcast message to all iframes
   */
  _broadcastToIframes(message, excludeFrameIds = []) {
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach(iframe => {
      try {
        if (iframe.contentWindow && !excludeFrameIds.includes(iframe.contentWindow.frameId)) {
          iframe.contentWindow.postMessage(message, '*');
        }
            } catch {
        // Ignore CORS errors for cross-origin iframes
      }
    });
  }

  /**
   * Broadcast to all frames (parent and children)
   */
  _broadcastToAllFrames(message) {
    // Send to parent
    if (this.isInIframe) {
      this._sendToParent(message);
    }
    
    // Send to children
    this._broadcastToIframes(message);
  }

  /**
   * Process queued messages
   */
  _processMessageQueue() {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      this._broadcastToAllFrames(message);
    }
  }

  /**
   * Perform maintenance and cleanup
   */
  _performMaintenance() {
    try {
      // Clean up disconnected frames from cache
      const currentTime = Date.now();
      const maxAge = 600000; // 10 minutes
      
      for (const [frameId, frameData] of this.frameCache.entries()) {
        if (currentTime - frameData.timestamp > maxAge) {
          this.frameCache.delete(frameId);
        }
      }
      
      // Clean up global registry
      if (window.translateItFrameRegistry) {
        for (const [frameId, frameData] of window.translateItFrameRegistry.entries()) {
          if (currentTime - frameData.timestamp > maxAge) {
            window.translateItFrameRegistry.delete(frameId);
          }
        }
      }
      
      this.logger.debug('Frame maintenance performed', {
        cachedFrames: this.frameCache.size,
        registeredFrames: window.translateItFrameRegistry?.size || 0,
        cleanupTime: Date.now()
      });
      
    } catch (error) {
      this.logger.warn('Maintenance failed', error);
    }
  }

  /**
   * Handle main frame unload
   */
  _handleMainFrameUnload() {
    // Clean up all frame references
    this.frameCache.clear();
    if (window.translateItFrameRegistry) {
      window.translateItFrameRegistry.clear();
    }
  }

  /**
   * Handle iframe unload
   */
  _handleIFrameUnload() {
    // Notify parent about unload
    this._sendToParent({
      type: 'TRANSLATE_IT_FRAME_UNLOAD',
      frameId: this.frameId,
      timestamp: Date.now()
    });
  }

  /**
   * Generate unique frame ID
   */
  _generateFrameId() {
    return `frame_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
  }

  /**
   * Get all registered frames
   */
  getAllFrames() {
    return Array.from(this.frameCache.entries()).map(([frameId, data]) => ({
      frameId,
      ...data
    }));
  }

  /**
   * Get frame by ID
   */
  getFrame(frameId) {
    return this.frameCache.get(frameId);
  }

  /**
   * Check if frame exists
   */
  hasFrame(frameId) {
    return this.frameCache.has(frameId);
  }

  /**
   * Send message to specific frame
   */
  sendToFrame(frameId, message) {
    const frameData = this.frameCache.get(frameId);
    if (frameData && frameData.window) {
      try {
        frameData.window.postMessage({
          ...message,
          targetFrameId: frameId,
          senderFrameId: this.frameId
        }, '*');
        return true;
      } catch (error) {
        this.logger.warn('Failed to send message to frame', { frameId, error });
        return false;
      }
    }
    return false;
  }

  /**
   * Enhanced cleanup with resource tracking
   */
  async cleanup() {
    try {
      this.logger.info('[IFrame] Starting cleanup process');
      
      // Notify other frames about cleanup
      this._broadcastToAllFrames({
        type: 'TRANSLATE_IT_FRAME_CLEANUP',
        frameId: this.frameId,
        timestamp: Date.now()
      });
      
      // Clear caches
      this.frameCache.clear();
      this.messageQueue.length = 0;
      
      // Call parent cleanup (ResourceTracker)
      await super.cleanup();
      
      this.logger.info('[IFrame] Cleanup completed successfully');
      
    } catch (error) {
      this.logger.error('Error during cleanup', error);
    }
  }
}

// Export singleton instance
export const iFrameManager = new IFrameManager();