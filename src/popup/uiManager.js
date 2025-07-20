// src/popup/uiManager.js
import { getTranslationString } from "../utils/i18n.js";

/** Toggles visibility of the clear button based on input value. */
export function toggleClearButtonVisibility(inputElement, clearButton) {
  const container = inputElement?.parentElement;
  if (!container || !clearButton) return;
  container.classList.toggle("has-value", !!inputElement.value);
}

/** Toggles visibility of the inline toolbar based on content. */
export function toggleInlineToolbarVisibility(element) {
  const container = element?.parentElement;
  if (!container) return;
  const text = (element.value || element.textContent || "").trim();
  container.classList.toggle(
    "has-content",
    text && text !== getTranslationString("popup_string_during_translate") && text !== "در حال ترجمه..."
  );
}

/** Provides visual feedback, e.g., a temporary checkmark or animation. */
export function showVisualFeedback(
  element,
  feedbackType = "success",
  duration = 1000
) {
  if (!element) return;
  const feedbackClass = `feedback-${feedbackType}`; // e.g., feedback-success, feedback-error
  element.classList.add(feedbackClass);
  setTimeout(() => {
    element.classList.remove(feedbackClass);
  }, duration);
}

// You can add more UI helper functions here as needed
