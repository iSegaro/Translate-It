import { MessagingCore, MessageContexts } from "../messaging/core/MessagingCore.js";
import { TranslationMode, getSettingsAsync } from "@/config.js";
import { logME } from "@/utils/core/helpers.js";
import { MessageActions } from "../messaging/core/MessageActions.js";
import { createLogger } from "../utils/core/logger.js";

export class TranslationService {
  constructor(context) {
    this.messenger = MessagingCore.getMessenger(context || MessageContexts.TRANSLATION_SERVICE);
    this.logger = createLogger('Translation', 'Service');
  }

  async translate(mode, payload) {
    try {
      // Get current provider from settings (async for cross-context compatibility)
      const settings = await getSettingsAsync();
      const currentProvider = settings.TRANSLATION_API || 'google-translate';
      
      const options = { 
        ...payload, 
        translationMode: mode,
        provider: currentProvider
      };
      
      this.logger.debug(`Sending translation request for mode: ${mode}, provider: ${currentProvider}, messageId: ${options.messageId}`);
      return await this.messenger.specialized.translation.translate(payload.promptText, options);
    } catch (error) {
      this.logger.error(`Translation error for mode ${mode}`, error);
      throw error;
    }
  }

  async sidepanelTranslate(text, sourceLang, targetLang) {
    return this.translate(TranslationMode.Sidepanel_Translate, { promptText: text, sourceLanguage: sourceLang, targetLanguage: targetLang });
  }

  async popupTranslate(text, sourceLang, targetLang) {
    return this.translate(TranslationMode.Popup_Translate, { promptText: text, sourceLanguage: sourceLang, targetLanguage: targetLang });
  }

  async activateSelectElementMode(active = true) {
    try {
      if (active) {
        await this.messenger.specialized.selection.activateMode(MessageActions.TRANSLATE);
      } else {
        await this.messenger.specialized.selection.deactivateMode();
      }
    } catch (error) {
      this.logger.error("Error toggling select element mode", error);
      throw error;
    }
  }

  async revertTranslation() {
    try {
      await this.messenger.sendMessage({ action: MessageActions.REVERT_SELECT_ELEMENT_MODE });
    } catch (error) {
      this.logger.error("Error reverting translation", error);
      throw error;
    }
  }

  async stopTTS() {
    try {
      await this.messenger.specialized.tts.stop();
    } catch (error) {
      this.logger.warn("TTS stop request failed (might not be active)", error);
    }
  }

  async fieldTranslate(text, sourceLang, targetLang) {
    return this.translate(TranslationMode.Field, { promptText: text, sourceLanguage: sourceLang, targetLanguage: targetLang });
  }

  async selectionTranslate(text, sourceLang, targetLang) {
    return this.translate(TranslationMode.Selection, { promptText: text, sourceLanguage: sourceLang, targetLanguage: targetLang });
  }

  async selectElementTranslate(jsonData) {
    return this.translate(TranslationMode.SelectElement, { promptText: jsonData });
  }
}
