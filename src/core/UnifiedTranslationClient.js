/**
 * Simplified Translation Client - Uses UnifiedMessenger for reliable communication
 * Based on proven OLD implementation pattern - simple and effective
 */

import { UnifiedMessenger } from "./UnifiedMessenger.js";

export class UnifiedTranslationClient {
  constructor(context) {
    if (!context) {
      throw new Error("Context is required");
    }

    this.context = context;
    this.messenger = new UnifiedMessenger(context);
  }

  /**
   * Translation-specific methods - Simplified wrappers around UnifiedMessenger
   */
  async translate(sourceText, targetLanguage, options = {}) {
    try {
      console.log(
        `[UnifiedTranslationClient:${this.context}] 🔧 Starting translation with:`,
        {
          sourceText: sourceText.substring(0, 100) + "...",
          targetLanguage,
          options,
        },
      );

      // Use simplified messenger - format according to OLD implementation pattern
      const payload = {
        text: sourceText,
        provider: targetLanguage.provider || "google",
        sourceLanguage: targetLanguage.sourceLanguage || "auto",
        targetLanguage: targetLanguage.targetLanguage || targetLanguage,
        mode: targetLanguage.mode || "simple",
        options: options,
      };

      console.log(
        `[UnifiedTranslationClient:${this.context}] 🔧 Prepared payload for messenger:`,
        payload,
      );

      console.log(
        `[UnifiedTranslationClient:${this.context}] 🔧 About to call messenger.translate()`,
      );
      const response = await this.messenger.translate(payload);

      console.log(
        `[UnifiedTranslationClient:${this.context}] 🔧 Translation response received:`,
        response,
      );
      return response;
    } catch (error) {
      console.error(
        `[UnifiedTranslationClient:${this.context}] Translation error:`,
        error,
      );
      throw new Error(
        `Translation failed in ${this.context}: ${error.message}`,
      );
    }
  }

  async getProviders() {
    return this.messenger.getProviders();
  }

  async getHistory() {
    return this.messenger.getHistory();
  }

  async clearHistory() {
    return this.messenger.clearHistory();
  }

  async speak(text, language, options = {}) {
    return this.messenger.speak(text, language, options);
  }

  async stopSpeaking() {
    return this.messenger.stopSpeaking();
  }

  /**
   * Get connection status (simplified)
   */
  getConnectionStatus() {
    return {
      context: this.context,
      messengerInfo: this.messenger.getInfo(),
    };
  }
}

// Factory function for creating clients
export function createTranslationClient(context) {
  return new UnifiedTranslationClient(context);
}

// Pre-created instances for common contexts
export const popupClient = new UnifiedTranslationClient("popup");
export const sidepanelClient = new UnifiedTranslationClient("sidepanel");
export const contentClient = new UnifiedTranslationClient("content");
export const optionsClient = new UnifiedTranslationClient("options");
