// src/content.js
import { CONFIG, state } from "./config.js";
import TranslationHandler from "./core/TranslationHandler.js";
import { setupEventListeners } from "./core/EventRouter.js";
import {
  isExtensionContextValid,
  taggleLinks,
  injectStyle,
} from "./utils/helpers.js";

injectStyle();

// ایجاد نمونه TranslationHandler
const translationHandler = new TranslationHandler();

// افزودن polyfill‌های مورد نیاز برای متدهای matches و closest
if (!Element.prototype.matches) {
  Element.prototype.matches =
    Element.prototype.msMatchesSelector ||
    function (selector) {
      const matches = (this.document || this.ownerDocument).querySelectorAll(
          selector
        ),
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

// اگر context معتبر است، تنظیمات افزونه و event listener ها اعمال می‌شوند
if (isExtensionContextValid()) {
  console.info("Extension initialized successfully");

  // تعریف متد یکپارچه updateSelectionState با استفاده از errorHandler
  translationHandler.updateSelectionState = function (newState) {
    if (isExtensionContextValid()) {
      try {
        state.selectionActive = newState;
        chrome.runtime.sendMessage(
          {
            action: "UPDATE_SELECTION_STATE",
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
                  "Error sending message:",
                  chrome.runtime.lastError.message
                );
              }
            }
          }
        );
        taggleLinks(newState);
        if (!newState && this.IconManager) {
          this.IconManager.cleanup();
        }
      } catch (error) {
        console.debug("Content.js: Error in updateSelectionState => ", error);
        if (error.message?.includes("context invalidated")) {
          console.debug("Content.js: Extension context invalidated");
        } else {
          throw this.errorHandler.handle(error, {
            type: this.ErrorTypes.CONTEXT,
            context: "updateSelectionState",
          });
        }
      }
    } else {
      console.debug(
        "Content.js: Extension context is not valid, skipping updateSelectionState."
      );
    }
  };

  setupEventListeners(translationHandler);
  Object.freeze(CONFIG);

  window.addEventListener("pagehide", () => {
    if (translationHandler.IconManager) {
      translationHandler.IconManager.cleanup();
    }
    state.selectionActive = false;
    translationHandler.updateSelectionState(false);
  });
} else {
  console.debug("Content.js: Extension context is not valid");
  translationHandler.notifier.show(
    "خطای بارگذاری افزونه - لطفا صفحه را رفرش کنید",
    "error",
    true
  );
}

chrome.runtime.onMessage.addListener((message) => {
  try {
    // بررسی اینکه پیام یک شیء معتبر است و دارای کلیدهای action یا type می‌باشد
    if (message && (message.action || message.type)) {
      if (message.action === "TOGGLE_SELECTION_MODE") {
        translationHandler.updateSelectionState(message.data);
      } else if (
        message.action === "CONTEXT_INVALID" ||
        message.type === "EXTENSION_RELOADED"
      ) {
        translationHandler.notifier.show(
          "در حال بارگذاری مجدد...دوباره تلاش کنید",
          "info",
          true
        );
        // افزودن تأخیر 2000 میلی‌ثانیه‌ای قبل از اجرای chrome.runtime.reload()
        setTimeout(() => {
          chrome.runtime.reload();
        }, 2000);
      } else {
        console.debug("Content.js: Received unknown message => ", message);
      }
    } else {
      console.debug("Content.js: Received unknown message => ", message);
    }
  } catch (error) {
    translationHandler.errorHandler.handle(error, {
      type: translationHandler.ErrorTypes.INTEGRATION,
      context: "message-listener",
    });
  }
});

export { translationHandler };
