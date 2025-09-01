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

export class TextSelectionManager {
  constructor(options = {}) {
    // Accept WindowsManager instance through dependency injection, or create one
    this.selectionWindows = options.windowsManager || new WindowsManager({});
    this.messenger = options.messenger;
    this.notifier = options.notifier;
    this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'TextSelectionManager');
    
    // Selection state management
    this.selectionTimeoutId = null;
    this.ctrlKeyPressed = false;
    
    // **FIX FOR DISCORD**: Track last processed selection to prevent duplicate processing
    this.lastProcessedText = null;
    this.lastProcessedTime = 0;
    this.selectionProcessingCooldown = 1000; // 1 second cooldown
    
    // Bind methods for event handlers
    this.handleTextSelection = this.handleTextSelection.bind(this);
    this.processSelectedText = this.processSelectedText.bind(this);
    this.cancelSelectionTranslation = this.cancelSelectionTranslation.bind(this);
    this._onOutsideClick = this._onOutsideClick.bind(this);
    
    this.logger.init('TextSelectionManager initialized');
  }

  /**
   * Main text selection handler - replaces EventHandler.handleMouseUp()
   * @param {MouseEvent} event - Mouse up event
   */
  async handleTextSelection(event) {
    this.logger.debug('handleTextSelection called');
    
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
    if (this.selectionWindows?.isVisible) {
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
      if (isRecentDuplicate && this.selectionWindows?.isVisible) {
        this.logger.debug('Skipping duplicate selection event for same text', {
          text: selectedText.substring(0, 30) + '...',
          timeSinceLastProcess: currentTime - this.lastProcessedTime,
          selectionWindowVisible: this.selectionWindows?.isVisible
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

        this.selectionTimeoutId = setTimeout(() => {
          this.selectionTimeoutId = null;
          this.processSelectedText(selectedText, event);
        }, delay);

        // **FIX FOR DISCORD**: Track this text as being processed
        this.lastProcessedText = selectedText;
        this.lastProcessedTime = currentTime;

        // اضافه کردن listener برای لغو ترجمه در صورت کلیک
        document.addEventListener("mousedown", this.cancelSelectionTranslation);
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
        if (!isInsideWindow && target.id === 'translate-it-host' && this.selectionWindows?.isVisible) {
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
          clearTimeout(this.selectionTimeoutId);
          this.selectionTimeoutId = null;
          document.removeEventListener("mousedown", this.cancelSelectionTranslation);
        }
      }

      // همچنین اگر پاپ‌آپ ترجمه متن انتخاب شده باز است آن را ببندید.
      // This should run for both onClick and immediate modes
      if (this.selectionWindows?.isVisible) {
        this.logger.debug('Dismiss SelectionWindows - no text selected (outside click)');
        this.selectionWindows.dismiss();
        
        // **FIX FOR DISCORD**: Clear tracking when dismissing
        this.lastProcessedText = null;
        this.lastProcessedTime = 0;
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
    this.logger.debug('processSelectedText called', { text: selectedText.substring(0, 50) + '...' });
    
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
      // Check if extension context is valid before showing window/icon
      if (!ExtensionContextManager.isValidSync()) {
        this.logger.debug('Extension context invalid, skipping window/icon creation to preserve text selection');
        return;
      }
      
      this.logger.debug('📢 Calling selectionWindows.show()', { 
        text: selectedText.substring(0, 30) + '...',
        position,
        selectionWindowsExists: !!this.selectionWindows
      });
      this.selectionWindows.show(selectedText, position);
    } else {
      this.logger.warn('SelectionWindows not available');
    }
    
    // حذف listener بعد از نمایش پاپ‌آپ
    document.removeEventListener("mousedown", this.cancelSelectionTranslation);
  }

  /**
   * Cancel selection translation timeout
   * Extracted from EventHandler.cancelSelectionTranslation()
   */
  cancelSelectionTranslation() {
    if (this.selectionTimeoutId) {
      clearTimeout(this.selectionTimeoutId);
      this.selectionTimeoutId = null;
      this.logger.debug('Selection translation cancelled');
      
      // **FIX FOR DISCORD**: Clear tracking when cancelling
      this.lastProcessedText = null;
      this.lastProcessedTime = 0;
      
      try {
        document.removeEventListener("mousedown", this.cancelSelectionTranslation);
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
      clearTimeout(this.selectionTimeoutId);
      this.selectionTimeoutId = null;
    }
    
    // Remove event listeners
    try {
      document.removeEventListener("mousedown", this.cancelSelectionTranslation);
    } catch {
      // Listener may not have been added
    }
    
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
