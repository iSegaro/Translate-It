// src/utils/tts-firefox.js
// Firefox-specific TTS utilities

import { languageList } from "./languages.js";

export const AUTO_DETECT_VALUE = "Auto Detect";

/**
 * Plays audio using Google Translate TTS service.
 * Firefox-optimized version using direct Audio API
 */
export function playAudioGoogleTTS(text, lang) {
  const ttsUrl = `https://translate.google.com/translate_tts?client=tw-ob&q=${encodeURIComponent(
    text
  )}&tl=${lang}`;

  const audio = new Audio(ttsUrl);
  // Remove crossOrigin to avoid CORS issues in Firefox

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
 * Web Speech API for Firefox
 */
export function playAudioWebSpeech(text, langCode) {
  return new Promise((resolve, reject) => {
    if (!text || !text.trim()) {
      return reject("No text to speak");
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = langCode;

    utterance.onend = () => resolve("Speech ended");
    utterance.onerror = (err) => reject(err);

    const setVoiceAndSpeak = () => {
      const voices = speechSynthesis.getVoices();
      if (voices && voices.length > 0) {
        const matchedVoice = voices.find((v) =>
          v.lang.toLowerCase().startsWith(langCode.toLowerCase())
        );
        if (matchedVoice) {
          utterance.voice = matchedVoice;
        } else {
          utterance.voice = voices[0];
        }
      }
      speechSynthesis.cancel();
      speechSynthesis.speak(utterance);
    };

    if (speechSynthesis.getVoices().length > 0) {
      setVoiceAndSpeak();
    } else {
      speechSynthesis.onvoiceschanged = () => {
        setVoiceAndSpeak();
      };
    }
  });
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