/**
 * TextSelectionManager - Modular text selection handling system
 * Extracted from EventHandler for better maintainability and separation of concerns
 */

import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import { isUrlExcluded } from "@/utils/ui/exclusion.js";
import { getRequireCtrlForTextSelectionAsync, getSettingsAsync, CONFIG, state } from "@/shared/config/config.js";
import { getEventPath, getSelectedTextWithDash } from "@/utils/browser/events.js";
import { WindowsConfig } from "@/features/windows/managers/core/WindowsConfig.js";
import { ExtensionContextManager } from "@/core/extensionContext.js";
import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { fieldDetector, FieldTypes } from "@/utils/text/FieldDetector.js";
import { selectionDetector } from "@/utils/text/SelectionDetector.js";

export class TextSelectionManager extends ResourceTracker {
  constructor(options = {}) {
    super('text-selection-manager');
    
    // Initialize logger first
    this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'TextSelectionManager');

    // Check if current URL is excluded from text selection features
    this.isExcluded = isUrlExcluded(window.location.href);
    if (this.isExcluded) {
      this.logger.debug('TextSelectionManager: URL is excluded, functionality will be limited');
    }
    
    // Generate frameId for cross-frame communication
    this.frameId = Math.random().toString(36).substring(7);
    
    // WindowsManager will be accessed through FeatureManager
    // Accept FeatureManager instance for accessing WindowsManager
    this.featureManager = options.featureManager;
    if (window !== window.top) {
      // In iframe context, don't use WindowsManager - use cross-frame communication
      this.logger.debug('TextSelectionManager in iframe - using cross-frame communication');
    } else {
      this.logger.debug('TextSelectionManager in main frame - WindowsManager will be accessed via FeatureManager');
    }
    this.messenger = options.messenger;
    this.notifier = options.notifier;
    
    // Selection state management
    this.selectionTimeoutId = null;
    this.ctrlKeyPressed = false;
    
    // Mouse drag detection for principled selection handling
    this.isDragging = false;
    this.pendingSelection = null;
    
    // Track last processed selection to prevent duplicate processing
    this.lastProcessedText = null;
    this.lastProcessedTime = 0;
    this.selectionProcessingCooldown = 1000; // 1 second cooldown
    
    // Store last valid position for recovery when selection is cleared
    this.lastValidPosition = null;
    
    // Track last selection context for proper dismissal
    this.lastSelectionElement = null;
    this.lastSelectionPosition = null;
    
    // Track external window state (for iframe-created windows in main frame)
    this.hasExternalWindow = false;
    
    // Double-click detection for professional editors
    this.lastDoubleClickTime = 0;
    this.doubleClickWindow = 500; // 500ms window to consider mouseup as part of double-click (increased for WPS)
    this.doubleClickProcessing = false; // Flag to prevent interference during double-click processing
    
    // Bind methods for event handlers
    this.handleTextSelection = this.handleTextSelection.bind(this);
    this.handleDoubleClick = this.handleDoubleClick.bind(this);
    this.processSelectedText = this.processSelectedText.bind(this);
    this.cancelSelectionTranslation = this.cancelSelectionTranslation.bind(this);
    this._onOutsideClick = this._onOutsideClick.bind(this);
    
    // Setup external window tracking for iframe-created windows
    this._setupExternalWindowTracking();
    
    this.logger.init('TextSelectionManager initialized');
  }

  /**
   * Get WindowsManager instance from FeatureManager
   * @returns {WindowsManager|null} WindowsManager instance or null
   */
  _getWindowsManager() {
    if (window !== window.top) {
      // In iframe context, no WindowsManager needed
      return null;
    }
    
    if (!this.featureManager) {
      this.logger.debug('FeatureManager not available');
      return null;
    }
    
    const windowsHandler = this.featureManager.getFeatureHandler('windowsManager');
    if (!windowsHandler || !windowsHandler.getIsActive()) {
      this.logger.debug('WindowsManager handler not active');
      return null;
    }
    
    return windowsHandler.getWindowsManager();
  }

  /**
   * Request window creation in main frame when in iframe context
   * @param {string} selectedText - The selected text to translate
   * @param {object} position - Position for the translation window
   */
  _requestWindowCreationInMainFrame(selectedText, position) {
    try {
      const message = {
        type: WindowsConfig.CROSS_FRAME.TEXT_SELECTION_WINDOW_REQUEST,
        frameId: window.name || `iframe-${Math.random().toString(36).substr(2, 9)}`,
        selectedText: selectedText,
        position: position,
        timestamp: Date.now()
      };

      // Send to parent window
      if (window.parent !== window) {
        window.parent.postMessage(message, '*');
        this.logger.debug('Text selection window request sent to parent frame', message);
      } else {
        this.logger.warn('Cannot send window request - not in iframe context');
      }
    } catch (error) {
      this.logger.error('Failed to request window creation in main frame:', error);
    }
  }

  /**
   * Setup external window tracking for iframe-created windows
   */
  _setupExternalWindowTracking() {
    if (!window.pageEventBus) return;
    
    // Listen for window show/dismiss events
    window.pageEventBus.on('windows-manager-show-window', () => {
      this.hasExternalWindow = true;
    });
    
    window.pageEventBus.on('windows-manager-dismiss-window', () => {
      this.hasExternalWindow = false;
    });
    
    window.pageEventBus.on('windows-manager-show-icon', () => {
      this.hasExternalWindow = true;
    });
    
    window.pageEventBus.on('windows-manager-dismiss-icon', () => {
      this.hasExternalWindow = false;
    });
  }

  /**
   * Check if translation window or icon is visible (works in both main frame and iframe)
   * @returns {boolean}
   */
  _isWindowVisible() {
    const windowsManager = this._getWindowsManager();
    if (windowsManager) {
      const isVisible = windowsManager.state.isVisible;
      const isIconMode = windowsManager.state.isIconMode;
      const result = isVisible || isIconMode;
      
      // Debug logging (only in development)
      if (process.env.NODE_ENV === 'development') {
        this.logger.debug('_isWindowVisible debug:', {
          isVisible,
          isIconMode,
          result
        });
      }
      
      return result;
    }
    
    // Check external window state (for iframe-created windows)
    if (this.hasExternalWindow) {
      return true;
    }
    
    // Fallback: check shadow DOM directly for both windows and icons
    // Try both possible host IDs (main and iframe)
    const shadowHostMain = document.getElementById('translate-it-host-main');
    const shadowHostIframe = document.getElementById('translate-it-host-iframe');
    const shadowHost = shadowHostMain || shadowHostIframe;
    if (shadowHost && shadowHost.shadowRoot) {
      const activeWindows = shadowHost.shadowRoot.querySelectorAll('.translation-window');
      const activeIcons = shadowHost.shadowRoot.querySelectorAll('.translation-icon');
      const result = activeWindows.length > 0 || activeIcons.length > 0;
      
      if (process.env.NODE_ENV === 'development') {
        this.logger.debug('_isWindowVisible fallback:', {
          activeWindows: activeWindows.length,
          activeIcons: activeIcons.length,
          result
        });
      }
      
      return result;
    }
    
    return false;
  }

  /**
   * Check if icon should be dismissed based on click position
   * @param {MouseEvent} event - Mouse event
   * @param {string} selectedText - Selected text
   * @returns {boolean} Whether to dismiss the icon
   */
  _shouldDismissIcon(event, selectedText) {
    // Only check when no text is selected and window/icon is visible
    if (selectedText || !this._isWindowVisible()) {
      return false;
    }
    
    // Use existing icon position from WindowsManager if available
    const windowsManager = this._getWindowsManager();
    let iconPosition = null;
    
    if (windowsManager?.state?.iconClickContext?.position) {
      iconPosition = windowsManager.state.iconClickContext.position;
    } else if (this.lastSelectionPosition) {
      iconPosition = this.lastSelectionPosition;
    }
    
    if (!iconPosition || !event.clientX || !event.clientY) {
      return false;
    }
    
    // Check proximity to icon position (within 150px radius)
    const distance = Math.hypot(
      event.clientX - iconPosition.x,
      event.clientY - iconPosition.y
    );
    
    return distance <= 150;
  }

  /**
   * Dismiss translation window (works in both main frame and iframe)
   */
  _dismissWindow() {
    const windowsManager = this._getWindowsManager();
    if (windowsManager) {
      windowsManager.dismiss();
    }
    // Clear selection tracking after dismissal
    this.lastSelectionElement = null;
    this.lastSelectionPosition = null;
    // In iframe context, send dismiss message to main frame
    // This could be implemented later if needed
  }

  /**
   * Main text selection handler - replaces EventHandler.handleMouseUp()
   * @param {MouseEvent} event - Mouse up event
   */
  async handleTextSelection(event) {
    this.logger.debug('handleTextSelection called', {
      eventType: event.type,
      isInIframe: window !== window.top,
      hasWindowsManager: !!this._getWindowsManager(),
      doubleClickProcessing: this.doubleClickProcessing,
      isProfessional: event.isProfessional
    });
    
    // Check selection event strategy compatibility for mouseup events
    if (event?.type === 'mouseup') {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const contextElement = range.commonAncestorContainer.nodeType === Node.TEXT_NODE 
          ? range.commonAncestorContainer.parentElement 
          : range.commonAncestorContainer;
        
        if (contextElement) {
          const { fieldDetector } = await import('@/utils/text/FieldDetector.js');
          const detection = fieldDetector.detect(contextElement);
          
          if (detection.selectionEventStrategy === 'selection-based') {
            this.logger.debug('Ignoring mouseup event for selection-based strategy', {
              fieldType: detection.fieldType,
              strategy: detection.selectionEventStrategy,
              elementTag: contextElement.tagName
            });
            return;
          }
        }
      }
    }
    
    // Principled approach: Handle selectionchange events based on drag state
    if (event?.type === 'selectionchange') {
      if (this.isDragging) {
        // During drag: store pending selection but don't process
        this.pendingSelection = {
          selection: event.selection,
          fieldType: event.fieldType,
          target: event.target
        };
        return;
      } else {
        // Not dragging: process immediately (like keyboard selection)
        await this._processSelectionChangeEvent(event);
        return;
      }
    }
    
    // Skip if currently processing double-click to avoid interference
    if (this.doubleClickProcessing && event.type !== 'selectionchange') {
      this.logger.debug('Skipping handleTextSelection due to active double-click processing');
      return;
    }
    
    // Skip if currently dragging a translation window
    if (window.__TRANSLATION_WINDOW_IS_DRAGGING === true) {
      this.logger.debug('Skipping handleTextSelection due to active window dragging');
      return;
    }
    this.logger.debug('Drag flag check:', { isDragging: window.__TRANSLATION_WINDOW_IS_DRAGGING });
    
    // Skip if we're in transition from selection icon to translation window
    // This prevents conflicts and duplicate selection windows during the transition
    if (state && state.preventTextFieldIconCreation === true) {
      this.logger.debug('Skipping handleTextSelection due to active selection window transition');
      return;
    }
    
    // For non-selectionchange events, extract selected text and perform checks
    if (event.type !== 'selectionchange') {
      // Extract selected text based on event type
      let selectedText;
      if (event.type === 'selectionchange' && event.selection) {
        selectedText = event.selection.toString().trim();
      } else {
        selectedText = getSelectedTextWithDash();
      }
      
      const path = getEventPath(event);
      
      this.logger.debug('Selected text check', {
        hasSelectedText: !!selectedText,
        textLength: selectedText?.length || 0,
        isFromDoubleClick: this._isFromRecentDoubleClick(),
        eventType: event.type,
        isProfessional: event.isProfessional
      });

      // Check if icon should be dismissed based on proximity
      if (this._shouldDismissIcon(event, selectedText)) {
        this._dismissWindow();
        return;
      }

      // For mouseup events, we need to check window clicks
      // (This is only handled by mouseup events through _onOutsideClick)

      // Skip text selection handling if select element mode is active in this tab
      try {
        // Prefer local content-script flag or selectElementManager instance if available
        if (window.translateItNewSelectManager || (window.selectElementManagerInstance && window.selectElementManagerInstance.isActive)) {
          return;
        }
      } catch (error) {
        // If check fails, continue with normal flow
        this.logger.warn("[TextSelectionManager] Failed to check local select element state:", error);
      }

      // Process traditional mouseup events
      if (selectedText) {
      // Check if this is a duplicate selection event
      // But allow processing if enough time has passed or if no selection window is visible
      const currentTime = Date.now();
      const isRecentDuplicate = selectedText === this.lastProcessedText && 
                               (currentTime - this.lastProcessedTime) < this.selectionProcessingCooldown;
      
      // **IMPORTANT**: Don't skip if selection window is not visible anymore
      // This allows normal processing after user dismisses the window
      if (isRecentDuplicate && this._isWindowVisible()) {
        this.logger.debug('Skipping duplicate selection event for same text', {
          text: selectedText.substring(0, 30) + '...',
          timeSinceLastProcess: currentTime - this.lastProcessedTime,
          selectionWindowVisible: this._isWindowVisible()
        });
        return;
      }

      if (!this.selectionTimeoutId) {
        // Check if we should process this text selection based on settings
        const shouldProcess = await this.shouldProcessTextSelection(event);
        if (!shouldProcess) {
          this.logger.debug('Skipping text selection processing due to Ctrl requirement not met');
          return;
        }


        // ۱. خواندن تنظیمات حالت ترجمه برای تعیین میزان تأخیر لازم
        let settings;
        let selectionTranslationMode;
        
        try {
          settings = await getSettingsAsync();
          selectionTranslationMode = settings.selectionTranslationMode || CONFIG.selectionTranslationMode;
        } catch (error) {
          // If extension context is invalidated, don't process text selection
          if (ExtensionContextManager.isContextError(error)) {
            this.logger.debug('Extension context invalidated, skipping text selection processing - RETURNING EARLY');
            return;
          } else {
            // Re-throw non-context errors
            throw error;
          }
        }

        // ۲. تعیین مقدار تأخیر بر اساس حالت انتخاب شده
        //    - برای حالت آیکون (onClick)، تأخیر کمتر (10ms)
        //    - برای حالت پنجره فوری (immediate)، تأخیر پیش‌فرض (250ms)
        const delay = selectionTranslationMode === "onClick" ? 10 : 250;

        this.selectionTimeoutId = this.trackTimeout(() => {
          this.selectionTimeoutId = null;
          this.processSelectedText(selectedText, event);
        }, delay);

        // Track this text as being processed
        this.lastProcessedText = selectedText;
        this.lastProcessedTime = currentTime;

        // اضافه کردن listener برای لغو ترجمه در صورت کلیک using ResourceTracker
        this.addEventListener(document, "mousedown", this.cancelSelectionTranslation);
      } else {
      
      // **IMPORTANT**: When no text is selected (outside click), only allow dismissal if click is outside translation window
      let settings;
      let selectionTranslationMode;
      let isInsideWindow = false;
      const windowsManager = this._getWindowsManager();
      let displayElement = windowsManager?.displayElement;
      let windowElements = [];
      if (!displayElement) {
        windowElements = Array.from(document.querySelectorAll('.translation-window, .aiwc-selection-popup-host'));
      } else {
        windowElements = [displayElement];
      }
      // اگر هیچ عنصر پیدا نشد، بررسی ShadowRoot
      if (windowElements.length === 0 && event && event.target && event.target.getRootNode) {
        const rootNode = event.target.getRootNode();
        if (rootNode instanceof ShadowRoot) {
          windowElements = Array.from(rootNode.querySelectorAll('.translation-window, .aiwc-selection-popup-host'));
        }
      }
      if (windowElements.length && event && event.target) {
        for (const el of windowElements) {
          if (event.target === el || el.contains(event.target)) {
            isInsideWindow = true;
            break;
          } else if (typeof event.composedPath === 'function') {
            const eventPath = event.composedPath();
            if (eventPath.includes(el)) {
              isInsideWindow = true;
              break;
            }
          } else {
            const path = getEventPath(event);
            if (Array.isArray(path) && path.includes(el)) {
              isInsideWindow = true;
              break;
            }
          }
        }
      } else if (event && event.target) {
        // اگر هیچ پنجره‌ای پیدا نشد، بررسی کن که آیا هدف رویداد کلاس translation-window یا aiwc-selection-popup-host دارد
        const target = event.target;
        if (target.classList && (target.classList.contains('translation-window') || target.classList.contains('aiwc-selection-popup-host'))) {
          isInsideWindow = true;
        }
        // اگر کلیک روی هاست translate-it-host بود و داخل آن translation-window یا aiwc-selection-popup-host وجود داشت و پنجره باز بود، dismiss نشود
        if (!isInsideWindow && (target.id === 'translate-it-host-main' || target.id === 'translate-it-host-iframe') && this._isWindowVisible()) {
          let hostChildren = [];
          // اگر هاست دارای shadowRoot است، داخل آن جستجو کن
          if (target.shadowRoot) {
            hostChildren = Array.from(target.shadowRoot.querySelectorAll('.translation-window, .aiwc-selection-popup-host'));
          } else {
            hostChildren = Array.from(target.querySelectorAll('.translation-window, .aiwc-selection-popup-host'));
          }
          if (hostChildren.length > 0) {
            isInsideWindow = true;
          }
        }
        // اگر باز هم پیدا نشد، والدین را در ShadowRoot بررسی کن
        if (!isInsideWindow && target.getRootNode && target.getRootNode() instanceof ShadowRoot) {
          let parent = target;
          while (parent && parent !== target.getRootNode()) {
            if (parent.classList && (parent.classList.contains('translation-window') || parent.classList.contains('aiwc-selection-popup-host'))) {
              isInsideWindow = true;
              break;
            }
            parent = parent.parentNode;
          }
        }
      }
      // Additional check: if click is inside translate-it-host shadow DOM
      if (!isInsideWindow && event && event.target) {
        // Try both possible host IDs (main and iframe)
        const shadowHostMain = document.getElementById('translate-it-host-main');
        const shadowHostIframe = document.getElementById('translate-it-host-iframe');
        const shadowHost = shadowHostMain || shadowHostIframe;
        if (shadowHost && (shadowHost === event.target || shadowHost.contains(event.target))) {
          isInsideWindow = true;
          this.logger.debug('Click detected inside translate-it-host shadow DOM, NOT dismissing.');
        }
      }

      if (isInsideWindow) {
        this.logger.debug('Outside click detected inside translation window, NOT dismissing.');
        return;
      }

      try {
        settings = await getSettingsAsync();
        selectionTranslationMode = settings.selectionTranslationMode || CONFIG.selectionTranslationMode;
      } catch (error) {
        // If extension context is invalidated, don't process dismissal logic
        if (ExtensionContextManager.isContextError(error)) {
          this.logger.debug('Extension context invalidated, skipping dismissal logic');
          return;
        } else {
          // Re-throw non-context errors
          throw error;
        }
      }

      if (selectionTranslationMode === "onClick") {
        // In onClick mode, check if selection was lost due to clicking the translation icon
        // If so, do NOT dismiss the translation window
        const iconElement = document.getElementById(WindowsConfig.IDS.ICON);
        if (iconElement && event && iconElement.contains(event.target)) {
          this.logger.debug('Selection lost due to icon click, NOT dismissing translation window');
          return;
        }
        // Otherwise, allow dismissal logic to run
      } else {
        // Clear tracking when no text is selected
        this.lastProcessedText = null;
        this.lastProcessedTime = 0;

        // اگر متنی انتخاب نشده، هر تایمر فعالی را پاک کنید و listener را حذف کنید
        if (this.selectionTimeoutId) {
          this.clearTimer(this.selectionTimeoutId);
          this.selectionTimeoutId = null;
          // ResourceTracker handles event listener cleanup automatically
        }
      }

      // همچنین اگر پاپ‌آپ ترجمه متن انتخاب شده باز است آن را ببندید.
      // This should run for both onClick and immediate modes
      const windowVisible = this._isWindowVisible();
      
      if (process.env.NODE_ENV === 'development') {
        this.logger.debug('Outside click check - window visible:', {
          windowVisible,
          target: event?.target?.tagName
        });
      }
      
      if (windowVisible) {
        // If a window is visible and an outside click is detected, dismiss the window.
        // This frame's TextSelectionManager takes responsibility for dismissing the window,
        // even if it was created by a different frame (e.g., an iframe).
        if (this._getWindowsManager()) {
          this.logger.debug('Dismiss SelectionWindows - no text selected (outside click)');
          this._dismissWindow();
          
          // Clear tracking when dismissing
          this.lastProcessedText = null;
          this.lastProcessedTime = 0;
        }
      }
      
      // **IFRAME CROSS-FRAME FIX**: If in iframe, broadcast outside click to main frame
      // This ensures that WindowsManager in main frame dismisses windows when clicking in iframe
      if (window !== window.top) {
        this.logger.debug('Broadcasting outside click from iframe to main frame');
        
        // Send outside click message to parent frame
        const outsideClickMessage = {
          type: WindowsConfig.CROSS_FRAME.OUTSIDE_CLICK,
          frameId: this.frameId || 'unknown-iframe',
          timestamp: Date.now(),
          isInIframe: true,
          target: {
            tagName: event?.target?.tagName || 'UNKNOWN',
            className: (event?.target?.className ? String(event.target.className).substring(0, 50) : '') || ''
          }
        };
        
        try {
          if (window.parent) {
            window.parent.postMessage(outsideClickMessage, '*');
          }
          if (window.top && window.top !== window.parent) {
            window.top.postMessage(outsideClickMessage, '*');
          }
        } catch (e) {
          // Silently ignore cross-origin errors
          this.logger.debug('Could not broadcast outside click (cross-origin)', e.message);
        }
      }
    }
    }
    }
  }

  /**
   * Start drag detection (mousedown)
   */
  startDragDetection(event) {
    this.isDragging = true;
    this.pendingSelection = null;
  }

  /**
   * End drag detection and process final selection (mouseup)
   */
  async endDragDetection(event) {
    this.isDragging = false;
    
    // Process pending selection if exists
    if (this.pendingSelection) {
      const pendingEvent = {
        type: 'selectionchange',
        selection: this.pendingSelection.selection,
        fieldType: this.pendingSelection.fieldType,
        target: this.pendingSelection.target
      };
      
      await this._processSelectionChangeEvent(pendingEvent);
      this.pendingSelection = null;
    }
  }

  /**
   * Process selected text and show translation window
   * Extracted from EventHandler.processSelectedText()
   * @param {string} selectedText - Selected text to translate
   * @param {MouseEvent} event - Original mouse event (optional)
   */
  async processSelectedText(selectedText, sourceEvent = null) {
    this.logger.debug('processSelectedText called', { 
      text: selectedText.substring(0, 30) + '...',
      isInIframe: window !== window.top,
      hasWindowsManager: !!this._getWindowsManager()
    });
    
    // Check if text is actually selected in DOM before processing
    const currentSelection = window.getSelection();
    const currentSelectedText = currentSelection ? currentSelection.toString().trim() : '';
    
    this.logger.debug('processSelectedText selection check', {
      currentSelectedText: !!currentSelectedText,
      currentLength: currentSelectedText?.length || 0,
      passedText: selectedText.substring(0, 30) + '...',
      passedLength: selectedText.length
    });
    
    // If no current selection but we have text, it means selection was cleared
    if (!currentSelectedText && selectedText) {
      this.logger.debug('Current selection cleared, but we have passed text - continuing anyway for double-click');
      // Don't return early for double-click case - continue processing
    }
    
    // Check if extension context is valid before processing
    if (!ExtensionContextManager.isValidSync()) {
      this.logger.debug('Extension context invalid, skipping processSelectedText to preserve text selection');
      return;
    }
    
    this.logger.debug('Extension context valid, continuing...');
    
    // Skip if we're in transition from selection icon to translation window
    // This prevents conflicts with text field icon creation during the transition
    if (state && state.preventTextFieldIconCreation === true) {
      this.logger.debug('Skipping processSelectedText due to active selection window transition');
      return;
    }
    
    this.logger.debug('No active selection window transition, continuing...');
    
    // Prevent duplicate processing of same selection
    const currentTime = Date.now();
    const windowsManager = this._getWindowsManager();
    if (this.lastProcessedText === selectedText && windowsManager && windowsManager.state.isVisible) {
      // If same text is selected again within a short time, don't recreate
      if (currentTime - this.lastProcessedTime < 2000) { // 2 second threshold
        this.logger.debug('Skipping duplicate processing of same text');
        return;
      }
    }
    
    this.logger.debug('Duplicate processing check passed, continuing...');
    
  const selection = window.getSelection();
  let position = { x: 0, y: 0 };
    
    // For double-click cases where selection is cleared, use sourceEvent position
    if (sourceEvent && (!selection || selection.rangeCount === 0)) {
      this.logger.debug('Using sourceEvent position for double-click', {
        clientX: sourceEvent.clientX,
        clientY: sourceEvent.clientY
      });
      
      position = {
        x: sourceEvent.clientX + window.scrollX,
        y: sourceEvent.clientY + window.scrollY + 20 // Small offset below click
      };
      
      // Skip normal position calculation and go directly to window show
      if (this._getWindowsManager()) {
        this.logger.debug('Calling windowsManager.show() with sourceEvent position', { 
          text: selectedText.substring(0, 30) + '...',
          position
        });
        await this._getWindowsManager().show(selectedText, position);
        
        // Update tracking after successful show
        this.lastProcessedText = selectedText;
        this.lastProcessedTime = Date.now();
      }
      return;
    }
    
    // Check if we have a valid selection with ranges
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      let rect = range.getBoundingClientRect();
      
      // Track the element and position where selection occurred for dismissal logic
      this.lastSelectionElement = range.commonAncestorContainer.nodeType === Node.TEXT_NODE 
        ? range.commonAncestorContainer.parentElement 
        : range.commonAncestorContainer;
        
      // Check if selection icon should be shown based on field type
      const detection = fieldDetector.detect(this.lastSelectionElement);
      if (!detection.shouldShowSelectionIcon) {
        this.logger.debug('Skipping selection icon display based on field type', {
          fieldType: detection.fieldType,
          elementTag: this.lastSelectionElement?.tagName
        });
        return;
      }
      
      // Additional check: For professional editors and rich text editors, 
      // ensure they follow selection strategy rules
      if (detection.fieldType === 'professional-editor' || 
          detection.fieldType === 'rich-text-editor') {
        const needsDoubleClick = detection.selectionStrategy === 'double-click-required';
        const isFromDoubleClick = this.isFromDoubleClick || false;
        
        if (needsDoubleClick && !isFromDoubleClick) {
          this.logger.debug('Skipping selection icon - double-click required', {
            fieldType: detection.fieldType,
            selectionStrategy: detection.selectionStrategy,
            needsDoubleClick,
            isFromDoubleClick,
            elementTag: this.lastSelectionElement?.tagName
          });
          return;
        }
      }
        
      // Store the selection position for proximity-based dismissal
      this.lastSelectionPosition = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };
        
      // Check if rect is valid (not empty)
      if (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.left === 0) {
        // If we already have a visible window, don't show another one
        if (windowsManager && windowsManager.state.isVisible) {
          return;
        }
      }
  
  // Fix for TEXTAREA and INPUT fields where getBoundingClientRect returns zeros
  if (rect.width === 0 && rect.height === 0) {
    // Check if selection is within a form element
    const activeElement = document.activeElement;
    if (activeElement && (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT')) {
      
      // Check if selection icon should be shown for this form element
      const activeElementDetection = fieldDetector.detect(activeElement);
      if (!activeElementDetection.shouldShowSelectionIcon) {
        this.logger.debug('Skipping selection icon for form element based on field type', {
          fieldType: activeElementDetection.fieldType,
          elementTag: activeElement.tagName
        });
        return;
      }
      // Use the element's bounding rect instead
      const elementRect = activeElement.getBoundingClientRect();
      
      // Calculate approximate position based on cursor position in the element
      let estimatedX = elementRect.left + 10; // Small offset from left
      let estimatedY = elementRect.top + 10; // Small offset from top
      
      // For multiline elements, try to estimate cursor position
      if (activeElement.tagName === 'TEXTAREA') {
        // Use selection start to estimate vertical position
        const cursorPosition = activeElement.selectionStart;
        const textBeforeCursor = activeElement.value.substring(0, cursorPosition);
        const lines = textBeforeCursor.split('\n');
        const lineHeight = 18; // Estimated line height
        
        estimatedY = elementRect.top + ((lines.length - 1) * lineHeight) + 10;
        
        // Estimate horizontal position based on last line length
        const lastLineLength = lines[lines.length - 1].length;
        const charWidth = 8; // Estimated character width
        estimatedX = elementRect.left + (lastLineLength * charWidth) + 10;
        
        // Constrain to element bounds
        estimatedX = Math.min(estimatedX, elementRect.right - 50);
      }
      
      // Create a synthetic rect
      rect = {
        left: estimatedX,
        right: estimatedX,
        top: estimatedY,
        bottom: estimatedY,
        width: 0,
        height: 0,
        x: estimatedX,
        y: estimatedY
      };
      
      this.logger.debug('Fixed rect for form element:', {
        original: 'empty rect',
        fixed: rect,
        elementTag: activeElement.tagName
      });
    }
  }

  // Read current selection translation mode to decide how to place the icon/window
  let settings;
  let selectionTranslationMode;
  
  try {
    settings = await getSettingsAsync();
    selectionTranslationMode = settings.selectionTranslationMode || CONFIG.selectionTranslationMode;
  } catch (error) {
    // If extension context is invalidated, don't process text selection
    if (ExtensionContextManager.isContextError(error)) {
      this.logger.debug('Extension context invalidated, skipping text selection processing in processSelectedText - RETURNING EARLY');
      return;
    } else {
      // Re-throw non-context errors
      throw error;
    }
  }
      
      this.logger.debug('Selection rect DEBUG', {
        rect: {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height
        },
        windowScroll: { x: window.scrollX, y: window.scrollY },
        beforeCalculation: { x: 0, y: 0 }
      });
      
      // محاسبه موقعیت با در نظر گیری viewport و جلوگیری از جابجایی زیاد
      let targetX, targetY;
      const viewportWidth = window.innerWidth;
      const iconSize = WindowsConfig.POSITIONING.ICON_SIZE;
      const popupWidth = WindowsConfig.POSITIONING.POPUP_WIDTH;
      const margin = WindowsConfig.POSITIONING.VIEWPORT_MARGIN;
      
      // محاسبه X موثر بر اساس نوع حالت
      if (selectionTranslationMode === 'onClick') {
        // برای آیکون: سعی کن در وسط متن قرار بگیری، اگر نمی‌شه کنار متن
        const centerX = rect.left + (rect.width / 2);
        const iconRight = centerX + iconSize;
        
        if (iconRight <= viewportWidth - margin) {
          targetX = centerX; // وسط متن
        } else if (rect.right + iconSize <= viewportWidth - margin) {
          targetX = rect.right - iconSize; // سمت راست متن
        } else {
          targetX = rect.left; // سمت چپ متن
        }
      } else {
        // برای پنجره فوری: سعی کن نزدیک چپ متن باشی
        const popupRight = rect.left + popupWidth;
        
        if (popupRight <= viewportWidth - margin) {
          targetX = rect.left; // چپ متن
        } else if (rect.right - popupWidth >= margin) {
          targetX = rect.right - popupWidth; // راست متن منهای عرض پنجره
        } else {
          targetX = Math.max(margin, viewportWidth - popupWidth - margin); // آخرین گزینه
        }
      }
      
      targetY = rect.bottom + WindowsConfig.POSITIONING.SELECTION_OFFSET; // استفاده از config
      
      // rect from getBoundingClientRect() is viewport-relative
      // Convert to absolute coordinates by adding scroll offset
      position = {
        x: targetX + window.scrollX,
        y: targetY + window.scrollY
      };


      
      // Save valid position for future use
      if (position.x > 0 || position.y > 0) {
        this.lastValidPosition = { ...position };
      }
    } else {
      // If no valid selection rect, try to use last valid position for same text
      if (this.lastValidPosition && this.lastProcessedText === selectedText) {
        position = { ...this.lastValidPosition };
      }
    }


    // نمایش پاپ آپ با متن و موقعیت جدید
    if (windowsManager) {
      // Main frame: use WindowsManager directly
      if (!ExtensionContextManager.isValidSync()) {
        this.logger.debug('Extension context invalid, skipping window/icon creation to preserve text selection');
        return;
      }
      
      this.logger.debug('Calling windowsManager.show() in main frame', { 
        text: selectedText.substring(0, 30) + '...',
        position
      });
      await windowsManager.show(selectedText, position);
      
      // Update tracking after successful show
      this.lastProcessedText = selectedText;
      this.lastProcessedTime = currentTime;
      
    } else if (window !== window.top) {
      // Iframe: use cross-frame communication to request window creation in main frame
      this.logger.debug('Requesting window creation in main frame from iframe', { 
        text: selectedText.substring(0, 30) + '...',
        position
      });
      this._requestWindowCreationInMainFrame(selectedText, position);
      
      // Update tracking after successful request
      this.lastProcessedText = selectedText;
      this.lastProcessedTime = currentTime;
      
    } else {
      this.logger.warn('SelectionWindows not available in main frame');
    }
    
    // حذف listener بعد از نمایش پاپ‌آپ
    // ResourceTracker handles event listener cleanup automatically
  }

  /**
   * Cancel selection translation timeout
   * Extracted from EventHandler.cancelSelectionTranslation()
   */
  cancelSelectionTranslation() {
    if (this.selectionTimeoutId) {
      this.clearTimer(this.selectionTimeoutId);
      this.selectionTimeoutId = null;
      this.logger.debug('Selection translation cancelled');
      
      // Clear tracking when cancelling
      this.lastProcessedText = null;
      this.lastProcessedTime = 0;
    }
  }

  /**
   * Handle double-click events to mark professional editor selections
   * @param {MouseEvent} event - Double-click event
   */
  handleDoubleClick(event) {
    this.logger.debug('Double-click detected', {
      target: event.target?.tagName,
      timestamp: Date.now()
    });
    
    // Mark the time of double-click and set processing flag
    this.lastDoubleClickTime = Date.now();
    this.doubleClickProcessing = true;
    
    // Capture selection immediately to avoid interference
    const immediateText = selectionDetector.detect(event.target);
    
    // Use smart retry mechanism based on field type detection
    const detection = fieldDetector.detect(event.target);
    const maxAttempts = detection.fieldType === FieldTypes.PROFESSIONAL_EDITOR ? 5 : 3;
    const initialDelay = detection.fieldType === FieldTypes.PROFESSIONAL_EDITOR ? 150 : 100;
    
    const handleSelection = async (attempt = 1) => {
      const selectedText = await selectionDetector.detectWithRetry(event.target, { 
        maxAttempts: 1,
        delay: 50 
      });
      
      if (selectedText && selectedText.trim()) {
        this.logger.debug('Text selected via double-click (delayed check)', {
          text: selectedText.substring(0, 30) + '...',
          target: event.target?.tagName,
          method: 'smart-detection',
          attempt: attempt,
          fieldType: detection.fieldType
        });
        
        // Set double-click flag before processing
        this.isFromDoubleClick = true;
        
        // Force process the selection with calculated position
        this.processSelectedText(selectedText, event);
        
        // Clear flags after successful processing
        this.doubleClickProcessing = false;
        this.isFromDoubleClick = false;
        return true;
      } else if (immediateText && immediateText.trim() && attempt === 1) {
        // Use immediate capture if delayed capture fails
        this.logger.debug('Text selected via double-click (immediate fallback)', {
          text: immediateText.substring(0, 30) + '...',
          target: event.target?.tagName,
          method: 'immediate',
          fieldType: detection.fieldType
        });
        
        // Set double-click flag before processing
        this.isFromDoubleClick = true;
        
        this.processSelectedText(immediateText, event);
        
        // Clear flags after successful processing
        this.doubleClickProcessing = false;
        this.isFromDoubleClick = false;
        return true;
      } else if (attempt < maxAttempts) {
        // Try again with adaptive delay based on field type
        const delay = detection.fieldType === FieldTypes.PROFESSIONAL_EDITOR ? 75 * attempt : 50 * attempt;
        this.logger.debug('Retrying text selection detection', {
          attempt: attempt,
          maxAttempts: maxAttempts,
          delay: delay,
          fieldType: detection.fieldType
        });
        setTimeout(() => handleSelection(attempt + 1), delay);
        return false;
      } else {
        this.logger.debug('No text selected after double-click delay', {
          target: event.target?.tagName,
          attempts: attempt,
          fieldType: detection.fieldType
        });
        this.doubleClickProcessing = false; // Clear flag after all attempts failed
        return false;
      }
    };
    
    // Start with initial delay for complex editors
    setTimeout(() => handleSelection(1), initialDelay);
    
    // Clear processing flag after maximum possible delay to prevent deadlock
    setTimeout(() => {
      this.doubleClickProcessing = false;
    }, 500);
  }

  /**
   * Check if current mouseup is part of a recent double-click
   * @returns {boolean} True if this mouseup is from double-click
   */
  _isFromRecentDoubleClick() {
    const timeSinceDoubleClick = Date.now() - this.lastDoubleClickTime;
    return timeSinceDoubleClick <= this.doubleClickWindow;
  }



  /**
   * Check if event requires Ctrl key for text selection
   * @param {MouseEvent} event - Mouse event
   * @returns {Promise<boolean>} Whether Ctrl requirement is satisfied
   */
  async shouldProcessTextSelection(event) {
    // Early return if URL is excluded
    if (this.isExcluded) {
      this.logger.debug('shouldProcessTextSelection: URL is excluded, skipping text selection processing');
      return false;
    }

    let settings;
    let selectionTranslationMode;
    
    try {
      settings = await getSettingsAsync();
      selectionTranslationMode = settings.selectionTranslationMode || CONFIG.selectionTranslationMode;
    } catch (error) {
      // If extension context is invalidated, use fallback values to preserve text selection
      if (ExtensionContextManager.isContextError(error)) {
        this.logger.debug('Extension context invalidated, using fallback settings for Ctrl check');
        selectionTranslationMode = CONFIG.selectionTranslationMode;
      } else {
        // Re-throw non-context errors
        throw error;
      }
    }

    // فقط در حالت immediate باید Ctrl را چک کنیم
    if (selectionTranslationMode === "immediate") {
      const requireCtrl = await getRequireCtrlForTextSelectionAsync();
      if (requireCtrl) {
        // Check Ctrl key from event or from tracked state
        const ctrlPressed = event.ctrlKey || event.metaKey || this.ctrlKeyPressed;
        if (!ctrlPressed) {
          return false;
        }
      }
    }

    return true;
  }


  /**
   * Handle outside mouse events for dismissing translation windows
   * @param {MouseEvent} event - Mouse event (mousedown/click)
   */
  _onOutsideClick(event) {
    // Only handle mouse events for dismissing windows, not for text selection
    if (!event) return;
    
    const windowsManager = this._getWindowsManager();
    if (!windowsManager || !this._isWindowVisible()) {
      return;
    }
    
    // Check if mouse event is inside translation window
    const displayElement = windowsManager.displayElement;
    if (displayElement && event.target) {
      if (displayElement.contains(event.target)) {
        // Mouse event inside window, don't dismiss
        this.logger.debug('Mouse event inside translation window - keeping open');
        return;
      }
      
      // Check composed path for shadow DOM elements
      if (typeof event.composedPath === 'function') {
        const eventPath = event.composedPath();
        if (eventPath.includes(displayElement)) {
          this.logger.debug('Mouse event in window path - keeping open');
          return;
        }
      }
    }
    
    // Mouse event outside window, dismiss it instantly
    this.logger.debug('Outside mouse event detected - dismissing translation window', {
      eventType: event.type,
      target: event.target?.tagName
    });
    this._dismissWindow();
  }

  /**
   * Update Ctrl key state
   * @param {boolean} pressed - Whether Ctrl key is pressed
   */
  updateCtrlKeyState(pressed) {
    this.ctrlKeyPressed = pressed;
  }

  /**
   * Cleanup resources and event listeners
   */
  cleanup() {
    // Cancel any pending selection translation
    this.cancelSelectionTranslation();
    
    // Clear tracking state
    this.lastProcessedText = null;
    this.lastProcessedTime = 0;
    this.lastSelectionElement = null;
    this.lastSelectionPosition = null;
    
    // Clear drag detection state
    this.isDragging = false;
    this.pendingSelection = null;
    
    // Clear any remaining timeouts
    if (this.selectionTimeoutId) {
      this.clearTimer(this.selectionTimeoutId);
      this.selectionTimeoutId = null;
    }
    
    
    // Call ResourceTracker cleanup for automatic resource management
    super.cleanup();
    
    this.logger.debug('Cleaned up');
  }

  /**
   * Get manager info for debugging
   * @returns {Object} Manager information
   */
  getInfo() {
    return {
      initialized: true,
      hasWindowsManager: !!this._getWindowsManager(),
      hasMessenger: !!this.messenger,
      activeTimeout: !!this.selectionTimeoutId,
      isDragging: this.isDragging,
      ctrlKeyPressed: this.ctrlKeyPressed,
      lastProcessedText: this.lastProcessedText ? this.lastProcessedText.substring(0, 50) + '...' : null,
      lastProcessedTime: this.lastProcessedTime,
      timeSinceLastProcess: this.lastProcessedTime ? Date.now() - this.lastProcessedTime : null
    };
  }

  /**
   * Process selectionchange events with proper debouncing
   * This method contains the core logic for handling selectionchange events
   * that was previously directly in handleTextSelection
   */
  async _processSelectionChangeEvent(event) {
    this.logger.debug('_processSelectionChangeEvent called', {
      eventType: event.type,
      hasSelection: !!event.selection
    });

    // Skip if currently processing double-click to avoid interference
    if (this.doubleClickProcessing) {
      this.logger.debug('Skipping selectionchange processing due to active double-click processing');
      return;
    }
    
    // Skip if currently dragging a translation window
    if (window.__TRANSLATION_WINDOW_IS_DRAGGING === true) {
      this.logger.debug('Skipping selectionchange processing due to active window dragging');
      return;
    }
    
    // Skip if we're in transition from selection icon to translation window
    if (state && state.preventTextFieldIconCreation === true) {
      this.logger.debug('Skipping selectionchange processing due to active selection window transition');
      return;
    }
    
    // Extract selected text from selectionchange event
    let selectedText;
    if (event.selection) {
      selectedText = event.selection.toString().trim();
    } else {
      const selection = window.getSelection();
      selectedText = selection ? selection.toString().trim() : '';
    }
    
    this.logger.debug('Selectionchange text check', {
      hasSelectedText: !!selectedText,
      textLength: selectedText?.length || 0
    });

    // If no text selected, dismiss any existing windows
    if (!selectedText) {
      this._dismissWindow();
      return;
    }

    // Skip text selection handling if select element mode is active
    try {
      if (window.translateItNewSelectManager || (window.selectElementManagerInstance && window.selectElementManagerInstance.isActive)) {
        return;
      }
    } catch (error) {
      this.logger.warn("[TextSelectionManager] Failed to check local select element state:", error);
    }

    // For selectionchange events, always use timeout-based processing (no immediate processing)
    // Check if we should process this text selection based on settings
    const shouldProcess = await this.shouldProcessTextSelection(event);
    if (!shouldProcess) {
      this.logger.debug('Skipping selectionchange processing due to Ctrl requirement not met');
      return;
    }

    // Read settings for selection translation mode
    let settings;
    let selectionTranslationMode;
    
    try {
      settings = await getSettingsAsync();
      selectionTranslationMode = settings.selectionTranslationMode || CONFIG.selectionTranslationMode;
    } catch (error) {
      if (ExtensionContextManager.isContextError(error)) {
        this.logger.debug('Extension context invalidated, skipping selectionchange processing');
        return;
      } else {
        throw error;
      }
    }

    // Process selection directly (no timeout needed here)
    const currentTime = Date.now();
    
    // Track this text as being processed
    this.lastProcessedText = selectedText;
    this.lastProcessedTime = currentTime;

    this.processSelectedText(selectedText, event);

    // Add listener for canceling translation on click
    this.addEventListener(document, "mousedown", this.cancelSelectionTranslation);
  }
}
