// src/utils/injector.js
import Browser from "webextension-polyfill";
import { logME } from "./helpers.js";

/**
 * Injects content script into the given tab if not already injected and not excluded.
 * @param {Object} params
 * @param {number} params.tabId - The ID of the tab to inject into.
 * @param {string} params.url - The URL of the tab to check against exclude list.
 * @returns {Promise<boolean>} - Returns true if injection was performed, false otherwise.
 */
export async function tryInjectIfNeeded({ tabId, url }) {
  try {
    const parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) return false;

    const settings = await Browser.storage.local.get(["EXCLUDED_SITES"]);
    const excludedSites = settings.EXCLUDED_SITES ?? [];

    const isExcluded = excludedSites.some((site) => url.includes(site));
    if (isExcluded) {
      logME(`[Injector] Skipped injection for excluded site: ${url}`);
      return false;
    }

    const result = await Browser.scripting.executeScript({
      target: { tabId },
      func: () => !!window.__AI_WRITING_EXTENSION_ACTIVE__,
    });

    const alreadyInjected = result?.[0]?.result;
    if (!alreadyInjected) {
      await Browser.scripting.executeScript({
        target: { tabId },
        files: ["browser-polyfill.js", "content.bundle.js"],
      });
    } else {
      logME(`[Injector] Script already active in tab ${tabId}`);
      return false;
    }
  } catch (e) {
    logME(`[Injector] Injection error for tab ${tabId}: ${e.message}`);
    return false; // مهم‌ترین بخش برای اینکه هیچ‌جا throw نشه
  }
}

export async function shouldInject(url) {
  try {
    const parsed = new URL(url);
    const isHttp = ["http:", "https:"].includes(parsed.protocol);
    if (!isHttp) return false;

    const settings = await Browser.storage.local.get([
      "EXCLUDED_SITES",
      "EXTENSION_ENABLED",
    ]);
    if (!settings.EXTENSION_ENABLED) return false;

    const excluded = settings.EXCLUDED_SITES ?? [];
    return !excluded.some((site) => url.includes(site));
  } catch (err) {
    console.warn(
      "[InjectionGuard] Failed to evaluate injection permission:",
      err
    );
    return false;
  }
}
