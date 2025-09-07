// src/managers/content/windows/NewWindowsManager.js

import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import { WindowsConfig } from "./core/WindowsConfig.js";
import { WindowsState } from "./core/WindowsState.js";
import { CrossFrameManager } from "./crossframe/CrossFrameManager.js";
import { TranslationHandler } from "./translation/TranslationHandler.js";
import { ClickManager } from "./interaction/ClickManager.js";
import { ThemeManager } from "./theme/ThemeManager.js";
import { TTSManager } from "@/features/tts/managers/TTSManager.js";
// UI-related imports removed - now handled by Vue UI Host
// - WindowsFactory, PositionCalculator, SmartPositioner
// - AnimationManager, TranslationRenderer
// - DragHandler, TTSManager
import { getSettingsAsync, CONFIG, state } from "@/shared/config/config.js";
import { ErrorHandler } from "@/shared/error-management/ErrorHandler.js";
import ExtensionContextManager from "@/core/extensionContext.js";
// Import event constants, get pageEventBus instance at runtime
import { WINDOWS_MANAGER_EVENTS, WindowsManagerEvents } from '@/core/PageEventBus.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';

/**
 * Modular WindowsManager for translation windows and icons
 * Refactored to use specialized modules for better maintainability
 */
export class WindowsManager extends ResourceTracker {
  /**
   * Get pageEventBus instance at runtime
   */
  get pageEventBus() {
    return window.pageEventBus;
  }

  constructor(options = {}) {
    // Initialize ResourceTracker first
    super('windows-manager');
    
    // Initialize logger
    this.logger = getScopedLogger(LOG_COMPONENTS.WINDOWS, 'WindowsManager');
    this.logger.debug('[WindowsManager] Constructor called, creating new instance:', new Error().stack);
    this.logger.debug('WindowsManager constructor called', options);
    
    // Initialize cross-frame communication first to get frameId
    this.crossFrameManager = new CrossFrameManager({
      debugCrossFrame: options.debugCrossFrame
    });
    
    // Initialize core modules for business logic only
    this.state = new WindowsState(this.crossFrameManager.frameId);
    
    // Initialize TTS request tracking
    this._currentTTSRequest = null;
    
    // Initialize translation business logic
    this.translationHandler = new TranslationHandler();
    
    // Initialize error handling
    this.errorHandler = ErrorHandler.getInstance();
    
    // Initialize interaction management (outside clicks)
    this.clickManager = new ClickManager(this.crossFrameManager, this.state);
    
    // Initialize theme management
    this.themeManager = new ThemeManager();
    
    // Initialize TTS management
    this.ttsManager = new TTSManager();
    
    // UI-related modules removed - now handled by Vue UI Host
    // - factory, positionCalculator, smartPositioner
    // - animationManager, translationRenderer, dragHandler
    
    // UI elements - deprecated (now handled by Vue UI Host)
    // this.displayElement = null;
    // this.innerContainer = null;
    // this.icon = null;
    
    // State flags for selection preservation
    this._isIconToWindowTransition = false;
    this._lastDismissedIcon = null;
    
    // External dependencies
    this.translationHandler.errorHandler = options.translationHandler?.errorHandler || ErrorHandler.getInstance();
    this.notifier = options.notifier;
    
    // Animation durations removed - handled by Vue UI Host
    
    this._setupEventHandlers();
    this._initialize();
  }

  /**
   * Setup event handlers for cross-module communication
   */
  _setupEventHandlers() {
    // Cross-frame event handlers
    this.crossFrameManager.setEventHandlers({
      onOutsideClick: this._handleCrossFrameOutsideClick.bind(this),
      onWindowCreationRequest: this._handleWindowCreationRequest.bind(this),
      onWindowCreatedResponse: this._handleWindowCreatedResponse.bind(this),
      onTextSelectionWindowRequest: this._handleTextSelectionWindowRequest.bind(this)
    });
    // Click manager handlers
    this.clickManager.setHandlers({
      onOutsideClick: this._handleOutsideClick.bind(this),
      onIconClick: this._handleIconClick.bind(this)
    });
    // Listen for events from the Vue UI Host
    this.logger.debug('[LOG] WindowsManager: EventBus ICON_CLICKED listener registered');
    this.logger.debug('[TEST] WindowsManager.js registering ICON_CLICKED listener on eventBus:', this.pageEventBus);
    if (this.pageEventBus) {
      // Create bound handler to enable proper cleanup
      this._iconClickHandler = (payload) => {
        this.logger.debug('[LOG] WindowsManager.js ICON_CLICKED handler triggered', payload);
        this.logger.debug('[TEST] WindowsManager.js eventBus instance', this.pageEventBus);
        this._handleIconClickFromVue(payload);
      };
      
      // Remove any existing listener first to prevent duplicates
      this.pageEventBus.off(WINDOWS_MANAGER_EVENTS.ICON_CLICKED, this._iconClickHandler);
      this.pageEventBus.on(WINDOWS_MANAGER_EVENTS.ICON_CLICKED, this._iconClickHandler);
      this.pageEventBus.on('translation-window-speak', this._handleSpeakRequest.bind(this));
      if (this.pageEventBus._listeners) {
        this.logger.debug('[TEST] WindowsManager.js ICON_CLICKED listeners after registration:', this.pageEventBus._listeners[WINDOWS_MANAGER_EVENTS.ICON_CLICKED]);
      }
    } else {
      this.logger.warn('PageEventBus not available during setup');
    }
    // Development toggle handler - use tracked event listener
    this.addEventListener(window, 'toggle-windows-manager-renderer', this._handleToggleRenderer.bind(this));
  }

  /**
   * Handle renderer toggle event
   */
  _handleToggleRenderer(event) {
    this.logger.debug('Renderer toggle requested', event.detail);
    const newRendererType = this.toggleEnhancedRenderer();
    
    // If there's an active translation window, re-render with new renderer through Vue UI Host
    if (this.state.isVisible && this.state.originalText && this.state.translatedText) {
      // Emit update event to Vue UI Host to re-render with new renderer
      // Note: This could be implemented later as WINDOWS_MANAGER_EVENTS.UPDATE_RENDERER
      this.logger.debug('Active translation will be re-rendered with new renderer through Vue UI Host');
    }
    
    this.logger.debug(`Renderer toggled to: ${newRendererType ? 'Enhanced' : 'Classic'}`);
  }

  /**
   * Determine if enhanced renderer should be used
   */
  _shouldUseEnhancedRenderer() {
    // Check for development mode
    const isDevelopment = (
      window.location.hostname === 'localhost' ||
      window.location.hostname.includes('dev') ||
      localStorage.getItem('dev-mode') === 'true'
    );
    
    // Check for saved preference
    const savedPreference = localStorage.getItem('windows-manager-enhanced-version');
    
    if (savedPreference !== null) {
      return savedPreference === 'true';
    }
    
    // Default to enhanced in development, classic in production
    return isDevelopment;
  }

  /**
   * Toggle renderer preference - now just saves preference for Vue components
   */
  toggleEnhancedRenderer() {
    // Determine current preference
    const savedPreference = localStorage.getItem('windows-manager-enhanced-version');
    const isDevelopment = (
      window.location.hostname === 'localhost' ||
      window.location.hostname.includes('dev') ||
      localStorage.getItem('dev-mode') === 'true'
    );
    
    const currentState = savedPreference !== null ? savedPreference === 'true' : isDevelopment;
    const newState = !currentState;
    
    localStorage.setItem('windows-manager-enhanced-version', newState.toString());
    this.logger.debug(`Renderer preference toggled to: ${newState ? 'Enhanced' : 'Classic'} (handled by Vue UI Host)`);
    
    return newState;
  }

  /**
   * Initialize the WindowsManager
   */
  async _initialize() {
    try {
      await this.themeManager.initialize();
      this.logger.debug('WindowsManager initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize WindowsManager:', error);
    }
  }

  /**
   * Show translation window or icon for selected text
   * @param {string} selectedText - Selected text to translate
   * @param {Object} position - Position to show window/icon
   */
  async show(selectedText, position) {
    if (!ExtensionContextManager.isValidSync()) {
      this.logger.warn('Extension context invalid, aborting show()');
      return;
    }

    if (this.state.isProcessing) {
      this.logger.debug('WindowsManager is already processing, skipping show()');
      return;
    }
    
    this.logger.debug('WindowsManager.show() called', {
      text: selectedText ? selectedText.substring(0, 30) + '...' : 'null',
      position,
      currentState: this.state.getSnapshot()
    });
    
    // Prevent showing same text multiple times
    if (this._shouldSkipShow(selectedText)) {
      return;
    }
    
    // Check if this is an icon->window transition OR we're in onClick mode, preserve selection if so
    // In onClick mode, we show icons first and user will click later, so preserve selection
    let isOnClickMode = false;
    try {
      const settings = await getSettingsAsync();
      const selectionTranslationMode = settings.selectionTranslationMode || CONFIG.selectionTranslationMode;
      isOnClickMode = selectionTranslationMode === 'onClick';
    } catch (error) {
      // If extension context is invalidated, use fallback values
      if (ExtensionContextManager.isContextError(error)) {
        const selectionTranslationMode = CONFIG.selectionTranslationMode;
        isOnClickMode = selectionTranslationMode === 'onClick';
      } else {
        throw error;
      }
    }
    const preserveSelection = this._isIconToWindowTransition || isOnClickMode;
    this.dismiss(false, preserveSelection);
    
    // Reset the transition flag after using it
    this._isIconToWindowTransition = false;
    
    if (!selectedText) return;

    this.state.setProcessing(true);

    try {
      let settings;
      let selectionTranslationMode;
      
      try {
        settings = await getSettingsAsync();
        selectionTranslationMode = settings.selectionTranslationMode || CONFIG.selectionTranslationMode;
      } catch (error) {
        // If extension context is invalidated, use fallback values
        if (ExtensionContextManager.isContextError(error)) {
          this.logger.debug('Extension context invalidated, using fallback settings for window display');
          selectionTranslationMode = CONFIG.selectionTranslationMode;
        } else {
          // Re-throw non-context errors
          throw error;
        }
      }

      this.logger.debug('Selection translation mode', { mode: selectionTranslationMode });

      if (selectionTranslationMode === "onClick") {
        await this._showIcon(selectedText, position);
      } else {
        await this._showWindow(selectedText, position);
      }
    } finally {
      this.state.setProcessing(false);
    }
  }

  /**
   * Check if we should skip showing (duplicate text)
   */
  _shouldSkipShow(selectedText) {
    if (selectedText && 
        this.state.isVisible && 
        this.state.originalText === selectedText) {
      this.logger.debug('Skipping show - same text already displayed');
      return true;
    }
    return false;
  }

  /**
   * Show translate icon
   */
  async _showIcon(selectedText, position) {
    if (!ExtensionContextManager.isValidSync()) {
      this.logger.warn('Extension context invalid, cannot create icon');
      return;
    }

    this.state.setIconMode(true);
    this.state.setOriginalText(selectedText);
    
    // Generate unique ID for this icon
    const iconId = `translation-icon-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Use the position from TextSelectionManager directly - Vue will handle calculation
    const positionToUse = position.finalPosition || position;

    // Emit event to create icon through Vue UI Host (Vue handles position calculation)
    WindowsManagerEvents.showIcon({
      id: iconId,
      text: selectedText,
      position: positionToUse
    });
    
    // Store context for click handling
    this.state.setIconClickContext({ 
      text: selectedText, 
      position,
      iconId 
    });
    
    // Add outside click listener
    this.clickManager.addOutsideClickListener();
    
    this.logger.debug('Icon creation event emitted successfully', { iconId });
  }

  /**
   * Handle TTS speak request from Vue component
   */
  async _handleSpeakRequest(detail) {
    this.logger.debug('Speak request received from UI Host', detail);
    if (!detail || !detail.text) return;

    // Prevent duplicate requests by checking if already processing for this window
    const requestKey = `${detail.id}-${detail.isSpeaking}`;
    if (this._currentTTSRequest === requestKey) {
      this.logger.debug('Duplicate TTS request ignored', requestKey);
      return;
    }
    
    this._currentTTSRequest = requestKey;
    
    try {
      if (detail.isSpeaking) {
        await this.ttsManager.speakTextUnified(detail.text);
      } else {
        this.ttsManager.stopCurrentTTS();
      }
    } catch (error) {
      this.logger.error('TTS error:', error);
    } finally {
      // Clear request tracking after a delay
      setTimeout(() => {
        if (this._currentTTSRequest === requestKey) {
          this._currentTTSRequest = null;
        }
      }, 1000);
    }
  }

  /**
   * Show translation window with two-phase loading
   */
  async _showWindow(selectedText, position) {
    if (!ExtensionContextManager.isValidSync() || !selectedText) {
      this.logger.error(`[LOG] _showWindow: ExtensionContextManager invalid or selectedText empty. selectedText=${selectedText}`);
      return;
    }

    this.logger.debug(`[LOG] _showWindow called: isInIframe=${this.crossFrameManager.isInIframe}, frameId=${this.crossFrameManager.frameId}, text=${selectedText}, position=${JSON.stringify(position)}`);
    
    // NEW: Create window directly in iframe using Vue UI Host
    // The old cross-frame logic is no longer needed since each frame has its own Vue UI Host
    this.logger.debug(`Creating window directly in current frame (${this.crossFrameManager.isInIframe ? 'iframe' : 'main-frame'})`);

    // PHASE 1: Show small loading window immediately
    const windowId = `translation-window-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const theme = this.themeManager.currentTheme || 'light';
    
    // Emit event to create small loading window
    WindowsManagerEvents.showWindow({
      id: windowId,
      selectedText,
      position,
      mode: 'window',
      theme,
      initialSize: 'small',
      isLoading: true
    });
    
    // Store state for this window
    this.state.setActiveWindowId(windowId);
    this.state.setOriginalText(selectedText);
    this.state.setTranslationCancelled(false);
    this.state.setIconMode(false);
    this.state.setVisible(true);
    
    this.logger.debug('Small loading window created', { windowId });

    // PHASE 2: Perform translation and update window
    try {
      const translationResult = await this._startTranslationProcess(selectedText);

      // If translation was cancelled (returns null for cancellation only)
      if (!translationResult) {
        this.logger.debug('Translation was cancelled by user, updating window with cancellation message.');
        WindowsManagerEvents.updateWindow(windowId, {
          initialSize: 'normal',
          isLoading: false,
          isError: true,
          initialTranslatedText: 'Translation cancelled by user'
        });
        return;
      }

      // Update window with translation result and resize to normal
      WindowsManagerEvents.updateWindow(windowId, {
        initialSize: 'normal',
        isLoading: false,
        initialTranslatedText: translationResult.translatedText
      });
      
      this.logger.debug('Window updated with translation result', { windowId });
      
    } catch (error) {
      this.logger.error('Error during translation process:', error);
      
      // Use ErrorHandler to get user-friendly error message
      let userFriendlyMessage;
      try {
        const errorInfo = await this.errorHandler.getErrorForUI(error, 'windows-translation');
        userFriendlyMessage = errorInfo.message;
      } catch (handlerError) {
        this.logger.warn('Failed to get user-friendly error message, using fallback:', handlerError);
        // Fallback to original extraction logic
        if (typeof error === 'string' && error.length > 0) {
          userFriendlyMessage = error;
        } else if (error && error.message && error.message.length > 0) {
          userFriendlyMessage = error.message;
        } else {
          userFriendlyMessage = 'Translation failed';
        }
      }
      
      // Update window with user-friendly error message
      WindowsManagerEvents.updateWindow(windowId, {
        initialSize: 'normal',
        isLoading: false,
        isError: true,
        initialTranslatedText: userFriendlyMessage
      });
    }
  }

  /**
   * Start translation process for a window
   */
  async _startTranslationProcess(selectedText) {
    try {
      // Perform translation
      const result = await this.translationHandler.performTranslation(selectedText);
      
      if (this.state.isTranslationCancelled) return null;
      
      this.logger.debug('Translation completed successfully');
      return result;
      
    } catch (error) {
      // Handle cancellation errors gracefully - they are expected when user dismisses window
      if (this.state.isTranslationCancelled || error.message === 'Translation cancelled') {
        this.logger.debug('Translation cancelled during translation process - this is normal');
        return null;
      }
      
      this.logger.error('Translation failed', { error });
      // Instead of returning null, throw the error so the caller can handle it properly
      throw error;
    }
  }

  /**
   * Create translation window - now delegates to Vue UI Host
   */
  async _createTranslationWindow(selectedText, position) {
    try {
      // Update state
      this.state.setOriginalText(selectedText);
      this.state.setTranslationCancelled(false);
      this.state.setIconMode(false);
      this.state.setVisible(true);

      // Generate unique ID for this window
      const windowId = `translation-window-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      this.state.setActiveWindowId(windowId);

      // Get current theme
      const theme = await this.themeManager.getCurrentTheme();
      
      // First emit event to create loading window
      WindowsManagerEvents.showWindow({
        id: windowId,
        selectedText: selectedText,
        initialTranslatedText: '', // Empty = loading state
        position: position,
        theme: theme,
        isLoading: true
      });
      
      // Setup click listener for outside clicks
      this.clickManager.addOutsideClickListener();
      
      this.logger.debug('Loading window creation event emitted', { windowId });

      // Perform translation
      const result = await this.translationHandler.performTranslation(selectedText);
      
      if (this.state.isTranslationCancelled) return;

      // Update window with translation result
      const windowPayload = {
        id: windowId,
        selectedText: selectedText,
        initialTranslatedText: result.translatedText,
        position: position,
        theme: theme,
        isLoading: false
      };
      
      this.logger.debug('[WindowsManager] About to emit showWindow with:', windowPayload);
      WindowsManagerEvents.showWindow(windowPayload);
      
      this.logger.debug('Translation window updated with result', { windowId });
      
    } catch (error) {
      // Handle cancellation errors gracefully - they are expected when user dismisses window
      if (this.state.isTranslationCancelled || error.message === 'Translation cancelled') {
        this.logger.debug('Translation cancelled during window creation - this is normal');
        return;
      }
      await this._handleTranslationError(error, selectedText, position);
    }
  }

  /**
   * Render translation content - deprecated (now handled by Vue UI Host)
   */
  // _renderTranslationContent method removed - handled by Vue UI Host

  /**
   * Setup window interactions
   */
  _setupWindowInteractions() {
    // Drag handling is already setup in _renderTranslationContent
    // Additional interaction setup can be added here
  }

  /**
   * Add outside click listener with delay
   */
  _addOutsideClickListenerDelayed() {
    setTimeout(() => {
      if (this.state.isVisible && !this.state.pendingTranslationWindow) {
        this.clickManager.addOutsideClickListener();
      }
    }, WindowsConfig.TIMEOUTS.OUTSIDE_CLICK_DELAY);
  }

  /**
   * Handle cross-frame outside click
   */
  _handleCrossFrameOutsideClick() {
    if (this.state.hasActiveElements) {
      this.dismiss(true);
    }
  }

  /**
   * Handle outside click
   */
  _handleOutsideClick() {
    if (this.state.shouldPreventDismissal) return;
    this.dismiss(true);
  }

  /**
   * Handle icon click
   */
  _handleIconClick() {
    const context = this.clickManager.handleIconClick(this.state.iconClickContext);
    if (!context) return;

    // Set prevention flag
    if (state && typeof state === 'object') {
      state.preventTextFieldIconCreation = true;
    }

    // Emit icon clicked event for Vue UI Host to handle
    if (context.iconId) {
      WindowsManagerEvents.iconClicked({
        id: context.iconId,
        text: context.text,
        position: context.position
      });
    }

    // Clean up icon
    this._cleanupIcon(false);

    // Create translation window (use _showWindow to handle iframe logic)
    this._showWindow(context.text, context.position);

    // Complete transition
    this.clickManager.completeIconTransition();
    
    setTimeout(() => {
      if (state && typeof state === 'object') {
        state.preventTextFieldIconCreation = false;
      }
    }, WindowsConfig.TIMEOUTS.PENDING_WINDOW_RESET);
  }

  /**
   * Handle window creation request from iframe
   */
  async _handleWindowCreationRequest(data) {
    if (this.crossFrameManager.isInIframe) return;

    try {
      // Get iframe element and adjust position
      let adjustedPosition = { ...data.position };
      const targetFrame = this.crossFrameManager.getIframeByFrameId(data.frameId);
      
      if (targetFrame) {
        adjustedPosition = this.positionCalculator.calculateAdjustedPositionForIframe(
          data.position,
          data.frameId,
          window.translateItFrameMap
        );
      }

      // Mark position as already adjusted
      adjustedPosition._alreadyAdjusted = true;
      this.state.setRequestingFrameId(data.frameId);
      
      // Generate unique ID for this window
      const windowId = `translation-window-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Emit event to create window through Vue UI Host
      WindowsManagerEvents.showWindow({
        id: windowId,
        selectedText: data.selectedText,
        position: adjustedPosition,
        mode: 'window'
      });
      
      // Store state for this window
      this.state.setOriginalText(data.selectedText);
      this.state.setTranslationCancelled(false);
      this.state.setIconMode(false);
      this.state.setVisible(true);
      
      // Start translation process
      this._startTranslationProcess(windowId, data.selectedText);
      
      // Notify success with the window ID
      this.crossFrameManager.notifyWindowCreated(data.frameId, true, windowId);
      
      this.logger.debug('Cross-frame window creation event emitted successfully', { windowId, frameId: data.frameId });
      
    } catch (error) {
      this.logger.error('Failed to create window in main document:', error);
      this.crossFrameManager.notifyWindowCreated(data.frameId, false, null, error.message);
    }
  }

  /**
   * Handle window creation response for iframe
   */
  _handleWindowCreatedResponse(data) {
    if (!this.crossFrameManager.isInIframe) return;

    this.logger.debug('Received window creation response in iframe', {
      success: data.success,
      windowId: data.windowId,
      error: data.error
    });

    if (data.success) {
      this.logger.debug('Window successfully created in main document, updating iframe state');
      this.state.setVisible(true);
      this.state.mainDocumentWindowId = data.windowId;
      this.clickManager.addOutsideClickListener();
    } else {
      this.logger.error('Failed to create window in main document:', data.error);
    }
  }

  /**
   * Handle text selection window request from iframe
   * @param {Object} data - Text selection data from iframe
   * @param {Window} sourceWindow - Source iframe window
   */
  async _handleTextSelectionWindowRequest(data, sourceWindow) {
    // Only handle in main frame
    if (this.crossFrameManager.isInIframe) return;

    try {
      // Adjust position for iframe coordinates
      let adjustedPosition = { ...data.position };
      
      const allIframes = document.querySelectorAll('iframe');

      // Find iframe element by source window
      let iframe = null;
      
      // Primary approach: Find by contentWindow (most reliable when possible)
      iframe = Array.from(allIframes).find(frame => {
        try {
          return frame.contentWindow === sourceWindow;
        } catch (e) {
          // Cross-origin iframe, can't access contentWindow - this is normal
          return false;
        }
      });
      
      // If contentWindow approach didn't work (cross-origin), we can't identify the exact iframe
      // This is a limitation of cross-origin security, so we gracefully skip positioning adjustment
      if (!iframe) {
        this.logger.warn('Could not identify source iframe (likely cross-origin). Using original position without offset adjustment.');
        // Use original position without iframe offset - this is the safest approach
        adjustedPosition = { ...data.position, _isViewportRelative: false };
      }
      
      if (iframe) {
        const iframeRect = iframe.getBoundingClientRect();
        adjustedPosition.x += iframeRect.left;
        adjustedPosition.y += iframeRect.top;
        // Mark as viewport-relative to prevent double scroll adjustment in Vue
        adjustedPosition._isViewportRelative = true;
      }

      await this.show(data.selectedText, adjustedPosition);

    } catch (error) {
      this.logger.error('Failed to handle text selection window request from iframe:', error);
    }
  }

  /**
   * Handle translation error - now delegates to Vue UI Host
   */
  async _handleTranslationError(error, selectedText, position) {
    // Get the original error message, preserve specific details
    const originalMessage = error instanceof Error ? error.message : String(error);
    
    // Use ErrorHandler for type detection and centralized logging
    const errorInfo = await this.translationHandler.errorHandler.getErrorForUI(error, 'windows-manager-translate');
    
    this.logger.error(`Translation error - Type: ${errorInfo.type}, Original: ${originalMessage}, Processed: ${errorInfo.message}`);
    
    // Generate unique ID for error window
    const windowId = `translation-window-error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.state.setActiveWindowId(windowId);

    // Get current theme
    const theme = await this.themeManager.getCurrentTheme();

    // Use the original specific error message instead of the generic one
    const displayMessage = originalMessage && originalMessage.length > 10 && 
                         !originalMessage.includes('Translation failed: No translated text') ? 
                         originalMessage : errorInfo.message;
    
    // Emit event to create error window through Vue UI Host
    WindowsManagerEvents.showWindow({
      id: windowId,
      selectedText: selectedText,
      initialTranslatedText: `Error: ${displayMessage}`,
      position: position,
      theme: theme,
      isError: true
    });
    
    // Use centralized error handler but keep silent to avoid double notifications
    await this.translationHandler.errorHandler.handle(error, {
      type: errorInfo.type,
      context: "windows-manager-translate",
      isSilent: true
    });
  }


  /**
   * Handle general errors
   */
  _handleError(error, context) {
    // Use ExtensionContextManager for context error detection
    if (ExtensionContextManager.isContextError(error)) {
      ExtensionContextManager.handleContextError(error, context);
    } else {
      this.logger.error(`Error in ${context}:`, error);
    }
    
    if (this.translationHandler.errorHandler) {
      this.translationHandler.errorHandler.handle(error, { context });
    }
  }

  /**
   * Cancel current translation
   */
  cancelCurrentTranslation() {
    this.dismiss();
    this.state.setTranslationCancelled(true);
    this.ttsManager.stopCurrentTTS();
  }

  /**
   * Handle icon click event from the Vue UI Host
   * @param {object} detail - Event detail containing { id, text, position }
   */
  _handleIconClickFromVue(detail) {
    this.logger.debug('[LOG] Icon click event received from UI Host', detail);
    this.logger.debug('[DEBUG] WindowsManager icon click, current state:', {
      isProcessing: this.state.isProcessing,
      isIconMode: this.state.isIconMode,
      isVisible: this.state.isVisible
    });
    
    if (!detail || !detail.id) {
      this.logger.error('[LOG] Icon click event: detail is missing or id is undefined', detail);
      return;
    }

    // Prevent duplicate processing of the same icon click
    if (this.state.isProcessing) {
      this.logger.debug('[LOG] Already processing icon click, ignoring duplicate');
      return;
    }
    
    // Check if this is a recent click from a just-dismissed icon
    // Allow clicks within a short window after dismiss to handle timing issues
    const recentDismissWindow = 1000; // 1 second grace period
    const now = Date.now();
    
    if (!this.state.isIconMode) {
      // Check if we recently dismissed this specific icon
      if (this._lastDismissedIcon && 
          this._lastDismissedIcon.id === detail.id && 
          (now - this._lastDismissedIcon.timestamp) < recentDismissWindow) {
        this.logger.debug('[DEBUG] Accepting recent click from dismissed icon:', detail.id);
        // Temporarily restore icon mode for processing
        this.state.setIconMode(true);
      } else {
        this.logger.debug('[DEBUG] Ignoring icon click - no longer in icon mode and not recent');
        return;
      }
    }

    const { id, text, position } = detail;
    this.logger.debug(`[LOG] Icon click event detail: id=${id}, text=${text}, position=${JSON.stringify(position)}`);

    // Set processing state to prevent duplicates
    this.state.setProcessing(true);

    // Prevent other icons from being created while we process this click
    if (state && typeof state === 'object') {
      state.preventTextFieldIconCreation = true;
    }

    // Set flag to preserve selection during icon->window transition BEFORE calling _showWindow
    this._isIconToWindowTransition = true;
    this.logger.debug('[Selection] Set transition flag - preserving selection during icon->window transition');
    
    // Dismiss the icon that was clicked
    this.logger.debug(`[LOG] Dismissing icon with id=${id}`);
    
    // Track dismissed icon for timing tolerance
    this._lastDismissedIcon = {
      id: id,
      timestamp: Date.now()
    };
    
    WindowsManagerEvents.dismissIcon(id);

    // Show the translation window
    this.logger.debug(`[LOG] Calling _showWindow with text=${text}, position=${JSON.stringify(position)}`);
    this._showWindow(text, position);

    // Reset flags after processing - don't reset immediately, let setTimeout handle it
    setTimeout(() => {
      if (state && typeof state === 'object') {
        state.preventTextFieldIconCreation = false;
      }
      this.state.setProcessing(false);
    }, WindowsConfig.TIMEOUTS.PENDING_WINDOW_RESET);
  }

  /**
   * Dismiss the current window/icon
   * @param {boolean} withFadeOut - Whether to animate the dismissal
   * @param {boolean} preserveSelection - Whether to preserve text selection (for icon->window transitions)
   */
  dismiss(withFadeOut = true, preserveSelection = false) {
    this.logger.debug('[LOG] WindowsManager.dismiss called', {
      withFadeOut,
      isIconMode: this.state.isIconMode,
      isVisible: this.state.isVisible,
      iconId: this.state.iconClickContext?.iconId,
      windowId: this.state.activeWindowId,
      stack: new Error().stack
    });
    // Clear text selection only when dismissing icon mode AND extension context is valid
    // AND we're not preserving selection (e.g., for icon->window transitions)
    const shouldClearSelection = this.state.isIconMode && ExtensionContextManager.isValidSync() && !preserveSelection;
    this.logger.debug('[Selection] Dismiss logic:', {
      isIconMode: this.state.isIconMode,
      extensionContextValid: ExtensionContextManager.isValidSync(),
      preserveSelection,
      shouldClearSelection
    });
    
    if (shouldClearSelection) {
      this.logger.debug('[Selection] Clearing text selection');
      this._clearTextSelection();
    } else {
      this.logger.debug('[Selection] Preserving text selection');
    }

    // Get current window/icon IDs before cleanup
    const iconId = this.state.iconClickContext?.iconId;
    const windowId = this.state.activeWindowId;

    // Clean up icon
    this._cleanupIcon(true);

    // Clean up window - now handled by Vue UI Host
    if (this.state.isVisible) {
      // Just reset state, Vue components handle their own cleanup
      this.state.setVisible(false);
    }

    // Emit dismissal events for Vue components
    if (iconId) {
      // Track dismissed icon for timing tolerance  
      this._lastDismissedIcon = {
        id: iconId,
        timestamp: Date.now()
      };
      
      WindowsManagerEvents.dismissIcon(iconId);
    }
    
    if (windowId) {
      WindowsManagerEvents.dismissWindow(windowId, withFadeOut);
    }

    // Cancel any ongoing translation when dismissing
    if (this.translationHandler) {
      this.state.setTranslationCancelled(true);
      this.translationHandler.cancelAllTranslations();
      this.logger.debug('[Translation] All pending translations cancelled during dismiss');
    }

    // Stop any ongoing TTS when dismissing
    if (this.ttsManager) {
      try {
        this.ttsManager.stopCurrentTTS();
        this.logger.debug('[TTS] TTS stopped during WindowsManager dismiss');
      } catch (error) {
        this.logger.warn('[TTS] Failed to stop TTS during dismiss:', error);
      }
    }
    
    // Clear TTS request tracking
    this._currentTTSRequest = null;

    // Reset flags
    this._resetState();
    this.state.setProcessing(false); // Ensure processing is reset on dismiss
  }

  /**
   * Clean up icon - simplified for event-only system
   */
  _cleanupIcon(removeListener = true) {
    // Clear icon context
    this.state.clearIconClickContext();
    
    if (removeListener) {
      this.clickManager.removeOutsideClickListener();
    }
    // Icon animation and DOM cleanup now handled by Vue components
  }

  /**
   * Clean up window - simplified for event-only system
   */
  async _cleanupWindow(withFadeOut) {
    this.logger.debug('[LOG] WindowsManager._cleanupWindow - simplified for Vue UI Host');
    
    // Note: Don't remove theme listeners here - keep them for future windows
    this.clickManager.removeOutsideClickListener();
    
    this.state.setVisible(false);
    // Animation and DOM cleanup now handled by Vue components
  }

  /**
   * Reset state
   */
  _resetState() {
    this.state.setPendingTranslationWindow(false);
    this.state.setIconMode(false);
    
    // Reset selection preservation flag
    this._isIconToWindowTransition = false;
    
    if (state && typeof state === 'object') {
      state.preventTextFieldIconCreation = false;
    }
  }

  /**
   * Clear text selection
   */
  _clearTextSelection() {
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

  

  // Backward compatibility getters
  get isVisible() {
    return this.state.isVisible;
  }

  get isIconMode() {
    return this.state.isIconMode;
  }

  get frameId() {
    return this.crossFrameManager.frameId;
  }

  get isInIframe() {
    return this.crossFrameManager.isInIframe;
  }

  /**
   * Destroy the WindowsManager and cleanup all resources
   */
  destroy() {
    // Cleanup event listeners and resources
    this.cleanup();
    
    // Clean up DOM references
    this.displayElement = null;
    this.innerContainer = null;
    this.icon = null;
    
    // Destroy child managers if they have destroy methods
    if (this.crossFrameManager && typeof this.crossFrameManager.destroy === 'function') {
      this.crossFrameManager.destroy();
    }
    if (this.translationHandler && typeof this.translationHandler.destroy === 'function') {
      this.translationHandler.destroy();
    }
    if (this.clickManager && typeof this.clickManager.destroy === 'function') {
      this.clickManager.destroy();
    }
    if (this.themeManager && typeof this.themeManager.destroy === 'function') {
      this.themeManager.destroy();
    }
    if (this.ttsManager && typeof this.ttsManager.destroy === 'function') {
      this.ttsManager.destroy();
    }
    
    this.logger.debug('🗑️ WindowsManager destroyed');
  }
}
