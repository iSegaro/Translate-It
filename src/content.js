// src/content.js
import { CONFIG, state } from "./config.js";
import TranslationHandler from "./core/TranslationHandler.js";
import { setupEventListeners } from "./core/EventRouter.js";
import { isExtensionContextValid } from "./utils/helpers.js";
import WhatsAppStrategy from "./strategies/WhatsAppStrategy.js";
// import ChatGPTStrategy from "./strategies/ChatGPTStrategy.js";
// import DefaultStrategy from "./strategies/DefaultStrategy.js";
// import MediumStrategy from "./strategies/MediumStrategy.js";
// import TelegramStrategy from "./strategies/TelegramStrategy.js";
// import TwitterStrategy from "./strategies/TwitterStrategy.js";

// تابع برای تزریق CSS به صورت داینامیک
function injectCSS(filePath) {
  const linkElement = document.createElement("link");
  linkElement.href = chrome.runtime.getURL(filePath);
  linkElement.rel = "stylesheet";
  document.head.appendChild(linkElement);
}

// بررسی hostname و انتخاب فایل CSS مناسب
const hostname = window.location.hostname;
injectCSS("styles/content.css");
if (hostname.includes("whatsapp.com")) {
  injectCSS("styles/whatsapp.css");
}

// Initialize core components
const translationHandler = new TranslationHandler();

if (window.location.hostname === "web.whatsapp.com") {
  translationHandler.strategies.whatsapp = new WhatsAppStrategy();

  // مانیتورینگ وضعیت context
  setInterval(() => {
    try {
      if (!isExtensionContextValid()) {
        chrome.runtime.sendMessage({ action: "CONTEXT_INVALID" });
      }
    } catch (error) {
      // اگر خطا مربوط به از بین رفتن context باشد، آن را نادیده بگیر
      if (
        error.message &&
        error.message.includes("Extension context invalidated")
      ) {
        return;
      }
      // در صورت بروز سایر خطاها، آن‌ها را در کنسول نمایش بده (اختیاری)
      console.error(error);
    }
  }, 5000);

  // بهبود مدیریت رویدادها برای واتساپ
  document.addEventListener("click", (e) => {
    if (state.selectionActive && e.target.closest('[role="textbox"]')) {
      translationHandler.eventHandler.handleSelectionClick(e);
    }
  });
}

// Polyfill برای مرورگرهای قدیمی
if (!Element.prototype.matches) {
  Element.prototype.matches =
    Element.prototype.msMatchesSelector ||
    Element.prototype.webkitMatchesSelector;
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

// Extension initialization
if (isExtensionContextValid()) {
  console.info("Extension initialized successfully");

  // Setup global event listeners
  setupEventListeners(translationHandler);

  // Apply initial configuration
  Object.freeze(CONFIG);

  // Add cleanup on `pagehide`, instead `unload`
  window.addEventListener("pagehide", () => {
    translationHandler.elementManager.cleanup();
    state.selectionActive = false;
  });
} else {
  // console.error("Extension context lost - please refresh page");
  translationHandler.notifier.show(
    "خطای بارگذاری افزونه - لطفا صفحه را رفرش کنید",
    "error",
    true
  );
}

// Initialize with default state
chrome.storage.local.get(["selectionActive"], (result) => {
  state.selectionActive = result.selectionActive || false;
});

// Listen to storage changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.selectionActive) {
    state.selectionActive = changes.selectionActive.newValue;
    updateSelectionUI();
  }
});

// Message listener
let notificationTimeout;

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "TOGGLE_SELECTION_MODE") {
    state.selectionActive = message.data;
    // پاک کردن نوتیفیکیشن قبلی
    if (notificationTimeout) clearTimeout(notificationTimeout);
    if (!state.selectionActive) {
      translationHandler.elementManager.cleanup();
    }
  }
});

function updateSelectionUI() {
  if (state.selectionActive) {
    // translationHandler.notifier.show("حالت انتخاب فعال شد", "info", true, 100);
  } else {
    // translationHandler.notifier.show(
    //   "حالت انتخاب غیرفعال شد",
    //   "info",
    //   true,
    //   100
    // );
    translationHandler.elementManager.cleanup();
  }
}
