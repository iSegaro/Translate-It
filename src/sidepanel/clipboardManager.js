// src/sidepanel/clipboardManager.js
import { showVisualFeedback } from './uiManager.js';

async function copyText(text, feedbackElement) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    showVisualFeedback(feedbackElement, 'success');
  } catch (err) {
    console.error("Failed to copy text:", err);
    showVisualFeedback(feedbackElement, 'error');
  }
}

async function pasteText(targetTextarea, feedbackElement, pasteButton) {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      targetTextarea.value = text;
      // Dispatch an input event to trigger other listeners (like toolbar visibility)
      targetTextarea.dispatchEvent(new Event('input', { bubbles: true }));
      targetTextarea.focus();
    }
  } catch (err) {
    console.error("Failed to paste text:", err);
    showVisualFeedback(feedbackElement, 'error');
    if (pasteButton) pasteButton.style.display = 'none';
  }
}

export function initClipboard(options) {
  const {
    copySourceBtn,
    sourceText,
    pasteSourceBtn,
    copyTargetBtn,
    translationResult,
  } = options;

  copySourceBtn?.addEventListener('click', () => {
    copyText(sourceText.value, copySourceBtn);
  });

  pasteSourceBtn?.addEventListener('click', () => {
    pasteText(sourceText, pasteSourceBtn, pasteSourceBtn);
  });

  copyTargetBtn?.addEventListener('click', () => {
    // Get the original markdown text if available, otherwise fall back to textContent
    const originalMarkdown = translationResult.dataset.originalMarkdown;
    const text = originalMarkdown || translationResult.textContent;
    copyText(text, copyTargetBtn);
  });

  // Show/hide paste button based on clipboard content
  const updatePasteButton = async () => {
    if (!pasteSourceBtn) return;
    try {
      const text = await navigator.clipboard.readText();
      pasteSourceBtn.style.display = text.trim() ? 'block' : 'none';
    } catch {
      pasteSourceBtn.style.display = 'none';
    }
  };
  
  // Check on focus or load
  document.addEventListener('focus', updatePasteButton, true);
  updatePasteButton();
}
