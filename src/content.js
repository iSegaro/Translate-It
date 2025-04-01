// src/content.js
import { CONFIG, state } from "./config.js";
import TranslationHandler from "./core/TranslationHandler.js";
import { setupEventListeners } from "./core/EventRouter.js";
import {
  isExtensionContextValid,
  taggleLinks,
  injectStyle,
} from "./utils/helpers.js";
import { logMethod } from "./utils/helpers.js";

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
  updateSelectElementState(newState) {
    if (isExtensionContextValid()) {
      try {
        state.selectElementActive = newState;
        chrome.runtime.sendMessage(
          {
            action: "UPDATE_SELECT_ELEMENT_STATE",
            data: newState,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              if (
                !chrome.runtime.lastError.message.includes(
                  "The message port closed before a response was received"
                ) &&
                !chrome.runtime.lastError.message.includes(
                  "Could not establish connection. Receiving end does not exist"
                )
              ) {
                console.debug(
                  "[Content] Error sending message:",
                  chrome.runtime.lastError.message
                );
              }
            }
          }
        );
        taggleLinks(newState);
        if (!newState && this.translationHandler.IconManager) {
          this.translationHandler.IconManager.cleanup();
        }
      } catch (error) {
        console.debug("[Content] Error in updateSelectElementState => ", error);
        if (error.message?.includes("context invalidated")) {
          console.debug("[Content] Extension context invalidated");
        } else {
          throw this.translationHandler.errorHandler.handle(error, {
            type: this.translationHandler.ErrorTypes.CONTEXT,
            context: "updateSelectElementState",
          });
        }
      }
    } else {
      console.debug(
        "[Content] Extension context is not valid, skipping updateSelectElementState."
      );
    }
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
  }

  @logMethod
  handleMessage(message) {
    try {
      // بررسی اینکه پیام یک شیء معتبر است و دارای کلیدهای action یا type می‌باشد
      if (message && (message.action || message.type)) {
        if (message.action === "TOGGLE_SELECT_ELEMENT_MODE") {
          this.updateSelectElementState(message.data);
        } else if (
          message.action === "CONTEXT_INVALID" ||
          message.type === "EXTENSION_RELOADED"
        ) {
          this.translationHandler.notifier.show(
            "در حال بارگذاری مجدد...دوباره تلاش کنید",
            "info",
            true
          );
          // افزودن تأخیر 2000 میلی‌ثانیه‌ای قبل از اجرای chrome.runtime.reload()
          setTimeout(() => {
            chrome.runtime.reload();
          }, 2000);
        } else {
          logME("[Content] Received unknown message => ", message);
        }
      } else {
        logME("[Content] Received unknown message => ", message);
      }
    } catch (error) {
      this.translationHandler.errorHandler.handle(error, {
        type: this.translationHandler.ErrorTypes.INTEGRATION,
        context: "message-listener",
      });
    }
  }
}

const contentScript = new ContentScript();
export const translationHandler = contentScript.translationHandler;
