// popup.js

// Restore original text by reverting elements that were translated
document.getElementById("restore").addEventListener("click", () => {
  chrome.scripting.executeScript({
    target: { allFrames: true },
    func: () => {
      document.querySelectorAll("[data-original-text]").forEach((element) => {
        element.innerText = element.dataset.originalText;
        delete element.dataset.originalText;
      });
    },
  });
});
