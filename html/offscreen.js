// html/offscreen.js

// This script runs in the offscreen document and handles audio playback.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "playOffscreenAudio") {
    // console.log(
    //   "[Offscreen]: Received playOffscreenAudio message:",
    //   message.url
    // );
    const audio = document.getElementById("tts-audio");

    // بهتر است قبل از تنظیم src جدید، پخش قبلی (اگر وجود دارد) متوقف شود
    if (audio) {
      audio.pause();
      audio.currentTime = 0; // Reset time
    } else {
      // console.error(
      //   "[Offscreen]: Audio element with ID 'tts-audio' not found!"
      // );
      // ارسال پاسخ خطا اگر المنت پیدا نشد
      sendResponse({ success: false, error: "Audio element not found" });
      return false; // نیازی به باز نگه داشتن کانال نیست
    }

    audio.src = message.url;
    audio
      .play()
      .then(() => {
        // console.log("[Offscreen] Audio playback initiated successfully.");
        // ارسال یک آبجکت به جای boolean
        sendResponse({ success: true }); // <--- **تغییر اصلی اینجاست**
      })
      .catch((error) => {
        // console.error("[Offscreen] Audio playback error:", error);
        // ارسال یک آبجکت با اطلاعات خطا
        sendResponse({
          success: false,
          error: error.message || "Unknown playback error",
        }); // <--- **تغییر اصلی اینجاست**
      });
    return true; // Indicate async response is needed
  }
  // برای پیام‌های دیگر (اگر وجود داشته باشند) false برگردانید
  // یا اصلا کاری نکنید اگر فقط همین یک action را دارید.
  // return false;
});

console.log("[Offscreen] Script loaded and listener attached.");
