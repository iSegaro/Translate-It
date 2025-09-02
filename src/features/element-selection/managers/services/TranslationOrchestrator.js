import browser from "webextension-polyfill";
import { applyTranslationsToNodes, expandTextsForTranslation, reassembleTranslations, separateCachedAndNewTexts } from "../../../../utils/text/extraction.js";
import { getScopedLogger } from "../../../../shared/logging/logger.js";
import { LOG_COMPONENTS } from "../../../../shared/logging/logConstants.js";
import { getTimeoutAsync, TranslationMode } from "@/shared/config/config.js";
import { MessageActions } from "@/shared/messaging/core/MessageActions.js";
import { generateContentMessageId } from "@/utils/messaging/messageId.js";
import { TRANSLATION_TIMEOUT_FALLBACK, TIMEOUT_CONFIG } from "../constants/selectElementConstants.js";

import { getTranslationString } from "../../../../utils/i18n/i18n.js";
import { sendSmart } from "@/shared/messaging/core/SmartMessaging.js";
import { AUTO_DETECT_VALUE } from "@/shared/config/constants.js";
import { pageEventBus } from '@/core/PageEventBus.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import ExtensionContextManager from '@/core/extensionContext.js';

export class TranslationOrchestrator {
  constructor(stateManager) {
    this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'TranslationOrchestrator');
    this.stateManager = stateManager;
    this.translationRequests = new Map();
    this.escapeKeyListener = null;
    this.statusNotification = null;
    this.errorHandler = ErrorHandler.getInstance();
  }

  async initialize() {
    this.logger.debug('TranslationOrchestrator initialized');
    
    // Set up periodic cleanup of old timeout requests (every 5 minutes)
    setInterval(() => this.cleanupOldTimeoutRequests(), 5 * 60 * 1000);
  }

  /**
   * Clean up old timeout requests that are unlikely to receive late results
   */
  cleanupOldTimeoutRequests() {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutes
    let cleanedCount = 0;

    for (const [messageId, request] of this.translationRequests) {
      if (request.status === 'timeout' && request.timeoutAt) {
        const age = now - request.timeoutAt;
        if (age > maxAge) {
          this.translationRequests.delete(messageId);
          cleanedCount++;
        }
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug(`Cleaned up ${cleanedCount} old timeout requests`);
    }
  }

  /**
   * Calculate dynamic timeout based on the number of segments to translate
   * @param {number} segmentCount - Number of translation segments
   * @returns {number} - Timeout in milliseconds
   */
  calculateDynamicTimeout(segmentCount) {
    if (!segmentCount || segmentCount <= 0) {
      return TRANSLATION_TIMEOUT_FALLBACK;
    }

    // Calculate timeout: base + (segments × time per segment)
    const calculatedTimeout = TIMEOUT_CONFIG.BASE_TIMEOUT + (segmentCount * TIMEOUT_CONFIG.TIME_PER_SEGMENT);
    
    // Apply min/max constraints
    const finalTimeout = Math.max(
      TIMEOUT_CONFIG.MIN_TIMEOUT,
      Math.min(calculatedTimeout, TIMEOUT_CONFIG.MAX_TIMEOUT)
    );

    this.logger.debug(`Dynamic timeout calculated: ${segmentCount} segments → ${finalTimeout}ms (${finalTimeout/1000}s)`);
    return finalTimeout;
  }

  async processSelectedElement(element, originalTextsMap, textNodes) {
    this.logger.operation("Starting advanced translation process for selected element");
    
    // Check extension context before proceeding
    if (!ExtensionContextManager.isValidSync()) {
      const contextError = new Error('Extension context invalidated');
      ExtensionContextManager.handleContextError(contextError, 'select-element-translation');
      throw contextError;
    }
    
    const messageId = generateContentMessageId();

    // Set global flag to indicate translation is in progress
    window.isTranslationInProgress = true;

    const statusMessage = await getTranslationString("STATUS_TRANSLATING") || "Translating...";
    this.statusNotification = `status-${messageId}`;
    pageEventBus.emit('show-notification', {
      id: this.statusNotification,
      message: statusMessage,
      type: "status",
    });

    try {
      const { textsToTranslate, cachedTranslations } = separateCachedAndNewTexts(originalTextsMap);

      if (textsToTranslate.length === 0 && cachedTranslations.size > 0) {
        this.logger.info("Applying translations from cache only.");
        // Store translations in state manager
        this.stateManager.addTranslatedElement(element, cachedTranslations);
        // Apply translations directly to DOM nodes (like OLD system)
        this.applyTranslationsToNodes(textNodes, cachedTranslations);
        // Dismiss the status notification since translation is complete
        if (this.statusNotification) {
          pageEventBus.emit('dismiss_notification', { id: this.statusNotification });
          this.statusNotification = null;
        }
        return;
      }

      if (textsToTranslate.length === 0) {
        this.logger.info("No new texts to translate.");
        // Dismiss the status notification since there's nothing to translate
        if (this.statusNotification) {
          pageEventBus.emit('dismiss_notification', { id: this.statusNotification });
          this.statusNotification = null;
        }
        return;
      }

      const { expandedTexts, originMapping } = expandTextsForTranslation(textsToTranslate);
      const jsonPayload = JSON.stringify(expandedTexts.map(t => ({ text: t })));

      this.translationRequests.set(messageId, {
        element,
        textNodes,
        textsToTranslate,
        originMapping,
        expandedTexts,
        cachedTranslations,
        translatedSegments: new Map(),
        status: 'pending',
        timestamp: Date.now()
      });

      await this.sendTranslationRequest(messageId, jsonPayload);
      // Removed setupTranslationWaiting to handle streaming results
    } catch (error) {
      // Clear the global translation in progress flag on error
      window.isTranslationInProgress = false;
      
      // Don't log or handle errors that are already handled
      if (!error.alreadyHandled) {
        this.logger.error("Translation process failed", error);
      }
      this.translationRequests.delete(messageId);
      // Dismiss the status notification on error
      if (this.statusNotification) {
        pageEventBus.emit('dismiss_notification', { id: this.statusNotification });
        this.statusNotification = null;
      }
      throw error;
    }
  }

  async sendTranslationRequest(messageId, jsonPayload) {
    try {
      const { getTranslationApiAsync, getTargetLanguageAsync } = await import("../../../../config.js");
      const provider = await getTranslationApiAsync();
      const targetLanguage = await getTargetLanguageAsync();

      const translationRequest = {
        action: MessageActions.TRANSLATE,
        data: {
          text: jsonPayload,
          provider,
          sourceLanguage: AUTO_DETECT_VALUE,
          targetLanguage,
          mode: TranslationMode.Select_Element,
          options: { rawJsonPayload: true },
        },
        context: 'event-handler',
        messageId,
      };

      this.logger.debug("Sending translation request with advanced payload");
      
      // Use safe messaging through ExtensionContextManager
      const result = await ExtensionContextManager.safeSendMessage(translationRequest, 'select-element-translation');
      
      if (result === null) {
        throw new Error('Extension context invalidated during translation request');
      }

      this.logger.debug("Translation request sent successfully");
    } catch (error) {
      this.logger.error("Failed to send translation request", error);
      throw error;
    }
  }

  async handleStreamUpdate(message) {
    const { messageId, data } = message;
    
    this.logger.debug(`[TranslationOrchestrator] Received stream update:`, {
      messageId,
      success: data?.success,
      batchIndex: data?.batchIndex,
      translatedBatchLength: data?.data?.length,
      originalBatchLength: data?.originalData?.length
    });

    if (!data.success) {
        this.logger.warn(`Received a failed stream update for messageId: ${messageId}`, data.error);
        
        // Clear the global translation in progress flag on error
        window.isTranslationInProgress = false;
        
        // Dismiss notification on error 
        if (this.statusNotification) {
          pageEventBus.emit('dismiss_notification', { id: this.statusNotification });
          this.statusNotification = null;
          this.logger.debug("Dismissed translating notification on stream error");
        }
        
        // Notify SelectElementManager to perform cleanup
        if (window.selectElementManagerInstance) {
          window.selectElementManagerInstance.performPostTranslationCleanup();
        }
        
        return;
    }

    // Ensure the translation in progress flag remains set during streaming
    window.isTranslationInProgress = true;

    const { data: translatedBatch, originalData: originalBatch, batchIndex } = data;
    
    const request = this.translationRequests.get(messageId);
    if (!request) {
      this.logger.debug("Received stream update for already completed message:", messageId);
      return;
    }

    // Keep notification during streaming - will be dismissed in handleStreamEnd

    const { textsToTranslate, originMapping, expandedTexts, textNodes } = request;

    for (let i = 0; i < translatedBatch.length; i++) {
        const translatedText = translatedBatch[i];
        const originalText = originalBatch[i];

        // Find the original index in the expandedTexts array
        const expandedIndex = expandedTexts.findIndex(text => text === originalText);

        if (expandedIndex === -1) {
            this.logger.warn(`Could not find original text for a translated segment: "${originalText}"`);
            continue;
        }

        const { originalIndex } = originMapping[expandedIndex];
        const originalTextKey = textsToTranslate[originalIndex];
        
        const nodesToUpdate = textNodes.filter(node => node.textContent.trim() === originalText.trim());

        if (nodesToUpdate.length > 0) {
            const translationMap = new Map([[originalText, translatedText]]);
            this.applyTranslationsToNodes(nodesToUpdate, translationMap);
            request.translatedSegments.set(expandedIndex, translatedText);
        }
    }
  }

  async handleStreamEnd(message) {
    const { messageId } = message;
    const request = this.translationRequests.get(messageId);
    if (!request) {
      this.logger.debug("Received stream end for already completed message:", messageId);
      return;
    }

    this.logger.info("Translation stream finished for message:", messageId);
    
    // Clear the global translation in progress flag
    window.isTranslationInProgress = false;
    
    // Dismiss the "Translating..." notification on stream completion
    if (this.statusNotification) {
      pageEventBus.emit('dismiss_notification', { id: this.statusNotification });
      this.statusNotification = null;
      this.logger.debug("Dismissed translating notification on stream completion");
    }
    
    // Finalize state, e.g., by storing all translations in stateManager
    const allTranslations = new Map(request.cachedTranslations);
    request.translatedSegments.forEach((value, key) => {
        const { originalIndex } = request.originMapping[key];
        const originalTextKey = request.textsToTranslate[originalIndex];
        // This part is complex, for now just storing the translated segments is enough for revert
        // A more sophisticated reassembly might be needed if we want to store the full translated block
    });
    this.stateManager.addTranslatedElement(request.element, request.translatedSegments);

    this.translationRequests.delete(messageId);
    
    // Notify SelectElementManager to perform cleanup
    if (window.selectElementManagerInstance) {
      window.selectElementManagerInstance.performPostTranslationCleanup();
    }
  }

  async handleTranslationResult(message) {
    // This method is now a fallback for non-streaming responses
    const { messageId, data } = message;
    this.logger.debug("Received non-streaming translation result:", { messageId });

    const request = this.translationRequests.get(messageId);
    if (!request) {
      this.logger.warn("Received translation result for unknown message:", messageId);
      return;
    }
    
    if (request.status !== 'pending') {
      this.logger.debug("Received translation result for already processed message:", { messageId });
      return;
    }

    try {
      if (data?.success) {
        const { translatedText } = data;
        const translatedData = JSON.parse(translatedText);
        const { textsToTranslate, originMapping, expandedTexts, cachedTranslations, textNodes, element } = request;

        const newTranslations = reassembleTranslations(
          translatedData,
          expandedTexts,
          originMapping,
          textsToTranslate,
          cachedTranslations
        );

        const allTranslations = new Map([...cachedTranslations, ...newTranslations]);
        
        // Store translations in state manager for potential revert
        this.stateManager.addTranslatedElement(element, allTranslations);
        
        // Apply translations directly to DOM nodes (like OLD system)
        this.applyTranslationsToNodes(textNodes, allTranslations);


        request.status = 'completed';
        request.result = data;
        this.logger.info("Translation applied successfully to DOM elements (fallback)", { messageId });
      } else {
        request.status = 'error';
        request.error = data?.error;
        this.logger.error("Translation failed (fallback)", { messageId, error: data?.error });
        await this.errorHandler.handle(new Error(data?.error?.message || 'Translation failed'), {
            context: 'select-element-translation-fallback',
            type: ErrorTypes.TRANSLATION_FAILED,
            showToast: true
        });
      }
    } catch (e) {
      this.logger.error("Unexpected error during fallback translation result handling:", e);
      request.status = 'error';
      request.error = e.message;
    } finally {
        // Clear the global translation in progress flag
        window.isTranslationInProgress = false;
        
        if (this.statusNotification) {
            pageEventBus.emit('dismiss_notification', { id: this.statusNotification });
            this.statusNotification = null;
        }
        this.translationRequests.delete(messageId);
        
        // Notify SelectElementManager to perform cleanup
        if (window.selectElementManagerInstance) {
          window.selectElementManagerInstance.performPostTranslationCleanup();
        }
    }
  }

  /**
   * Apply translations directly to DOM nodes (like OLD system)
   * @param {Array} textNodes - Array of text nodes to translate
   * @param {Map} translations - Map of original text to translated text
   */
  applyTranslationsToNodes(textNodes, translations) {
    this.logger.debug("Applying translations directly to DOM nodes", {
      textNodesCount: textNodes.length,
      translationsSize: translations.size
    });
    
    // Create simple context for the extraction utility
    const context = {
      state: {
        originalTexts: this.stateManager.originalTexts || new Map()
      }
    };
    
    // Use the existing applyTranslationsToNodes from extraction utilities
    applyTranslationsToNodes(textNodes, translations, context);
    
    this.logger.debug("Translations applied directly to DOM nodes", {
      appliedCount: translations.size
    });
  }

  cancelAllTranslations() {
    this.logger.operation("Cancelling all ongoing translations");

    // Clear the global translation in progress flag
    window.isTranslationInProgress = false;

    for (const [messageId, request] of this.translationRequests) {
      if (request.status === 'pending') {
        request.status = 'cancelled';
        request.error = 'Translation cancelled by user';
        
        // Notify background to cancel the network request
        sendSmart({
          action: MessageActions.CANCEL_TRANSLATION,
          messageId: messageId,
          data: { messageId: messageId }
        }).catch(err => this.logger.warn('Failed to send cancellation message to background', err));
      }
    }
    if (this.statusNotification) {
      pageEventBus.emit('dismiss_notification', { id: this.statusNotification });
      this.statusNotification = null;
    }
  }

  async cleanup() {
    this.cancelAllTranslations();
    this.translationRequests.clear();
    this.logger.debug('TranslationOrchestrator cleanup completed');
  }

  getDebugInfo() {
    return { activeRequests: this.translationRequests.size };
  }
}