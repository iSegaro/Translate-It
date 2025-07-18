// src/utils/tts-chrome.js
// Chrome-specific TTS utilities

import Browser from "webextension-polyfill";
import { logME } from "../utils/helpers.js";
import { languageList } from "./languages.js";

export const AUTO_DETECT_VALUE = "Auto Detect";

/**
 * Plays audio using Google Translate TTS service.
 */
export function playAudioGoogleTTS(text, lang) {
  const ttsUrl = `https://translate.google.com/translate_tts?client=tw-ob&q=${encodeURIComponent(
    text
  )}&tl=${lang}`;

  const audio = new Audio(ttsUrl);
  audio.crossOrigin = "anonymous";

  const playbackPromise = new Promise((resolve, reject) => {
    audio.addEventListener("ended", () => {
      resolve({ success: true });
    });
    audio.addEventListener("error", (e) => {
      reject(e);
    });
  });

  audio.play().catch((err) => {
    return Promise.reject(err);
  });

  return {
    audio,
    playbackPromise,
  };
}

/**
 * Chrome TTS API
 */
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

  const hasOffscreenAPI = !!chrome?.offscreen?.createDocument;
  if (!hasOffscreenAPI) {
    throw new Error("Offscreen API not available");
  }

  let exists = false;
  try {
    exists = await chrome.offscreen.hasDocument();
  } catch (err) {
    logME("[TTS:Offscreen] Error checking offscreen document existence:", err);
    throw new Error("Failed to check offscreen document existence.");
  }

  if (!exists) {
    try {
      await chrome.offscreen.createDocument({
        url: "html/offscreen-chrome.html",
        reasons: ["AUDIO_PLAYBACK"],
        justification: "Play TTS audio from background script",
      });
    } catch (err) {
      if (!err.message.includes("Only a single offscreen document")) {
        logME("[TTS:Offscreen] Failed to create offscreen document:", err);
        throw new Error("Failed to create offscreen document.");
      }
    }
  }

  try {
    const response = await Browser.runtime.sendMessage({
      action: "playOffscreenAudio",
      url,
    });

    await Browser.offscreen.closeDocument();

    if (!response || !response.success) {
      throw new Error(response?.error || "Playback failed via offscreen.");
    }

    return { success: true };
  } catch (err) {
    try {
      await Browser.offscreen.closeDocument();
    } catch  {
      // ignore
    }
    throw new Error(err.message || "Unknown offscreen playback error.");
  }
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