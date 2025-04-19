// src/backgrounds/bridgeIntegration.js

import Browser from "webextension-polyfill";

// ✅ Inject the page bridge script into the page (only once)
export function injectPageBridge() {
  if (document.getElementById("__AI_WRITING_BRIDGE")) return;

  const script = document.createElement("script");
  script.src = Browser.runtime.getURL("./pageBridge.js"); // ← مسیر صحیح برای Webpack خروجی
  script.id = "__AI_WRITING_BRIDGE";
  (document.head || document.documentElement).appendChild(script);
}

// ✅ Detect if page is in restricted site (Twitter, Facebook, etc.)
export function isRestrictedDomain() {
  const restrictedDomains = [
    "twitter.com",
    "facebook.com",
    "instagram.com",
    "x.com",
  ];
  return restrictedDomains.some((domain) =>
    window.location.hostname.includes(domain)
  );
}

export function normalizeTranslationResponse(res) {
  if (res?.data?.translatedText) return res;
  if (res?.result?.data?.translatedText) return res.result;
  if (typeof res?.translatedText === "string") {
    return { data: { translatedText: res.translatedText } };
  }
  throw new Error("Invalid API response format");
}

// ✅ Translation via postMessage bridge (new architecture)
export async function smartTranslate(text, translateMode = "Popup_Translate") {
  const useBridge = isRestrictedDomain();
  console.log("[smartTranslate] useBridge =", useBridge);

  try {
    let result = null;

    if (useBridge) {
      console.log("[smartTranslate] Using bridge...");
      result = await sendTranslationViaBridge(text, translateMode);
    } else {
      console.log("[smartTranslate] Using direct background messaging...");
      result = await Browser.runtime.sendMessage({
        action: "fetchTranslation",
        payload: {
          promptText: text,
          translationMode: translateMode,
        },
      });
    }

    console.log("[smartTranslate] Raw result received:", result);
    return result;
  } catch (error) {
    console.warn("[smartTranslate] Primary method failed:", error);

    if (!useBridge) {
      try {
        console.log("[smartTranslate] Falling back to bridge...");
        const fallback = await sendTranslationViaBridge(text, translateMode);
        return fallback?.result || fallback;
      } catch (fallbackError) {
        console.error(
          "[smartTranslate] Bridge fallback failed:",
          fallbackError
        );
        throw fallbackError;
      }
    }

    throw error;
  }
}

export function sendTranslationViaBridge(
  text,
  translateMode = "Popup_Translate"
) {
  return new Promise((resolve, reject) => {
    const requestId = Date.now() + "_" + Math.random().toString(36).slice(2);

    console.log("[Bridge] Sending translate request via bridge:", {
      text,
      translateMode,
      requestId,
    });

    const timeout = setTimeout(() => {
      cleanup();
      console.warn("[Bridge] Response timeout!");
      reject(new Error("Bridge response timeout"));
    }, 8000);

    const handler = (event) => {
      if (
        event.source !== window ||
        event.data?.type !== "AI_WRITING_TRANSLATE_RESPONSE"
      )
        return;

      const original = event.data.original || {};
      if (original.__requestId !== requestId) return;

      cleanup();

      if (event.data.error) {
        console.warn("[Bridge] Translation error response:", event.data.error);
        reject(new Error(event.data.error));
      } else {
        console.log(
          "[Bridge] Translation success response:",
          event.data.result
        );
        resolve(event.data.result);
      }
    };

    function cleanup() {
      clearTimeout(timeout);
      window.removeEventListener("message", handler);
    }

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
