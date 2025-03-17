// src/core/EventRouter.js
import { CONFIG, state } from "../config.js";
import { isEditable, taggleLinks } from "../utils/helpers.js";
import { ErrorTypes } from "../services/ErrorService.js";

export function setupEventListeners(translationHandler) {
  const errorHandler = translationHandler.errorHandler;

  const handleEventWithErrorHandling = (handler) => {
    return (...args) => {
      try {
        return handler(...args);
      } catch (error) {
        errorHandler.handle(error, {
          type: ErrorTypes.UI,
          context: "event-router",
          eventType: args[0]?.type,
        });
      }
    };
  };

  const handleFocus = handleEventWithErrorHandling((e) => {
    if (isEditable(e.target)) {
      translationHandler.handleEditableFocus(e.target);
    }
  });

  const handleBlur = handleEventWithErrorHandling((e) => {
    if (isEditable(e.target)) {
      translationHandler.handleEditableBlur(e.target);
    }
  });

  const handleSelectionChange = handleEventWithErrorHandling((e) => {
    translationHandler.handleEvent(e);
  });

  const handleClick = handleEventWithErrorHandling((e) => {
    if (state.selectionActive) {
      translationHandler.IconManager.cleanup();
      state.selectionActive = false;
      chrome.storage.local.set({ selectionActive: false });

      taggleLinks(false);

      chrome.runtime.sendMessage({
        action: "UPDATE_SELECTION_STATE",
        data: false,
      });
      setTimeout(() => {
        translationHandler.eventHandler.handleSelectionClick(e);
      }, 100);
    }
  });

  const handleKeyDown = handleEventWithErrorHandling((e) => {
    console.log("keydown event detected. Key:", e.key);
    if (e.key === "Escape" && state.selectionActive) {
      translationHandler.IconManager.cleanup();
      state.selectionActive = false;
      chrome.storage.local.set({ selectionActive: false });

      taggleLinks(false);

      chrome.runtime.sendMessage({
        action: "UPDATE_SELECTION_STATE",
        data: false,
      });
      console.info("Selection mode deactivated via Esc key.");
      return;
    }
    translationHandler.handleEvent(e);
  });

  const handleMouseOver = handleEventWithErrorHandling((e) => {
    if (!state.selectionActive) return;
    if (!e.target?.innerText?.trim()) return;

    if (state.highlightedElement !== e.target) {
      if (state.highlightedElement) {
        state.highlightedElement.style.outline = "";
        state.highlightedElement.style.opacity = "";
      }
      state.highlightedElement = e.target;
      e.target.style.outline = CONFIG.HIGHLIGHT_STYLE;
      e.target.style.opacity = "0.9";
    }
  });
  // ثبت Event Listeners
  document.addEventListener("focus", handleFocus, true);
  document.addEventListener("blur", handleBlur, true);
  document.addEventListener("selectionchange", handleSelectionChange);
  document.addEventListener("click", handleClick);
  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("mouseover", handleMouseOver);

  // برگرداندن توابع برای مدیریت حذف
  return {
    handleFocus,
    handleBlur,
    handleSelectionChange,
    handleClick,
    handleKeyDown,
    handleMouseOver,
  };
}

export function teardownEventListeners(listeners) {
  document.removeEventListener("focus", listeners.handleFocus, true);
  document.removeEventListener("blur", listeners.handleBlur, true);
  document.removeEventListener(
    "selectionchange",
    listeners.handleSelectionChange
  );
  document.removeEventListener("click", listeners.handleClick);
  document.removeEventListener("keydown", listeners.handleKeyDown);
  document.removeEventListener("mouseover", listeners.handleMouseOver);
}
