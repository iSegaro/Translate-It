import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { TranslationMode } from '@/shared/config/config.js';
import browser from 'webextension-polyfill';
import ExtensionContextManager from '@/core/extensionContext.js';

const logger = getScopedLogger(LOG_COMPONENTS.PAGE_TRANSLATION, 'handlePageTranslation');

/**
 * Handle page translation related messages
 */
export async function handlePageTranslation(message, sender) {
  try {
    logger.debug('Handling page translation message:', message.action);

    // Handle batch translation request directly in background
    if (message.action === MessageActions.PAGE_TRANSLATE_BATCH) {
      return await handleBatchTranslationRequest(message, sender);
    }

    // Actions that should be forwarded to content scripts
    const forwardActions = [
      MessageActions.PAGE_TRANSLATE,
      MessageActions.PAGE_RESTORE,
    ];

    if (!forwardActions.includes(message.action)) {
      return { success: false, error: 'Unknown page translation action' };
    }

    // Get the active tab
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tabs.length) {
      return { success: false, error: 'No active tab found' };
    }

    const tab = tabs[0];

    try {
      // Forward the message to the content script
      const response = await browser.tabs.sendMessage(tab.id, message);
      return response || { success: true };
    } catch (sendError) {
      // Use centralized context error detection
      if (ExtensionContextManager.isContextError(sendError)) {
        ExtensionContextManager.handleContextError(sendError, 'page-translation-handler');
      } else {
        logger.warn('Error sending page translation message to content script:', sendError);
      }
      return { success: false, error: 'Content script not available' };
    }
  } catch (error) {
    logger.error('Error handling page translation message:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle batch translation request for page translation
 * Uses TranslationEngine's executeOptimizedJsonTranslation directly for batch processing
 */
async function handleBatchTranslationRequest(message, sender) {
  try {
    const { text, provider, sourceLanguage, targetLanguage, mode } = message.data;

    if (!text) {
      return { success: false, error: 'No text provided for translation' };
    }

    // Parse texts array to validate
    const textsToTranslate = JSON.parse(text);

    logger.debug('Processing page translation batch request', {
      textsCount: textsToTranslate.length,
      provider,
      targetLanguage,
      firstText: textsToTranslate[0]?.text?.substring(0, 50),
      senderInfo: sender ? JSON.stringify(sender) : 'null'
    });

    // Get translation engine from background service
    const backgroundService = globalThis.backgroundService;
    if (!backgroundService || !backgroundService.translationEngine) {
      return { success: false, error: 'Translation service not available' };
    }

    const translationEngine = backgroundService.translationEngine;

    // Get the provider instance first
    const providerInstance = await translationEngine.getProvider(provider || 'google');

    if (!providerInstance) {
      throw new Error(`Provider '${provider}' not found or failed to initialize`);
    }

    logger.debug('Provider loaded:', {
      provider: provider || 'google',
      hasTranslateChunk: typeof providerInstance._translateChunk === 'function',
      hasTranslateBatch: typeof providerInstance._translateBatch === 'function'
    });

    // Get original source and target languages for proper handling
    const { getSourceLanguageAsync, getTargetLanguageAsync } = await import('@/shared/config/config.js');
    const [originalSourceLang, originalTargetLang] = await Promise.all([
      getSourceLanguageAsync(),
      getTargetLanguageAsync()
    ]);

    // Extract text segments from the JSON payload
    const segments = textsToTranslate.map(item => item.text);
    const messageId = message.messageId || `page-translation-${Date.now()}`;
    const tabId = sender?.tab?.id || null;

    logger.debug('Starting batch translation:', {
      segmentCount: segments.length,
      messageId,
      tabId
    });

    // Create an AbortController for this translation
    const abortController = new AbortController();
    translationEngine.activeTranslations.set(messageId, abortController);

    try {
      // Get the rate limit manager for proper rate limiting (singleton instance)
      const { rateLimitManager } = await import('@/features/translation/core/RateLimitManager.js');

      // Force reload configurations to ensure latest rate limiting settings
      rateLimitManager.reloadConfigurations();

      // Create batches (use smaller batch size for better reliability)
      const OPTIMAL_BATCH_SIZE = 20;
      const batches = translationEngine.createIntelligentBatches(segments, OPTIMAL_BATCH_SIZE);

      logger.debug(`Created ${batches.length} batches for ${segments.length} segments`);

      const results = new Array(segments.length).fill(null);
      const errorMessages = [];
      let hasErrors = false;

      // Process each batch
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];

        // Check if translation was cancelled
        if (translationEngine.isCancelled(messageId)) {
          logger.info(`Translation cancelled for messageId: ${messageId}`);
          break;
        }

        try {
          const batchResult = await rateLimitManager.executeWithRateLimit(
            provider || 'google',
            () => {
              // Check provider type to determine which method to call
              const isAIProvider = providerInstance?.constructor?.type === "ai" ||
                                 typeof providerInstance?._translateBatch === 'function';

              if (isAIProvider) {
                return providerInstance._translateBatch(
                  batch,
                  sourceLanguage || 'auto',
                  targetLanguage,
                  TranslationMode.Select_Element,
                  abortController
                );
              } else if (typeof providerInstance._translateChunk === 'function') {
                return providerInstance._translateChunk(
                  batch,
                  sourceLanguage || 'auto',
                  targetLanguage,
                  TranslationMode.Select_Element,
                  abortController
                );
              } else {
                throw new Error(`Provider ${provider} doesn't support batch translation`);
              }
            },
            `batch-${i + 1}/${batches.length}`,
            TranslationMode.Select_Element
          );

          // Process batch results
          if (Array.isArray(batchResult)) {
            for (let j = 0; j < batch.length; j++) {
              const segmentIndex = segments.indexOf(batch[j]);
              if (segmentIndex !== -1 && segmentIndex < results.length) {
                results[segmentIndex] = batchResult[j] || batch[j];
              }
            }
          }

        } catch (batchError) {
          hasErrors = true;
          const errorMessage = batchError instanceof Error ? batchError.message : String(batchError);
          if (!errorMessages.includes(errorMessage)) {
            errorMessages.push(errorMessage);
          }

          // Fill missing results with original text
          for (const segment of batch) {
            const segmentIndex = segments.indexOf(segment);
            if (segmentIndex !== -1 && segmentIndex < results.length && results[segmentIndex] === null) {
              results[segmentIndex] = segment;
            }
          }
        }
      }

      // Ensure all results are filled
      for (let i = 0; i < results.length; i++) {
        if (results[i] === null) {
          results[i] = segments[i];
        }
      }

      logger.debug('Translation completed:', {
        totalSegments: segments.length,
        translatedCount: results.length,
        hadErrors: hasErrors,
        errorMessages: errorMessages
      });

      // Create the response format
      const translatedTexts = results.map(text => ({ text }));
      const translatedJson = JSON.stringify(translatedTexts);

      return {
        success: true,
        translatedText: translatedJson
      };

    } finally {
      // Clean up abort controller
      translationEngine.activeTranslations.delete(messageId);
    }

  } catch (error) {
    logger.error('Error processing batch translation request:', error);
    return { success: false, error: error.message };
  }
}
