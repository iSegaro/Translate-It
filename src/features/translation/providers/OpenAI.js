// src/core/providers/OpenAIProvider.js
import { BaseAIProvider } from "@/features/translation/providers/BaseAIProvider.js";
import {
  getOpenAIApiKeysAsync,
  getOpenAIApiUrlAsync,
  getOpenAIModelAsync,
  getPromptBASEScreenCaptureAsync
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

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'OpenAI');

const OPENAI_REQUEST_CAPABILITIES = Object.freeze({
  'gpt-4o': Object.freeze({ supportsTemperature: true }),
  'gpt-4o-mini': Object.freeze({ supportsTemperature: true }),
});

const getRequestCapabilities = (model) => OPENAI_REQUEST_CAPABILITIES[model] || { supportsTemperature: false };

export class OpenAIProvider extends BaseAIProvider {
  static type = "ai";
  static description = "OpenAI's GPT models (GPT-4, GPT-3.5)";
  static displayName = "OpenAI GPT";

  constructor() {
    super(ProviderNames.OPENAI);
    this.providerSettingKey = 'OPENAI_API_KEY';
  }

  /**
   * Normalizes one raw OpenAI Chat Completion response into a provider-neutral
   * completion record at the adapter boundary. No-op when no selected choice
   * exists; absent facts remain null and raw provider fields do not leak.
   * @private
   */
  _recordOpenAICompletion(data, executionContext) {
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
   * @protected
   */
  async _callAI(systemPrompt, userText, options = {}) {
    const { abortController, sessionId, expectedFormat, isBatch, executionContext, callPurpose, conversationCommitCandidate, conversationParticipates: participationOverride, mode } = options;
    const conversationParticipates = typeof participationOverride === 'boolean'
      ? participationOverride
      : await AIConversationHelper.getConversationParticipation({ callPurpose, translateMode: mode, sessionId });

    const [apiKeys, apiUrl, model] = await Promise.all([
      getOpenAIApiKeysAsync(),
      getOpenAIApiUrlAsync(),
      getOpenAIModelAsync(),
    ]);

    const apiKey = apiKeys.length > 0 ? apiKeys[0] : '';

    this._validateConfig({ apiKey }, ["apiKey"], `${this.providerName.toLowerCase()}-translation`);

    const turnNumber = conversationParticipates
      ? await AIConversationHelper.claimNextTurn(sessionId, this.providerName, { callPurpose, translateMode: mode, conversationParticipates })
      : 1;
    const activeModel = model || "gpt-4o-mini";
    logger.info(`[OpenAI] Model: ${activeModel}${sessionId ? ` (Session: ${sessionId.substring(0, 15)}..., Turn: ${turnNumber})` : ''}`);

    const { messages } = await AIConversationHelper.getConversationMessages(sessionId, this.providerName, userText, systemPrompt, mode, { callPurpose, conversationParticipates });
    const requestCapabilities = getRequestCapabilities(activeModel);

    const fetchOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: activeModel,
        messages: messages,
        max_completion_tokens: 4096,
        ...(requestCapabilities.supportsTemperature && { temperature: 0.1 }),
        // Enforce JSON Mode for both Object and Batch (Array) contracts
        ...((expectedFormat === ResponseFormat.JSON_OBJECT || expectedFormat === ResponseFormat.JSON_ARRAY) && { 
          response_format: { type: "json_object" } 
        })
      }),
    };

    const result = await this._executeRequest({
      url: apiUrl || "https://api.openai.com/v1/chat/completions",
      fetchOptions,
      charCount: fetchOptions.body.length,
      originalCharCount: isBatch ? AITextProcessor.estimateOriginalChars(userText) : userText.length,
      extractResponse: (data) => {
        if (data?.error) {
          throw new Error(`API_ERROR: ${data.error.message || 'Unknown OpenAI Error'}`);
        }
        this._recordOpenAICompletion(data, executionContext);
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

  async _translateImageInternal(base64Image, _sourceLang, targetLang, options = {}) {
    const { abortController, sessionId } = options;

    const [apiKeys, apiUrl, model, promptBase] = await Promise.all([
      getOpenAIApiKeysAsync(),
      getOpenAIApiUrlAsync(),
      getOpenAIModelAsync(),
      getPromptBASEScreenCaptureAsync()
    ]);

    const apiKey = apiKeys.length > 0 ? apiKeys[0] : '';
    const systemPrompt = promptBase.replace("{targetLanguage}", targetLang);

    const messages = [
      {
        role: "user",
        content: [
          { type: "text", text: systemPrompt },
          {
            type: "image_url",
            image_url: { url: `data:image/png;base64,${base64Image}` }
          }
        ]
      }
    ];

    const fetchOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || "gpt-4-vision-preview",
        messages: messages,
        max_tokens: 1000
      }),
    };

    return await this._executeRequest({
      url: apiUrl,
      fetchOptions,
      charCount: AITextProcessor.calculatePayloadChars(messages),
      extractResponse: (data) => {
        if (data?.error) {
          throw new Error(`API_ERROR: ${data.error.message || 'Unknown OpenAI Error'}`);
        }
        return data?.choices?.[0]?.message?.content;
      },
      context: `${this.providerName.toLowerCase()}-image-translation`,
      abortController,
      sessionId,
      updateApiKey: (newKey, options) => {
        if (options && options.headers) {
          options.headers.Authorization = `Bearer ${newKey}`;
        }
      }
    });
  }
}
