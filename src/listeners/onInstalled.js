// src/listeners/onInstalled.js
import Browser from "webextension-polyfill";
import { logME } from "../utils/helpers.js";
import { getTranslationString } from "../utils/i18n.js";
// import { getTranslationString } from "../utils/i18n.js";

Browser.runtime.onInstalled.addListener(async (details) => {
  logME(
    `[Translate-It] 🌟 Successfully ${
      details.reason === "install" ? "Installed!"
      : details.reason === "update" ? "Updated!"
      : ""
    }`
  );

  // بررسی دلیل رویداد؛ اگر "update" بود، یک نوتیفیکیشن به کاربر نشان بده
  if (details.reason === "update") {
    try {
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
      message = message
        .replace("{appName}", appName)
        .replace("{version}", version);

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
