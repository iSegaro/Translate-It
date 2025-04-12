// src/backgrounds/tts-player.js

import Browser from "webextension-polyfill";
import { logME } from "../utils/helpers.js";
import { detectTextLanguage } from "../utils/textDetection.js";
import {
  AUTO_DETECT_VALUE,
  playAudioWebSpeech,
  playAudioViaOffscreen,
  playAudioGoogleTTS,
  playAudioChromeTTS,
} from "../utils/tts.js";
import { resolveLangCode } from "../utils/langUtils.js";

/**
 * تلاش برای پخش متن ورودی با ترتیب:
 *   1) Web Speech API (در صورت در دسترس بودن در بک‌گراند)
 *   2) اگر مرورگر Chrome:
 *       - تلاش با chrome.tts
 *       - اگر نشد => پخش از طریق offscreen
 *     اگر مرورگر Firefox:
 *       - پخش از طریق Google TTS
 */
export async function playTTS(message) {
  const text = message?.text?.trim();
  if (!text) {
    throw new Error("No text provided for TTS.");
  }

  // گام اول: اگر کاربر زبانی نفرستاده یا auto بود، سعی بر تشخیص.
  let rawLang = message?.lang || AUTO_DETECT_VALUE;
  if (rawLang === AUTO_DETECT_VALUE) {
    try {
      const detectedLang = await detectTextLanguage(text);
      rawLang = detectedLang || "en";
    } catch (err) {
      logME("[TTS] Language detection failed. Fallback to 'en'.", err);
      rawLang = "en";
    }
  }

  const lang = resolveLangCode(rawLang);
  logME("[TTS] Final language to play:", lang);

  // تشخیص Firefox یا Chrome
  let isFirefox = false;
  try {
    if (typeof Browser.runtime.getBrowserInfo === "function") {
      const browserInfo = await Browser.runtime.getBrowserInfo();
      isFirefox = browserInfo.name.toLowerCase() === "firefox";
    }
  } catch (e) {
    // اگر اطلاعاتی نتوانستیم بگیریم، فرض می‌کنیم Chrome-like است
    logME(
      "[TTS] Could not get browser info, assuming Chrome-like environment."
    );
  }

  // TODO: این روش نیازمندِ انتقال به UI می باشد.
  // (1) ابتدا تلاش برای پخش توسط Web Speech API
  // این روش در پس‌زمینه در دسترس نیست و برای هر دو مرورگر
  // باید از طریق UI انجام شود
  // try {
  //   if (typeof speechSynthesis !== "undefined" && speechSynthesis) {
  //     logME("[TTS] Trying Web Speech API first...");
  //     await playAudioWebSpeech(text, lang);
  //     return { success: true };
  //   }
  // } catch (error) {
  //   logME("[TTS] Web Speech API playback failed, will fallback...", error);
  // }
  // *** End of TODO ***

  // (2) اگر وب اسپیچ کار نکرد، بسته به مرورگر به سراغ فالبک‌ها می‌رویم
  if (isFirefox) {
    // --- فایرفاکس: google tts fallback ---
    logME("[TTS] On Firefox, falling back to Google TTS method.");
    await playAudioGoogleTTS(text, lang);
    return { success: true };
  } else {
    // --- کروم یا شبیه کروم: ابتدا تلاش با chrome.tts، در صورت عدم موفقیت => offscreen ---
    // اگر می‌خواهید صریحاً چک کنید که chrome.tts وجود دارد یا نه:
    try {
      if (typeof chrome !== "undefined" && chrome.tts) {
        logME("[TTS] Attempting chrome.tts...");
        await playAudioChromeTTS(text, lang);
        return { success: true };
      }
    } catch (err) {
      logME("[TTS] chrome.tts failed, will fallback to offscreen...", err);
    }

    // اگر chrome.tts وجود نداشت یا خطا داد، می‌رویم سراغ offscreen
    logME("[TTS] Fallback to offscreen TTS in Chrome...");
    const ttsUrl = `https://translate.google.com/translate_tts?client=tw-ob&q=${encodeURIComponent(
      text
    )}&tl=${lang}`;

    const result = await playAudioViaOffscreen(ttsUrl);
    if (result.success) {
      return { success: true };
    }
    throw new Error(result.error || "TTS playback failed via offscreen.");
  }
}
