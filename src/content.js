// src/content.js
import Browser from "webextension-polyfill";
import { CONFIG, state } from "./config.js";
import TranslationHandler from "./core/TranslationHandler.js";
import { setupEventListeners } from "./core/EventRouter.js";
import {
  isExtensionContextValid,
  taggleLinks,
  injectStyle,
  logME,
  logMethod,
} from "./utils/helpers.js";
import { revertTranslations } from "./utils/textExtraction.js";

class ContentScript {
  constructor() {
    injectStyle();
    this.translationHandler = new TranslationHandler();
    this.initPolyfills();
    this.init();
  }

  initPolyfills() {
    if (!Element.prototype.matches) {
      Element.prototype.matches =
        Element.prototype.msMatchesSelector ||
        function (selector) {
          const matches = (
              this.document || this.ownerDocument
            ).querySelectorAll(selector),
            i = matches.length;
          while (--i >= 0 && matches.item(i) !== this) {}
          return i > -1;
        };
    }

    if (!Element.prototype.closest) {
      Element.prototype.closest = function (selector) {
        let el = this;
        while (el) {
          if (el.matches(selector)) return el;
          el = el.parentElement;
        }
        return null;
      };
    }
  }

  init() {
    if (isExtensionContextValid()) {
      console.info("AI Writing Extension initialized successfully!");
      this.setupUpdateSelectElementState();
      setupEventListeners(this.translationHandler);
      Object.freeze(CONFIG);
      this.setupPagehideListener();
      this.setupMessageListener();
    } else {
      console.warn("[Content] Extension context is not valid");
      this.translationHandler.notifier.show(
        "خطای بارگذاری افزونه - لطفا صفحه را رفرش کنید",
        "error",
        true
      );
    }
  }

  setupPagehideListener() {
    window.addEventListener("pagehide", () => {
      if (this.translationHandler.IconManager) {
        this.translationHandler.IconManager.cleanup();
      }
      state.selectElementActive = false;
      this.updateSelectElementState(false);
    });
  }

  setupUpdateSelectElementState() {
    this.translationHandler.updateSelectElementState =
      this.updateSelectElementState.bind(this);
  }

  @logMethod
  async updateSelectElementState(newState) {
    if (isExtensionContextValid()) {
      try {
        state.selectElementActive = newState;
        const response = await Browser.runtime.sendMessage({
          action: "UPDATE_SELECT_ELEMENT_STATE",
          data: newState,
        });
        // Optional: Handle response here if needed
        // console.log("[Content] Select Element State Updated:", response);
        taggleLinks(newState);
        if (!newState && this.translationHandler.IconManager) {
          this.translationHandler.IconManager.cleanup();
        }
      } catch (error) {
        logME("[Content] Error in updateSelectElementState => ", error);
        if (error.message?.includes("context invalidated")) {
          logME("[Content] Extension context invalidated");
        } else {
          throw this.translationHandler.errorHandler.handle(error, {
            type: this.translationHandler.ErrorTypes.CONTEXT,
            context: "updateSelectElementState",
          });
        }
      }
    } else {
      logME(
        "[Content] Extension context is not valid, skipping updateSelectElementState."
      );
    }
  }

  setupMessageListener() {
    Browser.runtime.onMessage.addListener(this.handleMessage.bind(this));
  }

  @logMethod
  handleMessage(message, sender, sendResponse) {
    try {
      // بررسی اینکه پیام یک شیء معتبر است و دارای کلیدهای action یا type می‌باشد
      if (message && (message.action || message.type)) {
        if (message.action === "TOGGLE_SELECT_ELEMENT_MODE") {
          this.updateSelectElementState(message.data);
        } else if (message.action === "getSelectedText") {
          const selectedText = window.getSelection()?.toString()?.trim() ?? "";
          sendResponse({ selectedText: selectedText }); // پاسخ به popup با استفاده از sendResponse
          return true; // برای نگه داشتن کانال پیام برای پاسخ غیرهمزمان
        } else if (
          message.action === "CONTEXT_INVALID" ||
          message.type === "EXTENSION_RELOADED"
        ) {
          try {
            // ارسال پیام به اسکریپت پس‌زمینه قبل از بارگذاری مجدد
            Browser.runtime.sendMessage({
              action: "CONTENT_SCRIPT_WILL_RELOAD",
            });

            const reload_page_notifier = this.translationHandler.notifier.show(
              "لطف صفحه را رفرش کنید",
              "info",
              true
            );

            setTimeout(() => {
              if (reload_page_notifier) {
                this.translationHandler.notifier.dismiss();
                // Browser.runtime.reload();
                // window.location.reload();
              }
            }, 3000);
          } catch (error) {
            error = ErrorHandler.processError(error);
            this.translationHandler.errorHandler.handle(error, {
              type: this.translationHandler.ErrorTypes.INTEGRATION,
              context: "message-listener",
            });
          }
        } else if (message.action === "revertAllAndEscape") {
          logME("Received revertAllAndEscape in content script");
          revertTranslations({
            state,
            errorHandler: this.translationHandler.errorHandler,
            notifier: this.translationHandler.notifier,
            IconManager: this.translationHandler.IconManager,
          });
        } else {
          logME("[Content] Received unknown message 1 => ", message);
        }
      } else {
        logME("[Content] Received unknown message 2 => ", message);
      }
    } catch (error) {
      if (this.translationHandler.notifier) {
        this.translationHandler.notifier.dismiss();
      }
      this.translationHandler.errorHandler.handle(error, {
        type: this.translationHandler.ErrorTypes.INTEGRATION,
        context: "message-listener",
      });
    }
  }
}

const contentScript = new ContentScript();
export const translationHandler = contentScript.translationHandler;
