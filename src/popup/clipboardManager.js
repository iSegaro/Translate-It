// src/popup/clipboardManager.js
import elements from "./domElements.js";
import * as uiManager from "./uiManager.js";
import { logME } from "../utils/helpers.js";

let hasTriedUpdatingVisibilityOnFocus = false;

async function updatePasteButtonVisibility() {
  const button = elements.pasteSourceBtn;
  if (!button) return;

  button.classList.add("hidden-by-clipboard"); // Hide initially

  if (hasTriedUpdatingVisibilityOnFocus && !document.hasFocus()) {
    logME("[Clipboard]: Visibility update already deferred to window focus.");
    return;
  }

  try {
    if (!navigator.clipboard?.readText) {
      logME(
        "[Clipboard]: Clipboard API (readText) not available. Hiding Paste."
      );
      return; // Exit if API is not present
    }
    const clipboardText = await navigator.clipboard.readText();
    hasTriedUpdatingVisibilityOnFocus = false; // Reset flag on success
    if (clipboardText?.trim()) {
      button.classList.remove("hidden-by-clipboard");
      logME("[Clipboard]: Clipboard has text, showing Paste button.");
    } else {
      logME("[Clipboard]: Clipboard empty/no text, hiding Paste button.");
    }
  } catch (err) {
    if (
      err.name === "NotAllowedError" &&
      !document.hasFocus() &&
      !hasTriedUpdatingVisibilityOnFocus
    ) {
      logME("[Clipboard]: No focus. Deferring check until window gains focus.");
      hasTriedUpdatingVisibilityOnFocus = true;
      window.addEventListener("focus", updatePasteButtonVisibility, {
        once: true,
      });
    } else {
      logME("[Clipboard]: Failed to read clipboard. Hiding Paste.", err.name);
      console.warn(
        "[Clipboard]: Failed to read clipboard.",
        err.name,
        err.message
      ); // Keep for debug
      hasTriedUpdatingVisibilityOnFocus = false; // Reset flag on other errors
    }
  }
}

function setupEventListeners() {
  elements.copySourceBtn?.addEventListener("click", () => {
    const text = elements.sourceText.value;
    if (text) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          logME("[Clipboard]: Source text copied!");
          elements.pasteSourceBtn?.classList.remove("hidden-by-clipboard");
          uiManager.showVisualFeedback(elements.copySourceBtn); // Feedback
        })
        .catch((err) => {
          logME("[Clipboard]: Failed to copy source text: ", err);
          uiManager.showVisualFeedback(elements.copySourceBtn, "error");
        });
    }
  });

  elements.pasteSourceBtn?.addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        elements.sourceText.value = text;
        elements.sourceText.dispatchEvent(
          new Event("input", { bubbles: true })
        ); // Trigger UI update
        elements.sourceText.focus();
        // Optionally trigger translation:
        // elements.translateBtn?.click();
      }
      await updatePasteButtonVisibility(); // Re-check state after paste
    } catch (err) {
      logME("[Clipboard]: Failed to paste text: ", err);
      uiManager.showVisualFeedback(elements.pasteSourceBtn, "error");
      elements.pasteSourceBtn?.classList.add("hidden-by-clipboard"); // Hide on error
    }
  });

  elements.copyTargetBtn?.addEventListener("click", () => {
    const text = elements.translationResult.textContent;
    if (text && text !== "در حال ترجمه...") {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          logME("[Clipboard]: Target text copied!");
          elements.pasteSourceBtn?.classList.remove("hidden-by-clipboard");
          uiManager.showVisualFeedback(elements.copyTargetBtn);
        })
        .catch((err) => {
          logME("[Clipboard]: Failed to copy target text: ", err);
          uiManager.showVisualFeedback(elements.copyTargetBtn, "error");
        });
    }
  });

  // Listen for custom event from languageManager after swap
  document.addEventListener("translationSwapped", updatePasteButtonVisibility);
}

export async function init() {
  setupEventListeners();
  await updatePasteButtonVisibility(); // Initial check
  logME("[Clipboard]: Initialized.");
}

// Export for potential external calls (e.g., after clearing storage)
export { updatePasteButtonVisibility };
