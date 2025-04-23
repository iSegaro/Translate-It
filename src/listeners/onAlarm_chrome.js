// src/listeners/onAlarm_chrome.js

import Browser from "webextension-polyfill";

Browser.alarms.create("wake", { delayInMinutes: 0.1 });
Browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "wake") {
    console.info("[AI Writing Companion] ⏰ Wake alarm triggered!");
    // Call your onStartup logic manually here
    import("./onStartup.js");
  }
});
