// src/listeners/Injection.js

import Browser from "webextension-polyfill";
import { logME } from "../utils/helpers.js";

async function injectContentScript(tabId, url) {
  try {
    const parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) return;
  } catch {
    return;
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

  const { EXTENSION_ENABLED, EXCLUDED_SITES = [] } =
    await Browser.storage.local.get(["EXTENSION_ENABLED", "EXCLUDED_SITES"]);

  if (!EXTENSION_ENABLED) return;

  const isExcluded = EXCLUDED_SITES.some((site) => tab.url.includes(site));
  if (isExcluded) {
    logME("[Injection] Skipped due to excluded site:", tab.url);
    return;
  }

  injectContentScript(tabId, tab.url);
});

Browser.runtime.onInstalled.addListener(async () => {
  const tabs = await Browser.tabs.query({ url: ["http://*/*", "https://*/*"] });
  for (const tab of tabs) {
    injectContentScript(tab.id, tab.url);
  }
});
