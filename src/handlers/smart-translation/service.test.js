import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { isFieldTranslationRequestError } from './translationErrorOwnership.js';

const mocks = vi.hoisted(() => ({
  safeSendMessage: vi.fn(),
  getEffectiveProviderAsync: vi.fn(() => Promise.resolve('provider')),
  getSourceLanguageAsync: vi.fn(() => Promise.resolve('auto')),
  getTargetLanguageAsync: vi.fn(() => Promise.resolve('fa')),
  applyTranslationToTextField: vi.fn(),
  determineReplaceMode: vi.fn(),
  showStatus: vi.fn(() => 'toast-1'),
  update: vi.fn(),
  dismiss: vi.fn(),
  show: vi.fn(),
  clearPendingTranslationData: vi.fn(),
  clearPendingNotificationData: vi.fn(),
  abortExistingRequest: vi.fn(() => null),
  registerAbortController: vi.fn(),
  storePendingTranslationData: vi.fn(),
  pendingTranslationData: new WeakMap(),
  pendingTranslationByToastId: new Map(),
  activeAbortControllers: new WeakMap(),
  trackerRequests: new Map(),
  trackTimeout: vi.fn((callback, delay) => setTimeout(callback, delay)),
  clearTimer: vi.fn((timer) => clearTimeout(timer)),
}));

vi.mock('@/core/managers/core/NotificationManager.js', () => ({
  default: class NotificationManager {
    showStatus(...args) { return mocks.showStatus(...args); }
    update(...args) { return mocks.update(...args); }
    dismiss(...args) { return mocks.dismiss(...args); }
    show(...args) { return mocks.show(...args); }
  },
}));

vi.mock('@/shared/messaging/core/UnifiedMessaging.js', () => ({
  safeSendMessage: mocks.safeSendMessage,
}));

vi.mock('@/shared/messaging/core/MessagingCore.js', () => ({
  MessageFormat: {
    create: vi.fn((action, data, context, messageId) => ({ action, data, context, messageId })),
  },
  MessagingContexts: { CONTENT: 'content' },
}));

vi.mock('@/shared/messaging/core/MessageActions.js', () => ({
  MessageActions: {
    TRANSLATE: 'TRANSLATE',
    CANCEL_TRANSLATION: 'CANCEL_TRANSLATION',
  },
}));

vi.mock('@/shared/config/config.js', () => ({
  TranslationMode: { Field: 'field' },
  getEffectiveProviderAsync: (...args) => mocks.getEffectiveProviderAsync(...args),
  getSourceLanguageAsync: (...args) => mocks.getSourceLanguageAsync(...args),
  getTargetLanguageAsync: (...args) => mocks.getTargetLanguageAsync(...args),
}));

vi.mock('@/utils/browser/compatibility.js', () => ({
  detectSite: vi.fn(() => 'default'),
}));

vi.mock('@/utils/i18n/i18n.js', () => ({
  getTranslationString: vi.fn(() => Promise.resolve('Translating...')),
}));

vi.mock('@/core/contextCore.js', () => ({
  isValidSync: vi.fn(() => true),
  isContextError: vi.fn(() => false),
  contextState: { isInvalidated: false, notificationShown: false },
  ENVIRONMENTS: { CONTENT: 'content', BACKGROUND: 'background' },
  getActiveEnvironment: vi.fn(() => 'content'),
}));

vi.mock('@/core/contextErrorHandler.js', () => ({
  handleContextError: vi.fn(),
}));

vi.mock('./state.js', () => ({
  resourceTracker: {
    trackTimeout: (...args) => mocks.trackTimeout(...args),
    clearTimer: (...args) => mocks.clearTimer(...args),
  },
  processedMessageIds: new Set(),
  activeProcessing: new Map(),
  successfullyCompletedToastIds: new Set(),
}));

vi.mock('./dataStore.js', () => ({
  storePendingTranslationData: (...args) => mocks.storePendingTranslationData(...args),
  getPendingTranslationData: vi.fn(),
  clearPendingTranslationData: (...args) => mocks.clearPendingTranslationData(...args),
  clearPendingNotificationData: (...args) => mocks.clearPendingNotificationData(...args),
  pendingTranslationByToastId: mocks.pendingTranslationByToastId,
  abortExistingRequest: (...args) => mocks.abortExistingRequest(...args),
  registerAbortController: (...args) => mocks.registerAbortController(...args),
  activeAbortControllers: mocks.activeAbortControllers,
}));

vi.mock('./executor.js', () => ({
  determineReplaceMode: (...args) => mocks.determineReplaceMode(...args),
  applyTranslation: vi.fn(),
}));

vi.mock('@/shared/utils/text/markdown.js', () => ({
  SimpleMarkdown: { getCleanTranslation: vi.fn((text) => text) },
  ExtractionStrategy: { FULL_TEXT: 'full-text' },
}));

import { translateFieldViaSmartHandler } from './service.js';

const target = { tagName: 'TEXTAREA', value: 'original text' };

describe('translateFieldViaSmartHandler translation ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pendingTranslationByToastId.clear();
    mocks.pendingTranslationData = new WeakMap();
    mocks.activeAbortControllers.delete(target);
    mocks.trackerRequests.clear();
    mocks.storePendingTranslationData.mockImplementation((target, mode, platform, tabId, selectionRange, timestamp, toastId, messageId) => {
      const data = {
        target,
        mode,
        platform,
        tabId,
        selectionRange,
        timestamp,
        toastId,
        messageId,
      };
      mocks.pendingTranslationData.set(target, data);
      if (toastId) mocks.pendingTranslationByToastId.set(toastId, data);
      if (messageId) mocks.trackerRequests.set(messageId, { data, status: 'pending' });
      return data;
    });
    mocks.registerAbortController.mockImplementation((target, controller) => {
      mocks.activeAbortControllers.set(target, controller);
    });
    mocks.abortExistingRequest.mockImplementation((target) => {
      const controller = mocks.activeAbortControllers.get(target);
      if (!controller) return null;
      const data = mocks.pendingTranslationData.get(target);
      if (data) data.abortedForReplacement = true;
      controller.abort('New request started');
      mocks.activeAbortControllers.delete(target);
      return data || null;
    });
    mocks.clearPendingTranslationData.mockImplementation((toastId) => {
      window.pendingTranslationTarget = null;
      window.pendingTranslationToastId = null;
      if (!toastId) return;
      const data = mocks.pendingTranslationByToastId.get(toastId);
      if (data && !data.processed) mocks.pendingTranslationByToastId.delete(toastId);
    });
    mocks.getEffectiveProviderAsync.mockImplementation(() => Promise.resolve('provider'));
    mocks.getSourceLanguageAsync.mockImplementation(() => Promise.resolve('auto'));
    mocks.getTargetLanguageAsync.mockImplementation(() => Promise.resolve('fa'));
    mocks.determineReplaceMode.mockResolvedValue(true);
    mocks.safeSendMessage.mockResolvedValue({
      success: true,
      translatedText: 'translated text',
      originalText: 'original text',
    });
    mocks.applyTranslationToTextField.mockResolvedValue({ applied: true, mode: 'replace' });
  });

  it('marks failed provider responses after existing failure cleanup', async () => {
    const error = Object.assign(new Error('raw provider failure'), {
      type: ErrorTypes.API_ERROR,
      statusCode: 502,
    });
    mocks.safeSendMessage.mockResolvedValue({ success: false, error });

    await expect(translateFieldViaSmartHandler({ text: 'hello', target }))
      .rejects.toBe(error);

    expect(isFieldTranslationRequestError(error)).toBe(true);
    expect(mocks.dismiss).toHaveBeenCalled();
    expect(mocks.clearPendingTranslationData).toHaveBeenCalled();
    expect(mocks.clearPendingNotificationData).toHaveBeenCalled();
    expect(mocks.applyTranslationToTextField).not.toHaveBeenCalled();
  });

  it('marks reconstructed transport rejection', async () => {
    const error = Object.assign(new Error('raw transport failure'), {
      type: ErrorTypes.NETWORK_ERROR,
      statusCode: 503,
    });
    mocks.safeSendMessage.mockRejectedValue(error);

    await expect(translateFieldViaSmartHandler({ text: 'hello', target }))
      .rejects.toBe(error);

    expect(isFieldTranslationRequestError(error)).toBe(true);
    expect(mocks.applyTranslationToTextField).not.toHaveBeenCalled();
  });

  it('marks local translation timeout', async () => {
    mocks.trackTimeout.mockImplementationOnce((callback) => {
      callback();
      return 1;
    });
    mocks.safeSendMessage.mockImplementation((message) => (
      message?.action === 'CANCEL_TRANSLATION'
        ? Promise.resolve(null)
        : new Promise(() => {})
    ));

    const promise = translateFieldViaSmartHandler({ text: 'hello', target });

    await expect(promise).rejects.toMatchObject({ type: ErrorTypes.TRANSLATION_TIMEOUT });
    const thrownError = await promise.catch((error) => error);
    expect(isFieldTranslationRequestError(thrownError)).toBe(true);
    expect(mocks.dismiss).toHaveBeenCalled();
    expect(mocks.clearPendingTranslationData).toHaveBeenCalled();
  });

  it('does not mark application failure after request succeeds', async () => {
    const error = new Error('replacement failed');
    mocks.applyTranslationToTextField.mockRejectedValue(error);

    await expect(translateFieldViaSmartHandler({ text: 'hello', target }))
      .resolves.toBeUndefined();

    expect(isFieldTranslationRequestError(error)).toBe(false);
  });

  it('does not mark clipboard failure after request succeeds', async () => {
    const error = new Error('clipboard write failed');
    mocks.applyTranslationToTextField.mockRejectedValue(error);

    await expect(translateFieldViaSmartHandler({ text: 'hello', target }))
      .resolves.toBeUndefined();

    expect(isFieldTranslationRequestError(error)).toBe(false);
  });

  it('keeps user cancellation silent and unmarked', async () => {
    const error = Object.assign(new Error('cancelled'), {
      type: ErrorTypes.USER_CANCELLED,
    });
    mocks.safeSendMessage.mockRejectedValue(error);

    await expect(translateFieldViaSmartHandler({ text: 'hello', target }))
      .rejects.toBe(error);

    expect(isFieldTranslationRequestError(error)).toBe(false);
  });

  it('keeps context invalidation as the existing null return path', async () => {
    mocks.safeSendMessage.mockResolvedValue(null);

    await expect(translateFieldViaSmartHandler({ text: 'hello', target }))
      .resolves.toBeUndefined();

    expect(mocks.dismiss).toHaveBeenCalled();
    expect(mocks.clearPendingTranslationData).toHaveBeenCalled();
    expect(mocks.applyTranslationToTextField).not.toHaveBeenCalled();
  });

  it('characterizes post-registration replacement ownership across A and B', async () => {
    const requestA = { text: 'request A', target };
    const requestB = { text: 'request B', target };
    const translationRequests = new Map();

    mocks.safeSendMessage.mockImplementation((message) => {
      if (message?.action === 'CANCEL_TRANSLATION') return Promise.resolve(null);
      return new Promise((resolve) => {
        translationRequests.set(message.data.options.messageId, resolve);
      });
    });

    const promiseA = translateFieldViaSmartHandler(requestA);
    await vi.waitFor(() => expect(translationRequests.size).toBe(1));
    const [messageIdA] = translationRequests.keys();
    const dataA = mocks.pendingTranslationData.get(target);
    const controllerA = mocks.activeAbortControllers.get(target);
    const toastIdA = dataA.toastId;

    const promiseB = translateFieldViaSmartHandler(requestB);
    await vi.waitFor(() => expect(translationRequests.size).toBe(2));
    const messageIdB = [...translationRequests.keys()].find((id) => id !== messageIdA);
    const dataB = mocks.pendingTranslationData.get(target);
    const controllerB = mocks.activeAbortControllers.get(target);

    expect(controllerB).not.toBe(controllerA);
    expect(dataB).not.toBe(dataA);
    expect(dataA.abortedForReplacement).toBe(true);
    expect(dataB.abortedForReplacement).not.toBe(true);
    expect(dataB.toastId).toBe(toastIdA);
    expect(mocks.pendingTranslationByToastId.get(toastIdA)).toBe(dataB);
    expect(mocks.activeAbortControllers.get(target)).toBe(controllerB);

    expect(mocks.dismiss).not.toHaveBeenCalled();
    expect(mocks.clearPendingTranslationData).not.toHaveBeenCalled();
    expect(mocks.clearPendingNotificationData).not.toHaveBeenCalled();

    await expect(promiseA).resolves.toBeUndefined();
    expect(isFieldTranslationRequestError(await promiseA)).toBe(false);
    expect(mocks.dismiss).not.toHaveBeenCalled();
    expect(mocks.clearPendingTranslationData).not.toHaveBeenCalled();
    expect(mocks.clearPendingNotificationData).not.toHaveBeenCalled();
    expect(mocks.activeAbortControllers.get(target)).toBe(controllerB);

    mocks.applyTranslationToTextField.mockImplementationOnce(async (_text, _original, _mode, toastId) => {
      mocks.dismiss(toastId);
      mocks.clearPendingTranslationData(toastId);
      return { applied: true, mode: 'replace' };
    });
    translationRequests.get(messageIdB)({
      success: true,
      translatedText: 'translated B',
      originalText: 'request B',
    });

    await expect(promiseB).resolves.toBeUndefined();
    expect(mocks.dismiss).toHaveBeenCalledWith(toastIdA);
    expect(mocks.pendingTranslationByToastId.has(toastIdA)).toBe(false);
    expect(mocks.activeAbortControllers.get(target)).toBeUndefined();
    expect(mocks.trackerRequests.get(messageIdA).status).toBe('pending');
    expect(mocks.trackerRequests.get(messageIdB).status).toBe('pending');
  });

  it('characterizes pre-registration race where both requests issue work', async () => {
    let toastCount = 0;
    mocks.showStatus.mockImplementation(() => `toast-${++toastCount}`);
    let resolveProviderA;
    let resolveProviderB;
    const providerA = new Promise((resolve) => { resolveProviderA = resolve; });
    const providerB = new Promise((resolve) => { resolveProviderB = resolve; });
    let providerCall = 0;
    mocks.getEffectiveProviderAsync.mockImplementation(() => {
      providerCall += 1;
      return providerCall === 1 ? providerA : providerB;
    });

    const translationRequests = new Map();
    mocks.safeSendMessage.mockImplementation((message) => {
      if (message?.action === 'CANCEL_TRANSLATION') return Promise.resolve(null);
      return new Promise((resolve) => {
        translationRequests.set(message.data.options.messageId, resolve);
      });
    });

    const promiseA = translateFieldViaSmartHandler({ text: 'request A', target });
    await Promise.resolve();
    expect(mocks.activeAbortControllers.get(target)).toBeUndefined();

    const promiseB = translateFieldViaSmartHandler({ text: 'request B', target });
    resolveProviderB('provider-B');
    await vi.waitFor(() => expect(translationRequests.size).toBe(1));
    const messageIdB = [...translationRequests.keys()][0];
    const controllerB = mocks.activeAbortControllers.get(target);
    const dataB = mocks.pendingTranslationData.get(target);

    resolveProviderA('provider-A');
    await vi.waitFor(() => expect(translationRequests.size).toBe(2));
    const messageIdA = [...translationRequests.keys()].find((id) => id !== messageIdB);
    const dataA = mocks.pendingTranslationData.get(target);

    expect(controllerB).not.toBe(mocks.activeAbortControllers.get(target));
    expect(dataA).not.toBe(dataB);
    expect(dataB.abortedForReplacement).not.toBe(true);
    expect(mocks.pendingTranslationByToastId.get(dataB.toastId)).toBe(dataB);
    expect(mocks.pendingTranslationByToastId.get(dataA.toastId)).toBe(dataA);

    translationRequests.get(messageIdB)({
      success: true,
      translatedText: 'translated B',
      originalText: 'request B',
    });
    translationRequests.get(messageIdA)({
      success: true,
      translatedText: 'translated A',
      originalText: 'request A',
    });

    await expect(promiseB).resolves.toBeUndefined();
    await expect(promiseA).resolves.toBeUndefined();
    expect(isFieldTranslationRequestError(await promiseB)).toBe(false);
    expect(isFieldTranslationRequestError(await promiseA)).toBe(false);
  });
});
