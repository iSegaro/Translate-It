// src/listeners/onInstalled.js
import Browser from "webextension-polyfill";
import { CONFIG, getSettingsAsync } from "../config.js";
import { logME } from "../utils/helpers.js";
import { ErrorHandler } from "../services/ErrorService.js";
import { ErrorTypes } from "../services/ErrorTypes.js";
import { dismissAllSelectionWindows } from "../utils/cleanupSelectionWindows.js";
import { teardownEventListeners } from "../core/EventRouter.js";
// وارد کردن تابع برای خواندن رشته‌های ترجمه شده
import { getTranslationString } from "../utils/i18n.js";

const errorHandler = new ErrorHandler();

// listener اصلی را async می‌کنیم تا بتوانیم از await در آن استفاده کنیم
Browser.runtime.onInstalled.addListener(async (details) => {
  logME(
    `[AI Writing Companion] 🌟 Successfully ${
      details.reason === "install"
        ? "Installed!"
        : details.reason === "update"
          ? "Updated!"
          : ""
    }`
  );

  teardownEventListeners();

  const initOrUpdate = async () => {
    try {
      const settings = await getSettingsAsync();

      const defaultSettings = {
        ...CONFIG,
        ...settings,
      };

      await Browser.storage.local.set(defaultSettings);

      const tabs = await Browser.tabs.query({ url: "<all_urls>" });

      for (const tab of tabs) {
        if (!tab.id || !tab.url) continue;

        try {
          await Browser.runtime.sendMessage({
            action: "TRY_INJECT_IF_NEEDED",
            tabId: tab.id,
            url: tab.url,
          });
        } catch {
          //
        }
      }
    } catch (error) {
      throw await errorHandler.handle(error, {
        type: ErrorTypes.SERVICE,
        context: "background-onInstalled-initOrUpdate",
      });
    }
  };

  if (details.reason === "install" || details.reason === "update") {
    initOrUpdate().then(() => {
      dismissAllSelectionWindows();
    });
  }

  // نمایش اعلان برای بروزرسانی
  //--- این روش فقط در Chromium-based مرورگرها کار می‌کند ---//
  if (details.reason === "update") {
    try {
      // دریافت اطلاعات از مانیفست
      const manifest = Browser.runtime.getManifest();
      const version = manifest.version;
      const appName = (await getTranslationString("name")) || "Translate It!";

      // دریافت عنوان و پیام اعلان از فایل ترجمه
      const title =
        (await getTranslationString("notification_update_title")) ||
        "Extension Updated";
      let message =
        (await getTranslationString("notification_update_message")) ||
        "{appName} has been updated to version {version}.";

      // جایگزینی متغیرهای داخل پیام
      message = message.replace("{appName}", appName).replace("{version}", version);

      // ایجاد و نمایش اعلان
      await Browser.notifications.create("update-notification", {
        type: "basic",
        iconUrl: Browser.runtime.getURL("icons/extension_icon_128.png"),
        title: title,
        message: message,
      });
    } catch (e) {
      logME("Failed to create update notification:", e);
    }
  }
});