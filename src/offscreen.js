// src/offscreen.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "playOffscreenAudio" && message.url) {
    // console.log(
    //   "[Offscreen] Received playOffscreenAudio message with URL:",
    //   message.url
    // );

    // ایجاد یک المان audio و پخش URL Google TTS
    const audio = new Audio(message.url);
    audio.crossOrigin = "anonymous";

    audio.addEventListener("ended", () => {
      // console.log("[Offscreen] Audio playback finished.");
      sendResponse({ success: true });
    });

    audio.addEventListener("error", (e) => {
      // console.error("[Offscreen] Audio playback error:", e);
      sendResponse({
        success: false,
        error: e.message || "Audio playback error",
      });
    });

    audio
      .play()
      .then(() => {
        // console.log("[Offscreen] Audio started playing.");
        // منتظر رویدادهای ended یا error بمانیم
      })
      .catch((err) => {
        // console.error("[Offscreen] Audio play() rejected:", err);
        sendResponse({ success: false, error: err.message });
      });

    // برگرداندن true برای نگه داشتن اتصال تا sendResponse فراخوانی شود
    return true;
  }
});
