import { MessagingStandards } from "./MessagingStandards.js";
import { TranslationMode } from "@/config.js";
import { logME } from "@/utils/helpers.js";
import { MessageActions } from "./MessageActions.js";

export class TranslationService {
  constructor(context) {
    this.messenger = MessagingStandards.getMessenger(context || 'translation-service');
  }

  async translate(mode, payload) {
    try {
      logME(`[TranslationService] Sending translation request for mode: ${mode}`);
      return await this.messenger.specialized.translation.translate(payload.promptText, { ...payload, translationMode: mode });
    } catch (error) {
      logME(`[TranslationService] Translation error for mode ${mode}:`, error);
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
      logME("[TranslationService] Error toggling select element mode:", error);
      throw error;
    }
  }

  async revertTranslation() {
    try {
      await this.messenger.sendMessage({ action: MessageActions.REVERT_SELECT_ELEMENT_MODE });
    } catch (error) {
      logME("[TranslationService] Error reverting translation:", error);
      throw error;
    }
  }

  async stopTTS() {
    try {
      await this.messenger.specialized.tts.stop();
    } catch (error) {
      logME("[TranslationService] TTS stop request failed (might not be active):", error);
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
