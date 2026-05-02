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
   * Overridden to provide a realistic streaming/progressive rendering simulation for development.
   * Kicks in for any text longer than 100 characters when messageId is present.
   */
  async _translateBatch(texts, sourceLang, targetLang, translateMode, abortController, engine, messageId, sessionId, contextMetadata = null, expectedFormat = null, priority = null) {
    const textToProcess = Array.isArray(texts) ? (texts[0]?.t || texts[0]?.text || texts[0]) : texts;
    const textLength = textToProcess?.length || 0;

    // Trigger simulation if we have the necessary context and text is long enough for meaningful streaming
    if (engine && messageId && textLength > 300) {
      const { AIStreamManager } = await import("./utils/AIStreamManager.js");
      
      const fullMockResult = `(MOCK STREAMING) This is a simulated translation designed for UI verification. 
It arrives progressively to test the WindowsManager's ability to handle multiple batches.
Original input length: ${textLength} characters.
Target Language: ${targetLang}.
Current Timestamp: ${new Date().toLocaleTimeString()}.`;
      
      const parts = fullMockResult.split(' ');
      const batchCount = 4;
      const chunkSize = Math.ceil(parts.length / batchCount);
      
      logger.info(`[MockProvider] Simulating streaming for ${textLength} chars (${batchCount} batches)`);

      // Initial delay to avoid Handshake race conditions in messaging
      await new Promise(resolve => setTimeout(resolve, 500));

      for (let i = 0; i < batchCount; i++) {
        if (abortController?.signal?.aborted) {
          logger.debug('[MockProvider] Simulation aborted');
          break;
        }

        // Delay between batches to make it visible in the UI
        await new Promise(resolve => setTimeout(resolve, 700));

        const partialText = parts.slice(0, (i + 1) * chunkSize).join(' ');

        // Send simulated batch update
        // Note: For simulation, we send the cumulative text as many UI components expect 
        // the provider to handle accumulation if they don't support delta-merging.
        // However, TranslationHandler now supports both.
        await AIStreamManager.streamBatchResults(
          this.providerName,
          [partialText],
          Array.isArray(texts) ? texts : [texts],
          i,
          messageId,
          engine,
          sourceLang,
          targetLang
        );
      }

      // Final end signal
      await AIStreamManager.sendStreamEnd(this.providerName, messageId, engine, { targetLanguage: targetLang });

      // Return the full result as the final "direct" answer
      return Array.isArray(texts) ? [fullMockResult] : fullMockResult;
    }

    // Default behavior for short texts or non-streaming contexts
    return super._translateBatch(texts, sourceLang, targetLang, translateMode, abortController, engine, messageId, sessionId, contextMetadata, expectedFormat, priority);
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
