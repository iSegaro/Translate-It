// src/utils/select_element.js
import Browser from "webextension-polyfill";

import { getEventRouterInstance } from "../core/InstanceManager.js";

getEventRouterInstance();

export async function Active_SelectElement(active = null, closePopup = false) {
  try {
    const tabs = await Browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tabs.length === 0) return;

    const tabId = tabs[0].id;

    if (active !== null) {
      await Browser.storage.local.set({ selectElementState: active });
    } else {
      const result = await Browser.storage.local.get(["selectElementState"]);
      active = !result.selectElementState; // تغییر وضعیت به معکوس
      await Browser.storage.local.set({ selectElementState: active });
    }

    const response = await Browser.runtime.sendMessage({
      action: "activateSelectElementMode",
      data: active,
    });

    console.log("Select Mode Updated:", response);
    // بستن popup بعد از دریافت پاسخ از background script
    if (closePopup) {
      window.close();
    }
  } catch (error) {
    console.error("Error in Active_SelectElement:", error);
    // می‌توانید در صورت نیاز، مدیریت خطای بیشتری اینجا اضافه کنید
  }
}
