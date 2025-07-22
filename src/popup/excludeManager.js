// src/popup/excludeManager.js
// Manages the "Exclude Current Page" toggle in the popup

import Browser from "webextension-polyfill";
import { logME } from "../utils/helpers.js";
import { getTranslationString } from "../utils/i18n.js";
import { DEFAULT_EXCLUDED_SITES } from "../utils/exclusion.js";
import { getSettingsAsync } from "../config.js";

// Helper to extract origin from a URL
function getOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    logME("[excludeManager]: Invalid URL for origin extraction:", url);
    return url;
  }
}

// Initialize the exclude toggle
export async function init() {
  const toggle = document.getElementById("excludeCurrentPageToggle");
  if (!toggle) {
    // logME("[excludeManager]: Toggle element not found");
    return;
  }

  // Get current tab info
  let tabs;
  try {
    tabs = await Browser.tabs.query({ active: true, currentWindow: true });
  } catch {
    // logME("[excludeManager]: Error querying tabs:", err);
    return;
  }
  const currentTab = tabs[0];
  const origin = getOrigin(currentTab.url);

  // Only enable toggle for HTTP/HTTPS origins
  let protocol;
  try {
    protocol = new URL(currentTab.url).protocol;
  } catch {
    protocol = null;
  }
  const isHttp = protocol === "http:" || protocol === "https:";


  // بررسی جدید: آیا سایت در لیست پیش‌فرض و دائمی exclude قرار دارد؟
  const isPermanentlyExcluded = DEFAULT_EXCLUDED_SITES.some((site) =>
    origin.includes(site)
);

// toggle.disabled = !isHttp;

  if (!isHttp || isPermanentlyExcluded) {
    toggle.disabled = true;
    toggle.checked = false; // همیشه غیرفعال (چون مستثنی است)
    toggle.title = isPermanentlyExcluded
      ? "This site is excluded by default"
      : await getTranslationString("popup_exclude_toggle_title");
    return;
  }

  // منطق برای سایت‌های مستثنی شده توسط کاربر
  let { EXCLUDED_SITES = [] } = await Browser.storage.local.get("EXCLUDED_SITES");
  toggle.checked = !EXCLUDED_SITES.includes(origin);


  // Listen for changes
  toggle.addEventListener("change", async () => {
    if (toggle.disabled) {
      return;
    }
    // Refresh list in case it changed elsewhere
    const refreshedSettings = await getSettingsAsync();
    let list = refreshedSettings.EXCLUDED_SITES || [];
    // Remove this origin
    list = list.filter((item) => item !== origin);
    if (!toggle.checked) {
      // If user turns off, add to exclude list
      list.push(origin);
    }
    // If user turns on, exclude list should not contain origin
    await Browser.storage.local.set({ EXCLUDED_SITES: list });
    logME(
      `[excludeManager]: ${origin} ${toggle.checked ? "removed from" : "added to"} exclude list`
    );
  });
}
