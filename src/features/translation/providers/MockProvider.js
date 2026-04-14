import { BaseAIProvider } from "./BaseAIProvider.js";
import { ProviderNames } from "./ProviderConstants.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { statsManager } from '@/features/translation/core/TranslationStatsManager.js';

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
    const { sessionId, expectedFormat, isBatch } = options;
    const { ResponseFormat } = await import("@/shared/config/translationConstants.js");

    // 1. Stats and Detailed Logging (Simulate ProviderRequestEngine behavior)
    const charCount = (systemPrompt?.length || 0) + (userText?.length || 0);
    const originalCharCount = isBatch && typeof userText === 'string' && (userText.startsWith('{') || userText.startsWith('['))
      ? userText.length // Approximate for mock
      : (userText?.length || 0);

    const { globalCallId, sessionCallId } = statsManager.recordRequest(
      this.providerName, 
      sessionId, 
      charCount, 
      originalCharCount
    );

    const sessionTag = sessionId ? ` [Session: ${sessionId.substring(0, 8)}${sessionCallId > 0 ? ` #${sessionCallId}` : ''}]` : '';
    const mockUrl = `https://github.com/iSegaro/Translate-It`;

    // Log the simulated request (Lazy to maintain high-performance logging standard)
    logger.debugLazy(() => {
      const payload = {
        model: "mock-gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userText }
        ],
        temperature: 0,
        mock_options: { expectedFormat, isBatch }
      };
      return [`[Call #${globalCallId}]${sessionTag} Request: ${mockUrl}`, {
        context: 'mock-translation',
        charCount,
        payload
      }];
    });

    const startTime = Date.now();

    // 2. Network Latency Simulation (400ms to 1000ms)
    await new Promise(resolve => setTimeout(resolve, 400 + Math.random() * 600));

    // 3. Intelligent Data Processing
    let mockResult = "";

    try {
      // Handle JSON Input (Select Element Mode)
      if (typeof userText === 'string' && (userText.startsWith('{') || userText.startsWith('['))) {
        const data = JSON.parse(userText);
        const processedData = this._mockTransformJson(data);
        mockResult = JSON.stringify(processedData);
      } else {
        // Plain text translation
        const translatedText = `(MOCK) ${userText}`;

        // Respect expected format for structured responses
        // We return a simple array as it's most compatible with batch handlers
        if (expectedFormat === ResponseFormat.JSON_OBJECT || expectedFormat === ResponseFormat.JSON_ARRAY) {
          mockResult = JSON.stringify([translatedText]);
        } else {
          mockResult = translatedText;
        }
      }
    } catch (e) {
      mockResult = `(MOCK_ERROR_FALLBACK) ${userText}`;
      logger.error('Mock transformation failed:', e);
    }

    const duration = Date.now() - startTime;

    // Log the simulated response
    logger.debugLazy(() => {
      return [`[Call #${globalCallId}] Response: 200 OK (${duration}ms)`, {
        status: 200,
        duration,
        resultPreview: typeof mockResult === 'string' ? mockResult.substring(0, 100) : 'JSON'
      }];
    });

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
          text: `(MOCK) ${item.text || item.t || 'No Text'}`
        }))
      };
    }
    
    // 2. Simple Array format: [{"t": "...", "i": "..."}]
    if (Array.isArray(data)) {
      return data.map(item => ({
        ...item,
        t: `(MOCK) ${item.t || item.text || 'No Text'}`
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
