// src/sidepanel/ttsManager.js
import Browser from "webextension-polyfill";
import { AUTO_DETECT_VALUE } from "../utils/tts.js";

async function speakText(text, lang) {
  if (!text) return;
  try {
    await Browser.runtime.sendMessage({ action: "speak", text, lang });
  } catch (error) {
    console.error("Error sending TTS message:", error);
  }
}

export function initTts(options) {
  const {
    voiceSourceIcon,
    sourceText,
    sourceLanguageInput,
    voiceTargetIcon,
    translationResult,
    targetLanguageInput,
  } = options;

  voiceSourceIcon?.addEventListener('click', () => {
    const lang = sourceLanguageInput?.value || AUTO_DETECT_VALUE;
    speakText(sourceText.value.trim(), lang);
  });

  voiceTargetIcon?.addEventListener('click', () => {
    const lang = targetLanguageInput?.value || AUTO_DETECT_VALUE;
    speakText(translationResult.textContent.trim(), lang);
  });
}
