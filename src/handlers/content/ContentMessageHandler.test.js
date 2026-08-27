import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentMessageHandler } from './ContentMessageHandler.js';
import { TranslationMode } from '@/shared/config/config.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { ActionReasons } from '@/shared/messaging/core/MessagingConstants.js';
import { applyTranslationToTextField } from '../smartTranslationIntegration.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import browser from 'webextension-polyfill';

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      sendMessage: vi.fn(),
    },
  },
}));

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
    constructor() {
      this.eventListeners = [];
    }

    addEventListener(element, event, handler, options = null) {
      if (options) {
        element.addEventListener(event, handler, options);
      } else {
        element.addEventListener(event, handler);
      }
      this.eventListeners.push({ element, event, handler, options });
    }

    trackResource() {}

    cleanup() {
      for (const { element, event, handler, options } of this.eventListeners) {
        if (options) {
          element.removeEventListener(event, handler, options);
        } else {
          element.removeEventListener(event, handler);
        }
      }
      this.eventListeners = [];
    }
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
    ContentMessageHandler.resetInstance();
    vi.clearAllMocks();
    browser.runtime.sendMessage.mockResolvedValue({ success: true });
    handler = new ContentMessageHandler();
    handler.handlers.clear();
    handler.setSelectElementManager(null);
    handler.setPageTranslationManager(null);
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

  it('deactivates once for trusted background Select Element messages', async () => {
    const deactivate = vi.fn().mockResolvedValue(undefined);
    handler.setSelectElementManager({ deactivate });

    await handler.handleDeactivateSelectElementMode({
      data: { fromBackground: true, isExplicitDeactivation: true },
    });

    expect(deactivate).toHaveBeenCalledTimes(1);
    expect(deactivate).toHaveBeenCalledWith({ fromBackground: true });
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

  it('returns normal Page Translation admission rejection unchanged', async () => {
    const rejection = {
      success: false,
      reason: ActionReasons.BUSY_OR_DONE,
    };
    handler.setPageTranslationManager({
      isActive: true,
      translatePage: vi.fn().mockResolvedValue(rejection),
    });

    await expect(handler.handlePageTranslate({ data: {} })).resolves.toBe(rejection);
    expect(handler.pageTranslationManager.translatePage).toHaveBeenCalledWith({});
  });

  it('keeps restore and stop-auto commands on trusted runtime handlers', async () => {
    const restorePage = vi.fn().mockResolvedValue({ success: true });
    const stopAutoTranslation = vi.fn().mockResolvedValue({ success: true });
    handler.setPageTranslationManager({ restorePage, stopAutoTranslation });

    await expect(handler.handlePageRestore()).resolves.toEqual({ success: true });
    await expect(handler.handlePageStopAuto()).resolves.toEqual({ success: true });

    expect(restorePage).toHaveBeenCalledTimes(1);
    expect(stopAutoTranslation).toHaveBeenCalledTimes(1);
  });

  it('keeps cancellation on trusted runtime translation handling', async () => {
    const cancelTranslation = vi.fn().mockResolvedValue({ success: true });
    handler.setPageTranslationManager({ cancelTranslation });

    await expect(handler.handlePageTranslate({ data: { cancel: true } })).resolves.toEqual({
      success: true,
      cancelled: true,
    });

    expect(cancelTranslation).toHaveBeenCalledTimes(1);
  });

  it('routes trusted top-frame lifecycle to MainFrameCoordinator', async () => {
    const handleTrustedPageLifecycle = vi.fn().mockReturnValue({ success: true, aggregated: true });
    const previousCore = window.translateItContentCore;
    window.translateItContentCore = { mainFrameCoordinator: { handleTrustedPageLifecycle } };

    try {
      const relay = {
        frameId: 7,
        action: MessageActions.PAGE_TRANSLATE_PROGRESS,
        data: { translatedCount: 2, totalCount: 3, frameId: 99 },
      };
      await expect(handler.handlePageTranslationLifecycle(
        { data: relay },
        {}
      )).resolves.toEqual({ success: true, aggregated: true });

      expect(handleTrustedPageLifecycle).toHaveBeenCalledWith(relay);
    } finally {
      window.translateItContentCore = previousCore;
    }
  });

  it('installs one child retirement listener after translation participation becomes available', async () => {
    const previousTop = window.top;
    const addEventListener = vi.spyOn(window, 'addEventListener');
    Object.defineProperty(window, 'top', { configurable: true, value: {} });

    try {
      handler.setPageTranslationManager({
        isActive: true,
        acceptedLifecycleSessionId: 'session-a',
        translatePage: vi.fn().mockResolvedValue({ success: true }),
      });

      expect(addEventListener.mock.calls.filter(([event]) => event === 'beforeunload')).toHaveLength(0);

      await handler.handlePageTranslate({ data: {} });
      await handler.handlePageTranslate({ data: {} });

      expect(addEventListener.mock.calls.filter(([event]) => event === 'beforeunload')).toHaveLength(1);
    } finally {
      addEventListener.mockRestore();
      Object.defineProperty(window, 'top', { configurable: true, value: previousTop });
    }
  });

  it('sends child retirement through runtime messaging without payload identity', async () => {
    const previousTop = window.top;
    Object.defineProperty(window, 'top', { configurable: true, value: {} });

    try {
      handler.setPageTranslationManager({
        isActive: true,
        acceptedLifecycleSessionId: 'session-a',
        translatePage: vi.fn().mockResolvedValue({ success: true }),
      });
      await handler.handlePageTranslate({ data: {} });
      browser.runtime.sendMessage.mockClear();

      window.dispatchEvent(new Event('beforeunload'));

      expect(browser.runtime.sendMessage).toHaveBeenCalledTimes(1);
      expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
        action: MessageActions.PAGE_TRANSLATION_FRAME_LIFECYCLE,
        data: {
          action: MessageActions.PAGE_TRANSLATION_FRAME_RETIRED,
          data: { sessionId: 'session-a' },
        },
        context: 'page-translation-frame-retirement',
      });
    } finally {
      Object.defineProperty(window, 'top', { configurable: true, value: previousTop });
    }
  });

  it('does not send child retirement without an accepted session', async () => {
    const previousTop = window.top;
    Object.defineProperty(window, 'top', { configurable: true, value: {} });

    try {
      handler.setPageTranslationManager({
        isActive: true,
        acceptedLifecycleSessionId: null,
        translatePage: vi.fn().mockResolvedValue({ success: true }),
      });
      await handler.handlePageTranslate({ data: {} });
      browser.runtime.sendMessage.mockClear();

      window.dispatchEvent(new Event('beforeunload'));

      expect(browser.runtime.sendMessage).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, 'top', { configurable: true, value: previousTop });
    }
  });

  it('reads latest accepted session when child unloads', async () => {
    const previousTop = window.top;
    Object.defineProperty(window, 'top', { configurable: true, value: {} });

    try {
      const pageTranslationManager = {
        isActive: true,
        acceptedLifecycleSessionId: 'session-a',
        translatePage: vi.fn().mockResolvedValue({ success: true }),
      };
      handler.setPageTranslationManager(pageTranslationManager);
      await handler.handlePageTranslate({ data: {} });
      pageTranslationManager.acceptedLifecycleSessionId = 'session-b';
      browser.runtime.sendMessage.mockClear();

      window.dispatchEvent(new Event('beforeunload'));

      expect(browser.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
        data: {
          action: MessageActions.PAGE_TRANSLATION_FRAME_RETIRED,
          data: { sessionId: 'session-b' },
        },
      }));
    } finally {
      Object.defineProperty(window, 'top', { configurable: true, value: previousTop });
    }
  });

  it('does not install or send child retirement from the top frame', async () => {
    const addEventListener = vi.spyOn(window, 'addEventListener');
    handler.setPageTranslationManager({
      isActive: true,
      translatePage: vi.fn().mockResolvedValue({ success: true }),
    });

    await handler.handlePageTranslate({ data: {} });
    window.dispatchEvent(new Event('beforeunload'));

    expect(addEventListener.mock.calls.filter(([event]) => event === 'beforeunload')).toHaveLength(0);
    expect(browser.runtime.sendMessage).not.toHaveBeenCalled();
    addEventListener.mockRestore();
  });

  it('removes child retirement listener on cleanup and reinstalls one after reinjection', async () => {
    const previousTop = window.top;
    const addEventListener = vi.spyOn(window, 'addEventListener');
    Object.defineProperty(window, 'top', { configurable: true, value: {} });

    try {
      handler.setPageTranslationManager({
        isActive: true,
        acceptedLifecycleSessionId: 'session-a',
        translatePage: vi.fn().mockResolvedValue({ success: true }),
      });
      await handler.handlePageTranslate({ data: {} });
      await handler.cleanup();
      browser.runtime.sendMessage.mockClear();
      window.dispatchEvent(new Event('beforeunload'));
      expect(browser.runtime.sendMessage).not.toHaveBeenCalled();

      ContentMessageHandler.resetInstance();
      handler = new ContentMessageHandler();
      handler.setPageTranslationManager({
        isActive: true,
        acceptedLifecycleSessionId: 'session-b',
        translatePage: vi.fn().mockResolvedValue({ success: true }),
      });
      await handler.handlePageTranslate({ data: {} });
      browser.runtime.sendMessage.mockClear();
      window.dispatchEvent(new Event('beforeunload'));

      expect(addEventListener.mock.calls.filter(([event]) => event === 'beforeunload')).toHaveLength(2);
      expect(browser.runtime.sendMessage).toHaveBeenCalledTimes(1);
    } finally {
      addEventListener.mockRestore();
      Object.defineProperty(window, 'top', { configurable: true, value: previousTop });
    }
  });

  it('rejects lifecycle relay outside the top frame', async () => {
    const previousTop = window.top;
    const previousCore = window.translateItContentCore;
    const handleTrustedPageLifecycle = vi.fn();
    window.translateItContentCore = { mainFrameCoordinator: { handleTrustedPageLifecycle } };

    try {
      Object.defineProperty(window, 'top', { configurable: true, value: {} });

      await expect(handler.handlePageTranslationLifecycle(
        { data: {} },
        {}
      )).resolves.toEqual({ success: false, error: 'Page lifecycle relay requires top frame' });
      expect(handleTrustedPageLifecycle).not.toHaveBeenCalled();
    } finally {
      window.translateItContentCore = previousCore;
      Object.defineProperty(window, 'top', { configurable: true, value: previousTop });
    }
  });

  it('preserves canonical details for thrown Page Translation failures', async () => {
    const originalError = Object.assign(new Error('raw provider response'), {
      type: ErrorTypes.NETWORK_ERROR,
      originalType: ErrorTypes.HTTP_ERROR,
      statusCode: 503,
      context: 'page-translation',
      providerName: 'Provider',
      providerId: 'provider-id',
      code: 'UPSTREAM_FAILURE',
      errorCode: 'E_UPSTREAM',
      operationAborted: false,
      cancellationReason: 'user_action',
      translationOutcome: { committedParentCount: 0 },
    });
    handler.setPageTranslationManager({
      isActive: true,
      translatePage: vi.fn().mockRejectedValue(originalError),
    });
    handler.errorHandler = {
      getErrorForUI: vi.fn().mockResolvedValue({
        message: 'Safe provider failure',
        type: ErrorTypes.NETWORK_ERROR,
      }),
      handle: vi.fn().mockResolvedValue(undefined),
    };

    const response = await handler.handlePageTranslate({ data: {} });

    expect(response).toMatchObject({
      success: false,
      error: 'Safe provider failure',
      errorType: ErrorTypes.NETWORK_ERROR,
      errorDetails: {
        message: 'raw provider response',
        type: ErrorTypes.NETWORK_ERROR,
        originalType: ErrorTypes.HTTP_ERROR,
        statusCode: 503,
        context: 'page-translation',
        providerName: 'Provider',
        providerId: 'provider-id',
        code: 'UPSTREAM_FAILURE',
        errorCode: 'E_UPSTREAM',
        operationAborted: false,
        cancellationReason: 'user_action',
        translationOutcome: { committedParentCount: 0 },
      },
    });
    expect(response.errorDetails).not.toHaveProperty('cause');
    expect(handler.errorHandler.handle).toHaveBeenCalledTimes(1);
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
