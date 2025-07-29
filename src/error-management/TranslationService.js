// s../error-management/TranslationService.js
import browser from "webextension-polyfill";
import { TranslationMode } from "@/config.js";
import { logME } from "@/utils/helpers.js";

/**
 * مدیریت کلیه انواع ترجمه در افزونه
 * Service layer مشترک برای همه Translation Modes
 */
export class TranslationService {
  /**
   * ارسال درخواست ترجمه به background script
   * @param {string} mode - نوع ترجمه از TranslationMode
   * @param {Object} payload - داده‌های ترجمه
   * @returns {Promise<Object>} پاسخ ترجمه
   */
  static async translate(mode, payload) {
    try {
      logME(
        `[TranslationService] Sending translation request for mode: ${mode}`,
      );

      const response = await browser.runtime.sendMessage({
        action: "fetchTranslation",
        payload: {
          ...payload,
          translateMode: mode,
        },
      });

      if (browser.runtime.lastError) {
        throw new Error(browser.runtime.lastError.message);
      }

      return response;
    } catch (error) {
      logME(`[TranslationService] Translation error for mode ${mode}:`, error);
      throw error;
    }
  }

  /**
   * ترجمه متن در sidepanel
   * @param {string} text - متن برای ترجمه
   * @param {string} sourceLang - زبان مبدأ
   * @param {string} targetLang - زبان مقصد
   * @returns {Promise<Object>} نتیجه ترجمه
   */
  static async sidepanelTranslate(text, sourceLang, targetLang) {
    return this.translate(TranslationMode.Sidepanel_Translate, {
      promptText: text,
      sourceLanguage: sourceLang,
      targetLanguage: targetLang,
    });
  }

  /**
   * فعال‌سازی حالت انتخاب عنصر
   * @param {boolean} active - فعال یا غیرفعال کردن
   * @returns {Promise<void>}
   */
  static async activateSelectElementMode(active = true) {
    try {
      logME(
        `[TranslationService] ${active ? "Activating" : "Deactivating"} select element mode`,
      );

      await browser.runtime.sendMessage({
        action: "activateSelectElementMode",
        data: active,
      });
    } catch (error) {
      logME("[TranslationService] Error toggling select element mode:", error);
      throw error;
    }
  }

  /**
   * ارسال درخواست بازگردانی ترجمه
   * @returns {Promise<void>}
   */
  static async revertTranslation() {
    try {
      logME("[TranslationService] Sending revert translation request");

      await browser.runtime.sendMessage({
        action: "revertTranslation",
      });
    } catch (error) {
      logME("[TranslationService] Error reverting translation:", error);
      throw error;
    }
  }

  /**
   * توقف TTS (Text-to-Speech)
   * @returns {Promise<void>}
   */
  static async stopTTS() {
    try {
      await browser.runtime.sendMessage({
        action: "stopTTS",
      });
    } catch (error) {
      // خطا را نادیده می‌گیریم چون ممکن است TTS فعال نباشد
      logME(
        "[TranslationService] TTS stop request failed (might not be active):",
        error,
      );
    }
  }

  // آینده: Methods برای Translation Modes دیگر

  /**
   * ترجمه در فیلدهای متنی
   * @param {string} text - متن برای ترجمه
   * @param {string} sourceLang - زبان مبدأ
   * @param {string} targetLang - زبان مقصد
   * @returns {Promise<Object>} نتیجه ترجمه
   */
  static async fieldTranslate(text, sourceLang, targetLang) {
    return this.translate(TranslationMode.Field, {
      promptText: text,
      sourceLanguage: sourceLang,
      targetLanguage: targetLang,
    });
  }

  /**
   * ترجمه متن انتخاب شده
   * @param {string} text - متن انتخاب شده
   * @param {string} sourceLang - زبان مبدأ
   * @param {string} targetLang - زبان مقصد
   * @returns {Promise<Object>} نتیجه ترجمه
   */
  static async selectionTranslate(text, sourceLang, targetLang) {
    return this.translate(TranslationMode.Selection, {
      promptText: text,
      sourceLanguage: sourceLang,
      targetLanguage: targetLang,
    });
  }

  /**
   * ترجمه عنصر انتخاب شده (JSON format)
   * @param {string} jsonData - داده‌های JSON برای ترجمه
   * @returns {Promise<Object>} نتیجه ترجمه
   */
  static async selectElementTranslate(jsonData) {
    return this.translate(TranslationMode.SelectElement, {
      promptText: jsonData,
    });
  }
}
