// src/managers/content/windows/NewWindowsManager.js

import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import { WindowsConfig } from "./core/WindowsConfig.js";
import { WindowsState } from "./core/WindowsState.js";
import { CrossFrameManager } from "./crossframe/CrossFrameManager.js";
import { TranslationHandler as WindowsTranslationHandler } from "./translation/TranslationHandler.js";
import { ClickManager } from "./interaction/ClickManager.js";
import { ThemeManager } from "./theme/ThemeManager.js";
// TTS functionality will be loaded lazily when needed
// UI-related imports removed - now handled by Vue UI Host
// - WindowsFactory, PositionCalculator, SmartPositioner
// - AnimationManager, TranslationRenderer, DragHandler
import { settingsManager } from '@/shared/managers/SettingsManager.js';
import { state } from "@/shared/config/config.js";
import { ErrorHandler } from "@/shared/error-management/ErrorHandler.js";
import ExtensionContextManager from "@/core/extensionContext.js";
// Import event constants, get pageEventBus instance at runtime
import { WINDOWS_MANAGER_EVENTS, WindowsManagerEvents } from '@/core/PageEventBus.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';

/**
 * Modular WindowsManager for translation windows and icons
 * Refactored to use specialized modules for better maintainability
 */
// Singleton instance
let windowsManagerInstance = null;

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

    // Enforce singleton pattern
    if (windowsManagerInstance) {
      return windowsManagerInstance;
    }
    
    // Initialize logger
    this.logger = getScopedLogger(LOG_COMPONENTS.WINDOWS, 'WindowsManager');
    this.logger.info('WindowsManager initialized', options);

    // Store singleton instance
    windowsManagerInstance = this;
    
    // Initialize cross-frame communication first to get frameId
    this.crossFrameManager = new CrossFrameManager({
      debugCrossFrame: options.debugCrossFrame
    });
    
    // Initialize core modules for business logic only
    this.state = new WindowsState(this.crossFrameManager.frameId);
    
    // Initialize TTS system - will be loaded lazily when needed
    this.tts = null;
    this.ttsManager = null;
    
    // Initialize translation business logic
    this.translationHandler = options.translationHandler || new WindowsTranslationHandler();
    
    // Initialize error handling
    this.errorHandler = ErrorHandler.getInstance();
    
    // Initialize interaction management (outside clicks)
    this.clickManager = new ClickManager(this.crossFrameManager, this.state);
    
    // Initialize theme management
    this.themeManager = new ThemeManager();

    // UI-related modules removed - now handled by Vue UI Host
    // - factory, positionCalculator, smartPositioner
    // - animationManager, translationRenderer, dragHandler
    // this.icon = null;
    
    // State flags for selection preservation
    this._isIconToWindowTransition = false;
    this._lastDismissedIcon = null;

    // State flags for text field typing handling
    this._isDismissingDueToTyping = false;
    this._preserveSelectionForTyping = false;

    // State flag for preventing duplicate dismiss calls
    this._isDismissing = false;

    // State flag for preventing dismiss during Shift+Click operations
    this._isInShiftClickOperation = false;

    // Event handler references
    this._inputHandler = null;
    this._iconClickHandler = null;
    
    // External dependencies
    this.translationHandler.errorHandler = options.translationHandler?.errorHandler || ErrorHandler.getInstance();
    this.notifier = options.notifier;
    
    // Animation durations removed - handled by Vue UI Host
    
    this._setupEventHandlers();
    this._initialize();
  }

  /**
   * Lazy load TTS functionality when needed
   * @private
   */
  async _ensureTTSLoaded() {
    if (!this.tts || !this.ttsManager) {
      try {
        const { TTSFactory } = await import('@/features/tts/TTSFactory.js');

        // Load TTS Smart composable
        const useTTSSmart = await TTSFactory.getTTSSmart();
        this.tts = useTTSSmart();

        // Load TTS Global Manager
        const ttsGlobal = await TTSFactory.getTTSGlobal();
        this.ttsManager = ttsGlobal.TTSGlobalManager;

        this.logger.info('[TTS] TTS functionality loaded');
      } catch (error) {
        this.logger.error('[TTS] Failed to load TTS functionality:', error);
        throw error;
      }
    }
    return this.tts;
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
    if (this.pageEventBus) {
      // Create bound handler to enable proper cleanup
      this._iconClickHandler = (payload) => {
        this._handleIconClickFromVue(payload);
      };
      
      // Remove any existing listener first to prevent duplicates
      this.pageEventBus.off(WINDOWS_MANAGER_EVENTS.ICON_CLICKED, this._iconClickHandler);
      this.pageEventBus.on(WINDOWS_MANAGER_EVENTS.ICON_CLICKED, this._iconClickHandler);
      this.pageEventBus.on('translation-window-speak', this._handleSpeakRequest.bind(this));
    } else {
      this.logger.warn('PageEventBus not available during setup');
    }
    // Development toggle handler - use tracked event listener
    this.addEventListener(window, 'toggle-windows-manager-renderer', this._handleToggleRenderer.bind(this));
  }

  /**
   * Handle renderer toggle event
   */
  _handleToggleRenderer() {
    const newRendererType = this.toggleEnhancedRenderer();
    
    // If there's an active translation window, re-render with new renderer through Vue UI Host
    if (this.state.isVisible && this.state.originalText && this.state.translatedText) {
      // Emit update event to Vue UI Host to re-render with new renderer
      // Note: This could be implemented later as WINDOWS_MANAGER_EVENTS.UPDATE_RENDERER
      this.logger.debug('Active translation will be re-rendered with new renderer through Vue UI Host');
    }
    
    this.logger.info(`Renderer toggled to: ${newRendererType ? 'Enhanced' : 'Classic'}`);
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
    this.logger.info(`Renderer preference toggled to: ${newState ? 'Enhanced' : 'Classic'} (handled by Vue UI Host)`);
    
    return newState;
  }

  /**
   * Initialize the WindowsManager
   */
  async _initialize() {
    try {
      await this.themeManager.initialize();
      this.logger.info('WindowsManager initialized successfully');
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
      this.logger.debug('Extension context invalid, aborting show()');
      return;
    }

    if (this.state.isProcessing) {
      return;
    }
    
    this.logger.info('WindowsManager.show() called', {
      text: selectedText ? selectedText.substring(0, 30) + '...' : 'null',
      position
    });
    
    // Prevent showing same text multiple times
    if (this._shouldSkipShow(selectedText)) {
      return;
    }
    
    // Check if this is an icon->window transition OR we're in onClick mode, preserve selection if so
    // In onClick mode, we show icons first and user will click later, so preserve selection
    const selectionTranslationMode = settingsManager.get('selectionTranslationMode', 'onClick');
    const isOnClickMode = selectionTranslationMode === 'onClick';
    const preserveSelection = this._isIconToWindowTransition || isOnClickMode;
    await this.dismiss(false, preserveSelection);
    
    // Reset the transition flag after using it
    this._isIconToWindowTransition = false;
    
    if (!selectedText) return;

    this.state.setProcessing(true);

    try {
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
      return true;
    }
    return false;
  }

  /**
   * Show translate icon
   */
  async _showIcon(selectedText, position) {
    if (!ExtensionContextManager.isValidSync()) {
      this.logger.debug('Extension context invalid, cannot create icon');
      return;
    }

    this.logger.debug('Creating translation icon', {
      textLength: selectedText.length,
      position: {
        x: Math.round(position.x || 0),
        y: Math.round(position.y || 0)
      }
    });

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
    
    // Outside click handling is now managed by ClickManager

    // Add outside click listener with delay for iframe support
    setTimeout(() => {
      if (this.state.hasActiveElements && !this.state.pendingTranslationWindow) {
        this.clickManager.addOutsideClickListener();

        // Notify iframes to activate their click listeners
        if (this.crossFrameManager && !this.crossFrameManager.isInIframe) {
          this.crossFrameManager.messageRouter._broadcastToAllIframes({
            type: 'translateit-activate-click-listeners',
            frameId: this.crossFrameManager.frameId,
            timestamp: Date.now()
          });
        }
      }
    }, WindowsConfig.TIMEOUTS.OUTSIDE_CLICK_DELAY);

    this.logger.info('Translation icon created successfully', { iconId });
  }

  /**
   * Add listener to dismiss icon or window on outside clicks
   * Using click event with text element detection to avoid interfering with text selection
   */
  _addDismissListener() {
    // Remove any existing listener first
    this._removeDismissListener();

    // Create bound handler for reuse
    this._dismissHandler = (event) => {
      // Handle both icon mode and visible window mode
      if (!this.state.isIconMode && !this.state.isVisible) return;

      // Don't dismiss during Shift+Click operations
      if (this._isInShiftClickOperation || window.translateItShiftClickOperation) {
        return;
      }

      // Don't dismiss on middle or right clicks
      if (event.button !== 0) {
        return;
      }

      const target = event.target;

      // Use the same logic as ClickManager for consistency
      // Check if click is inside Vue UI Host (Shadow DOM contains both icons and windows)
      const vueUIHostMain = document.getElementById('translate-it-host-main');
      const vueUIHostIframe = document.getElementById('translate-it-host-iframe');
      const vueUIHost = vueUIHostMain || vueUIHostIframe;

      const isInsideVueUIHost = vueUIHost && vueUIHost.contains(target);

      // Also check legacy elements for compatibility
      const iconElement = document.getElementById('translate-it-icon'); // WindowsConfig.IDS.ICON
      const isInsideLegacyIcon = iconElement && iconElement.contains(target);

      const windowElements = document.querySelectorAll('.translation-window');
      const isInsideLegacyWindow = Array.from(windowElements).some(element =>
        element.contains(target)
      );

      const isClickingOnTranslationUI = isInsideVueUIHost || isInsideLegacyIcon || isInsideLegacyWindow;

      if (isClickingOnTranslationUI) {
        // If we're in window mode and clicking inside, set the flag
        if (this.state.isVisible && !this.state.isIconMode) {
          this.state._lastClickWasInsideWindow = true;
        }

        this.logger.debug('Click on translation UI element - not dismissing', {
          target: target?.tagName,
          className: target?.className,
          closestIcon: !!target?.closest('.translation-icon'),
          closestWindow: !!target?.closest('.translation-window'),
          isIconMode: this.state.isIconMode,
          isVisible: this.state.isVisible
        });
        return;
      }

      // Check if clicking on a text-containing element
      const isTextElement = target.nodeType === Node.TEXT_NODE ||
                           target.tagName === 'P' ||
                           target.tagName === 'SPAN' ||
                           target.tagName === 'DIV' ||
                           target.tagName === 'H1' ||
                           target.tagName === 'H2' ||
                           target.tagName === 'H3' ||
                           target.tagName === 'H4' ||
                           target.tagName === 'H5' ||
                           target.tagName === 'H6' ||
                           target.tagName === 'TD' ||
                           target.tagName === 'LI' ||
                           target.tagName === 'A' ||
                           target.tagName === 'B' ||
                           target.tagName === 'I' ||
                           target.tagName === 'STRONG' ||
                           target.tagName === 'EM';

      if (isTextElement) {
        // Check if there's any text selection
        const selection = window.getSelection();
        const hasSelection = selection && selection.toString().trim().length > 0;

        if (hasSelection) {
          this.logger.debug('Click on text element with selection - not dismissing', {
            target: target?.tagName,
            selectionLength: selection.toString().length
          });
          return;
        }
      }

      this.logger.info('Outside click detected - dismissing window', {
        target: target?.tagName,
        isIconMode: this.state.isIconMode,
        isVisible: this.state.isVisible
      });

      // Dismiss immediately
      this.dismiss();
    };

    // Use click with delay to dismiss - allows drag operations to complete first
    // Use passive event listener for better performance
    document.addEventListener('click', this._dismissHandler, { capture: false, passive: true });

    // Add input event listener specifically for text field typing when in icon mode
    if (this.state.isIconMode) {
      this._inputHandler = (event) => {
        // Only handle input events on text fields
        const target = event.target;
        if (this.isTextFieldElement(target)) {
          // Only handle input events (actual text changes)
          if (event.type !== 'input') {
            return;
          }

          // Debounce rapid successive input events
          const currentTime = Date.now();
          if (currentTime - this._lastInputTime < this._inputDebounceDelay) {
            return;
          }
          this._lastInputTime = currentTime;

          this.logger.debug('Input detected in text field - dismissing icon', {
            target: target?.tagName,
            targetType: target?.type || 'contenteditable',
            eventType: event.type
          });

          // Don't prevent default - let the key be processed normally
          // We just need to dismiss the icon and ensure focus stays

          // Store the active element before dismissing
          const elementToRefocus = target;

          // Remove listeners first to prevent multiple dismissals
          this._removeDismissListener();

          // Set flag to prevent multiple dismissals from other components
          this._isDismissingDueToTyping = true;

          // Use microtask for immediate response
          Promise.resolve().then(() => {
            // Store the element reference for focus restoration
            const element = elementToRefocus;

            // Set flag to preserve selection during dismissal
            const wasPreservingSelection = this._preserveSelectionForTyping;
            this._preserveSelectionForTyping = true;

            // Dismiss the icon without clearing selection and without animation
            this.dismiss(false, true);

            // Use microtask again to ensure DOM is ready
            Promise.resolve().then(() => {
              // Restore focus to the text field after dismissal
              if (element && element.isConnected && typeof element.focus === 'function') {
                try {
                  element.focus();
                  this.logger.debug('Focus restored to text field after typing dismissal');
                } catch (focusError) {
                  this.logger.warn('Failed to restore focus to text field', focusError);
                }
              }

              // Restore the flag after all operations
              this._preserveSelectionForTyping = wasPreservingSelection;

              // Clear the typing dismissal flag
              this._isDismissingDueToTyping = false;
            });
          });
        }
      };

      // Listen for input events with higher priority to catch typing early
      // Use capture phase to intercept before other handlers
      document.addEventListener('input', this._inputHandler, { capture: true, passive: false });

      // Also listen for keydown events as backup
      this._keydownHandler = (event) => {
        const target = event.target;
        if (this.isTextFieldElement(target) && this.state.isIconMode) {
          // Only handle actual typing keys (letters, numbers, space, backspace, delete)
          const isTypingKey = event.key.length === 1 ||
                            ['Backspace', 'Delete', 'Enter', 'Tab'].includes(event.key) ||
                            (event.key.length > 1 && event.key.startsWith('Arrow'));

          if (isTypingKey) {
            this.logger.debug('Typing key detected in text field', { key: event.key });

            // Set typing flag immediately
            this._isDismissingDueToTyping = true;
            this._preserveSelectionForTyping = true;

            // Store element for focus restoration
            const elementToRefocus = target;

            // Schedule dismiss with focus preservation
            Promise.resolve().then(() => {
              this.dismiss(false, true);

              // Restore focus
              Promise.resolve().then(() => {
                if (elementToRefocus && elementToRefocus.isConnected && typeof elementToRefocus.focus === 'function') {
                  try {
                    elementToRefocus.focus();
                    this.logger.debug('Focus restored after keydown dismiss');
                  } catch (focusError) {
                    this.logger.warn('Failed to restore focus after keydown dismiss', focusError);
                  }
                }

                // Clear flags
                this._isDismissingDueToTyping = false;
                this._preserveSelectionForTyping = false;
              });
            });
          }
        }
      };

      document.addEventListener('keydown', this._keydownHandler, { capture: true, passive: false });

      // Add debouncing for rapid successive input events
      this._lastInputTime = 0;
      this._inputDebounceDelay = 50; // Reduced delay for faster response

      this.logger.debug('Added enhanced text field input listeners with focus preservation');
    }

    // Also add Escape key listener for better UX
    this._escapeKeyHandler = (event) => {
      // Only dismiss on Escape key, ignore other keys like Shift
      if (event.key === 'Escape' && (this.state.isIconMode || this.state.isVisible)) {
        this.logger.info('Escape key pressed - dismissing window');
        this.dismiss();
      }
    };
    // Note: Escape key listener cannot be passive as we may need to prevent default
    document.addEventListener('keydown', this._escapeKeyHandler, { capture: false });

    this.logger.info('Added click dismiss listener with text element detection and Escape key handler', {
      forIcon: this.state.isIconMode,
      forWindow: this.state.isVisible
    });
  }

  /**
   * Remove dismiss listener
   */
  _removeDismissListener() {
    if (this._dismissHandler) {
      document.removeEventListener('click', this._dismissHandler, { capture: false });
      this._dismissHandler = null;
    }

    if (this._inputHandler) {
      document.removeEventListener('input', this._inputHandler, { capture: true });
      this._inputHandler = null;
    }

    if (this._keydownHandler) {
      document.removeEventListener('keydown', this._keydownHandler, { capture: true });
      this._keydownHandler = null;
    }

    if (this._escapeKeyHandler) {
      document.removeEventListener('keydown', this._escapeKeyHandler, { capture: false });
      this._escapeKeyHandler = null;
    }

    if (this._shiftKeyReleaseHandler) {
      document.removeEventListener('keyup', this._shiftKeyReleaseHandler, { capture: true });
      this._shiftKeyReleaseHandler = null;
    }

    this.logger.debug('Removed dismiss listeners');
  }

  /**
   * Handle TTS speak request from Vue component
   */
  async _handleSpeakRequest(detail) {
    this.logger.debug('Speak request received from UI Host', detail);
    if (!detail || !detail.text) return;

    try {
      // Load TTS lazily when needed
      const tts = await this._ensureTTSLoaded();

      if (detail.isSpeaking) {
        // Use unified TTS composable
        await tts.speak(detail.text, detail.language || 'auto');
        this.logger.info('TTS started via unified composable');
      } else {
        // Stop current TTS
        await tts.stop();
        this.logger.info('TTS stopped via unified composable');
      }
    } catch (error) {
      this.logger.error('TTS error:', error);
      await this.errorHandler.handle(error, {
        context: 'windows-manager-tts',
        showToast: false
      });
    }
  }

  /**
   * Show translation window with two-phase loading
   */
  async _showWindow(selectedText, position) {
    if (!ExtensionContextManager.isValidSync() || !selectedText) {
      this.logger.debug('Cannot show window: invalid context or empty text', { selectedText });
      return;
    }

    this.logger.info('Creating translation window', {
      textLength: selectedText.length,
      position: {
        x: Math.round(position.x || 0),
        y: Math.round(position.y || 0)
      },
      context: this.crossFrameManager.isInIframe ? 'iframe' : 'main-frame'
    });

      
    // NEW: Create window directly in iframe using Vue UI Host
    // The old cross-frame logic is no longer needed since each frame has its own Vue UI Host
    this.logger.info(`Creating window directly in current frame (${this.crossFrameManager.isInIframe ? 'iframe' : 'main-frame'})`);

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

    // Add outside click listener with delay for iframe support
    setTimeout(() => {
      if (this.state.hasActiveElements && !this.state.pendingTranslationWindow) {
        this.clickManager.addOutsideClickListener();

        // Notify iframes to activate their click listeners
        if (this.crossFrameManager && !this.crossFrameManager.isInIframe) {
          this.crossFrameManager.messageRouter._broadcastToAllIframes({
            type: 'translateit-activate-click-listeners',
            frameId: this.crossFrameManager.frameId,
            timestamp: Date.now()
          });
        }
      }
    }, WindowsConfig.TIMEOUTS.OUTSIDE_CLICK_DELAY);

    this.logger.info('Translation window created successfully', { windowId });

    // PHASE 2: Perform translation and update window
    try {
      const translationResult = await this._startTranslationProcess(selectedText);

      // If translation was cancelled (returns null for cancellation only)
      if (!translationResult) {
        this.logger.info('Translation cancelled by user, updating window with cancellation message');
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
      
      this.logger.info('Window updated with translation result', { windowId });
      
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
      
      // Outside click handling is now managed by ClickManager
      
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
        isLoading: false,
        targetLanguage: result.targetLanguage || 'auto'
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
   * Handle cross-frame outside click
   */
  async _handleCrossFrameOutsideClick() {
    if (this.state.hasActiveElements) {
      await this.dismiss(true);
    }
  }

  /**
   * Handle outside click
   */
  async _handleOutsideClick() {
    if (this.state.shouldPreventDismissal) return;

    // Check for drag operations - get reference to textSelectionManager if available
    let textSelectionManager = null;
    if (window.textSelectionManager) {
      textSelectionManager = window.textSelectionManager;
    } else if (window.TranslateItTextSelectionManager) {
      textSelectionManager = window.TranslateItTextSelectionManager;
    }

    // Prevent dismissal during or after drag operations
    if (textSelectionManager &&
        (textSelectionManager.isDragging ||
         textSelectionManager.justFinishedDrag ||
         textSelectionManager.preventDismissOnNextClear)) {
      this.logger.debug('Outside click ignored during drag operation in _handleOutsideClick', {
        isDragging: textSelectionManager.isDragging,
        justFinishedDrag: textSelectionManager.justFinishedDrag,
        preventDismissOnNextClear: textSelectionManager.preventDismissOnNextClear
      });
      return;
    }

    await this.dismiss(true);
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
      
      this.logger.info('Cross-frame window creation event emitted successfully', { windowId, frameId: data.frameId });
      
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

    this.logger.info('Received window creation response in iframe', {
      success: data.success,
      windowId: data.windowId,
      error: data.error
    });

    if (data.success) {
      this.logger.info('Window successfully created in main document, updating iframe state');
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
        } catch {
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
  async cancelCurrentTranslation() {
    await this.dismiss();
    this.state.setTranslationCancelled(true);
    try {
      if (this.tts) {
        await this.tts.stopAll();
      }
    } catch (error) {
      this.logger.warn('Failed to stop TTS during translation cancellation:', error);
    }
  }

  /**
   * Handle icon click event from the Vue UI Host
   * @param {object} detail - Event detail containing { id, text, position }
   */
  _handleIconClickFromVue(detail) {
    this.logger.info('Icon click event received from UI Host', {
      id: detail?.id,
      processing: this.state.isProcessing,
      mode: this.state.isIconMode ? 'icon' : 'window'
    });

    if (!detail || !detail.id) {
      this.logger.error('Icon click event: detail is missing or id is undefined', detail);
      return;
    }

    // Prevent duplicate processing of the same icon click
    if (this.state.isProcessing) {
      return;
    }

    // Track recently processed clicks to prevent duplicates
    const now = Date.now();
    if (this._lastProcessedClick &&
        this._lastProcessedClick.id === detail.id &&
        (now - this._lastProcessedClick.timestamp) < 500) { // 500ms debounce
      this.logger.debug('Ignoring duplicate click within debounce window');
      return;
    }

    // Check if this is a recent click from a just-dismissed icon
    // Allow clicks within a short window after dismiss to handle timing issues
    const recentDismissWindow = 1000; // 1 second grace period

    if (!this.state.isIconMode) {
      // Check if we recently dismissed this specific icon
      if (this._lastDismissedIcon &&
          this._lastDismissedIcon.id === detail.id &&
          (now - this._lastDismissedIcon.timestamp) < recentDismissWindow) {
        // Temporarily restore icon mode for processing
        this.state.setIconMode(true);
      } else {
        return;
      }
    }

    const { id, text, position } = detail;
    this.logger.debug('Processing icon click', { id, textLength: text?.length });

    // Track this click to prevent duplicates
    this._lastProcessedClick = {
      id: id,
      timestamp: now
    };

    // Set processing state to prevent duplicates
    this.state.setProcessing(true);

    // Prevent other icons from being created while we process this click
    if (state && typeof state === 'object') {
      state.preventTextFieldIconCreation = true;
    }

    // Set flag to preserve selection during icon->window transition BEFORE calling _showWindow
    this._isIconToWindowTransition = true;
    this.logger.info('Set transition flag - preserving selection during icon->window transition');

    // Dismiss the icon that was clicked
    this.logger.info('Dismissing icon', { id });

    // Track dismissed icon for timing tolerance
    this._lastDismissedIcon = {
      id: id,
      timestamp: Date.now()
    };

    WindowsManagerEvents.dismissIcon(id);

    // Show the translation window
    this.logger.info('Calling _showWindow', { textLength: text?.length });
    this._showWindow(text, position);

    // Reset flags after processing - don't reset immediately, let setTimeout handle it
    setTimeout(() => {
      if (state && typeof state === 'object') {
        state.preventTextFieldIconCreation = false;
      }
      this.state.setProcessing(false);
      // Clear the processed click tracking after processing completes
      this._lastProcessedClick = null;
    }, WindowsConfig.TIMEOUTS.PENDING_WINDOW_RESET);
  }

  /**
   * Dismiss the current window/icon
   * @param {boolean} withFadeOut - Whether to animate the dismissal
   * @param {boolean} preserveSelection - Whether to preserve text selection (for icon->window transitions)
   */
  async dismiss(withFadeOut = true, preserveSelection = false) {
    // Track dismissal attempts to prevent duplicates
    const now = Date.now();
    if (this._lastDismissTime && (now - this._lastDismissTime) < 100) {
      return;
    }
    this._lastDismissTime = now;

    // Check if we're already dismissing due to typing - prevent redundant dismissals
    if (this._isDismissingDueToTyping && withFadeOut) {
      return;
    }

    // Check if we're already in the process of dismissing
    if (this._isDismissing) {
      return;
    }

    // Check if we're in a Shift+Click operation
    if (this._isInShiftClickOperation || window.translateItShiftClickOperation) {
      return;
    }

    // Mark that we're starting dismissal
    this._isDismissing = true;

    const dismissMode = this.state.isIconMode ? 'icon' : 'window';
    this.logger.info('Dismissing translation UI', {
      mode: dismissMode,
      reason: this._isDismissingDueToTyping ? 'user_typing' : 'user_action'
    });

    this.logger.debug('Dismiss called', {
      withFadeOut,
      mode: this.state.isIconMode ? 'icon' : 'window',
      isDismissingDueToTyping: this._isDismissingDueToTyping
    });
    // Clear text selection only when dismissing icon mode AND extension context is valid
    // AND we're not preserving selection (e.g., for icon->window transitions)
    // AND we're not preventing dismissal due to drag operations
    // AND user is not doing Shift+Click operations
    let textSelectionManager = null;
    let preventDismissDueToDrag = false;
    let preventDismissDueToShiftClick = false;

    // Check for drag operations - get reference to textSelectionManager if available
    if (window.textSelectionManager) {
      textSelectionManager = window.textSelectionManager;
    } else if (window.TranslateItTextSelectionManager) {
      textSelectionManager = window.TranslateItTextSelectionManager;
    }

    // Check if we should prevent dismissal due to drag operations
    if (textSelectionManager && textSelectionManager.preventDismissOnNextClear) {
      preventDismissDueToDrag = true;
      this.logger.debug('Preventing dismissal due to drag operation');

      // Reset the flag after use to prevent it from affecting future dismissals
      textSelectionManager.preventDismissOnNextClear = false;
    }

    // Check if we should prevent dismissal due to Shift+Click operations
    if (textSelectionManager && textSelectionManager.shiftKeyPressed) {
      preventDismissDueToShiftClick = true;
      this._isInShiftClickOperation = true;
      this.logger.debug('Preventing dismissal due to Shift+Click operation');

      // Reset flag when Shift key is released (event-based approach)
      if (this._shiftKeyReleaseHandler) {
        document.removeEventListener('keyup', this._shiftKeyReleaseHandler, { capture: true });
      }

      this._shiftKeyReleaseHandler = (event) => {
        if (event.key === 'Shift' && this._isInShiftClickOperation) {
          this._isInShiftClickOperation = false;
          document.removeEventListener('keyup', this._shiftKeyReleaseHandler, { capture: true });
          this._shiftKeyReleaseHandler = null;
          this.logger.debug('Shift+Click operation ended - Shift key released');
        }
      };

      document.addEventListener('keyup', this._shiftKeyReleaseHandler, { capture: true });
    }

    // Check if the dismiss is happening in a text field context
    const activeElement = document.activeElement;
    const isInTextField = activeElement && this.isTextFieldElement(activeElement);

    const shouldClearSelection = this.state.isIconMode &&
                               ExtensionContextManager.isValidSync() &&
                               !preserveSelection &&
                               !preventDismissDueToDrag &&
                               !preventDismissDueToShiftClick &&
                               !this._preserveSelectionForTyping &&
                               !this._isDismissingDueToTyping &&
                               !isInTextField; // NEVER clear selection if in text field
    this.logger.debug('Dismiss selection logic', {
      shouldClearSelection,
      preserveSelection,
      preventDismissDueToDrag,
      preventDismissDueToShiftClick,
      isInTextField,
      activeElementTag: activeElement?.tagName,
      activeElementType: activeElement?.type || 'contenteditable'
    });
    
    if (shouldClearSelection) {
      this.logger.debug('Clearing text selection');
      this._clearTextSelection();
    } else {
      this.logger.debug('Preserving text selection');
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

      // Check if cancelAllTranslations method exists (compatibility between core and windows TranslationHandler)
      if (typeof this.translationHandler.cancelAllTranslations === 'function') {
        this.translationHandler.cancelAllTranslations();
        this.logger.info('All pending translations cancelled during dismiss');
      }
    }

    // Stop any ongoing TTS when dismissing
    try {
      if (this.tts) {
        await this.tts.stopAll();
        this.logger.info('TTS stopped during dismiss');
      }
    } catch (error) {
      this.logger.warn('Failed to stop TTS during dismiss:', error);
    }

    // Reset flags
    this._resetState();
    this.state.setProcessing(false); // Ensure processing is reset on dismiss

    // Reset dismissing flag and cleanup tracking
    this._isDismissing = false;

    // Clear dismissal tracking after a short delay to prevent immediate re-creation
    setTimeout(() => {
      this._lastDismissTime = null;
    }, 200);

    this.logger.info('Translation UI dismissed successfully');
  }

  /**
   * Clean up icon - simplified for event-only system
   */
  _cleanupIcon(removeListener = true) {
    // Clear icon context
    this.state.clearIconClickContext();

    if (removeListener) {
      // Remove the immediate dismiss listener
      this._removeDismissListener();
    }

    // Clear click tracking
    this._lastProcessedClick = null;

    // Icon animation and DOM cleanup now handled by Vue components
  }

  /**
   * Clean up window - simplified for event-only system
   */
  async _cleanupWindow() {
    this.logger.debug('Cleaning up window for Vue UI Host');

    // Note: Don't remove theme listeners here - keep them for future windows
    // Remove the immediate dismiss listener
    this._removeDismissListener();
    
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

    // Reset click tracking flag
    this.state._lastClickWasInsideWindow = false;

    // Clear tracking flags
    this._lastProcessedClick = null;
    this._lastDismissedIcon = null;
    this._isDismissingDueToTyping = false;
    this._isInShiftClickOperation = false;

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
  /**
   * Check if an element is a text field (input, textarea, or contenteditable)
   * Enhanced with better edge case handling
   * @param {Element} element - The element to check
   * @returns {boolean} True if the element is a text field
   */
  isTextFieldElement(element) {
    if (!element) return false;

    // Check if element is still connected to DOM
    if (!element.isConnected) return false;

    // Check for standard text input types
    if (element.tagName === 'INPUT') {
      // Exclude certain input types that shouldn't trigger text field behavior
      const excludedTypes = ['checkbox', 'radio', 'submit', 'reset', 'button', 'file', 'image', 'hidden'];
      const inputType = element.type || 'text';
      return !excludedTypes.includes(inputType);
    }

    // Check for textarea
    if (element.tagName === 'TEXTAREA') {
      return true;
    }

    // Check for contenteditable elements
    if (element.isContentEditable === true) {
      return true;
    }

    // Check if element is inside a contenteditable container
    if (element.closest && element.closest('[contenteditable="true"]')) {
      return true;
    }

    // Additional check for elements with contenteditable attribute set to any truthy value
    if (element.hasAttribute('contenteditable') &&
        element.getAttribute('contenteditable') !== 'false') {
      return true;
    }

    return false;
  }

  destroy() {
    // Cleanup event listeners and resources
    this.cleanup();

    // Clean up DOM references
    this.displayElement = null;
    this.innerContainer = null;
    this.icon = null;

    // Clean up state flags
    this._isIconToWindowTransition = false;
    this._lastDismissedIcon = null;
    this._isDismissingDueToTyping = false;
    this._preserveSelectionForTyping = false;
    this._isDismissing = false;
    this._isInShiftClickOperation = false;

    // Clean up event handler references
    this._inputHandler = null;
    this._iconClickHandler = null;
    this._dismissHandler = null;
    this._escapeKeyHandler = null;
    this._shiftKeyReleaseHandler = null;
    
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
    // TTS composable doesn't need explicit cleanup - handled by Vue lifecycle
    
    this.logger.debug('🗑️ WindowsManager destroyed');
  }

  // Static method to get singleton instance
  static getInstance(options = {}) {
    if (!windowsManagerInstance) {
      windowsManagerInstance = new WindowsManager(options);
    }
    return windowsManagerInstance;
  }

  // Method to reset singleton (for testing or cleanup)
  static resetInstance() {
    if (windowsManagerInstance) {
      windowsManagerInstance.destroy();
      windowsManagerInstance = null;
    }
  }
}
