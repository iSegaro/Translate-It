// src/core/providers/CustomProvider.js
import { BaseAIProvider } from "@/features/translation/providers/BaseAIProvider.js";
import {
  getCustomApiUrlAsync,
  getCustomApiKeysAsync,
  getCustomApiModelAsync,
} from "@/shared/config/config.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ProviderNames } from "@/features/translation/providers/ProviderConstants.js";
import { AIConversationHelper } from "./utils/AIConversationHelper.js";
import { AITextProcessor } from "./utils/AITextProcessor.js";
import { ResponseFormat } from "@/shared/config/translationConstants.js";
import {
  CompletionProviderFamily,
  createCompletionRecord,
  createUsageRecord,
  normalizeTermination,
} from "@/features/translation/ir/CompletionContract.js";
import { recordProviderCompletion } from "@/features/translation/ir/TranslationOperation.js";

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'Custom');

export class CustomProvider extends BaseAIProvider {
  static type = "ai";
  static description = "Custom OpenAI-compatible API";
  static displayName = "Custom AI";

  constructor() {
    super(ProviderNames.CUSTOM);
    this.providerSettingKey = 'CUSTOM_API_KEY';
  }

  /**
   * Normalizes one raw CustomProvider response into a provider-neutral
   * completion record at the adapter boundary. Optional OpenAI-compatible
   * metadata is recorded when present; absent facts remain null. No-op when
   * no selected choice exists.
   * @private
   */
  _recordCustomCompletion(data, executionContext) {
    const choice = data?.choices?.[0];
    if (!choice) return false;

    return recordProviderCompletion(executionContext, createCompletionRecord({
      provider: this.providerName,
      model: data?.model ?? null,
      termination: normalizeTermination(CompletionProviderFamily.OPENAI_COMPATIBLE, choice?.finish_reason),
      responseId: data?.id ?? null,
      usage: createUsageRecord({
        inputTokens: data?.usage?.prompt_tokens,
        outputTokens: data?.usage?.completion_tokens,
        reasoningTokens: data?.usage?.completion_tokens_details?.reasoning_tokens,
        totalTokens: data?.usage?.total_tokens,
      }),
    }));
  }


  /**
   * Internal implementation of the AI API call.
   * Handles authentication, endpoint resolution, and payload formatting.
   * @protected
   */
  async _callAI(systemPrompt, userText, options = {}) {
    const { abortController, sessionId, expectedFormat, isBatch, executionContext, callPurpose, conversationCommitCandidate, conversationParticipates: participationOverride, mode } = options;
    const conversationParticipates = typeof participationOverride === 'boolean'
      ? participationOverride
      : await AIConversationHelper.getConversationParticipation({ callPurpose, translateMode: mode, sessionId });

    const [apiUrl, apiKeys, model] = await Promise.all([
      getCustomApiUrlAsync(),
      getCustomApiKeysAsync(),
      getCustomApiModelAsync(),
    ]);

    const apiKey = apiKeys.length > 0 ? apiKeys[0] : '';

    this._validateConfig({ apiUrl, model }, ["apiUrl", "model"], `${this.providerName.toLowerCase()}-translation`);

    const turnNumber = conversationParticipates
      ? await AIConversationHelper.claimNextTurn(sessionId, this.providerName, { callPurpose, translateMode: mode, conversationParticipates })
      : 1;
    logger.info(`[Custom] Model: ${model || 'default'}${sessionId ? ` (Session: ${sessionId.substring(0, 15)}..., Turn: ${turnNumber})` : ''}`);

    const { messages } = await AIConversationHelper.getConversationMessages(sessionId, this.providerName, userText, systemPrompt, mode, { callPurpose, conversationParticipates });

    const headers = {
      "Content-Type": "application/json",
    };

    if (apiKey.trim()) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const fetchOptions = {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: model,
        messages: messages,
        max_tokens: 4096,
        // Apply JSON mode if requested by the contract
        ...((expectedFormat === ResponseFormat.JSON_OBJECT || expectedFormat === ResponseFormat.JSON_ARRAY)
          && { response_format: { type: "json_object" } })
      }),
    };

    const result = await this._executeRequest({
      url: apiUrl,
      fetchOptions,
      charCount: fetchOptions.body.length,
      originalCharCount: isBatch ? AITextProcessor.estimateOriginalChars(userText) : userText.length,
      extractResponse: (data) => {
        if (data?.error) {
          throw new Error(`API_ERROR: ${data.error.message || 'Unknown Custom AI Error'}`);
        }
        this._recordCustomCompletion(data, executionContext);
        return data?.choices?.[0]?.message?.content;
      },
      context: `${this.providerName.toLowerCase()}-translation`,
      abortController,
      sessionId,
      executionContext,
      callPurpose,
      updateApiKey: (newKey, options) => {
        if (options && options.headers) {
          options.headers.Authorization = `Bearer ${newKey}`;
        }
      }
    });

    if (sessionId && result && conversationParticipates) {
      if (conversationCommitCandidate) conversationCommitCandidate.stage({ sessionId, userContent: userText, assistantContent: result });
      else await AIConversationHelper.updateSessionHistory(sessionId, userText, result, { callPurpose, translateMode: mode, conversationParticipates });
    }

    return result;
  }

  _validateConfig(config, requiredFields, context) {
    super._validateConfig(config, requiredFields, context);
  }
}
