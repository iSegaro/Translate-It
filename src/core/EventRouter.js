// src/core/EventRouter.js
import { handleUIError } from "../services/ErrorService.js";
import Browser from "webextension-polyfill";
import { CONFIG, state } from "../config.js";
import { isEditable, logME, taggleLinks } from "../utils/helpers.js";
import { ErrorTypes } from "../services/ErrorService.js";
import { logMethod } from "../utils/helpers.js";
import { getTranslationString } from "../utils/i18n.js";

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
          handleUIError(error, {
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
    // this.handleSelectElementChange = this.handleEventWithErrorHandling(
    //   this.handleSelectElementMethod
    // );
    this.handleClick = this.handleEventWithErrorHandling(
      this.handleClickMethod
    );
    this.handleKeyDown = this.handleEventWithErrorHandling(
      this.handleKeyDownMethod
    );
    this.handleMouseOver = this.handleEventWithErrorHandling(
      this.handleMouseOverMethod
    );
    this.handleMouseUp = this.handleEventWithErrorHandling(
      this.handleMouseUpMethod
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
  async handleSelectElementMethod(e) {
    this.translationHandler?.handleEvent?.(e);
  }

  @logMethod
  async handleClickMethod(e) {
    if (!state?.selectElementActive) return;

    /* خاموش کردن حالت Select‑Element مثل قبل … */
    this.translationHandler.IconManager?.cleanup();
    state.selectElementActive = false;
    await Browser.storage.local.set({ selectElementActive: false });
    taggleLinks(false);
    await Browser.runtime.sendMessage({
      action: "UPDATE_SELECT_ELEMENT_STATE",
      data: false,
    });

    /* یک تأخیر کوچک براى اطمینان */
    setTimeout(async () => {
      try {
        const result =
          await this.translationHandler.eventHandler.handleSelect_ElementModeClick(
            e
          );

        /* اگر پس‑از ترجمه خطایی برگشت، به کاربر بگو */
        if (result?.status === "error") {
          const msg =
            result.message ||
            (await getTranslationString("ERRORS_DURING_TRANSLATE")) ||
            "(⚠️ خطایی در ترجمه رخ داد.)";
          this.translationHandler.notifier.show(msg, "error", true, 4000);
        }
      } catch (err) {
        await handleUIError(err, {
          type: ErrorTypes.UI,
          context: "handleSelect_ElementModeClick",
        });
        taggleLinks(true);
      }
    }, 100);
  }

  @logMethod
  async handleKeyDownMethod(e) {
    try {
      this.translationHandler.handleEvent(e);
      if (e.key === "Escape" && state.selectElementActive) {
        taggleLinks(true);
        if (this.translationHandler.IconManager) {
          this.translationHandler.IconManager.cleanup();
        }
        state.selectElementActive = false;
        Browser.storage.local.set({ selectElementActive: false });

        Browser.runtime.sendMessage({
          action: "UPDATE_SELECT_ELEMENT_STATE",
          data: false,
        });
        logME("[EventRouter] Select Element Mode deactivated via Esc key.");
        return;
      }
    } catch (error) {
      handleUIError(error, {
        type: ErrorTypes.UI,
        context: "event-router-handleKeyDown",
        eventType: e.type,
        key: e.key,
      });
      taggleLinks(true);
    }
  }

  async handleMouseOverMethod(e) {
    if (!state.selectElementActive) {
      return; // از اینجا متن انتخاب شده در رویداد mouseover بررسی نمیشود
    } else {
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
        handleUIError(error, {
          type: ErrorTypes.UI,
          context: "mouseover-style-update",
          element: e.target?.tagName,
        });
      }
    }
  }
  @logMethod
  async handleMouseUpMethod(e) {
    this.translationHandler?.handleEvent?.(e);
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
      // document.addEventListener(
      //   "selectionchange",
      //   this.handleSelectElementChange
      // );
      document.addEventListener("click", this.handleClick);
      document.addEventListener("keydown", this.handleKeyDown);
      document.addEventListener("mouseover", this.handleMouseOver);
      document.addEventListener("mouseup", this.handleMouseUp);

      this.listeners = {
        handleFocus: this.handleFocus,
        handleBlur: this.handleBlur,
        // handleSelectElementChange: this.handleSelectElementChange,
        handleClick: this.handleClick,
        handleKeyDown: this.handleKeyDown,
        handleMouseOver: this.handleMouseOver,
        handleMouseUp: this.handleMouseUp,
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
      // document.removeEventListener(
      //   "selectionchange",
      //   this.listeners.handleSelectElementChange
      // );
      document.removeEventListener("click", this.listeners.handleClick);
      document.removeEventListener("keydown", this.listeners.handleKeyDown);
      document.removeEventListener("mouseover", this.listeners.handleMouseOver);
      document.removeEventListener("mouseup", this.listeners.handleMouseUp);
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
