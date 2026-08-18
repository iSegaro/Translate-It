import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { isFieldTranslationRequestError } from './translationErrorOwnership.js';

const mocks = vi.hoisted(() => ({
  safeSendMessage: vi.fn(),
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
  getEffectiveProviderAsync: vi.fn(() => Promise.resolve('provider')),
  getSourceLanguageAsync: vi.fn(() => Promise.resolve('auto')),
  getTargetLanguageAsync: vi.fn(() => Promise.resolve('fa')),
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
  storePendingTranslationData: vi.fn(() => ({})),
  getPendingTranslationData: vi.fn(),
  clearPendingTranslationData: (...args) => mocks.clearPendingTranslationData(...args),
  clearPendingNotificationData: (...args) => mocks.clearPendingNotificationData(...args),
  pendingTranslationByToastId: new Map(),
  abortExistingRequest: (...args) => mocks.abortExistingRequest(...args),
  registerAbortController: (...args) => mocks.registerAbortController(...args),
  activeAbortControllers: new WeakMap(),
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
    mocks.abortExistingRequest.mockReturnValue(null);
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
});
