// src/features/translation/providers/WebAI.js
import { BaseAIProvider } from "@/features/translation/providers/BaseAIProvider.js";
import {
  getWebAIApiUrlAsync,
  getWebAIApiModelAsync,
  getAIConversationHistoryEnabledAsync,
  TranslationMode
} from "@/shared/config/config.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ProviderNames } from "@/features/translation/providers/ProviderConstants.js";
import { AIConversationHelper } from "./utils/AIConversationHelper.js";
import { AITextProcessor } from "./utils/AITextProcessor.js";
import { ResponseFormat } from "@/shared/config/translationConstants.js";
import { CompletionTermination, createCompletionRecord } from "@/features/translation/ir/CompletionContract.js";
import { recordProviderCompletion } from "@/features/translation/ir/TranslationOperation.js";

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'WebAI');

export class WebAIProvider extends BaseAIProvider {
  static type = "ai";
  static description = "WebAI service";
  static displayName = "WebAI";

  constructor() {
    super(ProviderNames.WEBAI);
  }

  /**
   * Records a content-only completion for the WebAI /translate endpoint.
   *
   * The current WebAI protocol exposes only `response` text — no model,
   * finish reason, usage, or completion identity. The record therefore
   * carries absent metadata (null/UNKNOWN) rather than fabricating facts
   * from request configuration. No completion record is created for a
   * malformed response.
   * @private
   */
  _recordWebAICompletion(data, executionContext) {
    if (typeof data?.response !== 'string') return false;

    return recordProviderCompletion(executionContext, createCompletionRecord({
      provider: this.providerName,
      model: null,
      termination: CompletionTermination.UNKNOWN,
      responseId: null,
      usage: null,
    }));
  }

  /**
   * Internal implementation of the WebAI API call.
   * @protected
   */
  async _callAI(systemPrompt, userText, options = {}) {
    const { abortController, sessionId, expectedFormat, isBatch, executionContext, callPurpose, conversationCommitCandidate } = options;

    const [apiUrl, apiModel] = await Promise.all([
      getWebAIApiUrlAsync(),
      getWebAIApiModelAsync(),
    ]);

    this._validateConfig({ apiUrl, apiModel }, ["apiUrl", "apiModel"], `${this.providerName.toLowerCase()}-translation`);

    const historyEnabled = await getAIConversationHistoryEnabledAsync();
    const shouldUseConversationHistory =
      historyEnabled && options.mode === TranslationMode.Select_Element;

    const turnNumber = shouldUseConversationHistory
      ? await AIConversationHelper.claimNextTurn(sessionId, this.providerName, { callPurpose })
      : null;
    logger.info(`[WebAI] Model: ${apiModel}${sessionId ? ` (Session: ${sessionId.substring(0, 15)}...${turnNumber ? `, Turn: ${turnNumber}` : ''})` : ''}`);

    // WebAI uses a single prompt string instead of separate messages
    // We combine the system prompt and user text into a final message
    const historyContext = shouldUseConversationHistory
      ? await AIConversationHelper.formatCompactHistoryContext(sessionId, options.mode, {
          maxChars: 300,
          callPurpose
        })
      : '';

    const finalMessage = [
      systemPrompt,
      historyContext
    ].filter(Boolean).join('\n\n') + `\n\nText to translate:\n${userText}`;

    const fetchOptions = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: finalMessage,
        model: apiModel,
        images: [],
        max_tokens: 4096,
        // Enforce JSON Mode for both Object and Batch (Array) contracts
        ...((expectedFormat === ResponseFormat.JSON_OBJECT || expectedFormat === ResponseFormat.JSON_ARRAY) && { 
          response_format: { type: "json_object" } 
        })
      }),
    };

    const result = await this._executeRequest({
      url: apiUrl,
      fetchOptions,
      charCount: fetchOptions.body.length,
      originalCharCount: isBatch ? AITextProcessor.estimateOriginalChars(userText) : userText.length,
      extractResponse: (data) => {
        this._recordWebAICompletion(data, executionContext);
        return typeof data.response === "string" ? data.response : undefined;
      },
      context: `${this.providerName.toLowerCase()}-translation`,
      abortController,
      sessionId,
      executionContext,
      callPurpose
    });

    if (shouldUseConversationHistory && sessionId && result) {
      if (conversationCommitCandidate) conversationCommitCandidate.stage({ sessionId, userContent: userText, assistantContent: result });
      else await AIConversationHelper.updateSessionHistory(sessionId, userText, result, { callPurpose });
    }
    
    return result;
  }
}

export default WebAIProvider;
