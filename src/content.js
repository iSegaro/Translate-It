// src/content.js

(function () {
  // جلوگیری از اجرای افزونه داخل iframeهایی که مجاز نیستند
  const allowInIframes = ["docs.google.com", "x.com"];
  const isTopWindow = window.top === window.self;
  const isAllowedIframe = allowInIframes.some((host) =>
    location.hostname.includes(host)
  );

  if (!isTopWindow && !isAllowedIframe) {
    console.debug(
      "[AIWriting] Skipping injection inside iframe:",
      location.hostname
    );
    return;
  }

  // ✅ اگر از قبل فعال شده بود، دوباره اجرا نکن
  if (window.__AI_WRITING_EXTENSION_ACTIVE__) {
    console.debug("[AIWriting] Skipping double init.");
    return;
  }

  // ✅ اینجا importهای ESM انجام می‌شن بدون مشکل
  import("./contentMain.js")
    .then(({ initContentScript }) => {
      if (typeof initContentScript === "function") {
        initContentScript();
      } else {
        console.error("[AIWriting] initContentScript is not a function");
      }
    })
    .catch((err) => {
      console.error("[AIWriting] Failed to import contentMain.js", err);
    });
})();
