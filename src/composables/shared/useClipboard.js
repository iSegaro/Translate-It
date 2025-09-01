// src/composables/useClipboard.js
// Vue composable for clipboard functionality in sidepanel
import { ref, onMounted, onUnmounted } from "vue";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'useClipboard');

export function useClipboard() {
  // State
  const hasClipboardContent = ref(false);
  const clipboardError = ref("");

  // Copy text to clipboard
  const copyText = async (text, feedbackCallback = null) => {
    if (!text) return false;

    try {
      await navigator.clipboard.writeText(text);
      if (feedbackCallback) {
        feedbackCallback("success");
      }
      return true;
    } catch (err) {
      logger.error("Failed to copy text:", err);
      clipboardError.value = "Failed to copy text";
      if (feedbackCallback) {
        feedbackCallback("error");
      }
      return false;
    }
  };

  // Paste text from clipboard
  const pasteText = async () => {
    try {
      const text = await navigator.clipboard.readText();
      return text || "";
    } catch (err) {
      logger.error("Failed to paste text:", err);
      clipboardError.value = "Failed to read clipboard";
      return "";
    }
  };

  // Check if clipboard has content
  const checkClipboardContent = async () => {
    try {
      const text = await navigator.clipboard.readText();
      hasClipboardContent.value = text.trim().length > 0;
      return hasClipboardContent.value;
    } catch {
      hasClipboardContent.value = false;
      return false;
    }
  };

  // Handle clipboard-related operations for source text
  const handleCopySource = async (sourceText, feedbackCallback) => {
    return await copyText(sourceText, feedbackCallback);
  };

  // Handle clipboard-related operations for translated text
  const handleCopyTarget = async (translationResult, feedbackCallback) => {
    // Get the original markdown text if available, otherwise fall back to textContent
    const originalMarkdown = translationResult?.dataset?.originalMarkdown;
    const text = originalMarkdown || translationResult?.textContent || "";
    return await copyText(text, feedbackCallback);
  };

  // Handle paste to source text
  const handlePasteSource = async (
    sourceTextRef,
    updateCallback,
    feedbackCallback,
  ) => {
    try {
      const text = await pasteText();
      if (text) {
        if (sourceTextRef) {
          sourceTextRef.value = text;
        }
        if (updateCallback) {
          updateCallback(text);
        }
        return text;
      }
      return "";
    } catch (err) {
      logger.error("Failed to paste text:", err);
      if (feedbackCallback) {
        feedbackCallback("error");
      }
      return "";
    }
  };

  // Focus handling for clipboard updates
  let focusListener = null;

  const setupClipboardMonitoring = () => {
    focusListener = () => {
      checkClipboardContent();
    };
    document.addEventListener("focus", focusListener, true);
    // Initial check
    checkClipboardContent();
  };

  const cleanupClipboardMonitoring = () => {
    if (focusListener) {
      document.removeEventListener("focus", focusListener, true);
      focusListener = null;
    }
  };

  // Lifecycle
  onMounted(() => {
    setupClipboardMonitoring();
  });

  onUnmounted(() => {
    cleanupClipboardMonitoring();
  });

  return {
    // State
    hasClipboardContent,
    clipboardError,

    // Methods
    copyText,
    pasteText,
    checkClipboardContent,
    handleCopySource,
    handleCopyTarget,
    handlePasteSource,
    setupClipboardMonitoring,
    cleanupClipboardMonitoring,

    // Aliases for shared component compatibility
    copyToClipboard: copyText,
    pasteFromClipboard: pasteText,
  };
}