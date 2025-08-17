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
    
    // Calculate icon position
    const iconPosition = this.positionCalculator.calculateIconPosition(
      window.getSelection(),
      position
    );
    
    if (!iconPosition) {
      this.logger.warn('Could not calculate icon position');
      return;
    }

    // Get target document and create icon
    const topDocument = this.positionCalculator.getTopDocument();
    const targetDocument = this.crossFrameManager.isInIframe ? document : topDocument;
    
    try {
      // Create icon host
      const iconHost = this.factory.createIconHost(targetDocument);
      
      // Create icon
      this.icon = this.factory.createTranslateIcon(targetDocument);
      
      // Calculate final position
      const targetWindow = this.crossFrameManager.isInIframe ? window : 
        (topDocument.defaultView || topDocument.parentWindow || window);
      const finalPosition = this.positionCalculator.calculateFinalIconPosition(iconPosition, targetWindow);
      
      // Apply position
      this.icon.style.left = `${finalPosition.left}px`;
      this.icon.style.top = `${finalPosition.top}px`;
      
      // Add to host
      iconHost.appendChild(this.icon);
      
      // Setup click handler
      this.clickManager.setupIconClickHandler(this.icon);
      
      // Store context
      this.state.setIconClickContext({ text: selectedText, position });
      
      // Add outside click listener
      this.clickManager.addOutsideClickListener();
      
      // Animate icon in
      await this.animationManager.animateIconIn(this.icon);
      
      this.logger.debug('Icon created and animated successfully');
    } catch (error) {
      // Use ExtensionContextManager for unified error handling
      if (ExtensionContextManager.isContextError(error)) {
        ExtensionContextManager.handleContextError(error, 'icon-creation');
        // Don't call _handleError for context errors to prevent side effects
        return;
      } else {
        this.logger.error('Error creating translate icon:', error);
        this._handleError(error, 'icon-creation');
      }
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

    // Create window directly
    this.logger.debug('Creating window directly (main document)');
    return this._createTranslationWindow(selectedText, position);
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
      
      // Create window in main document
      await this._createTranslationWindow(data.selectedText, adjustedPosition);
      
      // Notify success
      this.crossFrameManager.notifyWindowCreated(data.frameId, true, this.displayElement?.id);
      
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
    // Use ErrorHandler which now integrates ExtensionContextManager
    const errorInfo = await this.translationHandler.errorHandler.getErrorForUI(error, 'windows-manager-translate');
    
    this.logger.error(`Translation error - Type: ${errorInfo.type}, Message: ${errorInfo.message}`);
    
    if (this.innerContainer) {
      this.translationRenderer.renderError(this.innerContainer, errorInfo.message);
      setTimeout(() => this.dismiss(true), WindowsConfig.TIMEOUTS.ERROR_DISPLAY);
    } else {
      this.dismiss(false);
    }
    
    // Use centralized error handler
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
   * Dismiss the current window/icon
   * @param {boolean} withFadeOut - Whether to animate the dismissal
   */
  dismiss(withFadeOut = true) {
    // Clear text selection only when dismissing icon mode AND extension context is valid
    // This prevents clearing text selection when extension context is invalidated
    if (this.state.isIconMode && ExtensionContextManager.isValidSync()) {
      this._clearTextSelection();
    }

    // Clean up icon
    this._cleanupIcon(true);

    // Clean up window
    if (this.displayElement && this.state.isVisible) {
      this._cleanupWindow(withFadeOut);
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
    this.themeManager.removeThemeChangeListener();
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