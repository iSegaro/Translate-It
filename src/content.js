// src/content.js
import { CONFIG, state } from "./config.js";
import TranslationHandler from "./core/TranslationHandler.js";
import { setupEventListeners } from "./core/EventRouter.js";
import { isExtensionContextValid, taggleLinks } from "./utils/helpers.js";
import WhatsAppStrategy from "./strategies/WhatsAppStrategy.js";

/**
 * تابع تزریق CSS به صورت داینامیک
 */
function injectCSS(filePath) {
  const linkElement = document.createElement("link");
  linkElement.href = chrome.runtime.getURL(filePath);
  linkElement.rel = "stylesheet";
  document.head.appendChild(linkElement);
}

// تزریق فایل‌های CSS مناسب بر اساس hostname
const hostname = window.location.hostname;
injectCSS("styles/content.css");
if (hostname.includes("whatsapp.com")) {
  injectCSS("styles/whatsapp.css");
}
if (hostname.includes("x.com")) {
  injectCSS("styles/twitter.css");
}

// ایجاد نمونه TranslationHandler
const translationHandler = new TranslationHandler();

// در صورت استفاده از واتساپ، استراتژی مربوطه و مانیتورینگ context تنظیم می‌شود
if (window.location.hostname === "web.whatsapp.com") {
  translationHandler.strategies.whatsapp = new WhatsAppStrategy();

  // مانیتورینگ وضعیت context هر ۵ ثانیه
  setInterval(() => {
    try {
      if (!isExtensionContextValid()) {
        chrome.runtime.sendMessage({ action: "CONTEXT_INVALID" });
      }
    } catch (error) {
      // در صورت خطای "Extension context invalidated"، نادیده گرفته می‌شود
      if (
        error.message &&
        error.message.includes("Extension context invalidated")
      ) {
        return;
      }
      translationHandler.errorHandler.handle(error, {
        type: translationHandler.ErrorTypes.CONTEXT,
        context: "context-monitoring",
      });
    }
  }, 5000);

  // تنظیم event listener ویژه واتساپ برای کلیک روی باکس‌های متنی
  document.addEventListener("click", (e) => {
    if (state.selectionActive && e.target.closest('[role="textbox"]')) {
      translationHandler.eventHandler.handleSelectionClick(e);
    }
  });
}

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
        if (!newState) {
          this.IconManager.cleanup();
        }
      } catch (error) {
        if (
          error.message &&
          error.message.includes("Extension context invalidated")
        ) {
          // console.info(
          //   "Extension context is not valid, skipping updateSelectionState."
          // );
        } else {
          this.errorHandler.handle(error, {
            type: this.ErrorTypes.CONTEXT,
            context: "updateSelectionState",
          });
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
    translationHandler.IconManager.cleanup();
    state.selectionActive = false;
    translationHandler.updateSelectionState(false);
  });
} else {
  translationHandler.notifier.show(
    "خطای بارگذاری افزونه - لطفا صفحه را رفرش کنید",
    "error",
    true
  );
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "TOGGLE_SELECTION_MODE") {
    translationHandler.updateSelectionState(message.data);
  }
});

export { translationHandler };
