import browser from "webextension-polyfill";
import { applyTranslationsToNodes, expandTextsForTranslation, reassembleTranslations, separateCachedAndNewTexts } from "../../../../utils/text/extraction.js";
import { getScopedLogger } from "../../../../utils/core/logger.js";
import { LOG_COMPONENTS } from "../../../../utils/core/logConstants.js";
import { getTimeoutAsync, TranslationMode } from "../../../../config.js";
import { MessageActions } from "@/messaging/core/MessageActions.js";
import { generateContentMessageId } from "../../../../utils/messaging/messageId.js";
import { TRANSLATION_TIMEOUT_FALLBACK } from "../constants/selectElementConstants.js";

import { getTranslationString } from "../../../../utils/i18n/i18n.js";
import { sendReliable } from "@/messaging/core/ReliableMessaging.js";
import { AUTO_DETECT_VALUE } from "../../../../constants.js";
import { pageEventBus } from '@/utils/core/PageEventBus.js';

export class TranslationOrchestrator {
  constructor(stateManager) {
    this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'TranslationOrchestrator');
    this.stateManager = stateManager;
    this.translationRequests = new Map();
    this.escapeKeyListener = null;
    this.statusNotification = null;
  }

  async initialize() {
    this.logger.debug('TranslationOrchestrator initialized');
  }

  async processSelectedElement(element, originalTextsMap, textNodes) {
    this.logger.operation("Starting advanced translation process for selected element");
    const messageId = generateContentMessageId();

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
        // Show translations in Shadow DOM overlay
        this.showTranslationsInOverlay(element, cachedTranslations, textNodes);
        return;
      }

      if (textsToTranslate.length === 0) {
        this.logger.info("No new texts to translate.");
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
        status: 'pending',
        timestamp: Date.now()
      });

      await this.sendTranslationRequest(messageId, jsonPayload);
      await this.setupTranslationWaiting(messageId, element);

    } catch (error) {
      this.logger.error("Translation process failed", error);
      this.translationRequests.delete(messageId);
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
      const { sendReliable } = await import("../../../../messaging/core/ReliableMessaging.js");
      await sendReliable(translationRequest);

      this.logger.debug("Translation request sent successfully");
    } catch (error) {
      this.logger.error("Failed to send translation request", error);
      throw error;
    }
  }

  async setupTranslationWaiting(messageId, element) {
    this.logger.debug("Setting up translation waiting for message:", messageId);
    const timeout = await getTimeoutAsync() || TRANSLATION_TIMEOUT_FALLBACK;

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Translation timeout after ${timeout}ms`)), timeout);
    });

    try {
      await Promise.race([this.waitForTranslationResult(messageId), timeoutPromise]);
      this.logger.debug("Translation completed successfully for message:", messageId);
    } catch (error) {
      this.logger.error("Translation waiting failed", error);
      const request = this.translationRequests.get(messageId);
      if (request) {
        request.status = 'error';
        request.error = error.message;
      }
      throw error;
    } finally {
      window.isTranslationInProgress = false;
      if (this.statusNotification) {
        pageEventBus.emit('dismiss_notification', { id: this.statusNotification });
        this.statusNotification = null;
      }
    }
  }

  waitForTranslationResult(messageId) {
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const request = this.translationRequests.get(messageId);
        if (!request) {
          clearInterval(checkInterval);
          reject(new Error(`Translation request ${messageId} not found`));
          return;
        }
        if (request.status === 'completed') {
          clearInterval(checkInterval);
          resolve(request.result);
        } else if (request.status === 'error') {
          clearInterval(checkInterval);
          reject(new Error(request.error || 'Translation failed'));
        }
      }, 100);
    });
  }

  async handleTranslationResult(message) {
    const { messageId, data } = message;
    const { success, error, translatedText } = data;

    this.logger.debug("Received translation result:", { messageId, success });

    const request = this.translationRequests.get(messageId);
    if (!request || request.status !== 'pending') {
      this.logger.warn("Received translation result for unknown or completed message:", messageId);
      return;
    }

    try {
      if (success) {
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
        
        // Show translations in Shadow DOM overlay instead of direct DOM manipulation
        this.showTranslationsInOverlay(element, allTranslations, textNodes);

        request.status = 'completed';
        request.result = data;
        this.logger.info("Translation applied successfully to DOM elements", { messageId });
      } else {
        request.status = 'error';
        request.error = error;
        this.logger.error("Translation failed", { messageId, error });
        throw new Error(error || 'Translation failed');
      }
    } catch (e) {
      this.logger.error("Error handling translation result", e);
      request.status = 'error';
      request.error = e.message;
      throw e;
    }
  }

  /**
   * Show translations in Shadow DOM overlay with exact same styling as original
   * @param {HTMLElement} element - The element containing the text nodes
   * @param {Map} translations - Map of original text to translated text
   * @param {Array} textNodes - Array of text nodes that were translated
   */
  showTranslationsInOverlay(element, translations, textNodes) {
    // Extract the full translated text for the element
    let translatedText = '';
    textNodes.forEach(node => {
      const originalText = node.textContent;
      const translated = translations.get(originalText) || originalText;
      translatedText += translated;
    });

    // Show translation in Shadow DOM overlay with exact same styling
    pageEventBus.emit('show-translation', {
      element: element,
      translatedText: translatedText,
      originalText: element.textContent
    });

    this.logger.debug("Translation displayed in Shadow DOM overlay with original styling", {
      element: element.tagName,
      translatedLength: translatedText.length,
      originalLength: element.textContent.length
    });
  }

  cancelAllTranslations() {
    this.logger.operation("Cancelling all ongoing translations");

    for (const [messageId, request] of this.translationRequests) {
      if (request.status === 'pending') {
        request.status = 'cancelled';
        request.error = 'Translation cancelled by user';
        
        // Notify background to cancel the network request
        sendReliable({
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
    this.removeEscapeKeyListener();
    this.logger.debug('TranslationOrchestrator cleanup completed');
  }

  getDebugInfo() {
    return { activeRequests: this.translationRequests.size };
  }
}
