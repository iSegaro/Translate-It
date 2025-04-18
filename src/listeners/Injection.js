// src/listeners/Injection.js

import Browser from "webextension-polyfill";
import { logME } from "../utils/helpers.js";

async function injectContentScript(tabId, url) {
  try {
    const parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) return;
  } catch (e) {
    return; // Skip invalid or internal URLs
  }

  try {
    await Browser.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ["browser-polyfill.js", "content.bundle.js"],
    });
    logME("[Background] Content script injected successfully to tab:", tabId);
  } catch (error) {
    logME("[Background] Failed to inject content script:", error);
  }
}

Browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;

  const settings = await Browser.storage.local.get(["EXCLUDED_SITES"]);
  const excludedSites = settings.EXCLUDED_SITES ?? [];

  const isExcluded = excludedSites.some((site) => tab.url.includes(site));
  if (isExcluded) {
    console.log("Injection skipped for excluded site:", tab.url);
    return;
  }

  const { EXTENSION_ENABLED } =
    await Browser.storage.local.get("EXTENSION_ENABLED");

  if (EXTENSION_ENABLED) {
    injectContentScript(tabId, tab.url);
  }
});

// اگر می‌خواهی تزریق اولیه پس از فعال شدن افزونه صورت گیرد:
Browser.runtime.onInstalled.addListener(async () => {
  const tabs = await Browser.tabs.query({ url: ["http://*/*", "https://*/*"] });
  tabs.forEach((tab) => injectContentScript(tab.id, tab.url));
});
