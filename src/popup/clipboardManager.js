// src/popup/clipboardManager.js
import { logME } from "../utils/helpers.js";
import { getTranslationString } from "../utils/i18n.js";
import elements from "./domElements.js";
import * as uiManager from "./uiManager.js";

let hasTriedUpdatingVisibilityOnFocus = false;

// Simplified permission check for clipboard
async function hasClipboardReadPermission() {
  try {
    await navigator.clipboard.readText();
    return true;
  } catch (err) {
    logME("[Clipboard]: Clipboard read permission denied.", err);
    return false;
  }
}

async function updatePasteButtonVisibility() {
  const button = elements.pasteSourceBtn;
  if (!button) return;

  button.classList.add("hidden-by-clipboard"); // Hide initially

  if (hasTriedUpdatingVisibilityOnFocus && !document.hasFocus()) {
    logME("[Clipboard]: Visibility check deferred until window focus.");
    return;
  }

  if (!navigator.clipboard || !navigator.clipboard.readText) {
    logME("[Clipboard]: Clipboard API unavailable.");
    return;
  }

  try {
    const clipboardText = await navigator.clipboard.readText();
    hasTriedUpdatingVisibilityOnFocus = false;
    if (clipboardText?.trim()) {
      button.classList.remove("hidden-by-clipboard");
      logME("[Clipboard]: Clipboard has text, showing Paste button.");
    } else {
      logME("[Clipboard]: Clipboard empty or no text, hiding Paste button.");
    }
  } catch (err) {
    if (
      err.name === "NotAllowedError" &&
      !document.hasFocus() &&
      !hasTriedUpdatingVisibilityOnFocus
    ) {
      hasTriedUpdatingVisibilityOnFocus = true;
      logME("[Clipboard]: Permission error; deferring until focus.");
      window.addEventListener("focus", updatePasteButtonVisibility, {
        once: true,
      });
    } else {
      logME("[Clipboard]: Error reading clipboard.", err);
      hasTriedUpdatingVisibilityOnFocus = false;
    }
  }
}

function setupEventListeners() {
  elements.copySourceBtn?.addEventListener("click", async () => {
    const text = elements.sourceText.value;
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      logME("[Clipboard]: Source text copied successfully.");
      elements.pasteSourceBtn?.classList.remove("hidden-by-clipboard");
      uiManager.showVisualFeedback(elements.copySourceBtn);
    } catch (err) {
      logME("[Clipboard]: Failed to copy source text.", err);
      uiManager.showVisualFeedback(elements.copySourceBtn, "error");
    }
  });

  elements.pasteSourceBtn?.addEventListener("click", async () => {
    if (!(await hasClipboardReadPermission())) {
      uiManager.showVisualFeedback(elements.pasteSourceBtn, "error");
      elements.pasteSourceBtn.classList.add("hidden-by-clipboard");
      return;
    }

    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        elements.sourceText.value = text;
        elements.sourceText.dispatchEvent(
          new Event("input", { bubbles: true })
        );
        elements.sourceText.focus();
      }
      await updatePasteButtonVisibility();
    } catch (err) {
      logME("[Clipboard]: Error pasting text.", err);
      uiManager.showVisualFeedback(elements.pasteSourceBtn, "error");
      elements.pasteSourceBtn.classList.add("hidden-by-clipboard");
    }
  });

  elements.copyTargetBtn?.addEventListener("click", async () => {
    const text = elements.translationResult.textContent;
    if (
      !text ||
      text === (await getTranslationString("popup_string_during_translate"))
    )
      return;

    try {
      await navigator.clipboard.writeText(text);
      logME("[Clipboard]: Translation copied successfully.");
      elements.pasteSourceBtn?.classList.remove("hidden-by-clipboard");
      uiManager.showVisualFeedback(elements.copyTargetBtn);
    } catch (err) {
      logME("[Clipboard]: Failed to copy translation.", err);
      uiManager.showVisualFeedback(elements.copyTargetBtn, "error");
    }
  });

  document.addEventListener("translationSwapped", updatePasteButtonVisibility);
}

export async function init() {
  setupEventListeners();
  await updatePasteButtonVisibility();
  logME("[Clipboard]: Clipboard manager initialized.");
}

export { updatePasteButtonVisibility };
