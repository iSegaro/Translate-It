// src/backgrounds/bridgeIntegration.js
import Browser from "webextension-polyfill";
import { logME } from "../utils/helpers";

// ✅ Smart translation with bridge fallback
export async function smartTranslate(text, translateMode = "Popup_Translate") {
  try {
    const response = await Browser.runtime.sendMessage({
      action: "fetchTranslation",
      payload: {
        promptText: text,
        translationMode: translateMode,
      },
    });

    return {
      ...response,
      viaBridge: false, // ← حالت عادی موفق بود
    };
  } catch {
    logME(
      "[BridgeIntegration] Normal translate failed. Falling back to bridge."
    );

    const fallback = await sendTranslationViaBridge(text, translateMode);
    return fallback; // viaBridge: true داخل fallback هست
  }
}

// ✅ Send translation request via bridge script (used as fallback)
export function sendTranslationViaBridge(
  text,
  translateMode = "Popup_Translate"
) {
  return new Promise((resolve, reject) => {
    const requestId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const handler = (event) => {
      if (
        event.source !== window ||
        event.data?.type !== "AI_WRITING_TRANSLATE_RESPONSE" ||
        event.data?.original?.__requestId !== requestId
      )
        return;

      window.removeEventListener("message", handler);

      if (event.data.error) {
        reject(new Error(event.data.error));
      } else {
        // برگشت به‌همراه viaBridge
        resolve({
          ...event.data.result,
          viaBridge: true,
        });
      }
    };

    window.addEventListener("message", handler);

    window.postMessage(
      {
        type: "AI_WRITING_TRANSLATE_REQUEST",
        text,
        translateMode,
        __requestId: requestId,
      },
      "*"
    );
  });
}
