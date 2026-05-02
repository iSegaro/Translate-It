import { BaseAIProvider } from "./BaseAIProvider.js";
import { ProviderNames } from "./ProviderConstants.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ResponseFormat } from "@/shared/config/translationConstants.js";

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'MockProvider');

/**
 * Mock Provider for development and testing.
 * Simulates AI translation behavior by exercising the standard BaseAIProvider flows
 * without making actual network requests.
 * 
 * DESIGN GOAL: This provider must NOT override batching or streaming logic.
 * It should only implement _callAI to ensure it tests the extension's entire 
 * AI orchestration pipeline (prompting, batching, progressive rendering).
 */
export class MockProvider extends BaseAIProvider {
  static type = "ai";
  static description = "Development Mock Provider";
  static displayName = "Development Mock";
  static reliableJsonMode = true;

  constructor() {
    super(ProviderNames.MOCK);
  }

  /**
   * Internal implementation of the mock translation call.
   * This is called by BaseAIProvider's standard batching and streaming logic.
   * 
   * @protected
   */
  async _callAI(systemPrompt, userText, options = {}) {
    const { expectedFormat, isBatch, messageId, engine, sourceLang, targetLang } = options;
    
    // 1. Simulate network latency to make UI interactions feel realistic (LLMs usually take 2-5 seconds for batch/stream)
    const latency = 800 + Math.random() * 1200;
    await new Promise(resolve => setTimeout(resolve, latency));

    let result = "";

    try {
      // 2. Robust Input Parsing
      let parsedInput = userText;
      let isJsonInput = false;

      if (typeof userText === 'string' && (userText.trim().startsWith('{') || userText.trim().startsWith('['))) {
        try {
          parsedInput = JSON.parse(userText);
          isJsonInput = true;
        } catch (e) {
          isJsonInput = false;
        }
      }

      // 3. Process according to structure
      if (isJsonInput) {
        // Case A: Structured translations object {"translations": [{"id": "0", "text": "..."}]}
        if (parsedInput.translations && Array.isArray(parsedInput.translations)) {
          const translatedItems = parsedInput.translations.map(item => ({
            id: item.id,
            text: `[MOCK] ${item.text || item.t || ""}`
          }));
          
          if (expectedFormat === ResponseFormat.JSON_OBJECT) {
            result = JSON.stringify({ translations: translatedItems });
          } else if (expectedFormat === ResponseFormat.JSON_ARRAY) {
            result = JSON.stringify(translatedItems.map(i => i.text));
          } else {
            result = translatedItems.map(i => i.text).join('\n');
          }
        } 
        // Case B: Raw array ["Text1", "Text2"]
        else if (Array.isArray(parsedInput)) {
          const translatedArray = parsedInput.map(text => `[MOCK] ${text}`);
          
          if (expectedFormat === ResponseFormat.JSON_ARRAY) {
            result = JSON.stringify(translatedArray);
          } else if (expectedFormat === ResponseFormat.JSON_OBJECT) {
            result = JSON.stringify({ translatedText: translatedArray[0], translations: translatedArray });
          } else {
            result = translatedArray.join('\n');
          }
        }
      }

      // 4. Fallback for plain text or failed parsing
      if (!result) {
        const textToTranslate = typeof userText === 'string' ? userText : JSON.stringify(userText);
        const translatedText = `[MOCK] ${textToTranslate}`;
        
        if (expectedFormat === ResponseFormat.JSON_ARRAY) {
          result = JSON.stringify([translatedText]);
        } else if (expectedFormat === ResponseFormat.JSON_OBJECT) {
          result = JSON.stringify({ translatedText });
        } else {
          result = translatedText;
        }
      }
    } catch (e) {
      logger.error('[MockProvider] Error in mock processing:', e);
      result = `[MOCK ERROR] ${userText}`;
    }

    logger.debug(`[MockProvider] Simulated response for ${isBatch ? 'batch' : 'single'} request (${latency.toFixed(0)}ms)`);

    // 4. Trigger natural project behavior (Stats, Engine Logs)
    // We use a mock URL that the ProviderRequestEngine now knows how to bypass
    try {
      await this._executeRequest({
        url: 'mock://translation-simulation',
        context: 'mock-provider',
        charCount: userText.length,
        originalCharCount: userText.length,
        sessionId: options.sessionId
      });
    } catch {
      // Ignore mock-only errors
    }

    return result;
  }

  /**
   * Image translation simulation
   * Exercises the BaseAIProvider.translateImage flow
   */
  async _translateImageInternal(base64Image, sourceLang, targetLang, options = {}) {
    await new Promise(resolve => setTimeout(resolve, 1500)); // Images take longer
    return `[MOCK IMAGE TRANSLATION] Simulated result for image (${sourceLang} -> ${targetLang})`;
  }
}
