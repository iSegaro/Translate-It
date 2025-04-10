// src/backgrounds/tts-player.js
import Browser from "webextension-polyfill";
import { logME } from "../utils/helpers.js";
import { playAudioGoogleTTS, AUTO_DETECT_VALUE } from "../utils/tts.js";

// تابع playTTS یکپارچه (برای Chrome با offscreen و برای Firefox با SpeechSynthesis)
export async function playTTS(text) {
  logME("[TTS] Playing audio via offscreen with URL for text:", text);
  if (!text || !text.trim()) {
    throw new Error("No text provided for TTS.");
  }

  if ("offscreen" in chrome && chrome.offscreen) {
    // حالت Chrome: استفاده از offscreen
    // فرض می‌کنیم در حالت Google TTS، باید URL مربوط به گوگل ساخته شود
    // در اینجا می‌توانید تنظیمات بیشتری مانند زبان (tl) را هم اضافه کنید
    const ttsUrl = `https://translate.google.com/translate_tts?client=tw-ob&q=${encodeURIComponent(text)}&tl=en`;
    logME("[TTS] Playing audio via offscreen with URL:", ttsUrl);
    const result = await playAudioViaOffscreen(ttsUrl);
    if (result.success) {
      return result;
    } else {
      throw new Error(result.error || "TTS playback failed.");
    }
  } else {
    // حالت Firefox: استفاده از Web Speech API
    // const utterance = new SpeechSynthesisUtterance(text);
    // speechSynthesis.speak(utterance);

    await playAudioGoogleTTS(text, AUTO_DETECT_VALUE, null);

    return { success: true };
  }
}

export async function playAudioViaOffscreen(url) {
  // استفاده از chrome.offscreen در Chrome
  if ("offscreen" in chrome && chrome.offscreen) {
    // بررسی وجود سند offscreen
    const exists = await chrome.offscreen.hasDocument();
    if (!exists) {
      try {
        await chrome.offscreen.createDocument({
          url: "offscreen.html",
          reasons: ["AUDIO_PLAYBACK"],
          justification: "Play TTS audio from background script",
        });
        logME("[Offscreen] Offscreen document created.");
      } catch (err) {
        if (err.message.includes("Only a single offscreen document")) {
          logME(
            "[Offscreen] Document already exists (caught duplicate creation)."
          );
        } else {
          throw err;
        }
      }
    } else {
      logME("[Offscreen] Offscreen document already exists, reusing it.");
    }

    logME("[Offscreen] Sending message to offscreen with URL:", url);
    try {
      const response = await Browser.runtime.sendMessage({
        action: "playOffscreenAudio",
        url: url,
      });
      // بعد از دریافت پاسخ یا در صورت خطا سند offscreen را ببندیم
      await Browser.offscreen.closeDocument();
      logME("[Offscreen] Offscreen document closed after use.");
      if (!response || !response.success) {
        throw new Error(
          response?.error ||
            "Offscreen document failed to play audio or respond."
        );
      }
      logME("[Offscreen] Audio playback initiated successfully via offscreen.");
      return { success: true };
    } catch (error) {
      logME(
        "[Offscreen] Error sending message to offscreen or playing audio:",
        error
      );
      try {
        await Browser.offscreen.closeDocument();
        logME("[Offscreen] Offscreen document closed after error.");
      } catch (e) {
        logME("[Offscreen] Error closing offscreen document:", e);
      }
      return { error: error.message };
    }
  } else {
    // fallback برای مرورگرهایی مانند Firefox (استفاده از SpeechSynthesis)
    // const utterance = new SpeechSynthesisUtterance(url);
    // speechSynthesis.speak(utterance);

    await playAudioGoogleTTS(text, AUTO_DETECT_VALUE, null);

    return { success: true };
  }
}
