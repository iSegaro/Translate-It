// src/utils/select_element.js
import browser from "webextension-polyfill";

import { isExtensionContextValid, logME } from "./helpers.js";
import { getSettingsAsync } from "../config.js";


export async function Active_SelectElement(
  active = null,
  closePopup = false,
  force = false,
) {
  try {
    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tabs.length === 0) return;

    if (!isExtensionContextValid()) return;

    let currentState = false;

    const result = await getSettingsAsync();
    currentState = result.selectElementState;

    if (active === null) {
      active = !currentState;
    }

    // فقط وقتی تغییر می‌کنه یا force=true است
    if (force || active !== currentState) {
      await browser.storage.local.set({ selectElementState: active });

      const response = await browser.runtime.sendMessage({
        action: "activateSelectElementMode",
        data: active,
      });

      logME("Select Mode Updated:", response);
    }

    if (closePopup) {
      window.close();
    }
  } catch (error) {
    logME("Error in Active_SelectElement:", error);
  }
}
