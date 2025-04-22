// src/utils/select_element.js
import Browser from "webextension-polyfill";

import { getEventRouterInstance } from "../core/InstanceManager.js";
import { isExtensionContextValid, logME } from "./helpers.js";

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

    const tabId = tabs[0].id;
    let currentState = false;

    const result = await Browser.storage.local.get(["selectElementState"]);
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
