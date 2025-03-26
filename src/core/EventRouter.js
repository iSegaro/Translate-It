// src/core/EventRouter.js
import { CONFIG, state } from "../config.js";
import { isEditable, taggleLinks } from "../utils/helpers.js";
import { ErrorTypes } from "../services/ErrorService.js";
import { logMethod } from "../utils/helpers.js";

class EventRouter {
  constructor(translationHandler) {
    this.translationHandler = translationHandler;
    this.errorHandler = translationHandler.errorHandler;
    this.listeners = {}; // برای نگهداری از لیستنرهای ثبت شده

    this.handleEventWithErrorHandling = (handler) => {
      return (...args) => {
        try {
          return handler.apply(this, args); // اطمینان از درستی context
        } catch (error) {
          this.errorHandler.handle(error, {
            type: ErrorTypes.UI,
            context: "event-router-handleEventWithErrorHandling",
            eventType: args[0]?.type,
            element: args[0]?.target?.tagName,
          });
        }
      };
    };

    this.handleFocus = this.handleEventWithErrorHandling(
      this.handleFocusMethod
    );
    this.handleBlur = this.handleEventWithErrorHandling(this.handleBlurMethod);
    this.handleSelectionChange = this.handleEventWithErrorHandling(
      this.handleSelectionChangeMethod
    );
    this.handleClick = this.handleEventWithErrorHandling(
      this.handleClickMethod
    );
    this.handleKeyDown = this.handleEventWithErrorHandling(
      this.handleKeyDownMethod
    );
    this.handleMouseOver = this.handleEventWithErrorHandling(
      this.handleMouseOverMethod
    );

    this.addListeners();
  }

  @logMethod
  async handleFocusMethod(e) {
    if (isEditable(e.target)) {
      if (this.translationHandler?.IconManager) {
        this.translationHandler.handleEditableFocus(e.target);
      }
    }
  }

  @logMethod
  async handleBlurMethod(e) {
    if (isEditable(e.target)) {
      if (this.translationHandler.IconManager) {
        this.translationHandler.handleEditableBlur(e.target);
      }
    }
  }

  @logMethod
  async handleSelectionChangeMethod(e) {
    this.translationHandler?.handleEvent?.(e);
  }

  @logMethod
  async handleClickMethod(e) {
    if (state?.selectionActive) {
      this.translationHandler.IconManager?.cleanup();
      state.selectionActive = false;

      try {
        await chrome.storage.local.set({ selectionActive: false });
      } catch (storageError) {
        await this.errorHandler.handle(storageError, {
          type: ErrorTypes.INTEGRATION,
          context: "chrome-storage-set",
        });
        return;
      }

      taggleLinks(false);

      try {
        await chrome.runtime.sendMessage({
          action: "UPDATE_SELECTION_STATE",
          data: false,
        });
      } catch (messageError) {
        await this.errorHandler.handle(messageError, {
          type: ErrorTypes.INTEGRATION,
          context: "runtime-sendMessage",
        });
        return;
      }

      setTimeout(async () => {
        try {
          await this.translationHandler.eventHandler.handleSelectionClick(e);
        } catch (timeoutError) {
          await this.errorHandler.handle(timeoutError, {
            type: ErrorTypes.UI,
            context: "handleSelectionClick-timeout",
          });
        }
      }, 100);
    }
  }

  @logMethod
  async handleKeyDownMethod(e) {
    try {
      this.translationHandler.handleEvent(e);
      if (e.key === "Escape" && state.selectionActive) {
        if (this.translationHandler.IconManager) {
          this.translationHandler.IconManager.cleanup();
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
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "event-router-handleKeyDown",
        eventType: e.type,
        key: e.key,
      });
    }
  }

  async handleMouseOverMethod(e) {
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
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "mouseover-style-update",
        element: e.target?.tagName,
      });
    }
  }

  addListeners = async () => {
    try {
      const validateEventTarget = (target) => {
        if (!(target instanceof EventTarget)) {
          throw new Error("Invalid EventTarget");
        }
      };

      validateEventTarget(document);
      document.addEventListener("focus", this.handleFocus, true);
      document.addEventListener("blur", this.handleBlur, true);
      document.addEventListener("selectionchange", this.handleSelectionChange);
      document.addEventListener("click", this.handleClick);
      document.addEventListener("keydown", this.handleKeyDown);
      document.addEventListener("mouseover", this.handleMouseOver);

      this.listeners = {
        handleFocus: this.handleFocus,
        handleBlur: this.handleBlur,
        handleSelectionChange: this.handleSelectionChange,
        handleClick: this.handleClick,
        handleKeyDown: this.handleKeyDown,
        handleMouseOver: this.handleMouseOver,
      };
    } catch (listenerError) {
      this.errorHandler.handle(listenerError, {
        type: ErrorTypes.INTEGRATION,
        context: "add-event-listeners",
      });
    }
  };

  async teardownEventListeners() {
    try {
      document.removeEventListener("focus", this.listeners.handleFocus, true);
      document.removeEventListener("blur", this.listeners.handleBlur, true);
      document.removeEventListener(
        "selectionchange",
        this.listeners.handleSelectionChange
      );
      document.removeEventListener("click", this.listeners.handleClick);
      document.removeEventListener("keydown", this.listeners.handleKeyDown);
      document.removeEventListener("mouseover", this.listeners.handleMouseOver);
    } catch (teardownError) {
      this.errorHandler.handle(teardownError, {
        type: ErrorTypes.SYSTEM,
        context: "teardown-event-list",
      });
    }
  }
}

export function setupEventListeners(translationHandler) {
  return new EventRouter(translationHandler);
}

export async function teardownEventListeners(eventRouter) {
  await eventRouter.teardownEventListeners();
}
