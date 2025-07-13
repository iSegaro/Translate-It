// src/sidepanel/uiManager.js

/**
 * Toggles visibility of the inline toolbar based on content.
 * @param {HTMLElement} container - The container of the textarea/result div.
 */
export function toggleInlineToolbarVisibility(container) {
  if (!container) return;
  const textElement = container.querySelector('textarea, .result');
  if (!textElement) return;

  const text = (textElement.value || textElement.textContent || "").trim();
  container.classList.toggle("has-content", !!text);
}

/**
 * Provides visual feedback on an element, e.g., a temporary glow.
 * @param {HTMLElement} element - The element to apply feedback to.
 * @param {'success' | 'error'} feedbackType - The type of feedback.
 * @param {number} duration - Duration in milliseconds.
 */
export function showVisualFeedback(element, feedbackType = "success", duration = 800) {
  if (!element) return;
  const feedbackClass = `feedback-${feedbackType}`;
  element.classList.add(feedbackClass);
  setTimeout(() => {
    element.classList.remove(feedbackClass);
  }, duration);
}
