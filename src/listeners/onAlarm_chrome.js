// src/listeners/onAlarm_chrome.js

import Browser from "webextension-polyfill";

Browser.alarms.create("wake", { delayInMinutes: 0.1 });
Browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "wake") {
    console.log("[Background] Wake alarm triggered!");
    // Call your onStartup logic manually here
    import("./onStartup.js");
  }
});
