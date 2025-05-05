// src/popup/excludeManager.js
// Manages the "Exclude Current Page" toggle in the popup

import Browser from "webextension-polyfill";
import { logME } from "../utils/helpers.js";
import { getTranslationString } from "../utils/i18n.js";

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
  toggle.disabled = !isHttp;
  if (!isHttp) {
    toggle.checked = false;
    toggle.title =
      (await getTranslationString("popup_exclude_toggle_title")) ||
      "(فعال/غیرفعال در این صفحه)";
  }

  // Read existing excluded sites
  let { EXCLUDED_SITES = [] } =
    await Browser.storage.local.get("EXCLUDED_SITES");
  // Set initial toggle state: enabled by default unless in exclude list
  toggle.checked = isHttp && !EXCLUDED_SITES.includes(origin);

  // Listen for changes
  toggle.addEventListener("change", async () => {
    if (toggle.disabled) {
      return;
    }
    // Refresh list in case it changed elsewhere
    let { EXCLUDED_SITES: list = [] } =
      await Browser.storage.local.get("EXCLUDED_SITES");
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
