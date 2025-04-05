// src/utils/tts.js
import { logME } from "../utils/helpers.js";
import { languageList } from "./languages.js";

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
    // شاید بهتر باشد sourceText.focus() اینجا هم صدا زده شود؟
    return;
  }
  if (!lang || lang === ("auto" || AUTO_DETECT_VALUE)) {
    logME(`[TTS]: Invalid language code ('${lang}') for Google TTS.`);
    // اطلاع رسانی به کاربر که زبان auto پشتیبانی نمی‌شود یا زبان نامعتبر است
    // alert(
    //   "برای خواندن متن با صدای گوگل، لطفاً یک زبان مشخص (غیر از Auto Detect) انتخاب کنید."
    // );
    // sourceLanguageInput.focus();
    // return;

    lang = "en"; // اگر زبان نامعتبر بود، به انگلیسی پیش‌فرض برمی‌گردیم
  }

  // --- محدودیت طول متن گوگل (حدود 200 کاراکتر) ---
  // Google TTS URL can get very long and might fail for long texts.
  const maxLength = 200;
  if (text.length > maxLength) {
    logME(
      `[TTS]: Text too long for Google TTS (>${maxLength} chars). Length: ${text.length}`
    );
    // alert(
    //   `متن برای خوانده شدن توسط گوگل بیش از حد طولانی است (بیشتر از ${maxLength} کاراکتر). از Web Speech API پیش‌فرض استفاده می‌شود.`
    // );
    // --- بازگشت به Web Speech API به عنوان جایگزین ---
    playAudioWebSpeech(text, lang); // تابع کمکی برای Web Speech API
    return;
    // یا می‌توانید کلا متوقف کنید: return;
  }

  // --- ساخت URL ---
  const url = `https://translate.google.com/translate_tts?client=tw-ob&q=${encodeURIComponent(text)}&tl=${lang}`;
  logME("[TTS]: Requesting Google TTS URL:", url);

  // --- بررسی و درخواست دسترسی (Optional Permission) ---
  // این آدرس باید در "optional_permissions" فایل manifest.json شما اضافه شده باشد
  const requiredOrigin = "https://translate.google.com/*";

  try {
    // 1. بررسی وجود دسترسی
    const hasPermission = await new Promise((resolve, reject) => {
      chrome.permissions.contains({ origins: [requiredOrigin] }, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    });

    // 2. اگر دسترسی وجود نداشت، درخواست بده
    if (!hasPermission) {
      logME(
        "[TTS]: Optional permission for Google TTS not granted. Requesting..."
      );
      const granted = await new Promise((resolve, reject) => {
        chrome.permissions.request({ origins: [requiredOrigin] }, (granted) => {
          if (chrome.runtime.lastError) {
            reject(
              new Error(
                chrome.runtime.lastError.message || "Permission request failed."
              )
            );
          } else if (granted) {
            logME("[TTS]: Permission granted by user.");
            resolve(true);
          } else {
            logME("[TTS]: Permission denied by user.");
            // اگر کاربر رد کرد، نمی‌توان ادامه داد
            reject(
              new Error("دسترسی لازم برای استفاده از صدای گوگل داده نشد.")
            );
          }
        });
      });
      // اگر درخواست ناموفق بود یا رد شد، تابع متوقف می‌شود (چون reject شد)
    } else {
      logME("[TTS]: Google TTS permission already granted.");
    }

    // --- پخش صدا ---
    // اگر دسترسی وجود دارد یا داده شد، صدا را پخش کن
    logME("[TTS]: Attempting to play audio...");
    const audio = new Audio(url);
    audio.crossOrigin = "anonymous"; // برای منابع خارجی لازم است

    // گوش دادن به رویداد خطا در پخش
    audio.addEventListener("error", (e) => {
      logME("[TTS]: Error during audio playback:", e);
      console.error("[TTS]: Audio playback error details:", audio.error);
      alert(
        `خطا در پخش صدا از گوگل: ${audio.error?.message || "Unknown error"}`
      );
    });

    await audio.play();
    logME("[TTS]: Google TTS playback started.");
  } catch (error) {
    // خطاهای مربوط به بررسی/درخواست دسترسی یا پخش اولیه
    logME(
      "[TTS]: Error during permission check/request or playback initiation:",
      error.name,
      error.message
    );
    console.error("[TTS]: Full error object:", error);
    // نمایش خطا به کاربر
    alert(`خطا در فرآیند پخش صدا: ${error.message}`);
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
      l.name === trimmedId || l.promptName === trimmedId || l.code === trimmedId
  );
  return lang ? lang.code : null;
}
