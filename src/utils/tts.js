// src/utils/tts.js
import { logME, delay } from "../utils/helpers.js";
import { languageList } from "./languages.js";
import { detectTextLanguage } from "../utils/textDetection.js";

// --- Voice Functions ---
export const AUTO_DETECT_VALUE = "Auto Detect"; // مقدار ثابت برای تشخیص خودکار

/**
 * Plays audio using Google Translate TTS service.
 * Requires optional permission for "https://translate.google.com/*".
 * @param {string} text The text to speak.
 * @param {string} lang The language code (e.g., 'en', 'fa'). Cannot be 'auto'.
 */
export async function playAudioGoogleTTS(text, lang) {
  // --- ورودی‌ها را بررسی کنید ---
  if (!text || !text.trim()) {
    logME("[TTS]: No text provided to speak.");
    return;
  }

  let targetLangCode = lang;

  // --- تشخیص زبان در صورت نیاز ---
  if (
    !targetLangCode ||
    targetLangCode === "auto" ||
    targetLangCode === AUTO_DETECT_VALUE
  ) {
    logME("[TTS]: Attempting to auto-detect language...");
    const detectedLangCode = await detectTextLanguage(text);
    if (detectedLangCode) {
      targetLangCode = detectedLangCode;
      logME(`[TTS]: Auto-detected language: ${targetLangCode}`);
    } else {
      targetLangCode = "en"; // اگر تشخیص زبان ناموفق بود، به انگلیسی پیش‌فرض برمی‌گردیم
      logME("[TTS]: Auto-detection failed, defaulting to English.");
      // می‌توانید در اینجا به کاربر اطلاع دهید که تشخیص زبان ناموفق بوده است (مثلاً از طریق یک پیام لاگ یا یک notification اگر در UI قابل نمایش باشد).
    }
  } else {
    logME(`[TTS]: Using provided language: ${targetLangCode}`);
  }

  // --- محدودیت طول متن گوگل ---
  const maxLength = 200;
  if (text.length > maxLength) {
    logME(
      `[TTS]: Text too long for Google TTS (>${maxLength} chars). Length: ${text.length}`
    );
    playAudioWebSpeech(text, targetLangCode); // استفاده از Web Speech API به عنوان جایگزین
    return;
  }

  // --- ساخت URL ---
  const url = `https://translate.google.com/translate_tts?client=tw-ob&q=${encodeURIComponent(text)}&tl=${targetLangCode}`;
  logME("[TTS]: Requesting Google TTS URL:", url);

  const requiredOrigin = "https://translate.google.com/*";

  try {
    // --- بررسی و درخواست دسترسی ---
    const hasPermission = await new Promise((resolve) => {
      chrome.permissions.contains({ origins: [requiredOrigin] }, resolve);
    });

    if (!hasPermission) {
      logME(
        "[TTS]: Optional permission for Google TTS not granted. Requesting..."
      );
      const granted = await new Promise((resolve) => {
        chrome.permissions.request({ origins: [requiredOrigin] }, resolve);
      });
      if (!granted) {
        const errorMessage = "دسترسی لازم برای استفاده از صدای گوگل داده نشد.";
        logME("[TTS]: Permission denied by user.");
        // می‌توانید در اینجا به کاربر اطلاع دهید که دسترسی رد شده است (مثلاً از طریق یک notification).
        console.error("[TTS]: Permission denied:", errorMessage);
        return;
      }
      logME("[TTS]: Permission granted by user.");
    } else {
      logME("[TTS]: Google TTS permission already granted.");
    }

    // --- پخش صدا ---
    logME("[TTS]: Attempting to play audio...");
    const audio = new Audio(url);
    audio.crossOrigin = "anonymous"; // برای منابع خارجی لازم است

    await new Promise((resolve, reject) => {
      audio.addEventListener("ended", resolve);
      audio.addEventListener("error", (e) => {
        logME("[TTS]: Error during audio playback:", e);
        console.error("[TTS]: Audio playback error details:", audio.error);
        const errorMessage = `خطا در پخش صدا از گوگل: ${
          audio.error?.message || "Unknown error"
        }`;
        // می‌توانید در اینجا به کاربر اطلاع دهید که خطایی در پخش صدا رخ داده است.
        console.error("[TTS]: Audio playback error:", errorMessage);
        reject(new Error(errorMessage));
      });
      audio.play().then(resolve).catch(reject); // مدیریت Promise مربوط به play()
    });

    logME("[TTS]: Google TTS playback started.");
  } catch (error) {
    logME(
      "[TTS]: Error during Google TTS operation:",
      error.name,
      error.message
    );
    console.error("[TTS]: Full error object:", error);
    // می‌توانید در اینجا خطای کلی را به کاربر اطلاع دهید.
    console.error("[TTS]: Google TTS Error:", error.message);
  }
}

/**
 * Plays audio using the browser's built-in Web Speech API.
 * (This is the previous implementation, extracted into a helper function)
 * @param {string} text The text to speak.
 * @param {string} langCode The language code (e.g., 'en', 'fa', 'auto').
 */
export function playAudioWebSpeech(text, langCode) {
  if (!text || !text.trim()) {
    logME("[WebSpeech]: No text provided.");
    return;
  }

  logME(`[WebSpeech]: Playing text in lang '${langCode || "auto"}':`, text);
  const utterance = new SpeechSynthesisUtterance(text);
  const speechLang = getSpeechApiLangCode(langCode); // Use existing helper

  if (speechLang) {
    utterance.lang = speechLang;
    logME(`[WebSpeech]: Setting utterance lang to: ${speechLang}`);
  } else {
    logME(
      `[WebSpeech]: No specific speech lang code found for '${langCode}'. Using browser default.`
    );
  }

  // متوقف کردن پخش قبلی (اگر وجود داشت)
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
}

/**
 * Gets the appropriate language code for the Speech Synthesis API.
 * @param {string} langCode The standard language code ('en', 'fa', etc.).
 * @returns {string} The speech synthesis language code ('en-US', 'fa-IR', etc.) or the original code.
 */
export function getSpeechApiLangCode(langCode) {
  if (!langCode || langCode === ("auto" || AUTO_DETECT_VALUE)) return null; // Cannot speak 'auto'
  const lang = languageList.find((l) => l.code === langCode);
  return lang?.speechCode || lang?.code || null; // Prefer speechCode, fallback to code
}

export function getLanguageCode(langIdentifier) {
  if (!langIdentifier) return null;
  const trimmedId = langIdentifier.trim();
  if (trimmedId === AUTO_DETECT_VALUE) return "auto";
  const lang = languageList.find(
    (l) =>
      l.name === trimmedId ||
      l.promptName === trimmedId ||
      l.voiceCode === trimmedId
  );
  return lang ? lang.voiceCode : null;
}
