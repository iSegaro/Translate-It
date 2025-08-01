import { ref, reactive } from "vue";
import { TranslationService } from "../core/TranslationService.js";
import { logME } from "@/utils/helpers.js";
import { useLanguages } from "@/composables/useLanguages.js";
import { AUTO_DETECT_VALUE } from "@/constants.js";

export function useSidepanelTranslation() {
  const isLoading = ref(false);
  const result = ref(null);
  const error = ref(null);
  const translationService = new TranslationService();

  const translateText = async (text, sourceLang, targetLang) => {
    if (!text?.trim()) {
      error.value = "Text is required for translation";
      return null;
    }

    if (!targetLang || targetLang === AUTO_DETECT_VALUE) {
      error.value = "Target language is required";
      return null;
    }

    isLoading.value = true;
    error.value = null;
    result.value = null;

    try {
      const languages = useLanguages();
      const sourceLangCode =
        languages.getLanguagePromptName(sourceLang) || AUTO_DETECT_VALUE;
      const targetLangCode = languages.getLanguagePromptName(targetLang);

      logME("[useSidepanelTranslation] Starting translation:", {
        text: text.substring(0, 50) + "...",
        sourceLangCode,
        targetLangCode,
      });

      const response = await translationService.sidepanelTranslate(
        text,
        sourceLangCode,
        targetLangCode,
      );

      if (response?.success) {
        result.value = response;
        logME("[useSidepanelTranslation] Translation successful");
        return response;
      } else {
        const errorMsg = response?.error || "Translation failed";
        error.value = errorMsg;
        logME("[useSidepanelTranslation] Translation failed:", errorMsg);
        return null;
      }
    } catch (err) {
      const errorMsg = err.message || "Translation error occurred";
      error.value = errorMsg;
      logME("[useSidepanelTranslation] Translation error:", err);
      return null;
    } finally {
      isLoading.value = false;
    }
  };

  const clearState = () => {
    result.value = null;
    error.value = null;
    isLoading.value = false;
  };

  return {
    isLoading,
    result,
    error,
    translateText,
    clearState,
  };
}

export function useSelectElementTranslation() {
  const isActivating = ref(false);
  const isSelectModeActive = ref(false);
  const error = ref(null);
  const translationService = new TranslationService();

  const activateSelectMode = async () => {
    isActivating.value = true;
    error.value = null;

    try {
      logME("[useSelectElementTranslation] Activating select element mode");
      await translationService.activateSelectElementMode(true);
      logME("[useSelectElementTranslation] Select element mode activated");
      return true;
    } catch (err) {
      const errorMsg = err.message || "Failed to activate select element mode";
      error.value = errorMsg;
      logME("[useSelectElementTranslation] Error activating select mode:", err);
      return false;
    } finally {
      isActivating.value = false;
    }
  };

  const deactivateSelectMode = async () => {
    try {
      logME("[useSelectElementTranslation] Deactivating select element mode");
      await translationService.activateSelectElementMode(false);
      logME("[useSelectElementTranslation] Select element mode deactivated");
      return true;
    } catch (err) {
      const errorMsg =
        err.message || "Failed to deactivate select element mode";
      error.value = errorMsg;
      logME(
        "[useSelectElementTranslation] Error deactivating select mode:",
        err,
      );
      return false;
    }
  };

  const toggleSelectElement = async () => {
    if (isSelectModeActive.value) {
      const result = await deactivateSelectMode();
      if (result) {
        isSelectModeActive.value = false;
      }
      return result;
    } else {
      const result = await activateSelectMode();
      if (result) {
        isSelectModeActive.value = true;
      }
      return result;
    }
  };

  return {
    isActivating,
    isSelectModeActive,
    error,
    activateSelectMode,
    deactivateSelectMode,
    toggleSelectElement,
  };
}

export function useSidepanelActions() {
  const isProcessing = ref(false);
  const error = ref(null);
  const translationService = new TranslationService();

  const revertTranslation = async () => {
    isProcessing.value = true;
    error.value = null;

    try {
      logME("[useSidepanelActions] Reverting translation");
      await translationService.revertTranslation();
      logME("[useSidepanelActions] Translation reverted successfully");
      return true;
    } catch (err) {
      const errorMsg = err.message || "Failed to revert translation";
      error.value = errorMsg;
      logME("[useSidepanelActions] Error reverting translation:", err);
      return false;
    } finally {
      isProcessing.value = false;
    }
  };

  const stopTTS = async () => {
    try {
      logME("[useSidepanelActions] Stopping TTS");
      await translationService.stopTTS();
    } catch (err) {
      logME(
        "[useSidepanelActions] TTS stop failed (might not be active):",
        err,
      );
    }
  };

  return {
    isProcessing,
    error,
    revertTranslation,
    stopTTS,
  };
}

export function useFieldTranslation() {
  return {};
}

export function useSelectionTranslation() {
  return {};
}
