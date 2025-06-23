// src/listeners/Injection.js

import Browser from "webextension-polyfill";
import { logME } from "../utils/helpers.js";
import { isUrlExcluded } from "../utils/exclusion.js";

/**
 * اسکریپت محتوا را در صورت وجود تمام شرایط لازم به تب تزریق می‌کند.
 * 1. پروتکل URL باید http یا https باشد.
 * 2. افزونه باید توسط کاربر فعال شده باشد.
 * 3. URL نباید در لیست استثناهای کاربر باشد.
 * @param {number} tabId - شناسه‌ی تب.
 * @param {string} url - آدرس URL تب.
 */
async function injectContentScriptIfNeeded(tabId, url) {
  // شرط ۱: بررسی پروتکل URL
  try {
    const parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return; // خروج از تابع برای پروتکل‌های غیر وب
    }
  } catch {
    return; // URL نامعتبر است
  }

  // دریافت تنظیمات از حافظه
  const { EXTENSION_ENABLED, EXCLUDED_SITES = [] } =
    await Browser.storage.local.get(["EXTENSION_ENABLED", "EXCLUDED_SITES"]);

  // شرط ۲: بررسی فعال بودن کلی افزونه
  if (!EXTENSION_ENABLED) {
    return;
  }

  // شرط ۳: بررسی قرار نداشتن سایت در لیست استثناها
  if (isUrlExcluded(url, EXCLUDED_SITES)) {
    logME("[Injection] Skipped due to excluded site:", url);
    return;
  }

  // اگر تمام شروط برقرار باشند، اسکریپت را تزریق کن
  try {
    await Browser.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ["browser-polyfill.js", "content.bundle.js"],
    });
    // logME("[Background] Content script injected successfully to tab:", tabId);
  } catch (error) {
    logME("[Background-Injection] Failed to inject content script:", error);
  }
}

// شنونده برای زمانی که یک تب به‌روزرسانی می‌شود (مثلاً بارگذاری صفحه جدید)
Browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // تنها زمانی که بارگذاری صفحه کامل شده باشد، کد را اجرا می‌کنیم
  if (changeInfo.status !== "complete" || !tab.url) return;

  // اکنون شنونده تنها تابع اصلی را با اطلاعات تب فراخوانی می‌کند
  injectContentScriptIfNeeded(tabId, tab.url);
});

// شنونده برای زمانی که افزونه برای اولین بار نصب یا به‌روزرسانی می‌شود
Browser.runtime.onInstalled.addListener(async () => {
  // تمام تب‌های باز با پروتکل‌های وب را پیدا کن
  const tabs = await Browser.tabs.query({ url: ["http://*/*", "https://*/*"] });

  // برای هر تب، تابع تزریق را فراخوانی کن؛ تمام بررسی‌ها درون خود تابع انجام می‌شود
  for (const tab of tabs) {
    // اطمینان از وجود id و url قبل از فراخوانی
    if (tab.id && tab.url) {
      injectContentScriptIfNeeded(tab.id, tab.url);
    }
  }
});