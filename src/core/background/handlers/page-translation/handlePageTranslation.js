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

    // Actions that are events originating from content script and need to be broadcasted
    const eventActions = [
      MessageActions.PAGE_TRANSLATE_START,
      MessageActions.PAGE_TRANSLATE_PROGRESS,
      MessageActions.PAGE_TRANSLATE_COMPLETE,
      MessageActions.PAGE_TRANSLATE_ERROR,
      MessageActions.PAGE_RESTORE_COMPLETE,
      MessageActions.PAGE_AUTO_RESTORE_COMPLETE, // NEW
      MessageActions.PAGE_RESTORE_ERROR,
      MessageActions.PAGE_TRANSLATE_CANCELLED,
    ];

    if (eventActions.includes(message.action)) {
      logger.debug('Broadcasting page translation event:', message.action);
      // Re-broadcast to all extension views (Sidepanel, Popup, etc.)
      browser.runtime.sendMessage(message).catch(() => {});
      return { success: true };
    }

    // Actions that should be forwarded to content scripts
    const forwardActions = [
      MessageActions.PAGE_TRANSLATE,
      MessageActions.PAGE_RESTORE,
      MessageActions.PAGE_TRANSLATE_GET_STATUS,
      MessageActions.PAGE_TRANSLATE_STOP_AUTO, // NEW
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
      // Get all frames in the tab to ensure we reach every part of the page (especially iframes)
      // Safety check: webNavigation might not be available if permissions aren't fully reloaded
      const hasWebNav = typeof browser !== 'undefined' && browser.webNavigation;
      let allFrames = hasWebNav 
        ? await browser.webNavigation.getAllFrames({ tabId: tab.id }).catch(() => [{ frameId: 0 }])
        : [{ frameId: 0 }];
      
      // Filter frames to skip common ad domains and non-content frames
      allFrames = allFrames.filter(frame => {
        // Always include main frame
        if (frame.frameId === 0) return true;
        
        // Skip frames with no URL or common non-content protocols
        if (!frame.url) return false;
        if (frame.url.startsWith('about:') || frame.url.startsWith('javascript:')) return false;
        if (frame.url.startsWith('chrome-extension:')) return false;
        
        // Skip common ad networks early (optional but improves performance)
        const adDomains = [
          'doubleclick.net', 'googleads', 'adnxs.com', 'pubmatic.com', 
          'rubiconproject.com', 'openx.net', 'advertising.com'
        ];
        if (adDomains.some(domain => frame.url.includes(domain))) {
          logger.debug(`Filtering out ad frame: ${frame.url}`);
          return false;
        }
        
        return true;
      });

      if (message.action === MessageActions.PAGE_TRANSLATE_GET_STATUS) {
        // Query status from all frames and return the most active one
        const statusResponses = await Promise.all(
          allFrames.map(frame => 
            browser.tabs.sendMessage(tab.id, message, { frameId: frame.frameId })
              .catch(() => null)
          )
        );
        
        // Find the most relevant response (prefer one that is currently translating or already translated)
        const bestResponse = statusResponses.find(r => r && (r.isTranslating || r.isAutoTranslating || r.isTranslated)) || 
                           statusResponses.find(r => r && r.success) || 
                           { success: false, error: 'No active translation found' };
                           
        // Aggregate translated count if possible
        const totalCount = statusResponses.reduce((acc, r) => acc + (r?.translatedCount || 0), 0);
        
        // Only count as auto-translating if the frame is also in a valid state (translating or translated)
        // This prevents stale auto-translating flags in buggy frames from stucking the whole tab status.
        const anyAutoTranslating = statusResponses.some(r => r && r.isAutoTranslating && (r.isTranslating || r.isTranslated));
        
        if (bestResponse.success) {
          bestResponse.translatedCount = totalCount;
          bestResponse.isAutoTranslating = anyAutoTranslating;
        }
        
        return bestResponse;
      }

      // Forward TRANSLATE and RESTORE to all frames
      const responses = await Promise.all(
        allFrames.map(frame => 
          browser.tabs.sendMessage(tab.id, message, { frameId: frame.frameId })
            .catch(err => {
              logger.debug(`Could not send to frame ${frame.frameId}:`, err.message);
              return null;
            })
        )
      );

      // Return success if at least one frame responded successfully
      const success = responses.some(r => r && r.success);
      return { success, responses: responses.filter(Boolean) };
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
    const { text, provider, sourceLanguage, targetLanguage } = message.data;

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
    const { getTargetLanguageAsync } = await import('@/shared/config/config.js');
    await getTargetLanguageAsync();

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
      const { registryIdToName, isProviderType, ProviderTypes } = await import('@/features/translation/providers/ProviderConstants.js');

      // Force reload configurations to ensure latest rate limiting settings
      rateLimitManager.reloadConfigurations();

      // PROVIDER-AWARE LIMITS:
      // AI providers need large batches to stay under RPM limits and maintain context
      const pName = registryIdToName(provider || 'google');
      const isAI = isProviderType(pName, ProviderTypes.AI);
      const { CONFIG: globalConfig } = await import('@/shared/config/config.js');

      const OPTIMAL_BATCH_SIZE = globalConfig.WHOLE_PAGE_CHUNK_SIZE;
      const OPTIMAL_CHAR_LIMIT = isAI ? globalConfig.WHOLE_PAGE_AI_MAX_CHARS : globalConfig.WHOLE_PAGE_MAX_CHARS;
      
      const batches = translationEngine.createIntelligentBatches(segments, OPTIMAL_BATCH_SIZE, OPTIMAL_CHAR_LIMIT);

      logger.debug(`Created ${batches.length} batches for ${segments.length} segments (Provider: ${provider})`);

      const results = new Array(segments.length).fill(null);
      const errorMessages = [];
      let hasErrors = false;

      // Check if provider is an AI provider
      const isAIProvider = providerInstance?.constructor?.type === "ai" ||
                         typeof providerInstance?._translateBatch === 'function';

      // Process each batch
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];

        // Check if translation was cancelled
        if (translationEngine.isCancelled(messageId)) {
          logger.info(`Translation cancelled for messageId: ${messageId}`);
          break;
        }

        // For non-AI providers (Google/Yandex), add a delay between batches
        // 500ms is safer to avoid 429 when multiple page-translate requests are active
        if (i > 0 && !isAIProvider) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        try {
          const batchResult = await rateLimitManager.executeWithRateLimit(
            provider || 'google',
            () => {
              if (isAIProvider) {
                return providerInstance._translateBatch(
                  batch,
                  sourceLanguage || 'auto',
                  targetLanguage,
                  TranslationMode.Select_Element,
                  abortController,
                  translationEngine, // Pass engine
                  messageId, // Pass messageId
                  messageId  // Use messageId as sessionId for context preservation
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

      // If we had errors (like 429), return success: false so the content script knows to stop
      if (hasErrors) {
        return {
          success: false,
          error: errorMessages.join(', ') || 'Batch translation failed',
          partialResults: JSON.stringify(results.map(text => ({ text })))
        };
      }

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
