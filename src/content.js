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
        chrome.runtime.sendMessage({
          action: "UPDATE_SELECTION_STATE",
          data: newState,
        });
        taggleLinks(newState);
        if (!newState && this.IconManager) {
          this.IconManager.cleanup();
        }
      } catch (error) {
        if (error.message?.includes("context invalidated")) {
          // console.info("Extension context invalidated");
        } else {
          const handleError = this.errorHandler.handle(error, {
            type: this.ErrorTypes.CONTEXT,
            context: "updateSelectionState",
          });
          throw handleError;
        }
      }
    } else {
      // console.info(
      //   "Extension context is not valid, skipping updateSelectionState."
      // );
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
  console.debug("Extension context is not valid");
  translationHandler.notifier.show(
    "خطای بارگذاری افزونه - لطفا صفحه را رفرش کنید",
    "error",
    true
  );
}

chrome.runtime.onMessage.addListener((message) => {
  try {
    if (message.action === "TOGGLE_SELECTION_MODE") {
      translationHandler.updateSelectionState(message.data);
    } else if (message.action === "CONTEXT_INVALID") {
      translationHandler.notifier.show(
        "در حال بارگذاری مجدد...دوباره تلاش کنید",
        "info",
        true
      );
      chrome.runtime.reload();
    }
  } catch (error) {
    translationHandler.errorHandler.handle(error, {
      type: translationHandler.ErrorTypes.INTEGRATION,
      context: "message-listener",
    });
  }
});

export { translationHandler };
