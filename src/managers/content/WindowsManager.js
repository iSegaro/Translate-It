// src/managers/SelectionWindows.js

import { logME, isExtensionContextValid } from "../../utils/core/helpers.js";
import { ErrorTypes } from "../../error-management/ErrorTypes.js";
import {
  CONFIG,
  TranslationMode,
  getThemeAsync,
  getSettingsAsync,
} from "../../config.js";
import { storageManager } from "@/storage/core/StorageCore.js";
import { getResolvedUserTheme } from "../../utils/ui/theme.js";
import { AUTO_DETECT_VALUE } from "../../constants.js";
import { determineTranslationMode } from "../../utils/translationModeHelper.js";
import { SimpleMarkdown } from "../../utils/text/markdown.js";
import { MessageContexts, MessagingCore } from "../../messaging/core/MessagingCore.js";
import { MessageActions } from "@/messaging/core/MessageActions.js";

export default class SelectionWindows {
  constructor(options = {}) {
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

    // Enhanced messaging with context-aware selection and translation
    this.messenger = MessagingCore.getMessenger(MessageContexts.CONTENT);

    this.icon = null;
    this.iconClickContext = null;
    this.isIconMode = false; // Track current mode
    this.pendingTranslationWindow = false; // Flag to prevent immediate dismissal

    // Drag functionality
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };
    this.dragHandle = null;

    // Cross-iframe dismiss functionality - removed complex system

    this.show = this.show.bind(this);
    this.cancelCurrentTranslation = this.cancelCurrentTranslation.bind(this);
    this._handleThemeChange = this._handleThemeChange.bind(this);
    this.onIconClick = this.onIconClick.bind(this);
    this._onOutsideClick = this._onOutsideClick.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
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
      console.warn(
        "[SelectionWindows] Could not access top document, using current:",
        e
      );
    }

    return topDocument;
  }

  _calculateCoordsForTopWindow(position) {
    // If we're in an iframe, we need to adjust coordinates
    if (window !== window.top) {
      try {
        let totalOffsetX = position.x;
        let totalOffsetY = position.y;
        let currentWindow = window;

        // Add iframe offsets up the chain
        while (currentWindow.parent !== currentWindow) {
          try {
            const frameElement = currentWindow.frameElement;
            if (frameElement) {
              const frameRect = frameElement.getBoundingClientRect();
              const parentWindow = currentWindow.parent;
              totalOffsetX += frameRect.left + parentWindow.scrollX;
              totalOffsetY += frameRect.top + parentWindow.scrollY;
              currentWindow = parentWindow;
            } else {
              break;
            }
          } catch {
            // Cross-origin restriction
            break;
          }
        }

        return { x: totalOffsetX, y: totalOffsetY };
      } catch (e) {
        console.warn(
          "[SelectionWindows] Could not calculate top window coords:",
          e
        );
      }
    }

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
      logME(
        "[SelectionWindows] Theme changed, updating popup theme.",
        newValue
      );
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
    this.dismiss(false);
    if (!selectedText) return;

    const settings = await getSettingsAsync();
    const selectionTranslationMode =
      settings.selectionTranslationMode || CONFIG.selectionTranslationMode;

    if (selectionTranslationMode === "onClick") {
      this.isIconMode = true;
      this._createTranslateIcon(selectedText, position);
    } else {
      this.isIconMode = false;
      this._createTranslateWindow(selectedText, position);
    }
  }

  _createTranslateIcon(selectedText, position) {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    const topDocument = this._getTopDocument();
    if (!topDocument?.body) {
      logME("[SelectionWindows] Cannot access top document body.");
      return;
    }

    const hostId = "aiwc-selection-icon-host";
    let iconHost = topDocument.getElementById(hostId);
    if (!iconHost) {
      try {
        iconHost = topDocument.createElement("div");
        iconHost.id = hostId;
        topDocument.body.appendChild(iconHost);
      } catch (e) {
        logME("[SelectionWindows] Failed to create icon host container.", e);
        return;
      }
    }

    this.icon = document.createElement("div");
    this.icon.id = "translate-it-icon";

    const iconUrl = browser.runtime.getURL("icons/extension_icon_32.png");

    // Calculate position for iframe escape
    const iconPosition = this._calculateCoordsForTopWindow({
      x: window.scrollX + rect.left + rect.width / 2 - 12,
      y: window.scrollY + rect.bottom + 5,
    });

    // Get top window for positioning
    const topWindow =
      topDocument.defaultView || topDocument.parentWindow || window;

    // --- شروع تغییرات برای افزودن انیمیشن ---

    // 1. تعریف استایل‌های اولیه (حالت شروع انیمیشن)
    Object.assign(this.icon.style, {
      position: "fixed", // Use fixed for iframe escape
      zIndex: "2147483647",
      left: `${iconPosition.x - topWindow.scrollX}px`,
      top: `${iconPosition.y - topWindow.scrollY}px`,
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

    // 2. افزودن آیکون به صفحه (top document's HOST برای iframe escape)
    iconHost.appendChild(this.icon);

    // 3. با یک تأخیر بسیار کوتاه، استایل نهایی را اعمال کن تا انیمیشن اجرا شود
    setTimeout(() => {
      // اطمینان از اینکه آیکون هنوز در صفحه وجود دارد
      if (this.icon) {
        this.icon.style.opacity = "1";
        this.icon.style.transform = "scale(1)";
      }
    }, 10); // یک تأخیر کوتاه برای اجرای صحیح انیمیشن کافی است

    this.iconClickContext = { text: selectedText, position };
    this.icon.addEventListener("click", this.onIconClick);

    // Add outside click listener for icon dismissal
    this._addOutsideClickListener();
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

      // Clean up icon visuals.
      // The 'false' argument to _cleanupIcon means it won't try to remove the outside click listener again,
      // which is correct because we've just manually removed it.
      // This maintains compatibility with how _cleanupIcon is used elsewhere (e.g., in dismiss()).
      this._cleanupIcon(false); // Icon visuals and its specific event listeners are cleaned.

      // Create translation window
      this._createTranslateWindow(text, position);

      // Reset flag after a short delay, allowing the new window to establish its own event listeners.
      // This timeout can be experimented with if needed.
      setTimeout(() => {
        this.pendingTranslationWindow = false;
      }, 100); // Original timeout value, can be tuned if necessary
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

    this.originalText = selectedText;
    this.isTranslationCancelled = false;
    this.isIconMode = false; // Now in window mode

    const translationMode = determineTranslationMode(
      selectedText,
      TranslationMode.Selection
    );

    logME("[SelectionWindows] Creating translation window ", translationMode);

    this.displayElement = document.createElement("div");
    this.displayElement.classList.add("aiwc-selection-popup-host");

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

    // Get the top-level document to escape iframe constraints
    const topDocument = this._getTopDocument();
    topDocument.body.appendChild(this.displayElement);
    this.isVisible = true;

    // Add drag functionality
    this._setupDragHandlers();

    requestAnimationFrame(() => {
      if (this.displayElement) {
        this.displayElement.style.opacity = "0.95";
        this.displayElement.style.transform = "scale(1)";
      }
    });

    // Use specialized translation messenger for background translation
    this.messenger.specialized.translation
      .translateText(selectedText, {
        translationMode,
        action: MessageActions.FETCH_TRANSLATION,
      })
      .then((response) => {
        if (
          this.isTranslationCancelled ||
          this.originalText !== selectedText ||
          !this.innerContainer
        )
          return;
        if (response?.success) {
          const txt = (response.data.translatedText || "").trim();
          if (!txt) throw new Error(ErrorTypes.TRANSLATION_NOT_FOUND);
          this.transitionToTranslatedText(
            txt,
            loading,
            selectedText,
            translationMode
          );
        } else {
          throw new Error(
            response?.error?.message || response?.error || ErrorTypes.SERVICE
          );
        }
      })
      .catch(async (err) => {
        if (this.isTranslationCancelled || !this.innerContainer) return;
        await this.handleTranslationError(err, loading);
      });

    // Add outside click listener after translation window is ready AND
    // pendingTranslationWindow flag is false.
    // The timeout here ensures that the click event that initiated the window creation
    // has fully propagated and won't be caught by this new listener.
    setTimeout(() => {
      // Ensure we only add the listener if the window is still supposed to be visible
      // and we are NOT in the process of transitioning (pendingTranslationWindow is false).
      if (
        this.isVisible &&
        this.displayElement &&
        !this.pendingTranslationWindow
      ) {
        this._addOutsideClickListener();
      }
    }, 150); // Slightly increased delay for robustness, can be tuned.
  }

  _onOutsideClick(e) {
    // Prevent dismissal if we're in the middle of transitioning from icon to window
    if (this.pendingTranslationWindow) {
      return;
    }

    // Handle icon mode
    if (this.isIconMode && this.icon) {
      if (!this.icon.contains(e.target)) {
        this.dismiss(true);
      }
      return;
    }

    // Handle translation window mode
    if (this.displayElement && this.isVisible) {
      // Get top document for proper element checking
      const topDocument = this._getTopDocument();

      // Check if click target is outside our popup
      // Since popup is in top document, we can directly check contains
      const isClickInsidePopup = this.displayElement.contains(e.target);

      // Check for potential icon clicks (shouldn't exist in window mode but safety check)
      const clickedIcon = topDocument.getElementById("translate-it-icon");
      const isClickOnIcon = clickedIcon && clickedIcon.contains(e.target);

      // If click is outside popup and not on icon, dismiss
      if (!isClickInsidePopup && !isClickOnIcon) {
        // Immediate dismissal for outside clicks - no need for complex checks
        // since we're now properly handling cross-iframe scenarios
        this.cancelCurrentTranslation();
      }
    }
  }

  _addOutsideClickListener() {
    if (!isExtensionContextValid()) return;

    // Remove existing listener first
    this._removeOutsideClickListener();

    // Get top document - this is where popup exists and where we should listen
    const topDocument = this._getTopDocument();

    // Only add listener to top document since popup is always there
    topDocument.addEventListener("click", this._onOutsideClick, {
      capture: true,
    });

    // Store removal function
    this.removeMouseDownListener = () => {
      topDocument.removeEventListener("click", this._onOutsideClick, {
        capture: true,
      });
    };
  }

  _removeOutsideClickListener() {
    if (this.removeMouseDownListener) {
      this.removeMouseDownListener();
      this.removeMouseDownListener = null;
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
    if (isExtensionContextValid()) {
      // Use specialized TTS messenger for stopping TTS
      this.messenger.specialized.tts.stop().catch((error) => {
        logME("[SelectionWindows] Error stopping TTS:", error);
      });
    }
  }

  applyInitialStyles(position) {
    // Calculate coordinates relative to top window if in iframe
    const topWindowPosition = this._calculateCoordsForTopWindow(position);

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
    const popupWidth = 320; // Slightly larger than max-width: 300px + padding
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
        rect.left >= window.innerWidth ||
        rect.top >= window.innerHeight ||
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
        const newY = window.scrollY + rect.bottom + 10;
        const spaceBelow = window.innerHeight - (rect.bottom + 10);

        if (spaceBelow >= height) {
          return newY;
        } else {
          // Try above the fixed element
          const newYAbove = window.scrollY + rect.top - height - 10;
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

  _onMouseUp(_e) {
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
    const textSpan = document.createElement("span");
    textSpan.classList.add("text-content");
    try {
      // Ensure translatedText is safely rendered through SimpleMarkdown
      // which already includes XSS protection via filterXSS
      const markdownElement = SimpleMarkdown.render(translatedText);
      if (markdownElement) {
        textSpan.appendChild(markdownElement);
      } else {
        // Fallback to safe text content if markdown rendering fails
        textSpan.textContent = translatedText;
      }
    } catch (e) {
      logME("Error parsing markdown:", e);
      // Always use textContent for safe text rendering
      textSpan.textContent = translatedText;
    }
    secondLine.appendChild(textSpan);
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
    } else if (currentX < 10) {
      // Popup extends beyond left edge
      newX = 10;
      needsRepositioning = true;
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
    icon.addEventListener("click", (e) => {
      e.stopPropagation();
      if (isExtensionContextValid()) {
        // Use specialized TTS messenger for speaking
        this.messenger.specialized.tts
          .speak(textToSpeak, AUTO_DETECT_VALUE)
          .catch((error) => {
            logME("[SelectionWindows] Error speaking text:", error);
          });
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
        logME("[SelectionWindows] Failed to copy text:", err);
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
    if (this.innerContainer) {
      const errorMsgElement = document.createElement("div");
      // Use textContent to safely display error message
      errorMsgElement.textContent =
        CONFIG.ICON_ERROR + "Translation failed. Please try again.";
      errorMsgElement.style.color = "var(--sw-text-color)";
      errorMsgElement.style.padding = "5px";
      this.innerContainer.appendChild(errorMsgElement);
      setTimeout(() => this.dismiss(true), 3000);
    } else {
      this.dismiss(false);
    }
    const errObj =
      error instanceof Error ? error : (
        new Error(String(error.message || error))
      );
    await this.translationHandler.errorHandler.handle(errObj, {
      type: errObj.type || ErrorTypes.API,
      context: "selection-window-translate",
      isSilent: true,
    });
  }

  dismiss(withFadeOut = true) {
    // Ensure icon is cleaned up, including its outside click listener if active
    // _cleanupIcon is called with 'true' to ensure its outside click listener is removed IF it was active for the icon.
    // If we are dismissing from a window state, _cleanupIcon(true) will try to remove listeners,
    // which is fine (it will find no icon-specific listener if we are in window mode).
    // The main window's listener is handled by _removeOutsideClickListener directly below.
    this._cleanupIcon(true); // Cleanup icon and its listeners if any

    if (!this.displayElement || !this.isVisible) {
      // If only an icon was visible and now dismissed, ensure no lingering listeners.
      if (!this.isVisible) this._removeOutsideClickListener();
      return;
    }

    this._removeThemeChangeListener();
    this._removeOutsideClickListener(); // Specifically for the window
    this._removeDragHandlers(); // Clean up drag handlers

    this.isVisible = false;
    this.pendingTranslationWindow = false; // Reset this flag
    // this.isIconMode = false; // Reset mode, though usually handled by show() or onIconClick()

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
  logME("[SelectionWindows] Dismissing all selection windows");
  try {
    // Function to clean up from a specific document
    const cleanupDocument = (doc) => {
      const hosts = doc.querySelectorAll(".aiwc-selection-popup-host");
      hosts.forEach((host) => {
        try {
          host.remove();
        } catch (innerErr) {
          logME("[SelectionWindows] Failed to remove a host:", innerErr);
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
      logME("[SelectionWindows] Could not clean top document:", err);
    }
  } catch (err) {
    logME(
      "[SelectionWindows] Unknown error in dismissAllSelectionWindows:",
      err
    );
  }
}
