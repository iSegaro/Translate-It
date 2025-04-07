// src/popup/ttsManager.js
import elements from "./domElements.js";
import { playAudioGoogleTTS, getLanguageCode } from "../utils/tts.js";
import { logME } from "../utils/helpers.js";

function setupEventListeners() {
  elements.voiceSourceIcon?.addEventListener("click", () => {
    const text = elements.sourceText.value.trim();
    const sourceLangIdentifier = elements.sourceLanguageInput.value;
    const sourceLangCode = getLanguageCode(sourceLangIdentifier);

    if (!text) {
      elements.sourceText.focus();
      return;
    }
    logME(`[TTS]: Playing source text. Lang: ${sourceLangCode || "auto"}`);
    playAudioGoogleTTS(text, sourceLangCode); // Let playAudio handle 'auto' if necessary
  });

  elements.voiceTargetIcon?.addEventListener("click", () => {
    const text = elements.translationResult.textContent?.trim();
    const targetLangIdentifier = elements.targetLanguageInput.value;
    const targetLangCode = getLanguageCode(targetLangIdentifier);

    if (!text || text === "در حال ترجمه...") return;

    if (!targetLangCode || targetLangCode === "auto") {
      logME(
        "[TTS]: Cannot play target - invalid language code:",
        targetLangCode
      );
      elements.targetLanguageInput.focus();
      return;
    }
    logME(`[TTS]: Playing target text. Lang: ${targetLangCode}`);
    playAudioGoogleTTS(text, targetLangCode);
  });
}

export function init() {
  setupEventListeners();
  logME("[TTS]: Initialized.");
}
