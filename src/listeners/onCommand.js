// src/listeners/onCommand.js
// شنونده برای زمانی که یک دستور (شورتکات) توسط کاربر اجرا می‌شود

import { getBrowserAsync } from "@/utils/browser-polyfill.js";
import { logME } from "../utils/helpers.js";

export async function initialize(Browser) {
  Browser.commands.onCommand.addListener(async (command) => {
    logME(`[onCommand] Command received: ${command}`);

    // بررسی می‌کنیم که آیا دستور دریافتی، همان دستوری است که در مانیفست تعریف کردیم
    if (command === "toggle-select-element") {
      
      // ابتدا تب فعال فعلی را پیدا می‌کنیم
      try {
        const tabs = await Browser.tabs.query({ active: true, currentWindow: true });
        const activeTab = tabs[0];

        if (activeTab && activeTab.id) {
          // دقیقاً همان پیامی را که برای منوی راست‌کلیک و پاپ‌آپ استفاده کردیم،
          // به اسکریپت محتوای تب فعال ارسال می‌کنیم تا حالت انتخاب را فعال کند.
          logME(`[onCommand] Sending 'TOGGLE_SELECT_ELEMENT_MODE' to tab ${activeTab.id}`);
          Browser.tabs.sendMessage(activeTab.id, {
            action: "TOGGLE_SELECT_ELEMENT_ELEMENT_MODE",
            data: true // به اسکریپت محتوا می‌گوییم حالت انتخاب را فعال کند
          }).catch(err => {
            logME(`[onCommand] Could not send message to tab ${activeTab.id}:`, err.message);
          });
        }
      } catch (error) {
        logME('[onCommand] Error querying active tab:', error);
      }
    }
  });
}
