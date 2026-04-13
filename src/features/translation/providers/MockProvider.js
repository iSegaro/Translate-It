import { BaseAIProvider } from "./BaseAIProvider.js";
import { ProviderNames } from "./ProviderConstants.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'MockProvider');

/**
 * Mock Provider for development and testing.
 * Simulates AI translation behavior with zero network cost and zero latency.
 */
export class MockProvider extends BaseAIProvider {
  static type = "ai";
  static description = "Development Mock Provider";
  static displayName = "Development Mock";
  static reliableJsonMode = true;
  static supportsStreaming = true;

  constructor() {
    super(ProviderNames.MOCK);
  }

  /**
   * Internal implementation of the mock translation call.
   * @protected
   */
  async _callAI(systemPrompt, userText, options = {}) {
    const { sessionId } = options;

    // 1. Network Latency Simulation (400ms to 1000ms)
    await new Promise(resolve => setTimeout(resolve, 400 + Math.random() * 600));

    // 2. Intelligent Data Processing
    let mockResult = "";

    try {
      // Handle JSON Input (Select Element Mode)
      if (typeof userText === 'string' && (userText.startsWith('{') || userText.startsWith('['))) {
        const data = JSON.parse(userText);
        const processedData = this._mockTransformJson(data);
        mockResult = JSON.stringify(processedData);
      } else {
        // Plain text translation
        mockResult = `[MOCK] ${userText}`;
      }
    } catch (e) {
      mockResult = `[MOCK_ERROR_FALLBACK] ${userText}`;
      logger.error('Mock transformation failed:', e);
    }

    // 3. Debug log for verification
    if (sessionId) {
      logger.debug(`[Mock Session: ${sessionId.substring(0, 8)}] History/Context check passed ✅`);
    }

    return mockResult;
  }

  /**
   * Transforms JSON structure to simulate translation (keeps IDs, updates text)
   * @private
   */
  _mockTransformJson(data) {
    // 1. Logical Batching format: {translations: [{id, text}]}
    if (data.translations && Array.isArray(data.translations)) {
      return {
        translations: data.translations.map(item => ({
          ...item,
          text: `[MOCK] ${item.text || item.t || 'No Text'}`
        }))
      };
    }
    
    // 2. Simple Array format: [{"t": "...", "i": "..."}]
    if (Array.isArray(data)) {
      return data.map(item => ({
        ...item,
        t: `[MOCK] ${item.t || item.text || 'No Text'}`
      }));
    }

    return data;
  }

  /**
   * Specialized streaming for smooth UI testing
   */
  async *streamTranslate(text, sourceLang, targetLang, options) {
    const result = await this._callAI("", text, options);
    
    // Split result into small chunks for visible streaming effect
    const chunks = result.match(/.{1,8}/g) || [result];
    
    for (const chunk of chunks) {
      await new Promise(resolve => setTimeout(resolve, 30));
      yield chunk;
    }
  }
}
