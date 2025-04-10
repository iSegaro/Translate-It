// src/popup/ttsManager.js
import Browser from "webextension-polyfill";
import { logME } from "../utils/helpers.js";

function setupEventListeners() {
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
    logME("[Popup TTS]: Sending speak message for source text.");
    try {
      const response = await Browser.runtime.sendMessage({
        action: "speak",
        text: text,
      });
      if (response && response.success) {
        logME("[Popup TTS]: TTS playback initiated successfully.");
      } else {
        logME("[Popup TTS]: TTS playback error:", response?.error);
      }
    } catch (error) {
      logME("[Popup TTS]: Error sending speak message:", error);
    }
  });

  voiceTargetIcon?.addEventListener("click", async () => {
    const text = translationResultEl?.textContent?.trim();
    if (!text || text === "در حال ترجمه...") return;
    logME("[Popup TTS]: Sending speak message for target text.");
    try {
      const response = await Browser.runtime.sendMessage({
        action: "speak",
        text: text,
      });
      if (response && response.success) {
        logME("[Popup TTS]: TTS playback initiated successfully.");
      } else {
        logME("[Popup TTS]: TTS playback error:", response?.error);
      }
    } catch (error) {
      logME("[Popup TTS]: Error sending speak message:", error);
    }
  });
}

export function init() {
  setupEventListeners();
  logME("[Popup TTS]: Initialized.");
}
