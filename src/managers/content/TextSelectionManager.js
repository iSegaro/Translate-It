/**
 * TextSelectionManager - Modular text selection handling system
 * Extracted from EventHandler for better maintainability and separation of concerns
 */

import { createLogger } from "../../utils/core/logger.js";
import { getRequireCtrlForTextSelectionAsync, getSettingsAsync, CONFIG, state } from "../../config.js";
import { getEventPath, getSelectedTextWithDash, isCtrlClick } from "../../utils/browser/events.js";

export class TextSelectionManager {
  constructor(options = {}) {
    this.selectionWindows = options.selectionWindows;
    this.messenger = options.messenger;
    this.notifier = options.notifier;
    this.logger = createLogger('Content', 'TextSelectionManager');
    
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
    
    // **FIX FOR DISCORD**: Skip if we're in transition from selection icon to translation window
    // This prevents conflicts and duplicate selection windows during the transition
    if (state && state.preventTextFieldIconCreation === true) {
      this.logger.debug('Skipping handleTextSelection due to active selection window transition');
      return;
    }
    
    const selectedText = getSelectedTextWithDash();
    const path = getEventPath(event);

    // بررسی اینکه آیا کلیک در داخل پنجره ترجمه رخ داده است یا نه
    if (
      this.selectionWindows?.isVisible &&
      path.includes(this.selectionWindows?.displayElement)
    ) {
      // اگر کلیک داخل پنجره اتفاق افتاده باشد، عملیات متوقف می‌شود
      return;
    }

    // Skip text selection handling if select element mode is active in this tab
    try {
      // Prefer local content-script flag or selectElementManager instance if available
      if (window.translateItNewSelectManager || (window.selectElementManagerInstance && window.selectElementManagerInstance.isActive)) {
        return;
      }
    } catch {
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
        const settings = await getSettingsAsync();
        const selectionTranslationMode =
          settings.selectionTranslationMode || CONFIG.selectionTranslationMode;

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
      // **IMPORTANT**: When no text is selected (outside click), always allow dismissal
      const settings = await getSettingsAsync();
      const selectionTranslationMode =
        settings.selectionTranslationMode || CONFIG.selectionTranslationMode;

      if (selectionTranslationMode === "onClick") {
        // In onClick mode, outside clicks should still dismiss windows
        // Don't return early - allow dismissal logic to run
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
      
      // محاسبه موقعیت زیر متن انتخاب شده
      position = {
        x: rect.left + window.scrollX,
        y: rect.bottom + window.scrollY + 15, // کمی فاصله
      };

      // --- بهبود: تنظیم موقعیت افقی برای جلوگیری از خروج از صفحه ---
      const popupMaxWidth = 300; // عرض تقریبی پاپ‌آپ
      const viewportWidth = window.innerWidth;
      
      if (position.x < 10) {
        // جلوگیری از چسبیدن به لبه چپ
        position.x = 10;
      } else if (position.x + popupMaxWidth > viewportWidth - 10) {
        // جلوگیری از خروج از لبه راست
        position.x = viewportWidth - popupMaxWidth - 10;
      }
    }

    // نمایش پاپ آپ با متن و موقعیت جدید
    if (this.selectionWindows) {
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
    const settings = await getSettingsAsync();
    const selectionTranslationMode =
      settings.selectionTranslationMode || CONFIG.selectionTranslationMode;

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
