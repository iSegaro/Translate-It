// Handler for testing provider connection from Vue apps
import { ApiKeyManager } from '@/features/translation/providers/ApiKeyManager.js';
import { MessageFormat } from '@/shared/messaging/core/MessagingCore.js';

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

function createValidationResponse(providerId, testResult) {
  const result = testResult && typeof testResult === 'object'
    ? testResult
    : { allInvalid: true };
  const success = result.allInvalid === false;
  const message = success ? 'Connection successful' : 'Connection failed';

  return {
    success,
    data: {
      ...result,
      provider: providerId,
      providerId,
      success,
      message,
      testResult: result,
    },
    ...(!success && { message }),
  };
}

export async function handleTestProviderConnection(message) {
  const providerId = message?.data?.provider;

  try {
    const { keys, context } = getProviderTestInput(message?.data?.config);
    const testResult = await ApiKeyManager.testKeysDirect(keys, providerId, context);
    return createValidationResponse(providerId, testResult);
  } catch (error) {
    const errorResponse = MessageFormat.createErrorResponse(
      error,
      message?.messageId || null,
      {
        context: error?.context || 'provider-test',
        providerId: error?.providerId || providerId,
      }
    );

    return {
      ...errorResponse,
      data: {
        provider: providerId,
        providerId,
        success: false,
        message: errorResponse.errorDetails.message || 'Connection failed',
        error: errorResponse.error,
        errorDetails: errorResponse.errorDetails,
      },
    };
  }
}
