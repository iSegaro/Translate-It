// src/listeners/onContextMenu.js

import Browser from "webextension-polyfill";
import { logME } from "../utils/helpers.js";

const CONTEXT_MENU_ID = "translate-with-select-element";

function setupContextMenu() {
  Browser.contextMenus.remove(CONTEXT_MENU_ID).catch(() => {});
  Browser.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: "Translate with Select Element",
    contexts: ["page", "selection", "link", "image", "video", "audio"],
  });
  logME("[ContextMenu] 'Select Element' context menu created/updated.");
}

// شنونده برای زمانی که روی آیتم منوی ما کلیک می‌شود
Browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === CONTEXT_MENU_ID) {
    logME("[ContextMenu] 'Select Element' context menu item clicked.");

    // بررسی می‌کنیم که آیا تب معتبری برای ارسال پیام داریم
    if (tab && tab.id) {
      // به جای فراخوانی مستقیم تابع، یک پیام به اسکریپت محتوای همان تب ارسال می‌کنیم
      Browser.tabs.sendMessage(tab.id, {
        action: "TOGGLE_SELECT_ELEMENT_MODE", // از اکشن موجود شما استفاده می‌کنیم
        data: true // به اسکریپت محتوا می‌گوییم که حالت انتخاب را فعال کند
      }).catch(err => {
        logME(`[ContextMenu] Could not send message to tab ${tab.id}:`, err.message);
        // اینجا می‌توانید یک نوتیفیکیشن به کاربر نمایش دهید که این قابلیت در این صفحه کار نمی‌کند
        // مثلاً در صفحات داخلی مرورگر chrome://
      });
    }
  }
});

// اجرای تابع setup هنگام شروع به کار اسکریپت
setupContextMenu();