/**
 * TextSelectionManager - Modular text selection handling system
 * Extracted from EventHandler for better maintainability and separation of concerns
 */

import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import { getRequireCtrlForTextSelectionAsync, getSettingsAsync, CONFIG, state } from "@/shared/config/config.js";
import { getEventPath, getSelectedTextWithDash, isCtrlClick } from "@/utils/browser/events.js";
import { WindowsConfig } from "@/features/windows/managers/core/WindowsConfig.js";
import { ExtensionContextManager } from "@/core/extensionContext.js";
import { WindowsManager } from '@/features/windows/managers/WindowsManager.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';

export class TextSelectionManager extends ResourceTracker {
  constructor(options = {}) {
    super('text-selection-manager');
    
    // Initialize logger first
    this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'TextSelectionManager');
    
    // Generate frameId for cross-frame communication
    this.frameId = Math.random().toString(36).substring(7);
    
    // Accept WindowsManager instance through dependency injection, or use null for iframe
    if (window !== window.top) {
      // In iframe context, don't create WindowsManager - use cross-frame communication
      this.selectionWindows = null;
      this.logger.debug('TextSelectionManager in iframe - WindowsManager disabled, using cross-frame communication');
    } else {
      // In main frame, accept WindowsManager through dependency injection or create one
      this.selectionWindows = options.windowsManager || new WindowsManager({});
      this.logger.debug('TextSelectionManager in main frame - WindowsManager initialized');
    }
    this.messenger = options.messenger;
    this.notifier = options.notifier;
    
    // Selection state management
    this.selectionTimeoutId = null;
    this.ctrlKeyPressed = false;
    
    // **FIX FOR DISCORD**: Track last processed selection to prevent duplicate processing
    this.lastProcessedText = null;
    this.lastProcessedTime = 0;
    this.selectionProcessingCooldown = 1000; // 1 second cooldown
    
    // Track external window state (for iframe-created windows in main frame)
    this.hasExternalWindow = false;
    
    // Bind methods for event handlers
    this.handleTextSelection = this.handleTextSelection.bind(this);
    this.processSelectedText = this.processSelectedText.bind(this);
    this.cancelSelectionTranslation = this.cancelSelectionTranslation.bind(this);
    this._onOutsideClick = this._onOutsideClick.bind(this);
    
    // Setup external window tracking for iframe-created windows
    this._setupExternalWindowTracking();
    
    this.logger.init('TextSelectionManager initialized');
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
   * Check if translation window is visible (works in both main frame and iframe)
   * @returns {boolean}
   */
  _isWindowVisible() {
    if (this.selectionWindows) {
      return this.selectionWindows.isVisible;
    }
    
    // Check external window state (for iframe-created windows)
    if (this.hasExternalWindow) {
      return true;
    }
    
    // Fallback: check shadow DOM directly
    const shadowHost = document.getElementById('translate-it-host');
    if (shadowHost && shadowHost.shadowRoot) {
      const activeWindows = shadowHost.shadowRoot.querySelectorAll('.translation-window');
      return activeWindows.length > 0;
    }
    
    return false;
  }

  /**
   * Dismiss translation window (works in both main frame and iframe)
   */
  _dismissWindow() {
    if (this.selectionWindows) {
      this.selectionWindows.dismiss();
    }
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
      hasWindowsManager: !!this.selectionWindows
    });
    
    // Skip if currently dragging a translation window
    if (window.__TRANSLATION_WINDOW_IS_DRAGGING === true) {
      this.logger.debug('Skipping handleTextSelection due to active window dragging');
      return;
    }
    this.logger.debug('Drag flag check:', { isDragging: window.__TRANSLATION_WINDOW_IS_DRAGGING });
    
    // **FIX FOR DISCORD**: Skip if we're in transition from selection icon to translation window
    // This prevents conflicts and duplicate selection windows during the transition
    if (state && state.preventTextFieldIconCreation === true) {
      this.logger.debug('Skipping handleTextSelection due to active selection window transition');
      return;
    }
    
    const selectedText = getSelectedTextWithDash();
    const path = getEventPath(event);

    // بررسی اینکه آیا کلیک در داخل پنجره ترجمه رخ داده است یا نه
    if (this._isWindowVisible()) {
      let isInsideWindow = false;
      const displayElement = this.selectionWindows?.displayElement;
      if (displayElement && event.target) {
        // بررسی با contains و همچنین بررسی مسیر رویداد
        if (displayElement.contains(event.target)) {
          isInsideWindow = true;
        } else if (typeof event.composedPath === 'function') {
          const eventPath = event.composedPath();
          if (eventPath.includes(displayElement)) {
            isInsideWindow = true;
          }
        } else if (Array.isArray(path) && path.includes(displayElement)) {
          isInsideWindow = true;
        }
      }
      if (isInsideWindow) {
        // اگر کلیک داخل پنجره اتفاق افتاده باشد، عملیات متوقف می‌شود
        this.logger.debug('Click detected inside translation window, not dismissing.');
        return;
      }
    }

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

    if (selectedText) {
      // **FIX FOR DISCORD**: Check if this is a duplicate selection event
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

        // **FIX FOR DISCORD**: Track this text as being processed
        this.lastProcessedText = selectedText;
        this.lastProcessedTime = currentTime;

        // اضافه کردن listener برای لغو ترجمه در صورت کلیک using ResourceTracker
        this.addEventListener(document, "mousedown", this.cancelSelectionTranslation);
      }
    } else {
      // **IMPORTANT**: When no text is selected (outside click), only allow dismissal if click is outside translation window
      let settings;
      let selectionTranslationMode;
      let isInsideWindow = false;
      let displayElement = this.selectionWindows?.displayElement;
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
        if (!isInsideWindow && target.id === 'translate-it-host' && this._isWindowVisible()) {
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
        const shadowHost = document.getElementById('translate-it-host');
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
        // **FIX FOR DISCORD**: Clear tracking when no text is selected
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
      
      if (windowVisible) {
        // Only dismiss if we have our own selectionWindows (not external windows from iframe)
        if (this.selectionWindows && !this.hasExternalWindow) {
          this.logger.debug('Dismiss SelectionWindows - no text selected (outside click)');
          this._dismissWindow();
          
          // **FIX FOR DISCORD**: Clear tracking when dismissing
          this.lastProcessedText = null;
          this.lastProcessedTime = 0;
        }
        // If window is external (iframe-created), let WindowsManager handle dismissal
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
            className: event?.target?.className?.substring(0, 50) || ''
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

  /**
   * Process selected text and show translation window
   * Extracted from EventHandler.processSelectedText()
   * @param {string} selectedText - Selected text to translate
   * @param {MouseEvent} event - Original mouse event (optional)
   */
  async processSelectedText(selectedText) {
    this.logger.debug('processSelectedText called', { 
      text: selectedText.substring(0, 30) + '...',
      isInIframe: window !== window.top,
      hasWindowsManager: !!this.selectionWindows
    });
    
    // Check if extension context is valid before processing
    if (!ExtensionContextManager.isValidSync()) {
      this.logger.debug('Extension context invalid, skipping processSelectedText to preserve text selection');
      return;
    }
    
    // **FIX FOR DISCORD**: Skip if we're in transition from selection icon to translation window
    // This prevents conflicts with text field icon creation during the transition
    if (state && state.preventTextFieldIconCreation === true) {
      this.logger.debug('Skipping processSelectedText due to active selection window transition');
      return;
    }
    
  const selection = window.getSelection();
  let position = { x: 0, y: 0 };
    
    if (selection.rangeCount > 0) {
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

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

      this.logger.debug('Position after initial calculation', {
        position,
        mode: selectionTranslationMode,
        usedCenterX: selectionTranslationMode === 'onClick',
      });

      this.logger.debug('Smart positioning completed in TextSelectionManager', {
        finalPosition: position,
        mode: selectionTranslationMode,
        strategy: 'viewport-aware-calculation',
        targetX,
        targetY,
        selectionRect: {
          left: rect.left,
          right: rect.right,
          width: rect.width,
          viewportWidth
        }
      });
    }

    this.logger.debug('Final position before showing window', { position });

    // نمایش پاپ آپ با متن و موقعیت جدید
    if (this.selectionWindows) {
      // Main frame: use WindowsManager directly
      if (!ExtensionContextManager.isValidSync()) {
        this.logger.debug('Extension context invalid, skipping window/icon creation to preserve text selection');
        return;
      }
      
      this.logger.debug('Calling selectionWindows.show() in main frame', { 
        text: selectedText.substring(0, 30) + '...',
        position
      });
      this.selectionWindows.show(selectedText, position);
    } else if (window !== window.top) {
      // Iframe: use cross-frame communication to request window creation in main frame
      this.logger.debug('Requesting window creation in main frame from iframe', { 
        text: selectedText.substring(0, 30) + '...',
        position
      });
      this._requestWindowCreationInMainFrame(selectedText, position);
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
      
      // **FIX FOR DISCORD**: Clear tracking when cancelling
      this.lastProcessedText = null;
      this.lastProcessedTime = 0;
      
      try {
        // ResourceTracker handles event listener cleanup automatically
      } catch {
        // خطا در حذف
      }
    }
  }

  /**
   * Check if mouse event is Ctrl+Click
   * @param {MouseEvent} event - Mouse event
   * @returns {boolean} Whether Ctrl key was pressed
   */
  isMouseUpCtrl(event) {
    return isCtrlClick(event);
  }

  /**
   * Check if event requires Ctrl key for text selection
   * @param {MouseEvent} event - Mouse event
   * @returns {Promise<boolean>} Whether Ctrl requirement is satisfied
   */
  async shouldProcessTextSelection(event) {
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
      if (requireCtrl && !this.isMouseUpCtrl(event)) {
        return false;
      }
    }

    return true;
  }


  /**
   * Handle outside click events (placeholder for future integration)
   * @param {MouseEvent} event - Click event
   */
  _onOutsideClick() {
    // This will be used for more advanced selection window integration
    this.logger.debug('Outside click detected');
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
    
    // **FIX FOR DISCORD**: Clear tracking state
    this.lastProcessedText = null;
    this.lastProcessedTime = 0;
    
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
      hasSelectionWindows: !!this.selectionWindows,
      hasMessenger: !!this.messenger,
      activeTimeout: !!this.selectionTimeoutId,
      ctrlKeyPressed: this.ctrlKeyPressed,
      lastProcessedText: this.lastProcessedText ? this.lastProcessedText.substring(0, 50) + '...' : null,
      lastProcessedTime: this.lastProcessedTime,
      timeSinceLastProcess: this.lastProcessedTime ? Date.now() - this.lastProcessedTime : null
    };
  }
}
