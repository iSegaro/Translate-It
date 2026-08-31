import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { ProviderRegistryIds } from '@/features/translation/providers/ProviderConstants.js';
import { handleTestProviderConnection } from './handleTestProviderConnection.js';

const mocks = vi.hoisted(() => ({
  testKeysDirect: vi.fn(),
}));

vi.mock('@/features/translation/providers/ApiKeyManager.js', () => ({
  ApiKeyManager: mocks,
}));

describe('handleTestProviderConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete globalThis.backgroundService;
  });

  it('uses ApiKeyManager and reports successful validation consistently', async () => {
    const testResult = {
      valid: ['secret-key'],
      invalid: [],
      allInvalid: false,
      messageKey: 'api_test_result_partial',
      params: { valid: 1, invalid: 0 },
      reorderedString: 'secret-key',
    };
    mocks.testKeysDirect.mockResolvedValue(testResult);
    const legacyTestProvider = vi.fn();
    globalThis.backgroundService = { translationEngine: { testProvider: legacyTestProvider } };

    const response = await handleTestProviderConnection({
      messageId: 'provider-test-success',
      data: {
        provider: 'custom',
        config: {
          apiKey: 'secret-key',
          customUrl: 'https://example.com/v1/chat/completions',
          model: 'local-model',
        },
      },
    });

    expect(mocks.testKeysDirect).toHaveBeenCalledWith(
      'secret-key',
      ProviderRegistryIds.CUSTOM,
      {
        apiUrl: 'https://example.com/v1/chat/completions',
        apiModel: 'local-model',
      }
    );
    expect(response).toMatchObject({
      success: true,
      data: {
        provider: 'custom',
        providerId: 'custom',
        success: true,
        message: 'Connection successful',
        testResult,
        messageKey: testResult.messageKey,
      },
    });
    expect(legacyTestProvider).not.toHaveBeenCalled();
  });

  it.each([
    ProviderRegistryIds.DEEPL,
    ProviderRegistryIds.OPENAI,
    ProviderRegistryIds.CUSTOM,
  ])('passes registry provider %s unchanged', async (providerId) => {
    mocks.testKeysDirect.mockResolvedValue({ allInvalid: false });

    await handleTestProviderConnection({
      data: { provider: providerId, config: { apiKey: 'secret-key' } },
    });

    expect(mocks.testKeysDirect).toHaveBeenCalledWith(
      'secret-key',
      providerId,
      {}
    );
  });

  it('preserves unsaved DeepL tier in provider test context', async () => {
    mocks.testKeysDirect.mockResolvedValue({ allInvalid: false });

    await handleTestProviderConnection({
      data: {
        provider: ProviderRegistryIds.DEEPL,
        config: {
          apiKey: 'secret-key',
          apiTier: 'pro',
        },
      },
    });

    expect(mocks.testKeysDirect).toHaveBeenCalledWith(
      'secret-key',
      ProviderRegistryIds.DEEPL,
      { apiTier: 'pro' }
    );
  });

  it('reports invalid validation without contradictory success flags', async () => {
    const testResult = {
      valid: [],
      invalid: ['bad-key'],
      allInvalid: true,
      messageKey: 'api_test_result_all_invalid',
      params: { count: 1 },
      reorderedString: 'bad-key',
    };
    mocks.testKeysDirect.mockResolvedValue(testResult);

    const response = await handleTestProviderConnection({
      data: {
        provider: ProviderRegistryIds.OPENAI,
        config: { apiKey: 'bad-key' },
      },
    });

    expect(response).toMatchObject({
      success: false,
      message: 'Connection failed',
      data: {
        success: false,
        message: 'Connection failed',
        testResult,
        messageKey: testResult.messageKey,
      },
    });
    expect(response.success).toBe(response.data.success);
  });

  it('preserves canonical fields for structured thrown errors', async () => {
    const error = Object.assign(new Error('Model route rejected'), {
      type: ErrorTypes.HTTP_ERROR,
      originalType: ErrorTypes.MODEL_MISSING,
      statusCode: 404,
      code: 'model_not_found',
      errorCode: 'E_MODEL_NOT_FOUND',
      context: 'custom-translation',
      providerName: 'Custom',
      providerId: 'custom-provider',
      translationOutcome: { partial: false },
    });
    mocks.testKeysDirect.mockRejectedValue(error);

    const response = await handleTestProviderConnection({
      messageId: 'provider-test-structured-error',
      data: { provider: 'custom', config: { apiKey: 'secret-key' } },
    });

    expect(response).toMatchObject({
      success: false,
      error: {
        message: 'Model route rejected',
        type: ErrorTypes.HTTP_ERROR,
        originalType: ErrorTypes.MODEL_MISSING,
        statusCode: 404,
        code: 'model_not_found',
        errorCode: 'E_MODEL_NOT_FOUND',
        context: 'custom-translation',
        providerName: 'Custom',
        providerId: 'custom-provider',
        translationOutcome: { partial: false },
      },
      errorDetails: expect.objectContaining({
        type: ErrorTypes.HTTP_ERROR,
        originalType: ErrorTypes.MODEL_MISSING,
      }),
      data: {
        success: false,
        errorDetails: expect.objectContaining({ statusCode: 404 }),
        providerId: 'custom',
      },
    });
  });

  it('returns stable serialized fallback for plain errors', async () => {
    mocks.testKeysDirect.mockRejectedValue(new Error('Connection unavailable'));

    const response = await handleTestProviderConnection({
      data: { provider: 'openai', config: { apiKey: 'secret-key' } },
    });

    expect(response).toMatchObject({
      success: false,
      error: { message: 'Connection unavailable' },
      errorDetails: { message: 'Connection unavailable' },
      data: {
        success: false,
        message: 'Connection unavailable',
      },
    });
  });

  it('handles missing message data without crashing', async () => {
    mocks.testKeysDirect.mockResolvedValue({
      valid: [],
      invalid: [],
      allInvalid: true,
      messageKey: 'api_test_unknown_provider',
    });

    const response = await handleTestProviderConnection({});

    expect(response.success).toBe(false);
    expect(response.data.success).toBe(false);
    expect(mocks.testKeysDirect).toHaveBeenCalledWith('', undefined, {});
  });
});
