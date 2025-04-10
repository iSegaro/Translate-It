// src/utils/tts.js
import Browser from "webextension-polyfill";
import { logME } from "../utils/helpers.js";
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
  if (!text || !text.trim()) {
    logME("[TTS]: No text provided to speak.");
    return;
  }

  let targetLangCode = lang;

  try {
    // --- تشخیص زبان در صورت نیاز ---
    if (!targetLangCode || targetLangCode === AUTO_DETECT_VALUE) {
      logME("[TTS]: Attempting to auto-detect language...");
      const detectedLangCode = await detectTextLanguage(text);
      targetLangCode = detectedLangCode || "en";
      logME(`[TTS]: Auto-detected or fallback language: ${targetLangCode}`);
    } else {
      logME(`[TTS]: Using provided language: ${targetLangCode}`);
    }

    // --- محدودیت طول متن گوگل ---
    const maxLength = 200;
    if (text.length > maxLength) {
      logME(
        `[TTS]: Text too long for Google TTS (>${maxLength}). Using Web Speech API.`
      );
      playAudioWebSpeech(text, targetLangCode);
      return;
    }

    // --- ساخت URL ---
    const url = `https://translate.google.com/translate_tts?client=tw-ob&q=${encodeURIComponent(text)}&tl=${targetLangCode}`;
    logME("[TTS]: Requesting Google TTS URL:", url);

    const requiredOrigin = "https://translate.google.com/*";

    // --- بررسی و درخواست دسترسی ---
    const hasPermission = await Browser.permissions.contains({
      origins: [requiredOrigin],
    });

    if (!hasPermission) {
      logME("[TTS]: Permission not granted. Requesting...");
      const granted = await new Promise((resolve) => {
        Browser.permissions.request({ origins: [requiredOrigin] }, resolve);
      });
      if (!granted) {
        logME("[TTS]: Permission denied by user.");
        return;
      }
      logME("[TTS]: Permission granted.");
    } else {
      logME("[TTS]: Permission already granted.");
    }

    // --- پخش صدا ---
    const audio = new Audio(url);
    audio.crossOrigin = "anonymous"; // برای منابع خارجی لازم است

    audio.addEventListener("ended", () => {
      logME("[TTS]: Audio playback finished.");
    });

    audio.addEventListener("error", (e) => {
      logME("[TTS]: Audio playback error:", e);
    });

    await audio.play();
    logME("[TTS]: Audio started playing.");
  } catch (error) {
    logME("[TTS]: Error in playAudioGoogleTTS:", error.name, error.message);
    try {
    } catch (e) {
      logME("[TTS]: sendResponse failed (likely out of scope):", e.message);
    }
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

  logME(
    `[WebSpeech]: Playing text in lang '${langCode || AUTO_DETECT_VALUE}':`,
    text
  );
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
  if (!langCode || langCode === AUTO_DETECT_VALUE) return null; // Cannot speak 'auto'
  const lang = languageList.find((l) => l.code === langCode);
  return lang?.speechCode || lang?.code || null; // Prefer speechCode, fallback to code
}

export function getLanguageCode(langIdentifier) {
  if (!langIdentifier) return null;
  const trimmedId = langIdentifier.trim();
  if (trimmedId === AUTO_DETECT_VALUE) return AUTO_DETECT_VALUE;
  const lang = languageList.find(
    (l) =>
      l.name === trimmedId ||
      l.promptName === trimmedId ||
      l.voiceCode === trimmedId
  );
  return lang ? lang.voiceCode : null;
}
