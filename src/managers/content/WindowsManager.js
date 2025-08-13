// src/managers/SelectionWindows.js

import { ErrorHandler } from "../../error-management/ErrorService.js";
import { logME, isExtensionContextValid } from "../../utils/core/helpers.js";
import { createLogger } from "../../utils/core/logger.js";
import { ErrorTypes } from "../../error-management/ErrorTypes.js";
import browser from "webextension-polyfill";
import {
  CONFIG,
  TranslationMode,
  getThemeAsync,
  getSettingsAsync,
  state,
} from "../../config.js";
import { storageManager } from "@/storage/core/StorageCore.js";
import { getResolvedUserTheme } from "../../utils/ui/theme.js";
import { AUTO_DETECT_VALUE } from "../../constants.js";
import { determineTranslationMode } from "../../utils/translationModeHelper.js";
import { createTranslationRenderer, getTranslationDisplayStyles } from "../../utils/rendering/TranslationRenderer.js";
import { MessagingContexts, MessageFormat } from "../../messaging/core/MessagingCore.js";
import { MessageActions } from "@/messaging/core/MessageActions.js";
import { generateTranslationMessageId } from "../../utils/messaging/messageId.js";
import { getErrorMessage } from "../../error-management/ErrorMessages.js";
import { matchErrorToType } from "../../error-management/ErrorMatcher.js";

export default class SelectionWindows {
  constructor(options = {}) {
    // Initialize logger
    this.logger = createLogger('Content', 'SelectionWindows');
    this.fadeInDuration = options.fadeInDuration || 50;
    this.fadeOutDuration = options.fadeOutDuration || 125;
    this.isVisible = false;
    this.displayElement = null; // host element
    this.innerContainer = null; // content inside shadow
    this.removeMouseDownListener = null;
    this.translationHandler = options.translationHandler;
    this.notifier = options.notifier;
    this.originalText = null;
    this.isTranslationCancelled = false;
    this.themeChangeListener = null; // To store the theme change listener

    this.icon = null;
    this.iconClickContext = null;
    this.isIconMode = false; // Track current mode
    this.pendingTranslationWindow = false; // Flag to prevent immediate dismissal

    // Drag functionality
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };
    this.dragHandle = null;

    // **IFRAME SUPPORT**: Cross-frame communication for outside click detection
    this.isInIframe = window !== window.top;
    this.crossFrameListeners = new Set();
    this.frameId = Math.random().toString(36).substring(7);
  // Cross-frame debug (scoped)
  this.debugCrossFrame = options.debugCrossFrame === true;
  // Track if this frame has requested global relay enablement to prevent refcount leaks
  this._relayRequested = false;

    // Cross-iframe dismiss functionality - removed complex system

    this.show = this.show.bind(this);
    this.cancelCurrentTranslation = this.cancelCurrentTranslation.bind(this);
    this._handleThemeChange = this._handleThemeChange.bind(this);
    this.onIconClick = this.onIconClick.bind(this);
    this._onOutsideClick = this._onOutsideClick.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._handleCrossFrameMessage = this._handleCrossFrameMessage.bind(this);

    // Setup cross-frame communication
    this._setupCrossFrameListening();
  }

  /**
   * Setup cross-frame communication for iframe support
   */
  _setupCrossFrameListening() {
    // Listen for messages from other frames
    window.addEventListener('message', this._handleCrossFrameMessage);
  // Defer global click broadcasting until an icon/window is active
  this._globalClickHandler = null;
  this._broadcastEnabled = false;
  // Relay broadcasting: enabled across frames while any UI is active
  this._relayClickHandler = null;
  this._relayEnabled = false;
    
    // Register this frame in the global registry
    if (!window.translateItFrameRegistry) {
      window.translateItFrameRegistry = new Set();
    }
    window.translateItFrameRegistry.add(this.frameId);

    // If we're inside an iframe, register our frameId with the parent/top for precise mapping
    if (this.isInIframe) {
      try {
        const msg = { type: 'translateit-register-frame', frameId: this.frameId, timestamp: Date.now() };
        if (window.parent) window.parent.postMessage(msg, '*');
        if (window.top && window.top !== window.parent) window.top.postMessage(msg, '*');
        this._logXF('Sent translateit-register-frame');
      } catch {}
    }
  }

  /**
   * Handle cross-frame messages for outside click detection and window creation
   */
  _handleCrossFrameMessage(event) {
    if (!event.data) return;

    // Handle iframe registration (main document only)
    if (event.data.type === 'translateit-register-frame' && !this.isInIframe) {
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
            this._logXF('Registered frameId → iframe element', { frameId: event.data.frameId });
            break;
          }
        }
      } catch (e) {
        this._logXF('Failed to register frame', { error: e?.message });
      }
      return;
    }

    // Centralized request to enable/disable global click relay (main document only)
    if (event.data.type === 'translateit-set-broadcast-request' && !this.isInIframe) {
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
          if (window.translateItBroadcastCount < 0) window.translateItBroadcastCount = 0;
        }

        const shouldEnable = window.translateItBroadcastCount > 0;
        // Apply locally on main document
        this._applyGlobalClickRelay(shouldEnable);

        // Fan out apply message with final state to all iframes
        const frames = document.querySelectorAll('iframe');
        frames.forEach((frame) => {
          try {
            frame.contentWindow?.postMessage({
              type: 'translateit-set-broadcast-apply',
              enabled: shouldEnable,
              timestamp: Date.now()
            }, '*');
          } catch {}
        });
      } catch (e) {
        this._logXF('Failed broadcast request handling', { error: e?.message });
      }
      return;
    }

    // Apply global click relay state (all frames)
    if (event.data.type === 'translateit-set-broadcast-apply') {
      const enabled = !!event.data.enabled;
      this._applyGlobalClickRelay(enabled);
      // Forward to this frame's child iframes to cover nested frames
      try {
        const frames = document.querySelectorAll('iframe');
        frames.forEach((frame) => {
          try {
            frame.contentWindow?.postMessage({
              type: 'translateit-set-broadcast-apply',
              enabled,
              timestamp: Date.now()
            }, '*');
          } catch {}
        });
      } catch {}
      return;
    }

    // Handle outside click messages
    if (event.data.type === 'translateit-outside-click') {
      // Don't process our own messages (including forwarded ones from us)
      if (event.data.frameId === this.frameId || event.data.forwardedFrom === this.frameId) {
        return;
      }

      // If we're in main document and received message from iframe,
      // forward it to all other iframes (but only if not already forwarded)
      if (!this.isInIframe && event.data.isInIframe && !event.data.forwardedFrom) {
        this._forwardMessageToIframes(event.data);
      }

      // Only dismiss if we have active elements (icon or window)
      if ((this.isIconMode && this.icon) || (this.isVisible && this.displayElement)) {
        this.dismiss(true);
      }
      return;
    }

    // Handle window creation request from iframe
    if (event.data.type === 'translateit-create-window-request' && !this.isInIframe) {
      this._handleWindowCreationRequest(event.data, event.source);
      return;
    }

    // Handle window creation response to iframe
    if (event.data.type === 'translateit-window-created' && 
        event.data.targetFrameId === this.frameId) {
      this._handleWindowCreatedResponse(event.data);
      return;
    }

  // Removed iframe position request/response handling
  }

  /**
   * Forward cross-frame message to all iframes (called from main document)
   */
  _forwardMessageToIframes(originalMessage) {
    const frames = document.querySelectorAll('iframe');
    frames.forEach((frame, index) => {
      try {
        // Create forwarded message to avoid infinite loops
        const forwardedMessage = {
          ...originalMessage,
          type: 'translateit-outside-click',
          forwardedFrom: this.frameId,
          originalSender: originalMessage.frameId
        };
        
        frame.contentWindow?.postMessage(forwardedMessage, '*');
      } catch (error) {
        // Silently ignore CORS errors
      }
    });
  }

  /**
   * Handle window creation request from iframe (main document only)
   */
  _handleWindowCreationRequest(data, sourceWindow) {
    if (this.isInIframe) return; // Only main document should handle this

    try {
      // Try to find the requesting iframe and adjust coordinates
      let adjustedPosition = { ...data.position };
      try {
        // Prefer explicit frameId→iframe mapping if available
        let targetFrame = null;
        if (!this.isInIframe && window.translateItFrameMap && data.frameId && window.translateItFrameMap.has(data.frameId)) {
          targetFrame = window.translateItFrameMap.get(data.frameId);
        } else {
          // Fallback: find by sourceWindow
          const frames = document.querySelectorAll('iframe');
          for (const frame of frames) {
            if (frame.contentWindow === sourceWindow) {
              targetFrame = frame;
              break;
            }
          }
        }

        if (targetFrame) {
          const rect = targetFrame.getBoundingClientRect();
          adjustedPosition = {
            x: (data.position?.x ?? 0) + window.scrollX + rect.left,
            y: (data.position?.y ?? 0) + window.scrollY + rect.top
          };
        }
      } catch {}

      // Create window in main document with adjusted coordinates
      this._createTranslateWindowInMainDocument(data.selectedText, adjustedPosition, data.frameId);
    } catch (error) {
      this.logger.error('Failed to create window in main document:', error);
    }
  }

  // Scoped cross-frame debug logger
  _logXF(message, meta) {
    if (this.debugCrossFrame) {
      try {
        this.logger.debug(`[XF] ${message}`, meta || {});
      } catch {}
    }
  }

  /**
   * Handle window creation response (iframe only)
   */
  _handleWindowCreatedResponse(data) {
    if (!this.isInIframe) return; // Only iframes should handle this

    if (data.success) {
      // Window was successfully created in main document
      this.isVisible = true;
      this.mainDocumentWindowId = data.windowId;
      
      // Add outside click listener to handle dismissal
      this._addOutsideClickListener();
    } else {
      this.logger.error('Failed to create window in main document:', data.error);
    }
  }

  // Removed iframe position request/response methods. Parent adjusts using iframe rect at request time.

  /**
   * Broadcast outside click to other frames
   */
  _broadcastOutsideClick(originalEvent) {
    try {
      // Message for same-origin frames
      const message = {
        type: 'translateit-outside-click',
        frameId: this.frameId,
        targetFrame: 'all',
        timestamp: Date.now(),
        isInIframe: this.isInIframe,
  // Mark relay-origin to help future filtering if needed
  relayed: !!originalEvent?.__translateItRelay,
        target: {
          tagName: originalEvent.target.tagName,
          className: originalEvent.target.className?.substring(0, 50) || ''
        }
      };

      // If in iframe, broadcast to parent and top windows
      if (this.isInIframe) {
        try {
          if (window.parent) {
            window.parent.postMessage(message, '*');
          }
        } catch (error) {
          // Silently ignore CORS errors
        }

        try {
          if (window.top && window.top !== window.parent) {
            window.top.postMessage(message, '*');
          }
        } catch {
          // Silently ignore CORS errors
        }
      }

      // Always broadcast to all child frames
      const frames = document.querySelectorAll('iframe');
      frames.forEach((frame, index) => {
        try {
          frame.contentWindow?.postMessage(message, '*');
        } catch {
          // Silently ignore CORS errors
        }
      });

    } catch (error) {
      // Silently ignore errors
    }
  }

  _enableGlobalClickBroadcast() {
    if (this._broadcastEnabled) return;
    this._globalClickHandler = (e) => this._broadcastOutsideClick(e);
    document.addEventListener('click', this._globalClickHandler, { capture: true });
    this._broadcastEnabled = true;
  }

  _disableGlobalClickBroadcast() {
    if (!this._broadcastEnabled) return;
    if (this._globalClickHandler) {
      document.removeEventListener('click', this._globalClickHandler, { capture: true });
      this._globalClickHandler = null;
    }
    this._broadcastEnabled = false;
  }

  // Apply or remove a lightweight relay click handler in this frame
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
          // Tag the event so receivers know it's from relay
          try { Object.defineProperty(e, '__translateItRelay', { value: true, enumerable: false }); } catch {}
          this._broadcastOutsideClick(e);
        };
        document.addEventListener('click', this._relayClickHandler, { capture: true });
        this._relayEnabled = true;
        this._logXF('Relay click enabled in frame', { frameId: this.frameId });
      } else {
        if (!this._relayEnabled) return;
        if (this._relayClickHandler) {
          document.removeEventListener('click', this._relayClickHandler, { capture: true });
          this._relayClickHandler = null;
        }
        this._relayEnabled = false;
        this._logXF('Relay click disabled in frame', { frameId: this.frameId });
      }
    } catch (e) {
      this._logXF('Failed to apply relay state', { error: e?.message });
    }
  }

  // Request main document to enable/disable relay across all frames
  _broadcastGlobalClickRelay(enable) {
    try {
  // Update local request flag
  this._relayRequested = !!enable;
      const msg = { type: 'translateit-set-broadcast-request', enabled: !!enable, timestamp: Date.now() };
      if (this.isInIframe) {
        if (window.parent) window.parent.postMessage(msg, '*');
        if (window.top && window.top !== window.parent) window.top.postMessage(msg, '*');
      } else {
        // If we're main document, handle directly as if we received the request
        this._handleCrossFrameMessage({ data: msg, source: window });
      }
    } catch {}
  }

  _getTopDocument() {
    // Try to get the topmost document accessible
    let currentWindow = window;
    let topDocument = document;

    try {
      // Traverse up the window hierarchy
      while (currentWindow.parent !== currentWindow) {
        try {
          // Test if we can access the parent document
          const parentDoc = currentWindow.parent.document;
          if (parentDoc) {
            topDocument = parentDoc;
            currentWindow = currentWindow.parent;
          } else {
            break;
          }
        } catch {
          // Cross-origin restriction, can't go higher
          break;
        }
      }
    } catch (e) {
      // If anything fails, use current document
      this.logger.warn(
        "Could not access top document, using current:",
        e
      );
    }

    return topDocument;
  }

  /**
   * Request window creation in main document (called from iframe)
   */
  _requestWindowCreationInMainDocument(selectedText, position) {
    try {
      this.logger.debug('Requesting window creation in main document', {
        originalPosition: position,
        frameId: this.frameId
      });
      
      const message = {
        type: 'translateit-create-window-request',
        frameId: this.frameId,
        selectedText: selectedText,
        position: position,
        timestamp: Date.now()
      };

      // Send to parent and top windows
      if (window.parent) {
        window.parent.postMessage(message, '*');
      }
      
      if (window.top && window.top !== window.parent) {
        window.top.postMessage(message, '*');
      }
    } catch (error) {
      this.logger.error('Failed to request window creation:', error);
      // Fallback to creating window in iframe
      this._createTranslateWindowInIframe(selectedText, position);
    }
  }

  /**
   * Create window in main document (called from main document)
   */
  async _createTranslateWindowInMainDocument(selectedText, position, requestingFrameId) {
    try {
      // Store the requesting frame ID for later reference
      this.requestingFrameId = requestingFrameId;
      
      // **IFRAME COORDINATE FIX**: Position is already adjusted from iframe to main document
      // Mark it as already adjusted to prevent double calculation
      const adjustedPosition = { 
        ...position, 
        _alreadyAdjusted: true
      };
      
      this.logger.debug('Creating window in main document for iframe', {
        requestingFrameId,
        position: adjustedPosition
      });
      
      // Create the window normally in main document
      await this._createTranslateWindowDirectly(selectedText, adjustedPosition);
      
      // Notify the requesting iframe that window was created
      this._notifyFrameWindowCreated(requestingFrameId, true);
      
    } catch (error) {
      this.logger.error('Failed to create window in main document:', error);
      this._notifyFrameWindowCreated(requestingFrameId, false, error.message);
    }
  }

  /**
   * Notify iframe that window was created
   */
  _notifyFrameWindowCreated(frameId, success, error = null) {
    const message = {
      type: 'translateit-window-created',
      targetFrameId: frameId,
      success: success,
      windowId: this.displayElement?.id || null,
      error: error,
      timestamp: Date.now()
    };

    // Broadcast to all iframes
    const frames = document.querySelectorAll('iframe');
    frames.forEach((frame) => {
      try {
        frame.contentWindow?.postMessage(message, '*');
      } catch (error) {
        // Silently ignore CORS errors
      }
    });
  }

  /**
   * Fallback: Create window in iframe if main document communication fails
   */
  _createTranslateWindowInIframe(selectedText, position) {
    this.logger.warn('Creating window in iframe as fallback');
    return this._createTranslateWindowDirectly(selectedText, position);
  }

  /**
   * Actually create the translation window (extracted from original method)
   */
  async _createTranslateWindowDirectly(selectedText, position) {
    this.originalText = selectedText;
    this.isTranslationCancelled = false;
    this.isIconMode = false; // Now in window mode

    const translationMode = determineTranslationMode(
      selectedText,
      TranslationMode.Selection
    );

    this.logger.debug("Creating translation window directly", { 
      translationMode, 
      isInIframe: this.isInIframe 
    });

    this.displayElement = document.createElement("div");
    this.displayElement.classList.add("aiwc-selection-popup-host");
    
    // Generate unique ID for window tracking
    this.displayElement.id = `translate-window-${this.frameId || 'main'}-${Date.now()}`;

    // Apply theme class to host before appending to body
    await this._applyThemeToHost();
    this._addThemeChangeListener(); // Add listener for theme changes
    this.applyInitialStyles(position);

    const shadowRoot = this.displayElement.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    if (style) {
      // CSS variables will be scoped to the shadow DOM via :host
      // These variables will be updated based on :host(.theme-light) or :host(.theme-dark)
      style.textContent = `
        :host {
          --sw-bg-color: #f8f8f8; --sw-text-color: #333; --sw-border-color: #ddd; --sw-shadow-color: rgba(0,0,0,0.1);
          --sw-original-text-color: #000; --sw-loading-dot-opacity-start: 0.3; --sw-loading-dot-opacity-mid: 0.8;
          --sw-link-color: #0066cc; font-family: Vazirmatn, "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        }
        :host(.theme-dark) {
          --sw-bg-color: #2a2a2a; --sw-text-color: #e0e0e0; --sw-border-color: #444; --sw-shadow-color: rgba(255,255,255,0.08);
          --sw-original-text-color: #fff; --sw-loading-dot-opacity-start: 0.5; --sw-loading-dot-opacity-mid: 1; --sw-link-color: #58a6ff;
        }
        .popup-container { background-color: var(--sw-bg-color); color: var(--sw-text-color); border: 1px solid var(--sw-border-color);
          border-radius: 4px; padding: 8px 12px; font-size: 14px; box-shadow: 0 2px 8px var(--sw-shadow-color); max-width: 300px; overflow-wrap: break-word;
        }
        
        /* Unified Translation Display Styles */
        ${getTranslationDisplayStyles()}
        .loading-container { display: flex; justify-content: center; align-items: center; color: var(--sw-text-color); }
        @keyframes blink { 0% { opacity: var(--sw-loading-dot-opacity-start); } 50% { opacity: var(--sw-loading-dot-opacity-mid); } 100% { opacity: var(--sw-loading-dot-opacity-start); } }
        .loading-dot { font-size: 1.2em; margin: 0 2px; animation: blink 0.7s infinite; }
        .first-line { margin-bottom: 6px; display: flex; align-items: center; 
          user-select: none; padding: 6px 8px; margin: -8px -12px 6px -12px; 
          background-color: var(--sw-border-color); border-radius: 4px 4px 0 0; 
          border-bottom: 1px solid var(--sw-border-color); opacity: 0.9;
        }
        .first-line:hover { opacity: 1; }
        .original-text { font-weight: bold; margin-left: 6px; color: var(--sw-original-text-color); }
        .second-line { margin-top: 4px; }
        .tts-icon { width: 16px; height: 16px; cursor: pointer; margin-right: 6px; vertical-align: middle; }
        :host(.theme-dark) .tts-icon { filter: invert(90%) brightness(1.1); }
        .text-content a { color: var(--sw-link-color); text-decoration: none; }
        .text-content a:hover { text-decoration: underline; }
      `;
      shadowRoot.appendChild(style);
    }

    this.innerContainer = document.createElement("div");
    this.innerContainer.classList.add("popup-container");
    shadowRoot.appendChild(this.innerContainer);
    const loading = this.createLoadingDots();
    this.innerContainer.appendChild(loading);

    // **IFRAME FIX**: Always append to current document for proper positioning
    // The cross-frame communication ensures the window is created in main document when needed
    document.body.appendChild(this.displayElement);
    this.isVisible = true;

    // Add drag functionality
    this._setupDragHandlers();

    requestAnimationFrame(() => {
      if (this.displayElement) {
        this.displayElement.style.opacity = "0.95";
        this.displayElement.style.transform = "scale(1)";
      }
    });

    // Use same approach as SelectElement - direct messaging with manual listener
    try {
      const settings = await getSettingsAsync();
      
      // Generate messageId for tracking  
      const messageId = generateTranslationMessageId('content');
      this.logger.debug(`Generated messageId: ${messageId}`);
      
      // Set up direct listener like SelectElement does
      const resultPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (messageListener) {
            browser.runtime.onMessage.removeListener(messageListener);
          }
          reject(new Error('Translation timeout'));
        }, 30000);
        
        const messageListener = (message) => {
          this.logger.debug(`Received message: ${message.action}, messageId: ${message.messageId}, expected: ${messageId}`);
          
          if (message.action === MessageActions.TRANSLATION_RESULT_UPDATE && 
              message.messageId === messageId) {
            this.logger.operation("Message matched! Processing translation result");
            clearTimeout(timeout);
            browser.runtime.onMessage.removeListener(messageListener);
            
            if (message.data?.success === false && message.data?.error) {
              this.logger.error("Translation error received", message.data.error);
              const errorMessage = message.data.error.message || 'Translation failed';
              reject(new Error(errorMessage));
            } else if (message.data?.translatedText) {
              this.logger.operation("Translation success received");
              resolve({ translatedText: message.data.translatedText });
            } else {
              this.logger.error("Unexpected message data", message.data);
              reject(new Error('No translated text in result'));
            }
          }
        };
        
        browser.runtime.onMessage.addListener(messageListener);
      });
      
      // Send translation request using browser.runtime.sendMessage directly
      const payload = {
        text: selectedText,
        from: settings.SOURCE_LANGUAGE || 'auto',
        to: settings.TARGET_LANGUAGE || 'fa',
        provider: settings.TRANSLATION_API || 'google',
        messageId: messageId,
        mode: translationMode,
        options: {}
      };
      
      this.logger.debug("Sending translation request with payload", payload);
      
      // Send the translation request using correct action (TRANSLATE, not TRANSLATE_TEXT)
      browser.runtime.sendMessage({
        action: MessageActions.TRANSLATE,
        context: 'content',
        messageId: messageId,
        data: {
          text: payload.text,
          provider: payload.provider,
          sourceLanguage: payload.from,
          targetLanguage: payload.to,
          mode: payload.mode,
          options: payload.options
        }
      });

      // Wait for the result
      const result = await resultPromise;
      
      if (this.isTranslationCancelled || !this.innerContainer) return;
      
      if (result && result.translatedText) {
        const translatedText = result.translatedText;
        if (!translatedText) {
          throw new Error(ErrorTypes.TRANSLATION_NOT_FOUND);
        }
        
        this.transitionToTranslatedText(
          translatedText,
          loading,
          selectedText,
          translationMode
        );
      } else {
        throw new Error('Translation failed: No translated text received');
      }
      
    } catch (error) {
      if (this.isTranslationCancelled || !this.innerContainer) return;
      await this.handleTranslationError(error, loading);
    }

    // Add outside click listener after translation window is ready AND
    // pendingTranslationWindow flag is false.
    // The timeout here ensures that the click event that initiated the window creation
    // has fully propagated and won't be caught by this new listener.
    // CRITICAL: This timeout must be LONGER than the timeout in onIconClick (500ms)
    // to ensure pendingTranslationWindow is already false when we check it
    setTimeout(() => {
      this.logger.debug('Checking if should add outside click listener for translation window', {
        isVisible: this.isVisible,
        hasDisplayElement: !!this.displayElement,
        pendingTranslationWindow: this.pendingTranslationWindow,
        shouldAdd: this.isVisible && this.displayElement && !this.pendingTranslationWindow
      });

      // Ensure we only add the listener if the window is still supposed to be visible
      // and we are NOT in the process of transitioning (pendingTranslationWindow is false).
      if (
        this.isVisible &&
        this.displayElement &&
        !this.pendingTranslationWindow
      ) {
        this.logger.debug('Adding outside click listener for translation window');
        this._addOutsideClickListener();
      } else {
        this.logger.debug('NOT adding outside click listener for translation window');
      }
    }, 600); // MUST be > 500ms to ensure pendingTranslationWindow is reset
  }

  _calculateCoordsForTopWindow(position) {
    // **ENHANCED IFRAME SUPPORT**: Better coordinate calculation for nested iframes
    if (window !== window.top) {
      try {
        let totalOffsetX = position.x;
        let totalOffsetY = position.y;
        let currentWindow = window;

        this.logger.debug('Calculating iframe coordinates', {
          originalPosition: position,
          isInIframe: this.isInIframe,
          frameId: this.frameId,
          windowVsTop: window !== window.top
        });

        // Add iframe offsets up the chain
        while (currentWindow.parent !== currentWindow) {
          try {
            const frameElement = currentWindow.frameElement;
            if (frameElement) {
              const frameRect = frameElement.getBoundingClientRect();
              const parentWindow = currentWindow.parent;
              
              // Add iframe position offset
              totalOffsetX += frameRect.left + parentWindow.scrollX;
              totalOffsetY += frameRect.top + parentWindow.scrollY;
              
              // Add any CSS transforms or borders
              const computedStyle = parentWindow.getComputedStyle(frameElement);
              const borderLeft = parseInt(computedStyle.borderLeftWidth) || 0;
              const borderTop = parseInt(computedStyle.borderTopWidth) || 0;
              
              totalOffsetX += borderLeft;
              totalOffsetY += borderTop;
              
              this.logger.debug('Added iframe offset', {
                frameRect: { left: frameRect.left, top: frameRect.top },
                borders: { left: borderLeft, top: borderTop },
                cumulativeOffset: { x: totalOffsetX, y: totalOffsetY }
              });
              
              currentWindow = parentWindow;
            } else {
              // No frameElement accessible (likely cross-origin) – stop accumulating; use best effort so far
              break;
            }
          } catch (e) {
            // Cross-origin restriction
            this.logger.warn('Cross-origin restriction in iframe offset calculation:', e.message);
            // No reliable fallback; keep current accumulated offset only
            break;
          }
        }

        const finalPosition = { x: totalOffsetX, y: totalOffsetY };
        this.logger.debug('Final calculated position for top window', {
          original: position,
          final: finalPosition,
          difference: { x: finalPosition.x - position.x, y: finalPosition.y - position.y }
        });
        
        return finalPosition;
      } catch (e) {
        this.logger.warn("Could not calculate top window coords:", e);
      }
    }

    this.logger.debug('No iframe conversion needed, using original position', position);
    return position;
  }

  async _applyThemeToHost() {
    if (!this.displayElement) return;
    const storedTheme = await getThemeAsync();
    const resolvedTheme = getResolvedUserTheme(storedTheme); // Resolves 'auto' to 'light' or 'dark'
    this.displayElement.classList.remove("theme-light", "theme-dark");
    this.displayElement.classList.add(`theme-${resolvedTheme}`);
  }

  _handleThemeChange({ newValue }) {
    if (newValue && this.displayElement && this.isVisible) {
      this.logger.debug("Theme changed, updating popup theme", newValue);
      this._applyThemeToHost();
    }
  }

  _addThemeChangeListener() {
    if (!this.themeChangeListener) {
      // Store the bound function so it can be correctly removed
      this.boundHandleThemeChange = this._handleThemeChange.bind(this);
      storageManager.on("change:THEME", this.boundHandleThemeChange);
      // logME("[SelectionWindows] Theme change listener added with StorageManager.");
    }
  }

  _removeThemeChangeListener() {
    if (this.boundHandleThemeChange) {
      storageManager.off("change:THEME", this.boundHandleThemeChange);
      this.boundHandleThemeChange = null; // Clear the stored listener
      // logME("[SelectionWindows] Theme change listener removed from StorageManager.");
    }
  }

  async show(selectedText, position) {
    if (!isExtensionContextValid()) return;
    
    this.logger.debug('🎯 WindowsManager.show() called', {
      text: selectedText ? selectedText.substring(0, 30) + '...' : 'null',
      position,
      isVisible: this.isVisible,
      isIconMode: this.isIconMode,
      originalText: this.originalText ? this.originalText.substring(0, 30) + '...' : 'null'
    });
    
    // **FIX FOR DISCORD**: Prevent showing same text multiple times
    // But still allow showing if no window is currently visible (user dismissed it)
    if (selectedText && 
        this.isVisible && 
        ((this.originalText === selectedText) ||
         (this.isIconMode && this.iconClickContext && this.iconClickContext.text === selectedText))) {
      this.logger.debug('Skipping show - same text already displayed', {
        text: selectedText.substring(0, 30) + '...',
        isVisible: this.isVisible,
        isIconMode: this.isIconMode
      });
      return;
    }
    
    this.dismiss(false);
    if (!selectedText) return;

    const settings = await getSettingsAsync();
    const selectionTranslationMode =
      settings.selectionTranslationMode || CONFIG.selectionTranslationMode;

    this.logger.debug('📋 Selection translation mode', { mode: selectionTranslationMode });

    if (selectionTranslationMode === "onClick") {
      this.isIconMode = true;
      this.logger.debug('🔸 Creating icon for onClick mode');
      this._createTranslateIcon(selectedText, position);
    } else {
      this.isIconMode = false;
      this.logger.debug('🔹 Creating window for immediate mode');
      this._createTranslateWindow(selectedText, position);
    }
  }

  _createTranslateIcon(selectedText, position) {
    try {
      this.logger.debug('Starting _createTranslateIcon', { selectedText, position });
      
      // **IFRAME FIX**: Use passed position instead of recalculating from selection
      // This avoids issues where selection is lost between calls
      if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
        this.logger.warn('Invalid position provided, trying to get from selection');
        const selection = window.getSelection();
        this.logger.debug('Got selection', { rangeCount: selection.rangeCount });
        if (selection.rangeCount === 0) {
          this.logger.warn('No selection range found, returning');
          return;
        }
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        this.logger.debug('Got selection rect', { rect });
        // Calculate position from selection
        position = {
          x: window.scrollX + rect.left + rect.width / 2 - 12,
          y: window.scrollY + rect.bottom + 5,
        };
      } else {
        this.logger.debug('Using provided position', { position });
      }

      const topDocument = this._getTopDocument();
      this.logger.debug('Got top document', { hasTopDocument: !!topDocument, hasBody: !!topDocument?.body });
      if (!topDocument?.body) {
        this.logger.warn("Cannot access top document body");
        return;
      }

      // **IFRAME FIX**: Use appropriate document based on iframe context
      const targetDocument = this.isInIframe ? document : topDocument;
      const hostId = "aiwc-selection-icon-host";
      let iconHost = targetDocument.getElementById(hostId);
      this.logger.debug('Checking for icon host', { hostId, hasExistingHost: !!iconHost, isInIframe: this.isInIframe, targetDocument: targetDocument === document ? 'iframe' : 'top' });
      
      if (!iconHost) {
        try {
          this.logger.debug('Creating new icon host');
          iconHost = targetDocument.createElement("div");
          iconHost.id = hostId;
          targetDocument.body.appendChild(iconHost);
          this.logger.debug('Successfully created and appended icon host');
        } catch (e) {
          this.logger.error("Failed to create icon host container", e);
          return;
        }
      }

      // **IFRAME FIX**: Create icon in appropriate document
      this.logger.debug('Creating icon element');
      this.icon = targetDocument.createElement("div");
      this.icon.id = "translate-it-icon";
      this.logger.debug('Created icon element', { iconId: this.icon.id });

      const iconUrl = browser.runtime.getURL("icons/extension_icon_32.png");
      this.logger.debug('Got icon URL', { iconUrl });

      // Use the position that was already calculated (either from parameter or selection)
      const originalPosition = {
        x: position.x,
        y: position.y,
      };
      this.logger.debug('Using position for icon - DETAILED', { 
        originalPosition,
        inputPosition: position,
        xValue: position.x,
        yValue: position.y,
        positionType: typeof position.x
      });
      
      // **IFRAME FIX**: Don't transform coordinates if creating icon in iframe
      const iconPosition = this.isInIframe ? originalPosition : this._calculateCoordsForTopWindow(originalPosition);
      this.logger.debug('Calculated icon position', { iconPosition, coordinateTransformed: !this.isInIframe });

      // **IFRAME FIX**: Get appropriate window for positioning
      const targetWindow = this.isInIframe ? window : (topDocument.defaultView || topDocument.parentWindow || window);
      this.logger.debug('Got target window', { hasTargetWindow: !!targetWindow, isIframeWindow: this.isInIframe });

      // Calculate final position with scroll offset and proper icon placement
      // Adjust position to place icon below and centered relative to the selection
      const iconSize = 24; // icon width/height
      const finalPosition = {
        left: iconPosition.x - targetWindow.scrollX - (iconSize / 2), // Center horizontally
        top: iconPosition.y - targetWindow.scrollY + 5 // Place slightly below selection
      };
      this.logger.debug('Final icon position DETAILED', { 
        step1_iconPosition: iconPosition, 
        step2_windowScroll: { x: targetWindow.scrollX, y: targetWindow.scrollY },
        step3_iconSize: iconSize,
        step4_finalCalculation: {
          left: `${iconPosition.x} - ${targetWindow.scrollX} - ${iconSize/2} = ${finalPosition.left}`,
          top: `${iconPosition.y} - ${targetWindow.scrollY} + 5 = ${finalPosition.top}`,
          breakdown: {
            iconPositionX: iconPosition.x,
            scrollX: targetWindow.scrollX, 
            iconHalfSize: iconSize/2,
            finalLeft: finalPosition.left,
            iconPositionY: iconPosition.y,
            scrollY: targetWindow.scrollY,
            offset: 5,
            finalTop: finalPosition.top
          }
        },
        finalPosition,
        viewport: { width: targetWindow.innerWidth, height: targetWindow.innerHeight },
        isInsideViewport: {
          x: finalPosition.left >= 0 && finalPosition.left <= targetWindow.innerWidth,
          y: finalPosition.top >= 0 && finalPosition.top <= targetWindow.innerHeight
        }
      });

      // --- شروع تغییرات برای افزودن انیمیشن ---

      // 1. تعریف استایل‌های اولیه (حالت شروع انیمیشن)
      this.logger.debug('Applying styles to icon');
      Object.assign(this.icon.style, {
        position: "fixed", // Use fixed for iframe escape
        zIndex: "2147483647",
        left: `${finalPosition.left}px`,
        top: `${finalPosition.top}px`,
        width: "24px",
        height: "24px",
        backgroundColor: "#f0f0f0",
        backgroundImage: `url('${iconUrl}')`,
        backgroundSize: "16px 16px",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        borderRadius: "50%",
        border: "1px solid #ccc",
        cursor: "pointer",
        boxShadow: "0 2px 5px rgba(0,0,0,0.2)",

        // --- ویژگی‌های انیمیشن ---
        opacity: "0", // شروع از حالت نامرئی
        transform: "scale(0.5)", // شروع از اندازه کوچک‌تر
        transformOrigin: "bottom center", // نقطه شروع بزرگ‌نمایی از پایین و وسط آیکون
        transition:
          "opacity 120ms ease-out, transform 120ms cubic-bezier(0.34, 1.56, 0.64, 1)", // انیمیشن برای شفافیت و اندازه
      });
      this.logger.debug('Applied styles to icon');

      // 2. افزودن آیکون به صفحه (top document's HOST برای iframe escape)
      this.logger.debug('Appending icon to host');
      iconHost.appendChild(this.icon);
      this.logger.debug('Successfully appended icon to host');

      // Debug: Check if icon is actually visible
      setTimeout(() => {
        if (this.icon) {
          const iconRect = this.icon.getBoundingClientRect();
          const isVisible = iconRect.width > 0 && iconRect.height > 0;
          const computedStyle = targetWindow.getComputedStyle(this.icon);
          const targetDocument = this.isInIframe ? document : topDocument;
          
          this.logger.debug('Icon visibility check EXPANDED', {
            iconRect: {
              left: iconRect.left,
              top: iconRect.top,
              right: iconRect.right,
              bottom: iconRect.bottom,
              width: iconRect.width,
              height: iconRect.height
            },
            viewport: {
              width: targetWindow.innerWidth,
              height: targetWindow.innerHeight
            },
            isVisible,
            computedOpacity: computedStyle.opacity,
            computedDisplay: computedStyle.display,
            computedVisibility: computedStyle.visibility,
            computedPosition: computedStyle.position,
            computedZIndex: computedStyle.zIndex,
            parentElement: this.icon.parentElement?.tagName,
            inDocument: targetDocument.contains(this.icon),
            actualStyleValues: {
              left: this.icon.style.left,
              top: this.icon.style.top,
              position: this.icon.style.position
            },
            targetContext: this.isInIframe ? 'iframe' : 'top-document',
            isOffScreen: {
              left: iconRect.right < 0,
              right: iconRect.left > targetWindow.innerWidth, 
              top: iconRect.bottom < 0,
              bottom: iconRect.top > targetWindow.innerHeight
            }
          });
          
          // Only reposition if icon is completely off-screen (not just partially)
          const completelyOffScreen = (
            iconRect.right < 0 || // completely left of screen
            iconRect.left > targetWindow.innerWidth || // completely right of screen
            iconRect.bottom < 0 || // completely above screen
            iconRect.top > targetWindow.innerHeight // completely below screen
          );
          
          this.logger.debug('Off-screen detection result', {
            completelyOffScreen,
            checks: {
              rightLessThanZero: iconRect.right < 0,
              leftGreaterThanWidth: iconRect.left > targetWindow.innerWidth,
              bottomLessThanZero: iconRect.bottom < 0,
              topGreaterThanHeight: iconRect.top > targetWindow.innerHeight
            }
          });
          
          if (completelyOffScreen) {
            this.logger.warn('Icon appears to be completely off-screen, attempting to reposition');
            this.icon.style.left = '100px';
            this.icon.style.top = '100px';
          }
        }
      }, 100);

      // 3. با یک تأخیر بسیار کوتاه، استایل نهایی را اعمال کن تا انیمیشن اجرا شود
      setTimeout(() => {
        // اطمینان از اینکه آیکون هنوز در صفحه وجود دارد
        if (this.icon) {
          this.logger.debug('Applying final animation styles');
          this.icon.style.opacity = "1";
          this.icon.style.transform = "scale(1)";
        }
      }, 10); // یک تأخیر کوتاه برای اجرای صحیح انیمیشن کافی است

      this.logger.debug('Setting up icon click context and listeners');
      this.iconClickContext = { text: selectedText, position };
      this.icon.addEventListener("click", this.onIconClick);

      // Add outside click listener for icon dismissal
      this._addOutsideClickListener();
      this.logger.debug('Icon creation completed successfully');
    } catch (error) {
      this.logger.error('Error in _createTranslateIcon:', error);
      const handler = new ErrorHandler();
      handler.handle(error, { type: ErrorTypes.CONTEXT, context: 'SelectionWindows-_createTranslateIcon' });
    }
  }

  onIconClick(e) {
    e.preventDefault();
    e.stopPropagation();

    if (this.iconClickContext) {
      const { text, position } = this.iconClickContext;

      // ------------------- START: APPLIED CHANGE -------------------
      // 1. Immediately remove the outside click listener associated with the icon.
      //    This prevents the click that opened the window from also closing it.
      this._removeOutsideClickListener();
      // ------------------- END: APPLIED CHANGE -------------------

      // Set flag to prevent immediate dismissal during transition
      this.pendingTranslationWindow = true;

      // **FIX FOR DISCORD**: Prevent new text field icons from being created
      // This is especially important for Discord where focus/blur events 
      // might trigger during the transition from icon to translation window
      if (state && typeof state === 'object') {
        state.preventTextFieldIconCreation = true;
      }

      // Clean up icon visuals.
      // The 'false' argument to _cleanupIcon means it won't try to remove the outside click listener again,
      // which is correct because we've just manually removed it.
      // This maintains compatibility with how _cleanupIcon is used elsewhere (e.g., in dismiss()).
      this._cleanupIcon(false); // Icon visuals and its specific event listeners are cleaned.

      // Create translation window with original position
      this._createTranslateWindow(text, position);

      // Reset flags after a longer delay to ensure translation window is fully established
      // This is increased from 100ms to 500ms to handle Discord's complex event handling
      setTimeout(() => {
        this.pendingTranslationWindow = false;
        if (state && typeof state === 'object') {
          state.preventTextFieldIconCreation = false;
        }
      }, 500); // Increased timeout for Discord compatibility
    }
  }

  async _createTranslateWindow(selectedText, position) {
    if (
      !isExtensionContextValid() ||
      !selectedText ||
      (this.isVisible && selectedText === this.originalText)
    ) {
      return;
    }

    // **IFRAME WINDOW CREATION FIX**: If we're in an iframe, request main document to create window
    if (this.isInIframe) {
      return this._requestWindowCreationInMainDocument(selectedText, position);
    }

    // Otherwise create window directly (we're in main document or using fallback)
    return this._createTranslateWindowDirectly(selectedText, position);
  }

  _onOutsideClick(e) {
    // Note: Cross-frame broadcasting is handled by global click handler
    // No need to broadcast here to avoid double broadcasting

    // Prevent dismissal if we're in the middle of transitioning from icon to window
    if (this.pendingTranslationWindow) {
      return;
    }

    // Check if we should dismiss based on any visible elements
    const shouldDismiss = this._shouldDismissOnOutsideClick(e);
    
    if (shouldDismiss) {
      this.dismiss(true);
    }
  }

  /**
   * Determine if outside click should trigger dismissal
   */
  _shouldDismissOnOutsideClick(e) {
    // Handle icon mode
    if (this.isIconMode && this.icon) {
      const isClickInsideIcon = this.icon.contains(e.target);
      return !isClickInsideIcon; // Dismiss if click is outside icon
    }

    // Handle translation window mode
    if (this.displayElement && this.isVisible) {
      // Check if click target is inside our popup
      const isClickInsidePopup = this.displayElement.contains(e.target);

      // Check for potential icon clicks (safety check)
      const topDocument = this._getTopDocument();
      const clickedIcon = topDocument.getElementById("translate-it-icon");
      const isClickOnIcon = clickedIcon && clickedIcon.contains(e.target);

      return !isClickInsidePopup && !isClickOnIcon; // Dismiss if click is outside popup and not on icon
    }

    // No active elements, no need to dismiss
    return false;
  }

  _addOutsideClickListener() {
    if (!isExtensionContextValid()) return;

    // Remove existing listener first
    this._removeOutsideClickListener();

    // Add listener to current document only
    // Cross-frame detection relies on postMessage system
    document.addEventListener("click", this._onOutsideClick, {
      capture: true,
    });

  // Enable cross-frame broadcast while an icon/window is active
  this._enableGlobalClickBroadcast();
  // Ensure all frames relay clicks while UI is active
  this._broadcastGlobalClickRelay(true);

    // Store removal function
    this.removeMouseDownListener = () => {
      document.removeEventListener("click", this._onOutsideClick, {
        capture: true,
      });
      // Disable cross-frame broadcast if nothing is visible anymore
      if (!this.icon && !this.displayElement) {
        this._disableGlobalClickBroadcast();
          // Ask main to disable relay if no UI remains
          this._broadcastGlobalClickRelay(false);
      }
    };
  }

  _removeOutsideClickListener() {
    if (this.removeMouseDownListener) {
      this.removeMouseDownListener();
      this.removeMouseDownListener = null;
    }
    // Also ensure we don't keep broadcasting when nothing is shown
    if (!this.icon && !this.displayElement) {
      this._disableGlobalClickBroadcast();
    }
  }

  cancelCurrentTranslation() {
    this.dismiss(); // This will handle fadeOut and removal
    this.isTranslationCancelled = true;
    // this.originalText = null; // These are reset in removeElement
    // this.translatedText = null;
    this.stoptts_playing();
  }

  stoptts_playing() {
    try {
      // Stop any playing audio elements (Google TTS)
      const audioElements = document.querySelectorAll('audio');
      audioElements.forEach(audio => {
        audio.pause();
        audio.src = "";
      });
      
      this.logger.debug("TTS stopped");
    } catch (error) {
      this.logger.warn("Error stopping TTS", error);
    }
  }

  /**
   * Unified TTS method - same pattern as useTTSSimple
   * @param {string} text - Text to speak
   */
  async speakTextUnified(text) {
    if (!text || !text.trim()) {
      this.logger.warn("No text provided for TTS");
      return;
    }

    try {
      this.logger.debug("Speaking via background Google TTS:", text.substring(0, 50) + "...");

      // For content scripts, delegate to background to avoid CSP issues
      const language = this.detectSimpleLanguage(text) || "en";
      
      await browser.runtime.sendMessage({
        action: MessageActions.GOOGLE_TTS_SPEAK,
        data: {
          text: text.trim(),
          language: language
        }
      });

      this.logger.debug("Background Google TTS request sent successfully");
    } catch (error) {
      this.logger.error("Background Google TTS failed:", error);
      throw error;
    }
  }

  /**
   * Direct Google TTS API - same as useTTSSmart
   * @param {string} text - Text to speak
   * @param {string} language - Language code
   * @returns {Promise}
   */
  speakWithGoogleTTS(text, language) {
    return new Promise((resolve, reject) => {
      try {
        const ttsUrl = `https://translate.google.com/translate_tts?client=tw-ob&q=${encodeURIComponent(text)}&tl=${language}`;
        
        const audio = new Audio(ttsUrl);
        
        // Add timeout
        const timeout = setTimeout(() => {
          audio.pause();
          audio.src = "";
          reject(new Error('Google TTS timeout'));
        }, 15000);
        
        audio.onended = () => {
          clearTimeout(timeout);
          this.logger.debug("Google TTS audio completed");
          resolve();
        };
        
        audio.onerror = (error) => {
          clearTimeout(timeout);
          this.logger.error("Google TTS audio error:", error);
          reject(new Error(`Google TTS failed: ${error.message}`));
        };
        
        audio.play().catch((playError) => {
          clearTimeout(timeout);
          reject(new Error(`Google TTS play failed: ${playError.message}`));
        });
        
        this.logger.debug("Google TTS audio started");
        
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Simple language detection for TTS
   * @param {string} text - Text to analyze
   * @returns {string} Language code
   */
  detectSimpleLanguage(text) {
    // Simple patterns for major languages
    const patterns = {
      'fa': /[\u06A9\u06AF\u06C0-\u06D3]/,  // Persian specific chars
      'ar': /[\u0600-\u06FF]/,              // Arabic/Persian range
      'zh': /[\u4E00-\u9FFF]/,              // Chinese
      'ja': /[\u3040-\u309F\u30A0-\u30FF]/, // Japanese  
      'ko': /[\uAC00-\uD7AF]/,              // Korean
      'ru': /[\u0400-\u04FF]/,              // Russian
    };

    // Check patterns in priority order
    for (const [lang, pattern] of Object.entries(patterns)) {
      if (pattern.test(text)) {
        return lang;
      }
    }
    
    return 'en'; // Default to English
  }

  applyInitialStyles(position) {
    // **IFRAME COORDINATE FIX**: Check if coordinates are already adjusted from iframe
    let topWindowPosition;
    if (position._alreadyAdjusted) {
      // Position is already calculated relative to top window, use as-is
      topWindowPosition = { x: position.x, y: position.y };
      this.logger.debug('Using pre-adjusted coordinates from iframe', topWindowPosition);
    } else {
      // Calculate coordinates relative to top window if in iframe
      topWindowPosition = this._calculateCoordsForTopWindow(position);
    }

    // Calculate smart position that stays within viewport
    const smartPosition = this.calculateSmartPosition(topWindowPosition);

    // Get top document for proper viewport calculations
    const topDocument = this._getTopDocument();
    const topWindow =
      topDocument.defaultView || topDocument.parentWindow || window;

    Object.assign(this.displayElement.style, {
      position: "fixed", // Use fixed instead of absolute to escape iframe constraints
      zIndex: "2147483647", // Maximum z-index to ensure it's always on top
      left: `${smartPosition.x - topWindow.scrollX}px`, // Adjust for scroll since we're using fixed
      top: `${smartPosition.y - topWindow.scrollY}px`, // Adjust for scroll since we're using fixed
      transform: "scale(0.1)",
      transformOrigin: smartPosition.origin,
      opacity: "0",
      transition: `transform 0.1s ease-out, opacity ${this.fadeInDuration}ms ease-in-out`,
    });
  }

  calculateSmartPosition(position) {
    // Get top window for proper viewport calculations
    const topDocument = this._getTopDocument();
    const topWindow =
      topDocument.defaultView || topDocument.parentWindow || window;

    // Get viewport dimensions from top window
    const viewport = {
      width: topWindow.innerWidth,
      height: topWindow.innerHeight,
      scrollX: topWindow.scrollX,
      scrollY: topWindow.scrollY,
    };

    // Estimated popup dimensions (will be refined after DOM insertion)
    const popupWidth = 330; // More conservative estimate: max-width: 300px + padding + borders + safety margin
    const popupHeight = 120; // Estimated height for typical translations

    // Calculate available space in each direction
    const spaceRight = viewport.width - (position.x - viewport.scrollX);
    const spaceLeft = position.x - viewport.scrollX;
    const spaceBelow = viewport.height - (position.y - viewport.scrollY);
    const spaceAbove = position.y - viewport.scrollY;

    let finalX = position.x;
    let finalY = position.y;
    let transformOrigin = "top left";

    // Horizontal positioning logic
    if (spaceRight >= popupWidth) {
      // Enough space on the right
      finalX = position.x;
    } else if (spaceLeft >= popupWidth) {
      // Not enough space on right, try left
      finalX = position.x - popupWidth;
      transformOrigin = transformOrigin.replace("left", "right");
    } else {
      // Not enough space on either side, position to fit within viewport
      const maxRight = viewport.scrollX + viewport.width - popupWidth - 10; // 10px margin
      const minLeft = viewport.scrollX + 10; // 10px margin
      finalX = Math.max(minLeft, Math.min(position.x, maxRight));
      transformOrigin = "top center";
    }

    // Vertical positioning logic
    if (spaceBelow >= popupHeight) {
      // Enough space below
      finalY = position.y;
    } else if (spaceAbove >= popupHeight) {
      // Not enough space below, try above
      finalY = position.y - popupHeight - 10; // 10px gap from selection
      transformOrigin = transformOrigin.replace("top", "bottom");
    } else {
      // Not enough space above or below, position to fit within viewport
      const maxBottom = viewport.scrollY + viewport.height - popupHeight - 10; // 10px margin
      const minTop = viewport.scrollY + 10; // 10px margin
      finalY = Math.max(minTop, Math.min(position.y, maxBottom));

      // Adjust transform origin based on final position relative to selection
      if (finalY < position.y) {
        transformOrigin = transformOrigin.replace("top", "bottom");
      }
    }

    // Handle fixed/sticky elements by checking for overlaps
    finalY = this.adjustForFixedElements(
      finalX,
      finalY,
      popupWidth,
      popupHeight
    );

    return {
      x: finalX,
      y: finalY,
      origin: transformOrigin,
    };
  }

  adjustForFixedElements(x, y, width, height) {
    // Get top document and window for proper element detection
    const topDocument = this._getTopDocument();
    const topWindow =
      topDocument.defaultView || topDocument.parentWindow || window;

    // Get all fixed and sticky positioned elements from top document
    const fixedElements = Array.from(topDocument.querySelectorAll("*")).filter(
      (el) => {
        const style = topWindow.getComputedStyle(el);
        return style.position === "fixed" || style.position === "sticky";
      }
    );

    const popupRect = {
      left: x - topWindow.scrollX,
      top: y - topWindow.scrollY,
      right: x - topWindow.scrollX + width,
      bottom: y - topWindow.scrollY + height,
    };

    for (const element of fixedElements) {
      const rect = element.getBoundingClientRect();

      // Skip if element is not visible or has no dimensions
      if (
        rect.width === 0 ||
        rect.height === 0 ||
        rect.left >= topWindow.innerWidth ||
        rect.top >= topWindow.innerHeight ||
        rect.right <= 0 ||
        rect.bottom <= 0
      ) {
        continue;
      }

      // Check for overlap
      const isOverlapping = !(
        popupRect.right <= rect.left ||
        popupRect.left >= rect.right ||
        popupRect.bottom <= rect.top ||
        popupRect.top >= rect.bottom
      );

      if (isOverlapping) {
        // Try to reposition below the fixed element
  const newY = topWindow.scrollY + rect.bottom + 10;
  const spaceBelow = topWindow.innerHeight - (rect.bottom + 10);

        if (spaceBelow >= height) {
          return newY;
        } else {
          // Try above the fixed element
          const newYAbove = topWindow.scrollY + rect.top - height - 10;
          if (rect.top >= height + 10) {
            return newYAbove;
          }
        }
      }
    }

    return y;
  }

  _setupDragHandlers() {
    // We'll set up drag handlers when first-line is created in transitionToTranslatedText
    // This method is called early before content is ready
  }

  _onMouseDown(e) {
    if (!this.displayElement) return;

    this.isDragging = true;
    const rect = this.displayElement.getBoundingClientRect();
    this.dragOffset.x = e.clientX - rect.left;
    this.dragOffset.y = e.clientY - rect.top;

    // Get top document for proper event handling
    const topDocument = this._getTopDocument();

    // Add global listeners
    topDocument.addEventListener("mousemove", this._onMouseMove);
    topDocument.addEventListener("mouseup", this._onMouseUp);

    // Prevent text selection during drag
    e.preventDefault();

    // Add visual feedback
    if (this.dragHandle) {
      this.dragHandle.style.opacity = "1";
    }
  }

  _onMouseMove(e) {
    if (!this.isDragging || !this.displayElement) return;

    e.preventDefault();

    const newX = e.clientX - this.dragOffset.x;
    const newY = e.clientY - this.dragOffset.y;

    // Get top window for proper viewport calculations
    const topDocument = this._getTopDocument();
    const topWindow =
      topDocument.defaultView || topDocument.parentWindow || window;

    // Keep popup within viewport bounds
    const viewport = {
      width: topWindow.innerWidth,
      height: topWindow.innerHeight,
    };

    const rect = this.displayElement.getBoundingClientRect();
    const constrainedX = Math.max(
      0,
      Math.min(newX, viewport.width - rect.width)
    );
    const constrainedY = Math.max(
      0,
      Math.min(newY, viewport.height - rect.height)
    );

    // Apply position directly since we're using position: fixed
    this.displayElement.style.left = `${constrainedX}px`;
    this.displayElement.style.top = `${constrainedY}px`;
  }

  _onMouseUp() {
    if (!this.isDragging) return;

    this.isDragging = false;

    // Get top document for proper event handling
    const topDocument = this._getTopDocument();

    // Remove global listeners
    topDocument.removeEventListener("mousemove", this._onMouseMove);
    topDocument.removeEventListener("mouseup", this._onMouseUp);

    // Reset visual feedback
    if (this.dragHandle) {
      this.dragHandle.style.opacity = "0.8";
    }
  }

  _removeDragHandlers() {
    if (this.dragHandle) {
      this.dragHandle.removeEventListener("mousedown", this._onMouseDown);
    }

    // Get top document for proper event handling
    const topDocument = this._getTopDocument();
    topDocument.removeEventListener("mousemove", this._onMouseMove);
    topDocument.removeEventListener("mouseup", this._onMouseUp);
    this.isDragging = false;
  }

  /**
   * Clean up cross-frame communication
   * NOTE: This should only be called when the extension is being unloaded,
   * NOT on regular dismiss operations!
   */
  _cleanupCrossFrameListening() {
    try {
      // Remove message listener
      window.removeEventListener('message', this._handleCrossFrameMessage);
      
  // Remove global click handler via helper
  this._disableGlobalClickBroadcast();
      
      // Remove from frame registry
      if (window.translateItFrameRegistry) {
        window.translateItFrameRegistry.delete(this.frameId);
      }

      // Clear cross-frame listeners
      this.crossFrameListeners.clear();
    } catch (error) {
      this.logger.warn('Error cleaning up cross-frame communication:', error);
    }
  }

  /**
   * Complete cleanup - call this only when destroying the instance
   */
  destroy() {
    try {
      this.dismiss(false); // Dismiss without fade
      this._cleanupCrossFrameListening(); // Now it's safe to cleanup
      this.logger.debug('WindowsManager destroyed', { frameId: this.frameId });
    } catch (error) {
      this.logger.warn('Error during WindowsManager destruction:', error);
    }
  }

  createLoadingDots() {
    const container = document.createElement("div");
    container.classList.add("loading-container");
    [0, 1, 2].forEach(() => {
      const dot = document.createElement("span");
      dot.classList.add("loading-dot");
      dot.textContent = ".";
      container.appendChild(dot);
    });
    return container;
  }

  transitionToTranslatedText(
    translatedText,
    loadingContainer,
    originalText,
    trans_Mode
  ) {
    if (!this.innerContainer || !this.displayElement) return;
    if (
      loadingContainer &&
      loadingContainer.parentNode === this.innerContainer
    ) {
      loadingContainer.remove();
    }
    this.innerContainer.textContent = "";
    const firstLine = document.createElement("div");
    firstLine.classList.add("first-line");

    // Create a dedicated drag handle area in the middle
    const dragHandle = document.createElement("div");
    dragHandle.style.flex = "1"; // Take up available space between icons and close button
    dragHandle.style.cursor = "move";
    dragHandle.style.minHeight = "16px"; // Ensure there's a clickable area
    this.dragHandle = dragHandle;

    const ttsIconOriginal = this.createTTSIcon(
      originalText,
      CONFIG.SOURCE_LANGUAGE || "listen"
    );
    firstLine.appendChild(ttsIconOriginal);

    // Add copy button for translated text
    const copyIcon = this.createCopyIcon(translatedText);
    firstLine.appendChild(copyIcon);

    // Add the drag handle (middle area)
    if (trans_Mode === TranslationMode.Dictionary_Translation) {
      const orig = document.createElement("span");
      orig.classList.add("original-text");
      orig.textContent = originalText;
      dragHandle.appendChild(orig);
    }
    firstLine.appendChild(dragHandle);

    // Add close button
    const closeButton = document.createElement("span");
    closeButton.textContent = "✕";
    closeButton.style.opacity = "0.7";
    closeButton.style.fontSize = "14px";
    closeButton.style.cursor = "pointer";
    closeButton.style.padding = "0 4px";
    closeButton.title = "Close";
    closeButton.addEventListener("click", (e) => {
      e.stopPropagation();
      this.cancelCurrentTranslation();
    });
    firstLine.appendChild(closeButton);

    this.innerContainer.appendChild(firstLine);

    // Setup drag handlers now that first-line exists
    if (this.dragHandle) {
      this.dragHandle.addEventListener("mousedown", this._onMouseDown);
    }

    const secondLine = document.createElement("div");
    secondLine.classList.add("second-line");
    
    // Use unified TranslationRenderer with markdown support
    const renderer = createTranslationRenderer({
      enableMarkdown: true,
      enableLabelFormatting: true,
      mode: 'selection'
    });
    
    const contentElement = renderer.createContentElement({
      content: translatedText,
      error: null,
      isLoading: false,
      placeholder: ''
    });
    
    secondLine.appendChild(contentElement);
    this.applyTextDirection(secondLine, translatedText);
    this.innerContainer.appendChild(secondLine);

    // Reposition popup after content is added to ensure it fits properly
    requestAnimationFrame(() => {
      if (this.displayElement) {
        this.adjustPositionAfterContentChange();
        this.displayElement.style.transition = `opacity 0.15s ease-in-out`;
        this.displayElement.style.opacity = "0.95";
      }
    });
  }

  adjustPositionAfterContentChange() {
    if (!this.displayElement || !this.isVisible) return;

    // Get actual popup dimensions after content is rendered
    const rect = this.displayElement.getBoundingClientRect();
    const currentX = parseInt(this.displayElement.style.left);
    const currentY = parseInt(this.displayElement.style.top);

    // Get top window for proper viewport calculations
    const topDocument = this._getTopDocument();
    const topWindow =
      topDocument.defaultView || topDocument.parentWindow || window;

    // Check if popup is now outside viewport with actual dimensions
    const viewport = {
      width: topWindow.innerWidth,
      height: topWindow.innerHeight,
    };

    let needsRepositioning = false;
    let newX = currentX;
    let newY = currentY;

    // Check horizontal bounds (fixed positioning, so no need to consider scroll)
    if (currentX + rect.width > viewport.width - 10) {
      // Popup extends beyond right edge
      newX = viewport.width - rect.width - 10;
      needsRepositioning = true;
    } 
    // MORE AGGRESSIVE left edge check to prevent content overflow
    if (currentX < 10) {
      // Popup extends beyond left edge
      newX = 10;
      needsRepositioning = true;
    }
    // Additional check: ensure popup with actual width fits within viewport
    if (newX + rect.width > viewport.width - 10) {
      // Even after adjustment, popup is too wide - force fit
      newX = Math.max(10, viewport.width - rect.width - 10);
    }

    // Check vertical bounds
    if (currentY + rect.height > viewport.height - 10) {
      // Popup extends beyond bottom edge
      newY = viewport.height - rect.height - 10;
      needsRepositioning = true;
    } else if (currentY < 10) {
      // Popup extends beyond top edge
      newY = 10;
      needsRepositioning = true;
    }

    // Apply new position if needed
    if (needsRepositioning) {
      this.displayElement.style.left = `${newX}px`;
      this.displayElement.style.top = `${newY}px`;
    }
  }

  createTTSIcon(textToSpeak, title = "Speak") {
    const icon = document.createElement("img");
    icon.src = browser.runtime.getURL("icons/speaker.png");
    icon.alt = title;
    icon.title = title;
    icon.classList.add("tts-icon");
    icon.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (isExtensionContextValid()) {
        try {
          // Use unified TTS system - same as Vue components
          await this.speakTextUnified(textToSpeak.trim());
          this.logger.debug("TTS started via unified system");
        } catch (error) {
          this.logger.warn("Error speaking text", error);
        }
      }
    });
    return icon;
  }

  createCopyIcon(textToCopy, title = "Copy") {
    const icon = document.createElement("img");
    icon.src = browser.runtime.getURL("icons/copy.png");
    icon.alt = title;
    icon.title = title;
    icon.classList.add("tts-icon"); // Reuse same styling as TTS icon
    icon.style.marginLeft = "4px"; // Small gap from TTS icon
    icon.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(textToCopy);
        // Visual feedback - briefly change opacity
        const originalOpacity = icon.style.opacity;
        icon.style.opacity = "0.5";
        setTimeout(() => {
          icon.style.opacity = originalOpacity;
        }, 150);
      } catch (err) {
        this.logger.warn("Failed to copy text", err);
      }
    });
    return icon;
  }

  async handleTranslationError(error, loadingContainer) {
    if (
      loadingContainer &&
      loadingContainer.parentNode === this.innerContainer
    ) {
      loadingContainer.remove();
    }
    
    // Determine error type and get proper localized message
    const errObj = error instanceof Error ? error : new Error(String(error.message || error));
    const errorType = matchErrorToType(errObj.message);
    const localizedErrorMessage = await getErrorMessage(errorType);
    
    this.logger.error(`Handling translation error - Type: ${errorType}, Message: ${localizedErrorMessage}`);
    
    if (this.innerContainer) {
      const errorMsgElement = document.createElement("div");
      // Use proper localized error message from centralized system
      errorMsgElement.textContent = CONFIG.ICON_ERROR + localizedErrorMessage;
      errorMsgElement.style.color = "var(--sw-text-color)";
      errorMsgElement.style.padding = "5px";
      this.innerContainer.appendChild(errorMsgElement);
      setTimeout(() => this.dismiss(true), 4000); // Slightly longer display time for error
    } else {
      this.dismiss(false);
    }
    
    // Use centralized error handler with proper context and error type
    await this.translationHandler.errorHandler.handle(errObj, {
      type: errorType,
      context: "selection-window-translate",
      isSilent: true, // Keep silent to avoid duplicate notifications
    });
  }

  dismiss(withFadeOut = true) {
    // **FIX FOR DISCORD**: Clear text selection ONLY when dismissing icon mode
    // to prevent immediate re-triggering. Don't clear selection when dismissing translation window.
    if (this.isIconMode) {
      try {
        if (window.getSelection) {
          const selection = window.getSelection();
          if (selection && selection.removeAllRanges) {
            selection.removeAllRanges();
          }
        }
      } catch (error) {
        this.logger.warn('Failed to clear text selection on dismiss', error);
      }
    }

    // Ensure icon is cleaned up, including its outside click listener if active
    // _cleanupIcon is called with 'true' to ensure its outside click listener is removed IF it was active for the icon.
    // If we are dismissing from a window state, _cleanupIcon(true) will try to remove listeners,
    // which is fine (it will find no icon-specific listener if we are in window mode).
    // The main window's listener is handled by _removeOutsideClickListener directly below.
    this._cleanupIcon(true); // Cleanup icon and its listeners if any

    if (!this.displayElement || !this.isVisible) {
      // If only an icon was visible and now dismissed, ensure no lingering listeners.
      if (!this.isVisible) this._removeOutsideClickListener();
      
      // **FIX FOR DISCORD**: Reset all flags when dismissing
      this.isIconMode = false; // Reset mode
      this.pendingTranslationWindow = false; // Reset pending flag
      if (state && typeof state === 'object') {
        state.preventTextFieldIconCreation = false;
      }
      
      return;
    }

    this._removeThemeChangeListener();
    this._removeOutsideClickListener(); // Specifically for the window
    this._removeDragHandlers(); // Clean up drag handlers
    
    // **CRITICAL**: Do NOT cleanup cross-frame listening on dismiss
    // Global click handler must remain active for cross-frame communication

    this.isVisible = false;
    this.pendingTranslationWindow = false; // Reset this flag
    this.isIconMode = false; // Reset mode when dismissing

    // **FIX FOR DISCORD**: Reset text field icon prevention flag when dismissing
    if (state && typeof state === 'object') {
      state.preventTextFieldIconCreation = false;
    }

    if (withFadeOut && this.fadeOutDuration > 0 && this.displayElement) {
      this.displayElement.style.transition = `opacity ${this.fadeOutDuration}ms ease-in-out, transform 0.1s ease-in`;
      this.displayElement.style.opacity = "0";
      this.displayElement.style.transform = "scale(0.5)";
      const el = this.displayElement;
      const fallbackTimeout = setTimeout(() => {
        if (el && el.parentNode) {
          this.removeElement(el);
        }
      }, this.fadeOutDuration + 50); // A bit more than fadeOutDuration
      el.addEventListener(
        "transitionend",
        () => {
          clearTimeout(fallbackTimeout);
          this.removeElement(el);
        },
        { once: true }
      );
    } else {
      this.removeElement(this.displayElement);
    }
  }

  _cleanupIcon(removeListener = true) {
    // فقط در صورتی که آیکونی برای حذف وجود داشته باشد، ادامه بده
    if (this.icon) {
      const iconElement = this.icon; // یک رفرنس به عنصر آیکون نگه می‌داریم

      // رویداد کلیک را فوراً حذف می‌کنیم تا کاربر نتواند روی آیکونی که در حال ناپدید شدن است کلیک کند
      iconElement.removeEventListener("click", this.onIconClick);

      // --- افزودن انیمیشن ناپدید شدن ---

      // 1. با تغییر استایل، انیمیشن بازگشت (ناپدید شدن) را فعال می‌کنیم
      iconElement.style.opacity = "0";
      iconElement.style.transform = "scale(0.5)";

      // 2. یک تایمر تنظیم می‌کنیم تا عنصر را پس از پایان انیمیشن از DOM حذف کند
      // زمان تایمر باید با زمان transition در استایل هماهنگ باشد (مثلاً 150 میلی‌ثانیه)
      setTimeout(() => {
        if (iconElement.parentNode) {
          iconElement.remove();
        }
      }, 150); // کمی بیشتر از زمان انیمیشن (120ms) برای اطمینان

      // بلافاصله this.icon را null می‌کنیم تا بقیه قسمت‌های برنامه آن را یک عنصر در حال حذف بدانند
      this.icon = null;
    }

    this.iconClickContext = null;

    // If 'removeListener' is true, and we were in icon mode, attempt to remove the listener.
    // This logic is maintained for when dismiss() calls _cleanupIcon.
    // In onIconClick, we manually remove the listener *before* calling _cleanupIcon(false).
    if (removeListener) {
      this._removeOutsideClickListener();
    }
  }

  removeElement(elementToRemove) {
    const el = elementToRemove || this.displayElement;
    if (el && el.parentNode) {
      el.remove();
    }
    if (el === this.displayElement) {
      this.displayElement = null;
      this.innerContainer = null;
      this.dragHandle = null;
      this.originalText = null;
    }
  }

  applyTextDirection(element, text) {
    if (!element) return;
    const isRtl = CONFIG.RTL_REGEX.test(text);
    element.style.direction = isRtl ? "rtl" : "ltr";
    element.style.textAlign = isRtl ? "right" : "left";
  }
}

export function dismissAllSelectionWindows() {
  const logger = createLogger('Content', 'SelectionWindows');
  logger.debug("Dismissing all selection windows");
  try {
    // Function to clean up from a specific document
    const cleanupDocument = (doc) => {
      const hosts = doc.querySelectorAll(".aiwc-selection-popup-host");
      hosts.forEach((host) => {
        try {
          host.remove();
        } catch (innerErr) {
          logger.warn("Failed to remove a host", innerErr);
        }
      });
      const icons = doc.querySelectorAll("#translate-it-icon");
      icons.forEach((icon) => icon.remove());
    };

    // Clean current document
    cleanupDocument(document);

    // Also clean top document if different (for iframe cases)
    try {
      let currentWindow = window;
      let topDocument = document;

      while (currentWindow.parent !== currentWindow) {
        try {
          const parentDoc = currentWindow.parent.document;
          if (parentDoc) {
            topDocument = parentDoc;
            currentWindow = currentWindow.parent;
          } else {
            break;
          }
        } catch {
          break;
        }
      }

      if (topDocument !== document) {
        cleanupDocument(topDocument);
      }
    } catch (err) {
      logger.warn("Could not clean top document", err);
    }
  } catch (err) {
    logger.error("Unknown error in dismissAllSelectionWindows", err);
  }
}
