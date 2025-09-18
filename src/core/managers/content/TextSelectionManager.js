/**
 * TextSelectionManager - Modular text selection handling system
 * Extracted from EventHandler for better maintainability and separation of concerns
 */

import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import { isUrlExcluded } from "@/utils/ui/exclusion.js";
import { getRequireCtrlForTextSelectionAsync, getSettingsAsync, CONFIG, state } from "@/shared/config/config.js";
import { getEventPath, getSelectedTextWithDash, isTextDragOperation } from "@/utils/browser/events.js";
import { WindowsConfig } from "@/features/windows/managers/core/WindowsConfig.js";
import { ExtensionContextManager } from "@/core/extensionContext.js";
import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { fieldDetector, FieldTypes } from "@/utils/text/FieldDetector.js";
import { selectionDetector } from "@/utils/text/SelectionDetector.js";
// import { siteHandlerRegistry } from "@/utils/text/registry/SiteHandlerRegistry.js";

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
    
    // Track double-click context to prevent duplicate icon creation
    this.lastDoubleClickText = null;
    this.lastDoubleClickPosition = null;
    
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
    
    // Setup iframe dismiss listener for cross-frame communication
    this._setupIframeDismissListener();
    
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
    
    // Listen for dismiss messages from iframes (only in main frame)
    if (window === window.top) {
      this.addEventListener(window, 'message', (event) => {
        if (event.data && event.data.type === 'DISMISS_WINDOWS_MANAGER') {
          this.logger.debug('Received dismiss message from iframe', {
            frameId: event.data.frameId,
            reason: event.data.reason,
            origin: event.origin
          });
          
          // Dismiss WindowsManager in main frame
          const windowsManager = this._getWindowsManager();
          if (windowsManager) {
            this.logger.debug('WindowsManager state check', {
              isVisible: windowsManager.isVisible,
              isIconMode: windowsManager.isIconMode,
              shouldDismiss: windowsManager.isVisible || windowsManager.isIconMode
            });
            
            if (windowsManager.isVisible || windowsManager.isIconMode) {
              this.logger.debug('Dismissing WindowsManager from iframe request', {
                reason: event.data.reason
              });
              windowsManager.dismiss();
            } else {
              this.logger.debug('No active WindowsManager to dismiss');
            }
          } else {
            this.logger.debug('WindowsManager not available in main frame');
          }
        }
      });
    }
    
    window.pageEventBus.on('windows-manager-dismiss-icon', () => {
      this.hasExternalWindow = false;
    });
  }

  /**
   * Setup iframe dismiss listener for cross-frame communication
   * Only needed in iframe context to send dismiss messages to main frame
   */
  _setupIframeDismissListener() {
    // Only set up in iframe context
    if (window === window.top) return;
    
    // Create bound handler
    this._iframeDismissHandler = (event) => {
      // In iframe, we don't have direct access to WindowsManager state
      // So we'll send dismiss message whenever there's a mousedown
      // and let the main frame decide if dismissal is needed
      
      const target = event.target;
      
      // Use similar logic as WindowsManager for UI detection
      const vueUIHostMain = document.getElementById('translate-it-host-main');
      const vueUIHostIframe = document.getElementById('translate-it-host-iframe');
      const vueUIHost = vueUIHostMain || vueUIHostIframe;
      
      const isInsideVueUIHost = vueUIHost && vueUIHost.contains(target);
      
      // Check legacy elements
      const iconElement = document.getElementById('translate-it-icon');
      const isInsideLegacyIcon = iconElement && iconElement.contains(target);
      
      const windowElements = document.querySelectorAll('.translation-window');
      const isInsideLegacyWindow = Array.from(windowElements).some(element => 
        element.contains(target)
      );
      
      const isClickingOnTranslationUI = isInsideVueUIHost || isInsideLegacyIcon || isInsideLegacyWindow;
      
      if (isClickingOnTranslationUI) {
        this.logger.debug('Mousedown on translation UI in iframe - not dismissing', {
          target: target?.tagName,
          className: target?.className
        });
        return;
      }
      
      // Send dismiss message to main frame
      this.logger.debug('Iframe mousedown detected - sending dismiss to main frame', {
        target: target?.tagName,
        className: target?.className,
        eventType: event.type
      });
      
      try {
        window.parent.postMessage({
          type: 'DISMISS_WINDOWS_MANAGER',
          frameId: this.frameId,
          timestamp: Date.now(),
          reason: 'iframe-mousedown'
        }, '*');
      } catch (error) {
        this.logger.warn('Failed to send dismiss message from iframe:', error);
      }
    };
    
    // Add listener with capture to catch drag start immediately
    document.addEventListener('mousedown', this._iframeDismissHandler, { capture: true, passive: true });
    
    this.logger.debug('Iframe dismiss listener setup for cross-frame communication');
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
          const detection = await fieldDetector.detect(contextElement);
          
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
      
      // const path = getEventPath(event);

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
        //    - برای حالت آیکون (onClick)، تأخیر برای جلوگیری از مشکل دابل‌کلیک (300ms)
        //    - برای حالت پنجره فوری (immediate)، تأخیر پیش‌فرض (250ms)
        const delay = selectionTranslationMode === "onClick" ? 300 : 250;

        this.selectionTimeoutId = this.trackTimeout(() => {
          this.selectionTimeoutId = null;
          this.processSelectedText(selectedText, event);
        }, delay);

        // Track this text as being processed
        this.lastProcessedText = selectedText;
        this.lastProcessedTime = currentTime;

        // اضافه کردن listener برای لغو ترجمه در صورت کلیک using ResourceTracker (mousedown for all contexts)
        this.addEventListener(document, "mousedown", this.cancelSelectionTranslation, { capture: true });
        
        // In main frame only, add click handler for cancelSelectionTranslation
        // (iframe uses persistent handlers from constructor)
        if (window === window.top) {
          this.addEventListener(document, "click", this.cancelSelectionTranslation, { capture: true });
        }
        
        this.logger.debug('Added mousedown and click listeners for cancel selection (capture mode)', {
          isInIframe: window !== window.top,
          addedSelectionListener: window !== window.top
        });
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
  startDragDetection() {
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
      
      // Pass the mouseup event as the source event
      await this._processSelectionChangeEvent(pendingEvent, event);
      this.pendingSelection = null;
    }
  }

  /**
   * Process selected text and show translation window
   * Extracted from EventHandler.processSelectedText()
   * @param {string} selectedText - Selected text to translate
   * @param {MouseEvent} event - Original mouse event (optional)
   */
  async processSelectedText(selectedText, sourceEvent = null, options = {}) {
    const { isFromDoubleClick = false } = options;
    this.logger.debug('processSelectedText called', {
      text: selectedText.substring(0, 30) + '...', 
      isInIframe: window !== window.top,
      hasWindowsManager: !!this._getWindowsManager(),
      isFromDoubleClick,
      sourceEventType: sourceEvent?.type
    });

    // Basic validation checks
    if (!ExtensionContextManager.isValidSync() || (state && state.preventTextFieldIconCreation === true)) {
      this.logger.debug('Skipping processSelectedText due to invalid context or active transition');
      return;
    }

    const windowsManager = this._getWindowsManager();
    const currentTime = Date.now();
    if (this.lastProcessedText === selectedText && windowsManager?.state.isVisible && (currentTime - this.lastProcessedTime < 2000)) {
      this.logger.debug('Skipping duplicate processing of same text');
      return;
    }

    // --- Position Calculation Logic ---
    let position = null;
    const iconSize = WindowsConfig.POSITIONING.ICON_SIZE;

    // Strategy 1: Try site handler first (especially for Google Docs, Office Online, etc.)
    if (sourceEvent) {
      try {
        const siteHandlerPosition = await this._calculatePositionUsingSiteHandler(sourceEvent, sourceEvent.target);
        if (siteHandlerPosition) {
          position = siteHandlerPosition;
          this.logger.debug('Position calculated using site handler', position);
        }
      } catch (error) {
        this.logger.debug('Site handler position calculation failed, falling back', error);
      }
    }

    // Strategy 2: Selection-based positioning for double-click and professional editors
    const getPositionFromSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return null;

      let rect = selection.getRangeAt(0).getBoundingClientRect();

      // Fix for TEXTAREA/INPUT where getBoundingClientRect is empty
      if (rect.width === 0 && rect.height === 0) {
        const activeElement = document.activeElement;
        if (activeElement && (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT')) {
          this.logger.debug('Selection rect is empty, attempting fallback for form element.', { tag: activeElement.tagName });
          const elementRect = activeElement.getBoundingClientRect();
          let estimatedX = elementRect.left + 10;
          let estimatedY = elementRect.top + 10;

          if (activeElement.tagName === 'TEXTAREA') {
            const cursorPosition = activeElement.selectionStart;
            const textBeforeCursor = activeElement.value.substring(0, cursorPosition);
            const lines = textBeforeCursor.split('\n');
            const lineHeight = 18; // Estimated
            estimatedY = elementRect.top + ((lines.length - 1) * lineHeight) + 10;
            const lastLineLength = lines[lines.length - 1].length;
            const charWidth = 8; // Estimated
            estimatedX = elementRect.left + (lastLineLength * charWidth) + 10;
            estimatedX = Math.min(estimatedX, elementRect.right - 50);
          }
          
          rect = { left: estimatedX, right: estimatedX, top: estimatedY, bottom: estimatedY + 18, width: 0, height: 18 };
        }
      }

      if (!rect || (rect.width === 0 && rect.height === 0)) return null;

      const selectionCenter = rect.left + rect.width / 2;
      return {
        x: selectionCenter - (iconSize / 2) + window.scrollX,
        y: rect.bottom + WindowsConfig.POSITIONING.SELECTION_OFFSET + window.scrollY
      };
    };

    // Strategy 3: Mouse event-based positioning for drag selections
    if (!position) {
      if (isFromDoubleClick) {
        this.logger.debug('Double-click detected, using selection-based positioning');
        position = getPositionFromSelection();
      } else if (sourceEvent && typeof sourceEvent.clientX === 'number') {
        this.logger.debug('Drag selection, using mouse position from source event');
        position = {
          x: sourceEvent.clientX - (iconSize / 2) + window.scrollX,
          y: sourceEvent.clientY + 15 + window.scrollY
        };
      } else {
        this.logger.debug('No mouse event, falling back to selection-based positioning');
        position = getPositionFromSelection();
      }
    }

    // Strategy 4: Fallback to iframe-aware position calculation
    if (!position && window !== window.top && sourceEvent) {
      this.logger.debug('Attempting iframe-aware position calculation');
      try {
        // Calculate position relative to iframe viewport
        const iframeRect = window.frameElement?.getBoundingClientRect();
        if (iframeRect && sourceEvent.clientX && sourceEvent.clientY) {
          position = {
            x: iframeRect.left + sourceEvent.clientX - (iconSize / 2),
            y: iframeRect.top + sourceEvent.clientY + 15
          };
          this.logger.debug('Iframe position calculated', position);
        }
      } catch (error) {
        this.logger.debug('Iframe position calculation failed', error);
      }
    }

    // Save valid position for future use
    if (position && (position.x > 0 || position.y > 0)) {
      this.lastValidPosition = { ...position };
    } else if (this.lastValidPosition && this.lastProcessedText === selectedText) {
      position = { ...this.lastValidPosition };
      this.logger.debug('Using last valid position as fallback', position);
    }

    // Check if selection is near a regular-input field and should not show icon
    let shouldSkip = false;

    // Check source event target
    if (sourceEvent && sourceEvent.target) {
      try {
        const targetDetection = await fieldDetector.detect(sourceEvent.target);
        if (targetDetection.fieldType === FieldTypes.REGULAR_INPUT) {
          this.logger.debug('Skipping selection icon - selection originated from regular-input field', {
            fieldType: targetDetection.fieldType,
            tagName: sourceEvent.target.tagName
          });
          shouldSkip = true;
        }
      } catch (error) {
        this.logger.debug('Error checking target field type', error);
      }
    }

    // Also check active element for selection-based positioning (e.g., double-click in input)
    if (!shouldSkip && !sourceEvent) {
      const activeElement = document.activeElement;
      if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
        try {
          const activeDetection = await fieldDetector.detect(activeElement);
          if (activeDetection.fieldType === FieldTypes.REGULAR_INPUT) {
            this.logger.debug('Skipping selection icon - selection in regular-input field via keyboard/double-click', {
              fieldType: activeDetection.fieldType,
              tagName: activeElement.tagName
            });
            shouldSkip = true;
          }
        } catch (error) {
          this.logger.debug('Error checking active element field type', error);
        }
      }
    }

    // --- Show Window/Icon ---
    if (windowsManager && position && !shouldSkip) {
      this.logger.debug('Calling windowsManager.show()', {
        text: selectedText.substring(0, 30) + '...', 
        position
      });
      await windowsManager.show(selectedText, position);
      this.lastProcessedText = selectedText;
      this.lastProcessedTime = currentTime;
    } else if (window !== window.top && position && !shouldSkip) {
      this.logger.debug('Requesting window creation in main frame', {
        text: selectedText.substring(0, 30) + '...', 
        position
      });
      this._requestWindowCreationInMainFrame(selectedText, position);
      this.lastProcessedText = selectedText;
      this.lastProcessedTime = currentTime;
    } else {
      if (shouldSkip) {
        this.logger.debug('Selection icon intentionally skipped due to field type restrictions');
      } else {
        this.logger.warn('SelectionWindows not available or position not calculated');
      }
    }
  }

  /**
   * Cancel selection translation timeout and dismiss any active windows/icons
   * Extracted from EventHandler.cancelSelectionTranslation()
   */
  cancelSelectionTranslation(event) {
    this.logger.debug('cancelSelectionTranslation called', {
      hasTimeout: !!this.selectionTimeoutId,
      isInIframe: window !== window.top,
      eventTarget: event?.target?.tagName
    });

    // Only handle if we have a pending timeout - let WindowsManager handle icon dismissal
    if (!this.selectionTimeoutId) {
      this.logger.debug('No pending timeout, skipping cancelSelectionTranslation');
      return;
    }
    
    this.clearTimer(this.selectionTimeoutId);
    this.selectionTimeoutId = null;
    this.logger.debug('Selection translation timeout cancelled');
    
    // Clear tracking when cancelling
    this.lastProcessedText = null;
    this.lastProcessedTime = 0;
    
    // In iframe, send dismiss message to parent frame for timeout cancellation
    if (window !== window.top) {
      this.logger.debug('Sending timeout cancellation message to parent frame from iframe');
      try {
        window.parent.postMessage({
          type: 'DISMISS_WINDOWS_MANAGER',
          frameId: this.frameId,
          timestamp: Date.now(),
          reason: 'timeout-cancelled'
        }, '*');
      } catch (error) {
        this.logger.warn('Failed to send dismiss message to parent:', error);
      }
    }
    // Note: In main frame, WindowsManager's own dismiss listener will handle icon dismissal
  }




  /**
   * Handle double-click events to mark professional editor selections
   * @param {MouseEvent} event - Double-click event
   */
  async handleDoubleClick(event) {
    this.logger.debug('Double-click detected', {
      target: event.target?.tagName,
      timestamp: Date.now()
    });
    
    // Mark the time of double-click and set processing flag
    this.lastDoubleClickTime = Date.now();
    this.doubleClickProcessing = true;
    
    // Clear previous double-click tracking after timeout
    if (this.doubleClickCleanupTimeout) {
      clearTimeout(this.doubleClickCleanupTimeout);
    }
    this.doubleClickCleanupTimeout = setTimeout(() => {
      this.lastDoubleClickText = null;
      this.lastDoubleClickPosition = null;
    }, 1000);
    
    // Capture selection immediately to avoid interference
    const immediateText = await selectionDetector.detect(event.target);
    
    // Use smart retry mechanism based on field type detection
    const detection = await fieldDetector.detect(event.target);

    // Skip non-processable fields completely
    if (detection.fieldType === FieldTypes.NON_PROCESSABLE) {
      this.logger.debug('Ignoring double-click on non-processable field');
      return;
    }

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
        
        // Check if we should show selection icon for this field type
        if (!detection.shouldShowSelectionIcon) {
          this.logger.debug('Not showing selection icon for double-click on regular field', {
            fieldType: detection.fieldType,
            shouldShowSelectionIcon: detection.shouldShowSelectionIcon
          });
          return true;
        }
        
        // Store double-click context for duplicate detection
        this.lastDoubleClickText = selectedText;
        
        // Force process the selection with calculated position
        await this.processSelectedText(selectedText, event, { isFromDoubleClick: true });
        
        // Don't clear flag here - let the main timeout handle it
        return true;
      } else if (immediateText && immediateText.trim() && attempt === 1) {
        // Use immediate capture if delayed capture fails
        this.logger.debug('Text selected via double-click (immediate fallback)', {
          text: immediateText.substring(0, 30) + '...',
          target: event.target?.tagName,
          method: 'immediate',
          fieldType: detection.fieldType
        });
        
        // Check if we should show selection icon for this field type
        if (!detection.shouldShowSelectionIcon) {
          this.logger.debug('Not showing selection icon for double-click on regular field (immediate)', {
            fieldType: detection.fieldType,
            shouldShowSelectionIcon: detection.shouldShowSelectionIcon
          });
          return true;
        }
        
        // Store double-click context for duplicate detection
        this.lastDoubleClickText = immediateText;
        
        await this.processSelectedText(immediateText, event, { isFromDoubleClick: true });
        
        // Don't clear flag here - let the main timeout handle it
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
    
    // Clear processing flag after reasonable delay
    setTimeout(() => {
      this.doubleClickProcessing = false;
    }, 300);
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

    // Only dismiss on left click (button 0), ignore right-click (button 2) and middle-click (button 1)
    if (event.button !== 0) {
      return;
    }

    // Check if this is a text drag operation - if so, don't dismiss
    if (isTextDragOperation(event)) {
      this.logger.debug('Text drag operation detected in TextSelectionManager - preserving window', {
        target: event.target?.tagName,
        selectionLength: window.getSelection().toString().length
      });
      return;
    }

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

    // Check if mouse event is on a translation icon
    if (event.target) {
      const translationIcon = event.target.closest('.translation-icon');
      if (translationIcon) {
        this.logger.debug('Mouse event on translation icon - not dismissing');
        return;
      }

      // Check composed path for translation icons in shadow DOM
      if (typeof event.composedPath === 'function') {
        const eventPath = event.composedPath();
        for (const element of eventPath) {
          if (element.classList && element.classList.contains('translation-icon')) {
            this.logger.debug('Mouse event on translation icon in path - not dismissing');
            return;
          }
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
   * Calculate position using site handler
   * @param {MouseEvent} sourceEvent - The event that triggered selection
   * @param {Element} element - Target element
   * @returns {Promise<Object|null>} Position object with x,y coordinates
   */
  async _calculatePositionUsingSiteHandler(sourceEvent, element) {
    try {
      // Use the new modular selection detector for position calculation
      const position = await selectionDetector.calculatePosition(element, {
        sourceEvent,
        forceRefresh: true
      });
      
      if (position && (position.x !== 0 || position.y !== 0)) {
        this.logger.debug('Site handler position calculation successful:', position);
        return position;
      }
      
      this.logger.debug('Site handler returned default position (0,0)');
      return null;
      
    } catch (error) {
      this.logger.debug('Site handler position calculation failed:', error);
      return null;
    }
  }

  /**
   * DEPRECATED: Calculate position for Zoho Writer selection icon
   * This method is deprecated - position calculation is now handled by site handlers
   * @param {MouseEvent} sourceEvent - The double-click event
   * @returns {Object|null} Position object with x,y coordinates
   * @deprecated Use _calculatePositionUsingSiteHandler instead
   */
  calculateZohoWriterPosition(sourceEvent) {
    console.warn('DEPRECATED: calculateZohoWriterPosition is deprecated. Position calculation is now handled by site handlers.');
    
    // Fallback implementation for backward compatibility
    try {
      if (sourceEvent && sourceEvent.clientX && sourceEvent.clientY) {
        return {
          x: sourceEvent.clientX + window.scrollX,
          y: sourceEvent.clientY + window.scrollY + 25
        };
      }
    } catch (error) {
      this.logger.debug('Legacy calculateZohoWriterPosition failed:', error);
    }
    
    return null;
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
    
    // Clear double-click cleanup timeout
    if (this.doubleClickCleanupTimeout) {
      clearTimeout(this.doubleClickCleanupTimeout);
      this.doubleClickCleanupTimeout = null;
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
  async _processSelectionChangeEvent(event, sourceMouseEvent = null) {
    this.logger.debug('_processSelectionChangeEvent called', {
      eventType: event.type,
      hasSelection: !!event.selection,
      hasSourceMouseEvent: !!sourceMouseEvent
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
    
    // Check if this selection matches recent double-click to prevent duplicate icon creation
    if (this.lastDoubleClickText && selectedText === this.lastDoubleClickText) {
      const timeSinceDoubleClick = Date.now() - this.lastDoubleClickTime;
      if (timeSinceDoubleClick < 500) { // Within 500ms of double-click
        this.logger.debug('Skipping duplicate selectionchange processing - matches recent double-click');
        return;
      }
    }
    
    // Check if we should process this text selection based on settings
    const shouldProcess = await this.shouldProcessTextSelection(event);
    if (!shouldProcess) {
      this.logger.debug('Skipping selectionchange processing due to Ctrl requirement not met');
      return;
    }

    // Read settings for selection translation mode
    // let settings;
    // let selectionTranslationMode;

    try {
      // await getSettingsAsync();
      // selectionTranslationMode = settings.selectionTranslationMode || CONFIG.selectionTranslationMode;
    } catch (error) {
      if (ExtensionContextManager.isContextError(error)) {
        this.logger.debug('Extension context invalidated, skipping selectionchange processing');
        return;
      } else {
        throw error;
      }
    }

    // Process selection with a small delay to allow dblclick to take precedence
    const currentTime = Date.now();
    
    // Track this text as being processed
    this.lastProcessedText = selectedText;
    this.lastProcessedTime = currentTime;

    this.trackTimeout(() => {
      if (this.doubleClickProcessing) {
        this.logger.debug('Skipping delayed selection processing because a double-click was handled.');
        return;
      }
      this.processSelectedText(selectedText, sourceMouseEvent || event);
    }, 50); // 50ms delay to wait for a potential dblclick event

    this.logger.debug('Scheduled selection processing with 50ms delay');
  }
}
