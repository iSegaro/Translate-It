// src/utils/tts.js
import { getBrowserAPI } from "../browser-unified.js";
import { logME } from "../helpers.js";
import { languageList } from "../languages.js";

// --- Voice Functions ---
export const AUTO_DETECT_VALUE = "Auto Detect"; // مقدار ثابت برای تشخیص خودکار

/**
 * Plays audio using Google Translate TTS service.
 * Requires optional permission for "https://translate.google.com/*".
 * @param {string} text The text to speak.
 * @param {string} lang The language code (e.g., 'en', 'fa'). Cannot be 'auto'.
 */
export function playAudioGoogleTTS(text, lang) {
  const ttsUrl = `https://translate.google.com/translate_tts?client=tw-ob&q=${encodeURIComponent(
    text
  )}&tl=${lang}`;

  const audio = new Audio(ttsUrl);
  audio.crossOrigin = "anonymous";

  // برای اینکه هنگام پخش با .then بتوانیم متوجه اتمام شویم
  const playbackPromise = new Promise((resolve, reject) => {
    audio.addEventListener("ended", () => {
      resolve({ success: true });
    });
    audio.addEventListener("error", (e) => {
      reject(e);
    });
  });

  // آغاز پخش
  audio.play().catch((err) => {
    // اگر play() خطا داد:
    return Promise.reject(err);
  });

  // برگرداندن هم Audio و هم Promise
  return {
    audio,
    playbackPromise,
  };
}

/**
 * Plays audio using the browser's built-in Web Speech API.
 * (This is the previous implementation, extracted into a helper function)
 * @param {string} text The text to speak.
 * @param {string} langCode The language code (e.g., 'en', 'fa', 'auto').
 */
export function playAudioWebSpeechAPI(text, langCode) {
  return new Promise((resolve, reject) => {
    if (!text || !text.trim()) {
      return reject("No text to speak");
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = langCode;

    // شنونده‌های پایان و خطا
    utterance.onend = () => resolve("Speech ended");
    utterance.onerror = (err) => reject(err);

    // تابع انتخاب Voice مناسب
    const setVoiceAndSpeak = () => {
      const voices = speechSynthesis.getVoices();
      if (!voices || voices.length === 0) {
        // ممکن است فایرفاکس صدا نداشته باشد یا هنوز آماده نباشد
        logME("No voices available");
      } else {
        // تلاش کنید صدای مناسب زبان langCode را بیابید
        const matchedVoice = voices.find((v) =>
          v.lang.toLowerCase().startsWith(langCode.toLowerCase())
        );
        if (matchedVoice) {
          utterance.voice = matchedVoice;
        } else {
          // اگر پیدا نکرد، نخستین صدا را بگذارید یا fallback
          utterance.voice = voices[0];
        }
      }
      // اجرای گفتار
      speechSynthesis.cancel();
      speechSynthesis.speak(utterance);
    };

    // اگر لیست صداها آماده است:
    if (speechSynthesis.getVoices().length > 0) {
      setVoiceAndSpeak();
    } else {
      // در فایرفاکس یا برخی مرورگرها لازم است منتظر صدور این رویداد شویم
      speechSynthesis.onvoiceschanged = () => {
        setVoiceAndSpeak();
      };
    }
  });
}

export function playAudioChromeTTS(text, lang) {
  return new Promise((resolve, reject) => {
    if (!chrome?.tts) {
      return reject(new Error("chrome.tts not available"));
    }

    chrome.tts.speak(text, {
      lang,
      onEvent: (event) => {
        if (event.type === "end") {
          resolve({ success: true });
        } else if (event.type === "error") {
          reject(new Error(`Chrome TTS error: ${event.errorMessage || ""}`));
        }
      },
    });
  });
}

/**
 * Play audio using offscreen document in Chrome
 */
export async function playAudioViaOffscreen(url) {
  logME("[TTS:Offscreen] Attempting to play audio via offscreen.");
  
  // Quick fallback to Web Speech API to avoid offscreen blocking issues
  logME("[TTS:Offscreen] Using Web Speech API directly to avoid blocking.");
  try {
    // Extract text from URL for Web Speech API
    const urlParams = new URLSearchParams(url.split('?')[1]);
    const text = urlParams.get('q') || 'test';
    const lang = urlParams.get('tl') || 'en';
    
    await playAudioWebSpeechAPI(text, lang);
    return { success: true };
  } catch (err) {
    logME("[TTS:Offscreen] Web Speech API failed:", err);
    return { error: "Web Speech API failed: " + err.message };
  }
  
  // Original offscreen code (temporarily disabled to prevent blocking)
  /*
  // All offscreen-related code disabled
  */
}

/**
 * Gets the appropriate language code for the Speech Synthesis API.
 * @param {string} langCode The standard language code ('en', 'fa', etc.).
 * @returns {string} The speech synthesis language code ('en-US', 'fa-IR', etc.) or the original code.
 */
export function getSpeechApiLangCode(langCode) {
  if (!langCode) return null;
  const lang = languageList.find((l) => l.code === langCode);
  return lang ? lang.voiceCode : null;
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

// Export for backward compatibility
export const playAudioWebSpeech = playAudioWebSpeechAPI;
