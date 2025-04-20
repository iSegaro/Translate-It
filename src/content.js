// src/content.js

import { logME } from "./utils/helpers.js";
import { initContentScript } from "./contentMain.js";

(function () {
  // جلوگیری از اجرای افزونه داخل iframeهایی که مجاز نیستند
  const allowInIframes = [];
  const isTopWindow = window.top === window.self;
  const isAllowedIframe = allowInIframes.some((host) =>
    location.hostname.includes(host)
  );

  if (!isTopWindow && !isAllowedIframe) {
    logME("[AIWriting] Skipping injection inside iframe:", location.hostname);
    return;
  }

  // ✅ اگر از قبل فعال شده بود، دوباره اجرا نکن
  if (window.__AI_WRITING_EXTENSION_ACTIVE__) {
    logME("[AIWriting] Skipping double init.");
    return;
  }

  // ✅ اینجا importهای ESM انجام می‌شن بدون مشکل
  // import("./contentMain.js")
  //   .then(({ initContentScript }) => {
  //     if (typeof initContentScript === "function") {
  //       initContentScript();
  //     } else {
  //       logME("[AIWriting] initContentScript is not a function");
  //     }
  //   })
  //   .catch((err) => {
  //     logME("[AIWriting] Failed to import contentMain.js", err);
  //   });

  initContentScript();
})();
