// src/utils/tts-chrome-specific.js
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
    if (!window.speechSynthesis) {
      reject(new Error("Web Speech API not available"));
      return;
    }

    const actualLang = langCode === AUTO_DETECT_VALUE ? "en" : langCode;
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = actualLang;

    utterance.addEventListener("end", () => {
      resolve({ success: true });
    });

    utterance.addEventListener("error", (event) => {
      reject(new Error(`Speech synthesis error: ${event.error}`));
    });

    const setVoiceAndSpeak = () => {
      const voices = speechSynthesis.getVoices();
      
      if (voices.length > 0) {
        const targetLangVoices = voices.filter((voice) =>
          voice.lang.startsWith(actualLang)
        );
        if (targetLangVoices.length > 0) {
          utterance.voice = targetLangVoices[0];
        } else {
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
  logME("[TTS:Offscreen] Checking chrome.offscreen support...");

  const hasOffscreenAPI = !!chrome?.offscreen?.createDocument;
  logME(`[TTS:Offscreen] chrome.offscreen supported: ${hasOffscreenAPI}`);

  if (!hasOffscreenAPI) {
    throw new Error("Chrome offscreen API not available");
  }

  // چک کردن وجود offscreen document
  let exists = false;
  try {
    exists = await chrome.offscreen.hasDocument();
  } catch (err) {
    logME("[TTS:Offscreen] Error checking hasDocument:", err);
    exists = false;
  }

  // اگر وجود نداشت، آن را بسازیم
  if (!exists) {
    try {
      await chrome.offscreen.createDocument({
        url: "./html/offscreen-chrome.html",
        reasons: ["AUDIO_PLAYBACK"],
        justification: "Play audio for TTS functionality",
      });
      logME("[TTS:Offscreen] Offscreen document created.");
    } catch (err) {
      logME("[TTS:Offscreen] Error creating offscreen document:", err);
      throw err;
    }
  }

  // ارسال پیام برای پخش صدا
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        action: "playOffscreenAudio",
        url: url,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          logME("[TTS:Offscreen] Runtime error:", chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!response || !response.success) {
          logME("[TTS:Offscreen] Response error:", response);
          reject(new Error(response?.error || "Unknown offscreen error"));
        } else {
          logME("[TTS:Offscreen] Audio played successfully via offscreen.");
          resolve(response);
        }
      }
    );
  });
}

/**
 * Stop any Chrome TTS playback
 */
export function stopChromeTTS() {
  if (chrome?.tts?.stop) {
    chrome.tts.stop();
  }
}

export function findLanguageCode(input) {
  if (!input || typeof input !== "string") {
    return null;
  }

  const normalizedInput = input.trim().toLowerCase();

  // جستجو در languageList
  for (const languageEntry of languageList) {
    const code = languageEntry.code.toLowerCase();
    const name = languageEntry.name.toLowerCase();
    const nativeName = languageEntry.nativeName
      ? languageEntry.nativeName.toLowerCase()
      : "";

    if (
      code === normalizedInput ||
      name === normalizedInput ||
      nativeName === normalizedInput
    ) {
      return languageEntry.code;
    }
  }

  return null;
}

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