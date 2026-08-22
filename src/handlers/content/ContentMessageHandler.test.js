import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentMessageHandler } from './ContentMessageHandler.js';
import { TranslationMode } from '@/shared/config/config.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { applyTranslationToTextField } from '../smartTranslationIntegration.js';

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    init: vi.fn(),
    warn: vi.fn(),
  })),
}));

vi.mock('@/core/memory/ResourceTracker.js', () => ({
  default: class ResourceTracker {
    constructor() {}
    trackResource() {}
    cleanup() {}
  },
}));

vi.mock('@/shared/error-management/ErrorHandler.js', () => ({
  ErrorHandler: {
    getInstance: vi.fn(() => ({ handle: vi.fn() })),
  },
}));

vi.mock('@/features/element-selection/utils/activationError.js', () => ({
  getSelectElementActivationErrorMessage: vi.fn(() => Promise.resolve('Could not activate Select Element mode.')),
}));

vi.mock('./RevertHandler.js', () => ({
  revertHandler: { executeRevert: vi.fn() },
}));

vi.mock('../smartTranslationIntegration.js', () => ({
  applyTranslationToTextField: vi.fn(),
}));

vi.mock('@/core/PageEventBus.js', () => ({
  pageEventBus: { emit: vi.fn() },
}));

describe('ContentMessageHandler iframe Select Element activation', () => {
  let handler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new ContentMessageHandler();
    handler.handlers.clear();
    handler.setSelectElementManager(null);
  });

  it('sanitizes direct iframe activation failures', async () => {
    const technicalMessage = 'chrome.runtime.lastError: Receiving end does not exist INTERNAL_PORT_9f81';
    handler.setSelectElementManager({
      isInitialized: true,
      activateSelectElementMode: vi.fn().mockRejectedValue(new Error(technicalMessage)),
    });

    const response = await handler.handleIFrameActivateSelectElement();

    expect(response).toMatchObject({
      success: false,
      message: 'Could not activate Select Element mode.',
      error: 'Could not activate Select Element mode.',
      errorType: ErrorTypes.SELECT_ELEMENT,
    });
    expect(JSON.stringify(response)).not.toContain('INTERNAL_PORT_9f81');
    expect(JSON.stringify(response)).not.toContain('Receiving end does not exist');
  });

  it('sanitizes coordinate activation failures through the same boundary', async () => {
    handler.setSelectElementManager({
      isInitialized: true,
      activateSelectElementMode: vi.fn().mockRejectedValue(new Error('internal coordinate failure')),
    });

    const response = await handler.handleIFrameCoordinateOperation({
      operation: TranslationMode.Select_Element,
    });

    expect(response).toMatchObject({
      success: false,
      error: 'Could not activate Select Element mode.',
      errorType: ErrorTypes.SELECT_ELEMENT,
    });
  });

  it('preserves successful iframe activation response fields', async () => {
    handler.setSelectElementManager({
      isInitialized: true,
      activateSelectElementMode: vi.fn().mockResolvedValue({
        isActive: true,
        instanceId: 'manager-1',
      }),
    });

    await expect(handler.handleIFrameActivateSelectElement()).resolves.toEqual({
      success: true,
      activated: true,
      managerId: 'manager-1',
    });
  });

  it('leaves generic non-activation error responses unchanged', async () => {
    const technicalMessage = 'unrelated internal failure';
    handler.registerHandler('UNRELATED_ACTION', async () => {
      throw new Error(technicalMessage);
    });
    const sendResponse = vi.fn();

    await handler.handleMessage({ action: 'UNRELATED_ACTION' }, {}, sendResponse);

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: technicalMessage,
    });
  });

  it('sanitizes ordinary Field response failures before ErrorHandler', async () => {
    const error = {
      message: 'raw provider API response body',
      type: ErrorTypes.API_ERROR,
      originalType: 'HTTP_ERROR',
      statusCode: 503,
      context: 'field-translation',
      providerName: 'Private Provider',
      providerId: 'provider-id',
      code: 'UPSTREAM_FAILURE',
      errorCode: 'E_UPSTREAM',
      translationOutcome: { partial: true },
      responseBody: 'private response body',
      arbitrary: { ignored: true }
    };
    handler.errorHandler = {
      getErrorForUI: vi.fn(),
      handle: vi.fn().mockResolvedValue(undefined)
    };

    const thrown = await handler.handleTranslationResult({
      data: {
        translationMode: TranslationMode.Field,
        success: false,
        error
      }
    }).catch((value) => value);

    const handledError = handler.errorHandler.handle.mock.calls[0][0];
    expect(handler.errorHandler.handle).toHaveBeenCalledTimes(1);
    expect(handler.errorHandler.getErrorForUI).not.toHaveBeenCalled();
    expect(handledError).toBe(thrown);
    expect(handledError).not.toBe(error);
    expect(handledError.message).not.toContain('raw provider API response body');
    expect(handledError.message).not.toContain('Private Provider');
    expect(handledError).not.toHaveProperty('statusCode');
    expect(handledError).not.toHaveProperty('originalType');
    expect(handledError).not.toHaveProperty('providerName');
    expect(handledError).not.toHaveProperty('providerId');
    expect(handledError).not.toHaveProperty('code');
    expect(handledError).not.toHaveProperty('errorCode');
    expect(handledError).not.toHaveProperty('translationOutcome');
    expect(handledError).not.toHaveProperty('responseBody');
    expect(handledError).not.toHaveProperty('arbitrary');
    expect(handledError.alreadyHandled).toBe(true);
    expect(handledError.cause).toBeInstanceOf(Error);
    expect(Object.prototype.propertyIsEnumerable.call(handledError, 'cause')).toBe(false);
    expect(handler.errorHandler.handle).toHaveBeenCalledWith(handledError, {
      context: 'text-field-translation',
      type: ErrorTypes.API_ERROR,
      showToast: true,
    });
  });

  it('prefers canonical errorDetails over conflicting legacy error', async () => {
    handler.errorHandler = {
      getErrorForUI: vi.fn(),
      handle: vi.fn().mockResolvedValue(undefined),
    };

    const thrown = await handler.handleTranslationResult({
      data: {
        translationMode: TranslationMode.Field,
        success: false,
        error: { message: 'legacy failure', type: 'LEGACY_ERROR' },
        errorDetails: {
          message: 'canonical failure',
          type: ErrorTypes.MODEL_MISSING,
          statusCode: 404,
          providerName: 'Provider',
          code: 'MODEL_NOT_FOUND',
          errorCode: 'E_MODEL',
        },
      },
    }).catch((value) => value);

    expect(handler.errorHandler.handle).toHaveBeenCalledTimes(1);
    expect(handler.errorHandler.handle.mock.calls[0][1]).toMatchObject({
      type: ErrorTypes.MODEL_MISSING,
      context: 'text-field-translation',
    });
    expect(thrown.message).not.toContain('legacy failure');
    expect(applyTranslationToTextField).not.toHaveBeenCalled();
  });

  it('handles errorDetails-only Field failures without applying text', async () => {
    handler.errorHandler = {
      getErrorForUI: vi.fn(),
      handle: vi.fn().mockResolvedValue(undefined),
    };

    const thrown = await handler.handleTranslationResult({
      data: {
        translationMode: TranslationMode.Field,
        success: false,
        errorDetails: {
          message: 'canonical failure',
          type: ErrorTypes.API_KEY_INVALID,
        },
      },
    }).catch((value) => value);

    expect(handler.errorHandler.handle).toHaveBeenCalledTimes(1);
    expect(handler.errorHandler.handle.mock.calls[0][1]).toMatchObject({
      type: ErrorTypes.API_KEY_INVALID,
      context: 'text-field-translation',
    });
    expect(thrown).toBeInstanceOf(Error);
    expect(applyTranslationToTextField).not.toHaveBeenCalled();
  });

  it('falls back to legacy error when errorDetails is malformed', async () => {
    handler.errorHandler = {
      getErrorForUI: vi.fn(),
      handle: vi.fn().mockResolvedValue(undefined),
    };

    const thrown = await handler.handleTranslationResult({
      data: {
        translationMode: TranslationMode.Field,
        success: false,
        error: { message: 'legacy failure', type: ErrorTypes.NETWORK_ERROR },
        errorDetails: { arbitrary: true },
      },
    }).catch((value) => value);

    expect(handler.errorHandler.handle).toHaveBeenCalledTimes(1);
    expect(handler.errorHandler.handle.mock.calls[0][1]).toMatchObject({
      type: ErrorTypes.NETWORK_ERROR,
      context: 'text-field-translation',
    });
    expect(thrown.message).not.toContain('legacy failure');
    expect(applyTranslationToTextField).not.toHaveBeenCalled();
  });

  it.each([
    ErrorTypes.HTTP_ERROR,
    ErrorTypes.NETWORK_ERROR,
    ErrorTypes.SERVER_ERROR,
    ErrorTypes.TRANSLATION_TIMEOUT,
    ErrorTypes.API_RESPONSE_INVALID,
    ErrorTypes.JSON_PARSING_ERROR,
  ])('uses adapted safe Error for %s without duplicate presentation', async (type) => {
    const error = Object.assign(new Error(`raw ${type} parser/provider detail`), {
      type,
      statusCode: 502,
    });
    handler.errorHandler = {
      getErrorForUI: vi.fn(),
      handle: vi.fn().mockResolvedValue(undefined),
    };

    const thrown = await handler.handleTranslationResult({
      data: {
        translationMode: TranslationMode.Field,
        success: false,
        error,
      },
    }).catch((value) => value);

    expect(handler.errorHandler.handle).toHaveBeenCalledTimes(1);
    expect(handler.errorHandler.getErrorForUI).not.toHaveBeenCalled();
    expect(thrown).toBe(handler.errorHandler.handle.mock.calls[0][0]);
    expect(thrown.message).not.toContain(`raw ${type}`);
    expect(thrown.alreadyHandled).toBe(true);
    expect(handler.errorHandler.handle.mock.calls[0][1]).toMatchObject({
      context: 'text-field-translation',
      type,
      showToast: true,
    });
  });

  it('uses safe fallback for generic Field response failures', async () => {
    const error = { message: 'raw untyped provider detail' };
    handler.errorHandler = {
      getErrorForUI: vi.fn(),
      handle: vi.fn().mockResolvedValue(undefined),
    };

    const thrown = await handler.handleTranslationResult({
      data: {
        translationMode: TranslationMode.Field,
        success: false,
        error,
      },
    }).catch((value) => value);

    expect(handler.errorHandler.handle).toHaveBeenCalledTimes(1);
    expect(thrown.message).not.toContain('raw untyped provider detail');
    expect(handler.errorHandler.handle.mock.calls[0][0].type).toBe(ErrorTypes.TRANSLATION_FAILED);
    expect(handler.errorHandler.handle.mock.calls[0][1].type).toBe(ErrorTypes.UNKNOWN);
  });

  it.each([
    { type: ErrorTypes.USER_CANCELLED, message: 'cancelled' },
    { type: ErrorTypes.TRANSLATION_CANCELLED, message: 'cancelled' },
    { type: ErrorTypes.EXTENSION_CONTEXT_INVALIDATED, message: 'context invalidated' },
  ])('keeps $type response failure silent', async (error) => {
    handler.errorHandler = {
      getErrorForUI: vi.fn(),
      handle: vi.fn().mockResolvedValue(undefined),
    };

    const thrown = await handler.handleTranslationResult({
      data: {
        translationMode: TranslationMode.Field,
        success: false,
        error,
      },
    }).catch((value) => value);

    expect(handler.errorHandler.handle).not.toHaveBeenCalled();
    expect(handler.errorHandler.getErrorForUI).not.toHaveBeenCalled();
    expect(thrown.alreadyHandled).toBe(true);
    expect(thrown.type).toBe(error.type);
  });

  it('keeps Field application failure handling unchanged', async () => {
    const applicationError = new Error('DOM mutation failed');
    handler.errorHandler = {
      getErrorForUI: vi.fn().mockResolvedValue({ type: ErrorTypes.UI, message: 'safe application error' }),
      handle: vi.fn().mockResolvedValue(undefined),
    };
    const { applyTranslationToTextField } = await import('../smartTranslationIntegration.js');
    applyTranslationToTextField.mockRejectedValue(applicationError);

    await expect(handler.handleTranslationResult({
      data: {
        translationMode: TranslationMode.Field,
        success: true,
        translatedText: 'translated',
        originalText: 'original',
      },
    })).rejects.toBe(applicationError);

    expect(handler.errorHandler.getErrorForUI).toHaveBeenCalledWith(applicationError, 'text-field-application');
    expect(handler.errorHandler.handle).toHaveBeenCalledWith(applicationError, expect.objectContaining({
      context: 'text-field-application',
      showToast: true,
    }));
  });
});
