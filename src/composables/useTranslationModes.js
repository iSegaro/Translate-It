// src/composables/useTranslationModes.js
import { ref, reactive } from 'vue';
import { TranslationService } from '../error-management/TranslationService.js';
import { logME } from '@/utils/helpers.js';
import { useLanguages } from '@/composables/useLanguages.js';
import { AUTO_DETECT_VALUE } from '@/constants.js';

/**
 * Composable برای مدیریت Sidepanel Translation Mode
 * @returns {Object} state و methods های مربوط به ترجمه sidepanel
 */
export function useSidepanelTranslation() {
  const isLoading = ref(false);
  const result = ref(null);
  const error = ref(null);

  /**
   * ترجمه متن در sidepanel
   * @param {string} text - متن برای ترجمه
   * @param {string} sourceLang - زبان مبدأ
   * @param {string} targetLang - زبان مقصد
   * @returns {Promise<Object|null>} نتیجه ترجمه یا null در صورت خطا
   */
  const translateText = async (text, sourceLang, targetLang) => {
    if (!text?.trim()) {
      error.value = 'Text is required for translation';
      return null;
    }

    if (!targetLang || targetLang === AUTO_DETECT_VALUE) {
      error.value = 'Target language is required';
      return null;
    }

    isLoading.value = true;
    error.value = null;
    result.value = null;

    try {
      // تبدیل display names به language codes
      const languages = useLanguages();
      const sourceLangCode = languages.getLanguagePromptName(sourceLang) || AUTO_DETECT_VALUE;
      const targetLangCode = languages.getLanguagePromptName(targetLang);

      logME('[useSidepanelTranslation] Starting translation:', {
        text: text.substring(0, 50) + '...',
        sourceLangCode,
        targetLangCode
      });

      const response = await TranslationService.sidepanelTranslate(
        text,
        sourceLangCode,
        targetLangCode
      );

      if (response?.success) {
        result.value = response;
        logME('[useSidepanelTranslation] Translation successful');
        return response;
      } else {
        const errorMsg = response?.error || 'Translation failed';
        error.value = errorMsg;
        logME('[useSidepanelTranslation] Translation failed:', errorMsg);
        return null;
      }
    } catch (err) {
      const errorMsg = err.message || 'Translation error occurred';
      error.value = errorMsg;
      logME('[useSidepanelTranslation] Translation error:', err);
      return null;
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * پاک کردن state ها
   */
  const clearState = () => {
    result.value = null;
    error.value = null;
    isLoading.value = false;
  };

  return {
    // State
    isLoading,
    result,
    error,
    
    // Methods
    translateText,
    clearState
  };
}

/**
 * Composable برای مدیریت Select Element Mode
 * @returns {Object} methods های مربوط به انتخاب عنصر
 */
export function useSelectElementTranslation() {
  const isActivating = ref(false);
  const error = ref(null);

  /**
   * فعال‌سازی حالت انتخاب عنصر
   * @returns {Promise<boolean>} موفقیت عملیات
   */
  const activateSelectMode = async () => {
    isActivating.value = true;
    error.value = null;

    try {
      logME('[useSelectElementTranslation] Activating select element mode');
      
      await TranslationService.activateSelectElementMode(true);
      
      logME('[useSelectElementTranslation] Select element mode activated');
      return true;
    } catch (err) {
      const errorMsg = err.message || 'Failed to activate select element mode';
      error.value = errorMsg;
      logME('[useSelectElementTranslation] Error activating select mode:', err);
      return false;
    } finally {
      isActivating.value = false;
    }
  };

  /**
   * غیرفعال‌سازی حالت انتخاب عنصر
   * @returns {Promise<boolean>} موفقیت عملیات
   */
  const deactivateSelectMode = async () => {
    try {
      logME('[useSelectElementTranslation] Deactivating select element mode');
      
      await TranslationService.activateSelectElementMode(false);
      
      logME('[useSelectElementTranslation] Select element mode deactivated');
      return true;
    } catch (err) {
      const errorMsg = err.message || 'Failed to deactivate select element mode';
      error.value = errorMsg;
      logME('[useSelectElementTranslation] Error deactivating select mode:', err);
      return false;
    }
  };

  return {
    // State
    isActivating,
    error,
    
    // Methods
    activateSelectMode,
    deactivateSelectMode
  };
}

/**
 * Composable برای مدیریت عملیات عمومی sidepanel
 * @returns {Object} methods های عمومی
 */
export function useSidepanelActions() {
  const isProcessing = ref(false);
  const error = ref(null);

  /**
   * بازگردانی ترجمه
   * @returns {Promise<boolean>} موفقیت عملیات
   */
  const revertTranslation = async () => {
    isProcessing.value = true;
    error.value = null;

    try {
      logME('[useSidepanelActions] Reverting translation');
      
      await TranslationService.revertTranslation();
      
      logME('[useSidepanelActions] Translation reverted successfully');
      return true;
    } catch (err) {
      const errorMsg = err.message || 'Failed to revert translation';
      error.value = errorMsg;
      logME('[useSidepanelActions] Error reverting translation:', err);
      return false;
    } finally {
      isProcessing.value = false;
    }
  };

  /**
   * توقف TTS
   * @returns {Promise<void>}
   */
  const stopTTS = async () => {
    try {
      logME('[useSidepanelActions] Stopping TTS');
      await TranslationService.stopTTS();
    } catch (err) {
      // خطاها در TTS معمولاً مهم نیستند
      logME('[useSidepanelActions] TTS stop failed (might not be active):', err);
    }
  };

  return {
    // State
    isProcessing,
    error,
    
    // Methods
    revertTranslation,
    stopTTS
  };
}

// آینده: سایر Translation Modes

/**
 * Composable برای Field Translation (آینده)
 * @returns {Object} state و methods های مربوط به ترجمه فیلدها
 */
export function useFieldTranslation() {
  // پیاده‌سازی در آینده
  return {
    // placeholder
  };
}

/**
 * Composable برای Selection Translation (آینده)
 * @returns {Object} state و methods های مربوط به ترجمه انتخاب متن
 */
export function useSelectionTranslation() {
  // پیاده‌سازی در آینده
  return {
    // placeholder
  };
}