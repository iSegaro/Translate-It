// src/utils/select_element.js
import { Browser } from "@/utils/browser-polyfill.js";

import { getEventRouterInstance } from "../core/InstanceManager.js";
import { isExtensionContextValid, logME } from "./helpers.js";
import { getSettingsAsync } from "../config.js";

getEventRouterInstance();

export async function Active_SelectElement(
  active = null,
  closePopup = false,
  force = false
) {
  try {
    const tabs = await Browser.tabs.query({
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
      await Browser.storage.local.set({ selectElementState: active });

      const response = await Browser.runtime.sendMessage({
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
