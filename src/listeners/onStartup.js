// src/listeners/onStartup.js
import Browser from "webextension-polyfill";

Browser.runtime.onStartup.addListener(() => {
  Browser.tabs.query({ url: "<all_urls>" }).then(async (tabs) => {
    const settings = await Browser.storage.local.get("EXTENSION_ENABLED");
    if (!settings.EXTENSION_ENABLED) return;

    for (const tab of tabs) {
      if (!tab.id || !tab.url) continue;
      try {
        await Browser.runtime.sendMessage({
          action: "TRY_INJECT_IF_NEEDED",
          tabId: tab.id,
          url: tab.url,
        });
      } catch (err) {
        console.warn("[onStartup] sendMessage failed:", err.message);
      }
    }
  });
});
