// src/pageBridge.js

// ✅ The script to be injected via <script src="..."></script>
// This file should be built separately as a static file (pageBridge.js):

(function () {
  if (window.__AI_WRITING_BRIDGE_READY__) {
    // console.log("[AIWriting:bridge] Already initialized.");
    return;
  }

  window.__AI_WRITING_BRIDGE_READY__ = true;
  // console.log("[AIWriting:bridge] Bridge script injected into page.");

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.type !== "AI_WRITING_TRANSLATE_REQUEST") return;

    // console.log("[AIWriting:bridge] Received translate request:", event.data);

    // ✅ ارسال به content script
    window.postMessage(
      {
        type: "AI_WRITING_TRANSLATE_RELAY_TO_CONTENT",
        text: event.data.text,
        translateMode: event.data.translateMode,
        __requestId: Date.now() + "_" + Math.random().toString(36).slice(2),
      },
      "*"
    );
  });

  // ✅ دریافت پاسخ از content.js و forward به صفحه
  window.addEventListener("message", (event) => {
    if (
      event.source !== window ||
      event.data?.type !== "AI_WRITING_TRANSLATE_RELAY_FROM_CONTENT"
    )
      return;

    const original = event.data.original || {};

    window.postMessage(
      {
        type: "AI_WRITING_TRANSLATE_RESPONSE",
        result: event.data.result,
        error: event.data.error,
        original,
      },
      "*"
    );
  });
})();
