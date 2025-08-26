// src/managers/content/windows/NewWindowsManager.js

import { getScopedLogger } from "../../../utils/core/logger.js";
import { LOG_COMPONENTS } from "../../../utils/core/logConstants.js";
import { WindowsConfig } from "./core/WindowsConfig.js";
import { WindowsState } from "./core/WindowsState.js";
import { WindowsFactory } from "./core/WindowsFactory.js";
import { CrossFrameManager } from "./crossframe/CrossFrameManager.js";
import { PositionCalculator } from "./position/PositionCalculator.js";
import { SmartPositioner } from "./position/SmartPositioner.js";
import { AnimationManager } from "./animation/AnimationManager.js";
import { TranslationHandler } from "./translation/TranslationHandler.js";
import { TTSManager } from "./translation/TTSManager.js";
import { TranslationRenderer } from "./translation/TranslationRenderer.js";
import { EnhancedTranslationRenderer } from "./translation/EnhancedTranslationRenderer.js";
import { DragHandler } from "./interaction/DragHandler.js";
import { ClickManager } from "./interaction/ClickManager.js";
import { ThemeManager } from "./theme/ThemeManager.js";
import { getSettingsAsync, CONFIG, state } from "../../../config.js";
import { ErrorHandler } from "../../../error-management/ErrorHandler.js";
import ExtensionContextManager from "../../../utils/core/extensionContext.js";
import { pageEventBus, WINDOWS_MANAGER_EVENTS, WindowsManagerEvents } from "../../../utils/core/PageEventBus.js";

/**
 * Modular WindowsManager for translation windows and icons
 * Refactored to use specialized modules for better maintainability
 */
export class WindowsManager {
  constructor(options = {}) {
    // Initialize logger
    this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'WindowsManager');
    this.logger.debug('WindowsManager constructor called', options);
    
    // Initialize cross-frame communication first to get frameId
    this.crossFrameManager = new CrossFrameManager({
      debugCrossFrame: options.debugCrossFrame
    });
    
    // Initialize core modules
    this.state = new WindowsState(this.crossFrameManager.frameId);
    this.factory = new WindowsFactory();
    
    // Initialize positioning
    this.positionCalculator = new PositionCalculator();
    this.smartPositioner = new SmartPositioner(this.positionCalculator);
    
    // Initialize animation
    this.animationManager = new AnimationManager();
    
    // Initialize translation
    this.translationHandler = new TranslationHandler();
    this.ttsManager = new TTSManager();
    
    // Initialize translation renderer (enhanced version detection)
    this.useEnhancedRenderer = this._shouldUseEnhancedRenderer();
    if (this.useEnhancedRenderer) {
      this.translationRenderer = new EnhancedTranslationRenderer(this.factory, this.ttsManager);
      this.logger.debug('Using Enhanced TranslationRenderer with Text Actions System');
    } else {
      this.translationRenderer = new TranslationRenderer(this.factory, this.ttsManager);
      this.logger.debug('Using Classic TranslationRenderer');
    }
    
    // Initialize interaction
    this.dragHandler = new DragHandler(this.positionCalculator);
    this.clickManager = new ClickManager(this.crossFrameManager, this.state);
    
    // Initialize theme
    this.themeManager = new ThemeManager();
    
    // UI elements
    this.displayElement = null;
    this.innerContainer = null;
    this.icon = null;
    
    // External dependencies
    this.translationHandler.errorHandler = options.translationHandler?.errorHandler || ErrorHandler.getInstance();
    this.notifier = options.notifier;
    
    // Animation durations (backward compatibility)
    this.fadeInDuration = options.fadeInDuration || WindowsConfig.ANIMATION.FADE_IN_DURATION;
    this.fadeOutDuration = options.fadeOutDuration || WindowsConfig.ANIMATION.FADE_OUT_DURATION;
    
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
      onWindowCreatedResponse: this._handleWindowCreatedResponse.bind(this)
    });
    
    // Click manager handlers
    this.clickManager.setHandlers({
      onOutsideClick: this._handleOutsideClick.bind(this),
      onIconClick: this._handleIconClick.bind(this)
    });

    // Listen for events from the Vue UI Host
    pageEventBus.on(WINDOWS_MANAGER_EVENTS.ICON_CLICKED, this._handleIconClickFromVue.bind(this));
    pageEventBus.on('translation-window-speak', this._handleSpeakRequest.bind(this));

    // Development toggle handler
    window.addEventListener('toggle-windows-manager-renderer', this._handleToggleRenderer.bind(this));
  }

  /**
   * Handle renderer toggle event
   */
  _handleToggleRenderer(event) {
    this.logger.debug('Renderer toggle requested', event.detail);
    const newRendererType = this.toggleEnhancedRenderer();
    
    // If there's an active translation window, recreate it with new renderer
    if (this.state.isVisible && this.displayElement && this.state.originalText) {
      const originalText = this.state.originalText;
      const translatedText = this.state.translatedText;
      
      if (translatedText) {
        // Re-render the content with new renderer
        this.innerContainer.innerHTML = '';
        this._renderTranslationContent(translatedText, originalText);
        this.logger.debug('Active translation re-rendered with new renderer');
      }
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
   * Toggle between enhanced and classic renderers
   */
  toggleEnhancedRenderer() {
    this.useEnhancedRenderer = !this.useEnhancedRenderer;
    localStorage.setItem('windows-manager-enhanced-version', this.useEnhancedRenderer.toString());
    
    // Recreate renderer
    if (this.useEnhancedRenderer) {
      this.translationRenderer = new EnhancedTranslationRenderer(this.factory, this.ttsManager);
      this.logger.debug('Switched to Enhanced TranslationRenderer');
    } else {
      this.translationRenderer = new TranslationRenderer(this.factory, this.ttsManager);
      this.logger.debug('Switched to Classic TranslationRenderer');
    }
    
    return this.useEnhancedRenderer;
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
    
    this.logger.debug('WindowsManager.show() called', {
      text: selectedText ? selectedText.substring(0, 30) + '...' : 'null',
      position,
      currentState: this.state.getSnapshot()
    });
    
    // Prevent showing same text multiple times
    if (this._shouldSkipShow(selectedText)) {
      return;
    }
    
    this.dismiss(false);
    if (!selectedText) return;

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
  }

  /**
   * Check if we should skip showing (duplicate text)
   */
  _shouldSkipShow(selectedText) {
    if (selectedText && 
        this.state.isVisible && 
        ((this.state.originalText === selectedText) ||
         (this.state.isIconMode && this.state.iconClickContext?.text === selectedText))) {
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
    
    // Use the final position from TextSelectionManager if available
    const positionToUse = position.finalPosition || position;

    // Calculate icon position
    const iconPosition = this.positionCalculator.calculateIconPosition(
      window.getSelection(),
      positionToUse
    );
    
    if (!iconPosition) {
      this.logger.warn('Could not calculate icon position');
      return;
    }

    // Generate unique ID for this icon
    const iconId = `translation-icon-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Calculate final position
    const topDocument = this.positionCalculator.getTopDocument();
    const targetWindow = this.crossFrameManager.isInIframe ? window : 
      (topDocument.defaultView || topDocument.parentWindow || window);
    const finalPosition = this.positionCalculator.calculateFinalIconPosition(iconPosition, targetWindow);

    if (!finalPosition) {
      this.logger.warn('Could not calculate final icon position');
      return;
    }

    // Emit event to create icon through Vue UI Host
    WindowsManagerEvents.showIcon({
      id: iconId,
      text: selectedText,
      position: {
        top: finalPosition.top,
        left: finalPosition.left
      }
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
  _handleSpeakRequest(detail) {
    this.logger.debug('Speak request received from UI Host', detail);
    if (!detail || !detail.text) return;

    if (detail.isSpeaking) {
      this.ttsManager.speak(detail.text, {});
    } else {
      this.ttsManager.stopCurrentTTS();
    }
  }

  /**
   * Show translation window
   */
  async _showWindow(selectedText, position) {
    if (!ExtensionContextManager.isValidSync() || !selectedText) return;

    this.logger.debug('_showWindow called', {
      isInIframe: this.crossFrameManager.isInIframe,
      frameId: this.crossFrameManager.frameId,
      text: selectedText.substring(0, 20),
      position
    });

    // Check if we need to create window in main document (iframe case)
    if (this.crossFrameManager.isInIframe) {
      this.logger.debug('Requesting window creation in main document (iframe detected)');
      // Store context for when response comes back
      this.state.setOriginalText(selectedText);
      this.state.setTranslationCancelled(false);
      this.state.setIconMode(false);
      // Don't set visible yet - wait for response
      return this.crossFrameManager.requestWindowCreation(selectedText, position);
    }

    // Generate unique ID for this window
    const windowId = `translation-window-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const theme = this.themeManager.currentTheme || 'light';
    
    // Emit event to create window through Vue UI Host
    WindowsManagerEvents.showWindow({
      id: windowId,
      selectedText,
      position,
      mode: 'window',
      theme
    });
    
    // Store state for this window
    this.state.setOriginalText(selectedText);
    this.state.setTranslationCancelled(false);
    this.state.setIconMode(false);
    this.state.setVisible(true);
    
    // Start translation process
    this._startTranslationProcess(windowId, selectedText);
    
    this.logger.debug('Window creation event emitted successfully', { windowId });
  }

  /**
   * Start translation process for a window
   */
  async _startTranslationProcess(windowId, selectedText) {
    try {
      // Show loading state in the Vue component
      WindowsManagerEvents.translationLoading(windowId);
      
      // Perform translation
      const result = await this.translationHandler.performTranslation(selectedText);
      
      if (this.state.isTranslationCancelled) return;
      
      // Send translation result to Vue component
      WindowsManagerEvents.translationResult(windowId, {
        translatedText: result.translatedText,
        originalText: selectedText
      });
      
      this.logger.debug('Translation completed successfully', { windowId });
      
    } catch (error) {
      if (this.state.isTranslationCancelled) return;
      
      // Send translation error to Vue component
      WindowsManagerEvents.translationError(windowId, {
        message: error.message || 'Translation failed',
        error: error
      });
      
      this.logger.error('Translation failed', { windowId, error });
    }
  }

  /**
   * Create translation window directly
   */
  async _createTranslationWindow(selectedText, position) {
    try {
      // This method should only be called for main document
      this.state.setOriginalText(selectedText);
      this.state.setTranslationCancelled(false);
      this.state.setIconMode(false);
      this.state.setVisible(true);

      // Create host element
      this.displayElement = this.factory.createPopupHost(this.crossFrameManager.frameId);
      
      // Apply theme
      await this.themeManager.applyThemeToHost(this.displayElement);
      
      // Apply initial positioning
      this.smartPositioner.applyInitialStyles(this.displayElement, position);
      
      // Create popup container
      const { container } = this.factory.createPopupContainer(this.displayElement);
      this.innerContainer = container;
      
      // Add loading animation
      this.translationRenderer.renderLoading(this.innerContainer);
      
      // Append to document
      document.body.appendChild(this.displayElement);
      
      // Animate window in
      await this.animationManager.animateWindowIn(this.displayElement);
      
      // Perform translation
      const result = await this.translationHandler.performTranslation(selectedText);
      
      if (this.state.isTranslationCancelled || !this.innerContainer) return;
      
      // Render translation content
      this._renderTranslationContent(result.translatedText, selectedText);
      
      // Setup interactions
      this._setupWindowInteractions();
      
      // Add outside click listener with delay
      this._addOutsideClickListenerDelayed();
      
    } catch (error) {
      if (this.state.isTranslationCancelled || !this.innerContainer) return;
      await this._handleTranslationError(error);
    }
  }

  /**
   * Render translation content
   */
  _renderTranslationContent(translatedText, originalText) {
    const { firstLine } = this.translationRenderer.renderTranslationContent(
      this.innerContainer,
      translatedText,
      originalText,
      'selection', // translation mode
      () => this.cancelCurrentTranslation()
    );

    // Setup drag handlers
    const dragHandle = this.translationRenderer.getDragHandle(firstLine);
    if (dragHandle) {
      this.dragHandler.setupDragHandlers(this.displayElement, dragHandle);
    }

    // Adjust position after content is rendered
    setTimeout(() => {
      this.smartPositioner.adjustPositionAfterContentChange(this.displayElement);
    }, 0);
  }

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
      if (this.state.isVisible && 
          this.displayElement && 
          !this.state.pendingTranslationWindow) {
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
   * Handle translation error
   */
  async _handleTranslationError(error) {
    // Get the original error message, preserve specific details
    const originalMessage = error instanceof Error ? error.message : String(error);
    
    // Use ErrorHandler for type detection and centralized logging
    const errorInfo = await this.translationHandler.errorHandler.getErrorForUI(error, 'windows-manager-translate');
    
    this.logger.error(`Translation error - Type: ${errorInfo.type}, Original: ${originalMessage}, Processed: ${errorInfo.message}`);
    
    if (this.innerContainer) {
      // Use the original specific error message instead of the generic one
      const displayMessage = originalMessage && originalMessage.length > 10 && 
                           !originalMessage.includes('Translation failed: No translated text') ? 
                           originalMessage : errorInfo.message;
      
      // Render error message without buttons
      this.translationRenderer.renderError(
        this.innerContainer, 
        displayMessage
      );
      
      // Don't auto-close window - let user decide via buttons
      // setTimeout(() => this.dismiss(true), WindowsConfig.TIMEOUTS.ERROR_DISPLAY);
    } else {
      this.dismiss(false);
    }
    
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
    this.logger.debug('Icon click event received from UI Host', detail);
    if (!detail || !detail.id) return;

    const { id, text, position } = detail;

    // Prevent other icons from being created while we process this click
    if (state && typeof state === 'object') {
      state.preventTextFieldIconCreation = true;
    }

    // Dismiss the icon that was clicked
    WindowsManagerEvents.dismissIcon({ id });

    // Show the translation window
    this._showWindow(text, position);

    // Reset the prevention flag after a short delay
    setTimeout(() => {
      if (state && typeof state === 'object') {
        state.preventTextFieldIconCreation = false;
      }
    }, WindowsConfig.TIMEOUTS.PENDING_WINDOW_RESET);
  }

  /**
   * Dismiss the current window/icon
   * @param {boolean} withFadeOut - Whether to animate the dismissal
   */
  dismiss(withFadeOut = true) {
    // Clear text selection only when dismissing icon mode AND extension context is valid
    // This prevents clearing text selection when extension context is invalidated
    if (this.state.isIconMode && ExtensionContextManager.isValidSync()) {
      this._clearTextSelection();
    }

    // Get current window/icon IDs before cleanup
    const iconId = this.state.iconClickContext?.iconId;
    const windowId = this.state.mainDocumentWindowId || this.displayElement?.id;

    // Clean up icon
    this._cleanupIcon(true);

    // Clean up window
    if (this.displayElement && this.state.isVisible) {
      this._cleanupWindow(withFadeOut);
    }

    // Emit dismissal events for Vue components
    if (iconId) {
      WindowsManagerEvents.dismissIcon({ id: iconId });
    }
    
    if (windowId) {
      WindowsManagerEvents.dismissWindow({ id: windowId, withFadeOut });
    }

    // Reset flags
    this._resetState();
  }

  /**
   * Clean up icon
   */
  _cleanupIcon(removeListener = true) {
    if (this.icon) {
      this.animationManager.animateIconOut(this.icon);
      this.icon = null;
    }
    
    this.state.clearIconClickContext();
    
    if (removeListener) {
      this.clickManager.removeOutsideClickListener();
    }
  }

  /**
   * Clean up window
   */
  async _cleanupWindow(withFadeOut) {
    // Note: Don't remove theme listeners here - keep them for future windows
    this.clickManager.removeOutsideClickListener();
    this.dragHandler.removeDragHandlers();
    
    this.state.setVisible(false);

    if (withFadeOut && this.fadeOutDuration > 0) {
      await this.animationManager.animateWindowOut(this.displayElement, this.fadeOutDuration);
    }
    
    this._removeElement(this.displayElement);
  }

  /**
   * Reset state
   */
  _resetState() {
    this.state.setPendingTranslationWindow(false);
    this.state.setIconMode(false);
    
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

  /**
   * Remove element from DOM
   */
  _removeElement(element) {
    if (element && element.parentNode) {
      element.remove();
    }
    if (element === this.displayElement) {
      this.displayElement = null;
      this.innerContainer = null;
    }
  }

  /**
   * Destroy WindowsManager instance
   */
  destroy() {
    try {
      this.dismiss(false);
      
      // Remove event listeners
      window.removeEventListener('toggle-windows-manager-renderer', this._handleToggleRenderer.bind(this));
      
      // Cleanup all modules
      this.crossFrameManager.cleanup();
      this.translationHandler.cleanup();
      this.ttsManager.cleanup();
      this.dragHandler.cleanup();
      this.clickManager.cleanup();
      this.themeManager.cleanup();
      
      this.logger.debug('WindowsManager destroyed');
    } catch (error) {
      this.logger.warn('Error during WindowsManager destruction:', error);
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
}
