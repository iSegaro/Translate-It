// src/utils/helpers.popup.js

export function Active_SelectElement(active = null) {
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    if (tabs.length === 0) return;

    const tabId = tabs[0].id;

    if (active !== null) {
      await chrome.storage.local.set({ selectElementState: active });
    } else {
      const result = await chrome.storage.local.get(["selectElementState"]);
      active = !result.selectElementState; // تغییر وضعیت به معکوس
      await chrome.storage.local.set({ selectElementState: active });
    }

    chrome.runtime.sendMessage(
      { action: "activateSelectElementMode", data: active },
      (response) => {
        console.log("Select Mode Updated:", response);
      }
    );
  });
}
