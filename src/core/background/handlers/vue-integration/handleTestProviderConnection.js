// Handler for testing provider connection from Vue apps
import { ApiKeyManager } from '@/features/translation/providers/ApiKeyManager.js';
import { MessageFormat } from '@/shared/messaging/core/MessagingCore.js';

const PROVIDER_VALIDATION_NAMES = Object.freeze({
  openai: 'OpenAI',
  gemini: 'Gemini',
  deepseek: 'DeepSeek',
  openrouter: 'OpenRouter',
  deepl: 'DeepL',
  custom: 'Custom',
});

function resolveProviderName(provider) {
  if (typeof provider !== 'string') return provider;
  const normalizedProvider = provider.trim();
  return PROVIDER_VALIDATION_NAMES[normalizedProvider.toLowerCase()] || normalizedProvider;
}

function getProviderTestInput(config) {
  if (typeof config === 'string') {
    return { keys: config, context: {} };
  }

  const values = config && typeof config === 'object' ? config : {};
  const apiUrl = values.apiUrl ?? values.customUrl;
  const apiModel = values.apiModel ?? values.model;

  return {
    keys: typeof values.apiKey === 'string' ? values.apiKey : '',
    context: {
      ...(apiUrl !== undefined && { apiUrl }),
      ...(apiModel !== undefined && { apiModel }),
    },
  };
}

function createValidationResponse(provider, providerName, testResult) {
  const result = testResult && typeof testResult === 'object'
    ? testResult
    : { allInvalid: true };
  const success = result.allInvalid === false;
  const message = success ? 'Connection successful' : 'Connection failed';

  return {
    success,
    data: {
      ...result,
      provider,
      providerName,
      success,
      message,
      testResult: result,
    },
    ...(!success && { message }),
  };
}

export async function handleTestProviderConnection(message) {
  const provider = message?.data?.provider;
  const providerName = resolveProviderName(provider);

  try {
    const { keys, context } = getProviderTestInput(message?.data?.config);
    const testResult = await ApiKeyManager.testKeysDirect(keys, providerName, context);
    return createValidationResponse(provider, providerName, testResult);
  } catch (error) {
    const errorResponse = MessageFormat.createErrorResponse(
      error,
      message?.messageId || null,
      {
        context: error?.context || 'provider-test',
        providerName: error?.providerName || providerName,
      }
    );

    return {
      ...errorResponse,
      data: {
        provider,
        providerName,
        success: false,
        message: errorResponse.errorDetails.message || 'Connection failed',
        error: errorResponse.error,
        errorDetails: errorResponse.errorDetails,
      },
    };
  }
}
