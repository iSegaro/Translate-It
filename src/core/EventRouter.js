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
          context: "event-router-handleEventWithErrorHandling",
          eventType: args[0]?.type,
          element: args[0]?.target?.tagName,
        });
      }
    };
  };

  const handleFocus = handleEventWithErrorHandling((e) => {
    if (isEditable(e.target)) {
      if (translationHandler?.IconManager) {
        // Null-check ایمن
        translationHandler.handleEditableFocus(e.target);
      }
    }
  });

  const handleBlur = handleEventWithErrorHandling((e) => {
    if (isEditable(e.target)) {
      if (translationHandler.IconManager) {
        translationHandler.handleEditableBlur(e.target);
      }
    }
  });

  const handleSelectionChange = handleEventWithErrorHandling((e) => {
    translationHandler?.handleEvent?.(e);
  });

  const handleClick = handleEventWithErrorHandling((e) => {
    if (state?.selectionActive) {
      translationHandler.IconManager?.cleanup();
      state.selectionActive = false;

      try {
        chrome.storage.local.set({ selectionActive: false });
      } catch (storageError) {
        const handlerError = errorHandler.handle(storageError, {
          type: ErrorTypes.INTEGRATION,
          context: "chrome-storage-set",
        });
        throw handlerError;
      }

      taggleLinks(false);

      try {
        chrome.runtime.sendMessage({
          action: "UPDATE_SELECTION_STATE",
          data: false,
        });
      } catch (messageError) {
        const handlerError = errorHandler.handle(messageError, {
          type: ErrorTypes.INTEGRATION,
          context: "runtime-sendMessage",
        });
        throw handlerError;
      }

      setTimeout(() => {
        try {
          translationHandler.eventHandler.handleSelectionClick(e);
        } catch (timeoutError) {
          const handlerError = errorHandler.handle(timeoutError, {
            type: ErrorTypes.UI,
            context: "handleSelectionClick-timeout",
          });
          throw handlerError;
        }
      }, 100);
    }
  });

  const handleKeyDown = handleEventWithErrorHandling((e) => {
    try {
      translationHandler.handleEvent(e);
      if (e.key === "Escape" && state.selectionActive) {
        if (translationHandler.IconManager) {
          translationHandler.IconManager.cleanup();
        }
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
    } catch (error) {
      errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "event-router-handleKeyDown",
        eventType: e.type,
        key: e.key,
      });
    }
  });

  const handleMouseOver = handleEventWithErrorHandling((e) => {
    if (!state.selectionActive) return;
    const target = e.composedPath?.()?.[0] || e.target;
    if (!target?.innerText?.trim()) return;

    try {
      if (state.highlightedElement !== e.target) {
        if (state.highlightedElement) {
          state.highlightedElement.style.outline = "";
          state.highlightedElement.style.opacity = "";
        }
        state.highlightedElement = e.target;
        e.target.style.outline = CONFIG.HIGHLIGHT_STYLE;
        e.target.style.opacity = "0.9";
      }
    } catch (styleError) {
      const handlerError = errorHandler.handle(styleError, {
        type: ErrorTypes.UI,
        context: "mouseover-style-update",
        element: e.target?.tagName,
      });
      throw handlerError;
    }
  });

  // ثبت Event Listenerها
  const addListeners = async () => {
    try {
      const validateEventTarget = (target) => {
        if (!(target instanceof EventTarget)) {
          throw new Error("Invalid EventTarget");
        }
      };

      validateEventTarget(document);
      document.addEventListener("focus", handleFocus, true);
      document.addEventListener("blur", handleBlur, true);
      document.addEventListener("selectionchange", handleSelectionChange);
      document.addEventListener("click", handleClick);
      document.addEventListener("keydown", handleKeyDown);
      document.addEventListener("mouseover", handleMouseOver);
    } catch (listenerError) {
      const handlerError = errorHandler.handle(listenerError, {
        type: ErrorTypes.INTEGRATION,
        context: "add-event-listeners",
      });
      throw handlerError;
    }
  };

  addListeners();

  return {
    handleFocus,
    handleBlur,
    handleSelectionChange,
    handleClick,
    handleKeyDown,
    handleMouseOver,
  };
}

export async function teardownEventListeners(listeners) {
  try {
    document.removeEventListener("focus", listeners.handleFocus, true);
    document.removeEventListener("blur", listeners.handleBlur, true);
    document.removeEventListener(
      "selectionchange",
      listeners.handleSelectionChange
    );
    document.removeEventListener("click", listeners.handleClick);
    document.removeEventListener("keydown", listeners.handleKeyDown);
    document.removeEventListener("mouseover", listeners.handleMouseOver);
  } catch (teardownError) {
    console.debug("Error Tearing Down Event Listeners:", teardownError);
    const handlerError = errorHandler.handle(teardownError, {
      type: ErrorTypes.SYSTEM,
      context: "teardown-event-list",
    });
    throw handlerError;
  }
}
