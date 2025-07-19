// src/popup/ttsManager.js
import Browser from "webextension-polyfill";
import { logME } from "../utils/helpers.js";
import { AUTO_DETECT_VALUE } from "tts-utils";

function setupEventListeners() {
  const sourceLanguageInput = document.querySelector("#sourceLanguageInput");
  const targetLanguageInput = document.querySelector("#targetLanguageInput");
  const voiceSourceIcon = document.querySelector("#voiceSourceIcon");
  const voiceTargetIcon = document.querySelector("#voiceTargetIcon");
  const sourceTextEl = document.querySelector("#sourceText");
  const translationResultEl = document.querySelector("#translationResult");

  voiceSourceIcon?.addEventListener("click", async () => {
    const text = sourceTextEl?.value.trim();
    if (!text) {
      sourceTextEl.focus();
      return;
    }

    try {
      const lang = sourceLanguageInput?.value || AUTO_DETECT_VALUE;
      // اگر کاربر زبانی را وارد نکرده بود، auto
      const response = await Browser.runtime.sendMessage({
        action: "speak",
        text,
        lang,
      });

      if (!response) {
        logME("[Popup TTS]: No response from background.");
      } else if (response.success) {
        logME("[Popup TTS]: TTS playback started.");
      } else {
        logME("[Popup TTS]: TTS error:", response.error);
      }
    } catch (error) {
      logME("[Popup TTS]: Error sending message:", error);
    }
  });

  voiceTargetIcon?.addEventListener("click", async () => {
    const text = translationResultEl?.textContent?.trim();
    if (!text) {
      translationResultEl.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      return;
    }

    try {
      const lang = targetLanguageInput?.value || AUTO_DETECT_VALUE;

      const response = await Browser.runtime.sendMessage({
        action: "speak",
        text,
        lang,
      });

      if (!response) {
        logME("[Popup TTS]: No response from background.");
      } else if (response.success) {
        logME("[Popup TTS]: TTS playback started for target text.");
      } else {
        logME("[Popup TTS]: TTS error (target):", response.error);
      }
    } catch (error) {
      logME("[Popup TTS]: Error sending message (target):", error);
    }
  });
}

export function init() {
  setupEventListeners();
  logME("[Popup TTS]: Initialized.");
}
