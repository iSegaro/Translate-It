document.addEventListener("DOMContentLoaded", () => {
  // Fetch extension name and version from manifest.json
  const manifest = chrome.runtime.getManifest();
  document.getElementById(
    "NameVersion"
  ).textContent = `${manifest.name} v${manifest.version}`;

  // Retrieve the saved key (if it exists)
  chrome.storage.sync.get("apiKey", (data) => {
    if (data.apiKey) {
      document.getElementById("apiKey").value = data.apiKey;
    }
  });

  // Save the API key when the button is clicked
  document.getElementById("saveApiKey").addEventListener("click", () => {
    const apiKey = document.getElementById("apiKey").value.trim();
    chrome.storage.sync.set({ apiKey }, () => {
      const status = document.getElementById("status");
      status.textContent = "API key saved.";
      setTimeout(() => (status.textContent = ""), 2000);
    });
  });
});
