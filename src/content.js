// src/content.js

import Browser from "webextension-polyfill";
import { initContentScript } from "./contentMain.js";
import { isUrlExcluded } from "./utils/exclusion.js";
import { logME } from "./utils/helpers.js";

(async () => {
  try {
    // ابتدا تنظیمات را از حافظه افزونه دریافت کن
    const settings = await Browser.storage.local.get([
      "EXTENSION_ENABLED",
      "EXCLUDED_SITES",
    ]);

    const isEnabled = settings.EXTENSION_ENABLED !== false; // اگر تعریف نشده باشد، فعال در نظر گرفته شود
    const excludedSites = settings.EXCLUDED_SITES || [];

    // شرط ۱: اگر افزونه به طور کلی غیرفعال است، اسکریپت را متوقف کن
    if (!isEnabled) {
      logME("Extension is disabled. Content script will not run on this page.");
      return;
    }

    // شرط ۲: اگر این سایت در لیست استثناها قرار دارد، اسکریپت را متوقف کن
    if (isUrlExcluded(window.location.href, excludedSites)) {
      logME("This site is excluded. Content script will not run on this page.");
      return;
    }

    // اگر تمام شرایط برقرار بود، منطق اصلی اسکریپت محتوا را اجرا کن
    initContentScript();
    
  } catch (error) {
    console.error("Translate-It: Error initializing content script:", error);
  }
})();