import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { isFieldTranslationRequestError } from './translationErrorOwnership.js';
import { TRANSLATION_TIMEOUT } from './constants.js';

const mocks = vi.hoisted(() => ({
  safeSendMessage: vi.fn(),
  getEffectiveProviderAsync: vi.fn(() => Promise.resolve('provider')),
  getSourceLanguageAsync: vi.fn(() => Promise.resolve('auto')),
  getTargetLanguageAsync: vi.fn(() => Promise.resolve('fa')),
  getTranslationString: vi.fn(() => Promise.resolve('Translating...')),
  detectSite: vi.fn(() => 'default'),
  applyTranslationToTextField: vi.fn(),
  determineReplaceMode: vi.fn(),
  applyTranslation: vi.fn(),
  getPendingTranslationData: vi.fn(),
  showStatus: vi.fn(() => 'toast-1'),
  update: vi.fn(),
  dismiss: vi.fn(),
  show: vi.fn(),
  clearPendingTranslationData: vi.fn(),
  clearPendingNotificationData: vi.fn(),
  beginFieldTranslationRequest: vi.fn(),
  isCurrentFieldTranslationRequest: vi.fn(),
  releaseFieldTranslationRequest: vi.fn(),
  cleanupSupersededFieldTranslationState: vi.fn(),
  storePendingTranslationData: vi.fn(),
  pendingTranslationData: new WeakMap(),
  pendingTranslationByToastId: new Map(),
  activeAbortControllers: new WeakMap(),
  fieldRequestOwners: new WeakMap(),
  trackerRequests: new Map(),
  successfullyCompletedToastIds: new Set(),
  tracker: {
    isRequestActive: vi.fn(),
    completeRequest: vi.fn(),
    failRequest: vi.fn(),
    cancelRequest: vi.fn(),
    markTimeout: vi.fn(),
  },
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
  detectSite: (...args) => mocks.detectSite(...args),
}));

vi.mock('@/utils/i18n/i18n.js', () => ({
  getTranslationString: (...args) => mocks.getTranslationString(...args),
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
  successfullyCompletedToastIds: mocks.successfullyCompletedToastIds,
}));

vi.mock('./dataStore.js', () => ({
  storePendingTranslationData: (...args) => mocks.storePendingTranslationData(...args),
  getPendingTranslationData: (...args) => mocks.getPendingTranslationData(...args),
  clearPendingTranslationData: (...args) => mocks.clearPendingTranslationData(...args),
  clearPendingNotificationData: (...args) => mocks.clearPendingNotificationData(...args),
  pendingTranslationByToastId: mocks.pendingTranslationByToastId,
  beginFieldTranslationRequest: (...args) => mocks.beginFieldTranslationRequest(...args),
  isCurrentFieldTranslationRequest: (...args) => mocks.isCurrentFieldTranslationRequest(...args),
  releaseFieldTranslationRequest: (...args) => mocks.releaseFieldTranslationRequest(...args),
  cleanupSupersededFieldTranslationState: (...args) => mocks.cleanupSupersededFieldTranslationState(...args),
  activeAbortControllers: mocks.activeAbortControllers,
}));

vi.mock('./executor.js', () => ({
  determineReplaceMode: (...args) => mocks.determineReplaceMode(...args),
  applyTranslation: (...args) => mocks.applyTranslation(...args),
}));

vi.mock('@/core/services/translation/TranslationRequestTracker.js', () => ({
  translationRequestTracker: mocks.tracker,
}));

vi.mock('@/shared/utils/text/markdown.js', () => ({
  SimpleMarkdown: { getCleanTranslation: vi.fn((text) => text) },
  ExtractionStrategy: { FULL_TEXT: 'full-text' },
}));

import { applyTranslationToTextField, translateFieldViaSmartHandler } from './service.js';

const target = { tagName: 'TEXTAREA', value: 'original text' };
let toastCount = 0;

describe('translateFieldViaSmartHandler translation ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.showStatus.mockImplementation(() => `toast-${++toastCount}`);
    mocks.pendingTranslationByToastId.clear();
    mocks.pendingTranslationData = new WeakMap();
    mocks.activeAbortControllers.delete(target);
    mocks.fieldRequestOwners = new WeakMap();
    mocks.trackerRequests.clear();
    mocks.successfullyCompletedToastIds.clear();
    mocks.tracker.isRequestActive.mockImplementation((messageId) => {
      const request = mocks.trackerRequests.get(messageId);
      return request && request.status === 'pending';
    });
    mocks.tracker.completeRequest.mockImplementation((messageId, result) => {
      const request = mocks.trackerRequests.get(messageId);
      if (!request || request.status !== 'pending') return { accepted: false, reason: 'already_terminal' };
      request.status = 'completed';
      request.result = result;
      return { accepted: true, status: 'completed', request };
    });
    mocks.tracker.failRequest.mockImplementation((messageId, error) => {
      const request = mocks.trackerRequests.get(messageId);
      if (!request || request.status !== 'pending') return { accepted: false, reason: 'already_terminal' };
      request.status = 'failed';
      request.error = error;
      return { accepted: true, status: 'failed', request };
    });
    mocks.tracker.cancelRequest.mockImplementation((messageId, reason) => {
      const request = mocks.trackerRequests.get(messageId);
      if (!request || request.status !== 'pending') return { accepted: false, reason: 'already_terminal' };
      request.status = 'cancelled';
      request.reason = reason;
      return { accepted: true, status: 'cancelled', request };
    });
    mocks.tracker.markTimeout.mockImplementation((messageId) => {
      const request = mocks.trackerRequests.get(messageId);
      if (!request || request.status !== 'pending') return { accepted: false, reason: 'already_terminal' };
      request.status = 'timeout';
      return { accepted: true, status: 'timeout', request };
    });
    mocks.beginFieldTranslationRequest.mockImplementation((requestTarget) => {
      const previous = mocks.fieldRequestOwners.get(requestTarget) || null;
      if (previous) {
        previous.replaced = true;
        previous.controller.abort('New request started');
      }
      const ownership = {
        target: requestTarget,
        controller: new AbortController(),
        replaced: false,
        data: null,
        toastId: null,
        messageId: null,
      };
      mocks.fieldRequestOwners.set(requestTarget, ownership);
      mocks.activeAbortControllers.set(requestTarget, ownership.controller);
      return { ownership, previous };
    });
    mocks.isCurrentFieldTranslationRequest.mockImplementation((requestTarget, ownership) => (
      mocks.fieldRequestOwners.get(requestTarget) === ownership && !ownership.replaced
    ));
    mocks.releaseFieldTranslationRequest.mockImplementation((requestTarget, ownership) => {
      if (!mocks.isCurrentFieldTranslationRequest(requestTarget, ownership)) return false;
      mocks.fieldRequestOwners.delete(requestTarget);
      mocks.activeAbortControllers.delete(requestTarget);
      return true;
    });
    mocks.storePendingTranslationData.mockImplementation((target, mode, platform, tabId, selectionRange, timestamp, toastId, messageId, ownership) => {
      const data = {
        target,
        mode,
        platform,
        tabId,
        selectionRange,
        timestamp,
        toastId,
        messageId,
        ownership,
      };
      if (ownership) {
        ownership.data = data;
        ownership.toastId = toastId;
        ownership.messageId = messageId;
      }
      mocks.pendingTranslationData.set(target, data);
      if (toastId) mocks.pendingTranslationByToastId.set(toastId, data);
      window.pendingTranslationOwner = ownership;
      window.pendingTranslationTarget = target;
      window.pendingTranslationToastId = toastId;
      if (messageId) mocks.trackerRequests.set(messageId, { messageId, data, status: 'pending' });
      return data;
    });
    mocks.clearPendingTranslationData.mockImplementation((toastId, ownership) => {
      if (ownership?.target && ownership.data
        && mocks.pendingTranslationData.get(ownership.target) === ownership.data) {
        mocks.pendingTranslationData.delete(ownership.target);
      }
      window.pendingTranslationTarget = null;
      window.pendingTranslationToastId = null;
      if (!toastId) return;
      const data = mocks.pendingTranslationByToastId.get(toastId);
      if (data && !data.processed) mocks.pendingTranslationByToastId.delete(toastId);
    });
    mocks.getEffectiveProviderAsync.mockImplementation(() => Promise.resolve('provider'));
    mocks.getSourceLanguageAsync.mockImplementation(() => Promise.resolve('auto'));
    mocks.getTargetLanguageAsync.mockImplementation(() => Promise.resolve('fa'));
    mocks.getTranslationString.mockImplementation(() => Promise.resolve('Translating...'));
    mocks.detectSite.mockImplementation(() => 'default');
    mocks.update.mockImplementation(() => undefined);
    mocks.determineReplaceMode.mockResolvedValue(true);
    mocks.applyTranslation.mockResolvedValue(true);
    mocks.getPendingTranslationData.mockImplementation((_target, toastId, ownership) => (
      ownership?.data || (toastId ? mocks.pendingTranslationByToastId.get(toastId) : null)
    ));
    mocks.safeSendMessage.mockResolvedValue({
      success: true,
      translatedText: 'translated text',
      originalText: 'original text',
    });
    mocks.applyTranslationToTextField.mockImplementation(async (_translatedText, _originalText, _mode, toastId, _messageId, _notifier, ownership) => {
      mocks.clearPendingTranslationData(toastId, ownership);
      return { applied: true, mode: 'replace' };
    });
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
    expect(mocks.pendingTranslationData.get(target)).toBeUndefined();
    const request = [...mocks.trackerRequests.values()][0];
    expect(request.status).toBe('failed');
    expect(mocks.tracker.failRequest).toHaveBeenCalledWith(request.messageId, error);
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
    expect(mocks.pendingTranslationData.get(target)).toBeUndefined();
    expect([...mocks.trackerRequests.values()][0].status).toBe('failed');
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
    expect(mocks.pendingTranslationData.get(target)).toBeUndefined();
    expect([...mocks.trackerRequests.values()][0].status).toBe('timeout');
    expect(mocks.tracker.markTimeout).toHaveBeenCalledTimes(1);
    expect(mocks.tracker.failRequest).not.toHaveBeenCalled();
    expect(mocks.tracker.cancelRequest).not.toHaveBeenCalled();
    expect(mocks.safeSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CANCEL_TRANSLATION' }),
      expect.anything(),
      'text-field-timeout'
    );
    expect(mocks.releaseFieldTranslationRequest).toHaveBeenCalled();
    expect(mocks.tracker.markTimeout.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.releaseFieldTranslationRequest.mock.invocationCallOrder[0]);
  });

  it('preserves timeout ownership when abort listener is already registered', async () => {
    vi.useFakeTimers();

    try {
      mocks.safeSendMessage.mockImplementation((message) => (
        message?.action === 'CANCEL_TRANSLATION'
          ? Promise.resolve(null)
          : new Promise(() => {})
      ));

      const promise = translateFieldViaSmartHandler({ text: 'hello', target });
      await vi.waitFor(() => expect(mocks.trackTimeout).toHaveBeenCalled());
      const ownership = mocks.fieldRequestOwners.get(target);
      const removeAbortListener = vi.spyOn(ownership.controller.signal, 'removeEventListener');
      await vi.advanceTimersByTimeAsync(TRANSLATION_TIMEOUT + 20);

      const error = await promise.catch((caught) => caught);
      expect(error).toMatchObject({ type: ErrorTypes.TRANSLATION_TIMEOUT });
      expect(error.type).not.toBe(ErrorTypes.USER_CANCELLED);
      expect([...mocks.trackerRequests.values()][0].status).toBe('timeout');
      expect(mocks.tracker.markTimeout).toHaveBeenCalledTimes(1);
      expect(mocks.tracker.cancelRequest).not.toHaveBeenCalled();
      expect(removeAbortListener).toHaveBeenCalledWith('abort', expect.any(Function));
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores provider resolution after timeout ownership', async () => {
    vi.useFakeTimers();

    try {
      let resolveProvider;
      mocks.safeSendMessage.mockImplementation((message) => {
        if (message?.action === 'CANCEL_TRANSLATION') return Promise.resolve(null);
        return new Promise((resolve) => { resolveProvider = resolve; });
      });

      const promise = translateFieldViaSmartHandler({ text: 'hello', target });
      await vi.waitFor(() => expect(mocks.trackTimeout).toHaveBeenCalled());
      await vi.advanceTimersByTimeAsync(TRANSLATION_TIMEOUT + 20);
      await expect(promise).rejects.toMatchObject({ type: ErrorTypes.TRANSLATION_TIMEOUT });

      resolveProvider({
        success: true,
        translatedText: 'late result',
        originalText: 'hello',
      });
      await Promise.resolve();

      expect(mocks.applyTranslationToTextField).not.toHaveBeenCalled();
      expect([...mocks.trackerRequests.values()][0].status).toBe('timeout');
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores provider rejection after timeout ownership', async () => {
    vi.useFakeTimers();

    try {
      let rejectProvider;
      mocks.safeSendMessage.mockImplementation((message) => {
        if (message?.action === 'CANCEL_TRANSLATION') return Promise.resolve(null);
        return new Promise((_, reject) => { rejectProvider = reject; });
      });

      const promise = translateFieldViaSmartHandler({ text: 'hello', target });
      await vi.waitFor(() => expect(mocks.trackTimeout).toHaveBeenCalled());
      await vi.advanceTimersByTimeAsync(TRANSLATION_TIMEOUT + 20);
      await expect(promise).rejects.toMatchObject({ type: ErrorTypes.TRANSLATION_TIMEOUT });

      rejectProvider(new Error('late provider failure'));
      await Promise.resolve();

      expect([...mocks.trackerRequests.values()][0].status).toBe('timeout');
      expect(mocks.tracker.failRequest).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not mark application failure after request succeeds', async () => {
    const error = new Error('replacement failed');
    mocks.applyTranslation.mockRejectedValue(error);

    await expect(translateFieldViaSmartHandler({ text: 'hello', target }))
      .resolves.toBeUndefined();

    expect(isFieldTranslationRequestError(error)).toBe(false);
  });

  it('clears current data after application failure', async () => {
    const error = new Error('application failed');
    mocks.applyTranslation.mockRejectedValue(error);

    await expect(translateFieldViaSmartHandler({ text: 'hello', target }))
      .resolves.toBeUndefined();

    expect(mocks.pendingTranslationData.get(target)).toBeUndefined();
    expect([...mocks.trackerRequests.values()][0].status).toBe('failed');
  });

  it('does not mark clipboard failure after request succeeds', async () => {
    const error = new Error('clipboard write failed');
    mocks.applyTranslation.mockRejectedValue(error);

    await expect(translateFieldViaSmartHandler({ text: 'hello', target }))
      .resolves.toBeUndefined();

    expect(isFieldTranslationRequestError(error)).toBe(false);
    expect([...mocks.trackerRequests.values()][0].status).toBe('failed');
  });

  it('completes successful application', async () => {
    await expect(translateFieldViaSmartHandler({ text: 'hello', target })).resolves.toBeUndefined();

    const request = [...mocks.trackerRequests.values()][0];
    expect(request.status).toBe('completed');
    expect(mocks.tracker.completeRequest).toHaveBeenCalledWith(request.messageId, expect.objectContaining({
      success: true,
      result: { applied: true, mode: 'replace' },
    }));
    expect(mocks.pendingTranslationData.get(target)).toBeUndefined();
  });

  it('completes successful clipboard application', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    mocks.determineReplaceMode.mockResolvedValue(false);

    await expect(translateFieldViaSmartHandler({ text: 'hello', target })).resolves.toBeUndefined();

    const request = [...mocks.trackerRequests.values()][0];
    expect(request.status).toBe('completed');
    expect(writeText).toHaveBeenCalledWith('translated text');
    expect(mocks.pendingTranslationData.get(target)).toBeUndefined();
  });

  it('does not start clipboard write after ownership is lost', async () => {
    let current = false;
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    mocks.determineReplaceMode.mockResolvedValue(false);
    const ownership = { target, data: { target, mode: 'field' } };
    mocks.fieldRequestOwners.set(target, ownership);
    mocks.isCurrentFieldTranslationRequest.mockImplementation(() => current);

    const result = await applyTranslationToTextField(
      'translated text',
      'original text',
      'field',
      'clipboard-toast',
      'clipboard-message',
      { update() {}, dismiss() {} },
      ownership
    );

    expect(result).toMatchObject({ applied: false, mode: 'stale' });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('does not report stale clipboard success after write has started', async () => {
    let current = true;
    let resolveWrite;
    const writeText = vi.fn(() => new Promise((resolve) => { resolveWrite = resolve; }));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    mocks.determineReplaceMode.mockResolvedValue(false);
    const ownership = { target, data: { target, mode: 'field' } };
    mocks.fieldRequestOwners.set(target, ownership);
    mocks.isCurrentFieldTranslationRequest.mockImplementation(() => current);

    const application = applyTranslationToTextField(
      'translated text',
      'original text',
      'field',
      'clipboard-toast',
      'clipboard-message',
      { update() {}, dismiss() {} },
      ownership
    );

    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    current = false;
    resolveWrite();

    await expect(application).resolves.toMatchObject({ applied: false, mode: 'stale' });
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it('completes accepted already-completed application result', async () => {
    const toastId = 'already-completed-toast';
    mocks.showStatus.mockReturnValue(toastId);
    mocks.successfullyCompletedToastIds.add(toastId);

    const applicationResult = await applyTranslationToTextField(
      'translated text',
      'original text',
      'field',
      toastId,
      'application-message',
      new (class {
        update() {}
        dismiss() {}
      })()
    );

    expect(applicationResult).toMatchObject({ applied: false, mode: 'already-completed' });

    await expect(translateFieldViaSmartHandler({ text: 'hello', target })).resolves.toBeUndefined();

    const request = [...mocks.trackerRequests.values()][0];
    expect(request.status).toBe('completed');
    expect(request.result.result.mode).toBe('already-completed');
    expect(mocks.tracker.failRequest).not.toHaveBeenCalled();
  });

  it.each([
    ['provider', 'getEffectiveProviderAsync'],
    ['source language', 'getSourceLanguageAsync'],
    ['target language', 'getTargetLanguageAsync'],
  ])('marks %s setup rejection without changing Error identity', async (_phase, getter) => {
    const error = new Error(`${getter} failed`);
    mocks[getter].mockRejectedValue(error);

    await expect(translateFieldViaSmartHandler({ text: 'hello', target }))
      .rejects.toBe(error);

    expect(isFieldTranslationRequestError(error)).toBe(true);
  });

  it.each([
    ['context', { type: ErrorTypes.CONTEXT }],
    ['extension context', { type: ErrorTypes.EXTENSION_CONTEXT_INVALIDATED }],
    ['user cancellation', { type: ErrorTypes.USER_CANCELLED }],
    ['translation cancellation', { type: ErrorTypes.TRANSLATION_CANCELLED }],
  ])('keeps %s setup failure unmarked', async (_name, details) => {
    const error = Object.assign(new Error('setup stopped'), details);
    mocks.getEffectiveProviderAsync.mockRejectedValue(error);

    await expect(translateFieldViaSmartHandler({ text: 'hello', target }))
      .rejects.toBe(error);

    expect(isFieldTranslationRequestError(error)).toBe(false);
  });

  it('marks bare AbortError setup failure as a generic translation error', async () => {
    const error = Object.assign(new Error('setup stopped'), { name: 'AbortError' });
    mocks.getEffectiveProviderAsync.mockRejectedValue(error);

    await expect(translateFieldViaSmartHandler({ text: 'hello', target }))
      .rejects.toBe(error);

    expect(isFieldTranslationRequestError(error)).toBe(true);
  });

  it('keeps i18n failure unmarked', async () => {
    const error = new Error('translation label failed');
    mocks.getTranslationString.mockRejectedValue(error);

    await expect(translateFieldViaSmartHandler({ text: 'hello', target }))
      .rejects.toBe(error);

    expect(isFieldTranslationRequestError(error)).toBe(false);
  });

  it('keeps notification creation failure unmarked', async () => {
    const error = new Error('status notification failed');
    mocks.showStatus.mockImplementation(() => { throw error; });

    await expect(translateFieldViaSmartHandler({ text: 'hello', target }))
      .rejects.toBe(error);

    expect(isFieldTranslationRequestError(error)).toBe(false);
  });

  it('keeps notification update failure unmarked', async () => {
    const error = new Error('status notification update failed');
    mocks.update.mockImplementation(() => { throw error; });

    await expect(translateFieldViaSmartHandler({ text: 'hello', target, toastId: 'existing-toast' }))
      .rejects.toBe(error);

    expect(isFieldTranslationRequestError(error)).toBe(false);
  });

  it('keeps pending-state failure unmarked', async () => {
    const error = new Error('pending state failed');
    mocks.storePendingTranslationData.mockImplementation(() => { throw error; });

    await expect(translateFieldViaSmartHandler({ text: 'hello', target }))
      .rejects.toBe(error);

    expect(isFieldTranslationRequestError(error)).toBe(false);
  });

  it('keeps platform detection failure unmarked', async () => {
    const error = new Error('platform detection failed');
    mocks.detectSite.mockImplementation(() => { throw error; });

    await expect(translateFieldViaSmartHandler({ text: 'hello', target }))
      .rejects.toBe(error);

    expect(isFieldTranslationRequestError(error)).toBe(false);
    expect(mocks.fieldRequestOwners.get(target)).toBeUndefined();
    expect(mocks.activeAbortControllers.get(target)).toBeUndefined();
    expect(mocks.releaseFieldTranslationRequest).toHaveBeenCalled();
    expect(mocks.showStatus).not.toHaveBeenCalled();
    expect(mocks.storePendingTranslationData).not.toHaveBeenCalled();
    expect(mocks.trackerRequests.size).toBe(0);
  });

  it('starts cleanly after platform detection failure', async () => {
    const error = new Error('platform detection failed');
    mocks.detectSite.mockImplementationOnce(() => { throw error; });

    await expect(translateFieldViaSmartHandler({ text: 'first', target }))
      .rejects.toBe(error);

    await expect(translateFieldViaSmartHandler({ text: 'second', target }))
      .resolves.toBeUndefined();

    expect(mocks.trackerRequests.size).toBe(1);
    expect([...mocks.trackerRequests.values()][0].status).toBe('completed');
    expect(mocks.activeAbortControllers.get(target)).toBeUndefined();
  });

  it('releases B when replacement terminalization throws', async () => {
    const translationRequests = new Map();
    mocks.safeSendMessage.mockImplementation((message) => new Promise((resolve) => {
      translationRequests.set(message.data.options.messageId, resolve);
    }));

    const promiseA = translateFieldViaSmartHandler({ text: 'request A', target });
    await vi.waitFor(() => expect(translationRequests.size).toBe(1));
    const [messageIdA] = translationRequests.keys();
    const error = new Error('replacement terminalization failed');
    mocks.tracker.cancelRequest.mockImplementationOnce(() => { throw error; });

    const promiseB = translateFieldViaSmartHandler({ text: 'request B', target });

    await expect(promiseB).rejects.toBe(error);
    await expect(promiseA).resolves.toBeUndefined();
    expect(isFieldTranslationRequestError(error)).toBe(false);
    expect(mocks.fieldRequestOwners.get(target)).toBeUndefined();
    expect(mocks.activeAbortControllers.get(target)).toBeUndefined();
    expect(mocks.releaseFieldTranslationRequest).toHaveBeenCalled();
    expect(mocks.storePendingTranslationData).toHaveBeenCalledTimes(1);
    expect(mocks.trackerRequests.get(messageIdA).status).toBe('pending');
  });

  it('does not mark stale setup failure after replacement and lets B continue', async () => {
    let rejectProviderA;
    let providerCall = 0;
    const providerA = new Promise((_, reject) => { rejectProviderA = reject; });
    mocks.getEffectiveProviderAsync.mockImplementation(() => {
      providerCall += 1;
      return providerCall === 1 ? providerA : Promise.resolve('provider-B');
    });

    const translationRequests = new Map();
    mocks.safeSendMessage.mockImplementation((message) => new Promise((resolve) => {
      translationRequests.set(message.data.options.messageId, resolve);
    }));

    const promiseA = translateFieldViaSmartHandler({ text: 'request A', target });
    await Promise.resolve();
    const promiseB = translateFieldViaSmartHandler({ text: 'request B', target });
    await vi.waitFor(() => expect(translationRequests.size).toBe(1));

    const ownershipB = mocks.fieldRequestOwners.get(target);
    const error = new Error('provider setup A failed');
    rejectProviderA(error);

    await expect(promiseA).resolves.toBeUndefined();
    expect(isFieldTranslationRequestError(error)).toBe(false);
    expect(mocks.fieldRequestOwners.get(target)).toBe(ownershipB);
    expect(mocks.clearPendingTranslationData).not.toHaveBeenCalled();
    expect(mocks.clearPendingNotificationData).not.toHaveBeenCalled();

    const [messageIdB] = translationRequests.keys();
    translationRequests.get(messageIdB)({
      success: true,
      translatedText: 'translated B',
      originalText: 'request B',
    });

    await expect(promiseB).resolves.toBeUndefined();
    expect(mocks.trackerRequests.get(messageIdB).status).toBe('completed');
  });

  it('releases failing B after tracked A replacement and allows C to complete', async () => {
    const translationRequests = new Map();
    mocks.safeSendMessage.mockImplementation((message) => new Promise((resolve) => {
      translationRequests.set(message.data.options.messageId, resolve);
    }));

    const promiseA = translateFieldViaSmartHandler({ text: 'request A', target });
    await vi.waitFor(() => expect(translationRequests.size).toBe(1));
    const [messageIdA] = translationRequests.keys();
    const dataA = mocks.pendingTranslationData.get(target);
    const toastIdA = dataA.toastId;
    const ownershipA = mocks.fieldRequestOwners.get(target);

    const platformError = new Error('platform detection failed for B');
    mocks.detectSite.mockImplementationOnce(() => { throw platformError; });
    const promiseB = translateFieldViaSmartHandler({ text: 'request B', target });

    await expect(promiseB).rejects.toBe(platformError);
    await expect(promiseA).resolves.toBeUndefined();
    expect(isFieldTranslationRequestError(platformError)).toBe(false);
    expect(mocks.trackerRequests.get(messageIdA).status).toBe('cancelled');
    expect(mocks.trackerRequests.get(messageIdA).reason).toBe('replacement');
    expect(mocks.trackerRequests.size).toBe(1);
    expect(mocks.fieldRequestOwners.get(target)).toBeUndefined();
    expect(mocks.activeAbortControllers.get(target)).toBeUndefined();
    expect(mocks.showStatus).toHaveBeenCalledTimes(1);
    expect(mocks.storePendingTranslationData).toHaveBeenCalledTimes(1);
    expect(mocks.dismiss).toHaveBeenCalledTimes(1);
    expect(mocks.dismiss).toHaveBeenCalledWith(toastIdA);
    expect(mocks.cleanupSupersededFieldTranslationState).toHaveBeenCalledWith(ownershipA);

    translationRequests.get(messageIdA)({
      success: true,
      translatedText: 'stale A',
      originalText: 'request A',
    });

    mocks.detectSite.mockImplementation(() => 'default');
    mocks.safeSendMessage.mockResolvedValue({
      success: true,
      translatedText: 'translated C',
      originalText: 'request C',
    });
    await expect(translateFieldViaSmartHandler({ text: 'request C', target }))
      .resolves.toBeUndefined();

    expect(mocks.trackerRequests.size).toBe(2);
    const cRequest = [...mocks.trackerRequests.values()].find(({ messageId }) => messageId !== messageIdA);
    expect(cRequest.status).toBe('completed');
  });

  it('cleans A state after toast adoption fails before pending adoption', async () => {
    const translationRequests = new Map();
    mocks.safeSendMessage.mockImplementation((message) => new Promise((resolve) => {
      translationRequests.set(message.data.options.messageId, resolve);
    }));

    const promiseA = translateFieldViaSmartHandler({ text: 'request A', target });
    await vi.waitFor(() => expect(translationRequests.size).toBe(1));
    const dataA = mocks.pendingTranslationData.get(target);
    const toastIdA = dataA.toastId;
    const ownershipA = mocks.fieldRequestOwners.get(target);
    const error = new Error('pending adoption failed');
    mocks.storePendingTranslationData.mockImplementationOnce(() => { throw error; });

    const promiseB = translateFieldViaSmartHandler({ text: 'request B', target });

    await expect(promiseB).rejects.toBe(error);
    await expect(promiseA).resolves.toBeUndefined();
    expect(mocks.update).toHaveBeenCalledWith(
      toastIdA,
      'Translating...',
      { type: 'status', persistent: true }
    );
    expect(mocks.dismiss).toHaveBeenCalledTimes(1);
    expect(mocks.dismiss).toHaveBeenCalledWith(toastIdA);
    expect(mocks.cleanupSupersededFieldTranslationState).toHaveBeenCalledWith(ownershipA);
    expect(mocks.trackerRequests.size).toBe(1);
    expect(mocks.fieldRequestOwners.get(target)).toBeUndefined();
  });

  it('uses normal B cleanup after pending adoption', async () => {
    const translationRequests = new Map();
    let sendCount = 0;
    const error = new Error('post-adoption request failed');
    mocks.safeSendMessage.mockImplementation((message) => {
      sendCount += 1;
      if (sendCount === 1) {
        return new Promise((resolve) => translationRequests.set(message.data.options.messageId, resolve));
      }
      return Promise.reject(error);
    });

    const promiseA = translateFieldViaSmartHandler({ text: 'request A', target });
    await vi.waitFor(() => expect(translationRequests.size).toBe(1));
    const ownershipA = mocks.fieldRequestOwners.get(target);
    const promiseB = translateFieldViaSmartHandler({ text: 'request B', target });

    await expect(promiseB).rejects.toBe(error);
    await expect(promiseA).resolves.toBeUndefined();
    expect(mocks.cleanupSupersededFieldTranslationState).toHaveBeenCalledWith(ownershipA);
    expect(mocks.dismiss).toHaveBeenCalledTimes(1);
    expect(mocks.trackerRequests.size).toBe(2);
    const bRequest = [...mocks.trackerRequests.values()].find(({ status }) => status === 'failed');
    expect(bRequest).toBeDefined();
  });

  it('transfers inherited state through B to C when B is replaced before adoption', async () => {
    let resolveA;
    let sendCount = 0;
    mocks.safeSendMessage.mockImplementation(() => {
      sendCount += 1;
      if (sendCount === 1) {
        return new Promise((resolve) => { resolveA = resolve; });
      }
      return Promise.resolve({
        success: true,
        translatedText: 'translated C',
        originalText: 'request C',
      });
    });

    const promiseA = translateFieldViaSmartHandler({ text: 'request A', target });
    await vi.waitFor(() => expect(mocks.trackerRequests.size).toBe(1));
    const dataA = mocks.pendingTranslationData.get(target);
    const toastIdA = dataA.toastId;
    const ownershipA = mocks.fieldRequestOwners.get(target);

    let resolveProviderB;
    const providerB = new Promise((resolve) => { resolveProviderB = resolve; });
    let providerCall = 0;
    mocks.getEffectiveProviderAsync.mockImplementation(() => {
      providerCall += 1;
      return providerCall === 1 ? providerB : Promise.resolve('provider-C');
    });

    const promiseB = translateFieldViaSmartHandler({ text: 'request B', target });
    await Promise.resolve();
    const promiseC = translateFieldViaSmartHandler({ text: 'request C', target });
    await expect(promiseC).resolves.toBeUndefined();

    expect(mocks.update).toHaveBeenCalledWith(
      toastIdA,
      'Translating...',
      { type: 'status', persistent: true }
    );
    expect(mocks.showStatus).toHaveBeenCalledTimes(1);

    resolveA?.({ success: true, translatedText: 'stale A', originalText: 'request A' });
    resolveProviderB('provider-B');
    await expect(promiseA).resolves.toBeUndefined();
    await expect(promiseB).resolves.toBeUndefined();
    expect(mocks.cleanupSupersededFieldTranslationState).toHaveBeenCalledWith(ownershipA);
    const currentOwner = mocks.fieldRequestOwners.get(target);
    expect(currentOwner).toBeUndefined();
  });

  it('fails application result without changing public error ownership', async () => {
    const applicationError = new Error('copy failed');
    mocks.applyTranslation.mockImplementation(() => { throw applicationError; });

    await expect(translateFieldViaSmartHandler({ text: 'hello', target })).resolves.toBeUndefined();

    const request = [...mocks.trackerRequests.values()][0];
    expect(request.status).toBe('failed');
    expect(request.error).toBe('copy failed');
    expect(isFieldTranslationRequestError(applicationError)).toBe(false);
  });

  it('fails empty application result', async () => {
    mocks.safeSendMessage.mockResolvedValue({
      success: true,
      translatedText: '',
      originalText: 'original text',
    });

    await expect(translateFieldViaSmartHandler({ text: 'hello', target })).resolves.toBeUndefined();

    expect([...mocks.trackerRequests.values()][0].status).toBe('failed');
  });

  it('keeps user cancellation silent and unmarked', async () => {
    const error = Object.assign(new Error('cancelled'), {
      type: ErrorTypes.USER_CANCELLED,
    });
    mocks.safeSendMessage.mockRejectedValue(error);

    await expect(translateFieldViaSmartHandler({ text: 'hello', target }))
      .rejects.toBe(error);

    expect(isFieldTranslationRequestError(error)).toBe(false);
    expect(mocks.pendingTranslationData.get(target)).toBeUndefined();
    expect([...mocks.trackerRequests.values()][0].status).toBe('cancelled');
    expect(mocks.tracker.cancelRequest).toHaveBeenCalledWith(
      [...mocks.trackerRequests.keys()][0],
      ErrorTypes.USER_CANCELLED
    );
  });

  it('keeps context invalidation as the existing null return path', async () => {
    mocks.safeSendMessage.mockResolvedValue(null);

    await expect(translateFieldViaSmartHandler({ text: 'hello', target }))
      .resolves.toBeUndefined();

    expect(mocks.dismiss).toHaveBeenCalled();
    expect(mocks.clearPendingTranslationData).toHaveBeenCalled();
    expect(mocks.applyTranslationToTextField).not.toHaveBeenCalled();
    expect(mocks.pendingTranslationData.get(target)).toBeUndefined();
    expect([...mocks.trackerRequests.values()][0].status).toBe('cancelled');
    expect(mocks.tracker.cancelRequest).toHaveBeenCalledWith(
      [...mocks.trackerRequests.keys()][0],
      'context-invalidated'
    );
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
    const ownershipA = mocks.fieldRequestOwners.get(target);
    const toastIdA = dataA.toastId;

    const promiseB = translateFieldViaSmartHandler(requestB);
    await vi.waitFor(() => expect(translationRequests.size).toBe(2));
    const messageIdB = [...translationRequests.keys()].find((id) => id !== messageIdA);
    const dataB = mocks.pendingTranslationData.get(target);
    const controllerB = mocks.activeAbortControllers.get(target);
    const ownershipB = mocks.fieldRequestOwners.get(target);

    expect(controllerB).not.toBe(controllerA);
    expect(dataB).not.toBe(dataA);
    expect(ownershipA.replaced).toBe(true);
    expect(ownershipB.replaced).not.toBe(true);
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
    expect(mocks.pendingTranslationByToastId.get(toastIdA).processed).toBe(true);
    expect(mocks.activeAbortControllers.get(target)).toBeUndefined();
    expect(mocks.trackerRequests.get(messageIdA).status).toBe('cancelled');
    expect(mocks.trackerRequests.get(messageIdA).reason).toBe('replacement');
    expect(mocks.trackerRequests.get(messageIdB).status).toBe('completed');
    expect(mocks.tracker.cancelRequest).toHaveBeenCalledWith(messageIdA, 'replacement');
    expect(mocks.tracker.failRequest).not.toHaveBeenCalledWith(messageIdA, expect.anything());
    expect(mocks.cleanupSupersededFieldTranslationState).toHaveBeenCalledWith(ownershipA);
  });

  it('cleans old compatibility mapping after adopting a different toast', async () => {
    const translationRequests = new Map();
    mocks.safeSendMessage.mockImplementation((message) => new Promise((resolve) => {
      translationRequests.set(message.data.options.messageId, resolve);
    }));
    mocks.cleanupSupersededFieldTranslationState.mockImplementation((previous) => {
      if (mocks.pendingTranslationByToastId.get(previous.toastId) === previous.data) {
        mocks.pendingTranslationByToastId.delete(previous.toastId);
      }
      if (mocks.pendingTranslationData.get(target) === previous.data) {
        mocks.pendingTranslationData.delete(target);
      }
    });

    const promiseA = translateFieldViaSmartHandler({ text: 'request A', target });
    await vi.waitFor(() => expect(translationRequests.size).toBe(1));
    const dataA = mocks.pendingTranslationData.get(target);
    const toastIdA = dataA.toastId;
    const ownershipA = mocks.fieldRequestOwners.get(target);

    const promiseB = translateFieldViaSmartHandler({ text: 'request B', target, toastId: 'toast-B' });
    await vi.waitFor(() => expect(translationRequests.size).toBe(2));
    const dataB = mocks.pendingTranslationData.get(target);
    const ownershipB = mocks.fieldRequestOwners.get(target);

    expect(mocks.dismiss).toHaveBeenCalledTimes(1);
    expect(mocks.dismiss).toHaveBeenCalledWith(toastIdA);
    expect(mocks.dismiss).not.toHaveBeenCalledWith('toast-B');
    expect(mocks.cleanupSupersededFieldTranslationState).toHaveBeenCalledWith(ownershipA);
    expect(mocks.pendingTranslationByToastId.get(toastIdA)).toBeUndefined();
    expect(mocks.pendingTranslationByToastId.get('toast-B')).toBe(dataB);
    expect(mocks.pendingTranslationData.get(target)).toBe(dataB);
    expect(window.pendingTranslationOwner).toBe(ownershipB);

    const messageIdB = [...translationRequests.keys()].find((id) => id !== dataA.messageId);
    translationRequests.get(messageIdB)({
      success: true,
      translatedText: 'translated B',
      originalText: 'request B',
    });

    await expect(promiseB).resolves.toBeUndefined();
    await expect(promiseA).resolves.toBeUndefined();
    expect(mocks.trackerRequests.get(messageIdB).status).toBe('completed');
  });

  it('prevents pre-registration stale request from issuing work', async () => {
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
    const controllerA = mocks.activeAbortControllers.get(target);
    const ownershipA = mocks.fieldRequestOwners.get(target);
    expect(controllerA).toBeDefined();

    const promiseB = translateFieldViaSmartHandler({ text: 'request B', target });
    const controllerB = mocks.activeAbortControllers.get(target);
    const ownershipB = mocks.fieldRequestOwners.get(target);
    expect(controllerB).not.toBe(controllerA);
    expect(ownershipA.replaced).toBe(true);
    expect(ownershipB).not.toBe(ownershipA);

    resolveProviderB('provider-B');
    await vi.waitFor(() => expect(translationRequests.size).toBe(1));
    const messageIdB = [...translationRequests.keys()][0];
    const dataB = mocks.pendingTranslationData.get(target);

    resolveProviderA('provider-A');
    await Promise.resolve();
    expect(translationRequests.size).toBe(1);
    expect(mocks.pendingTranslationData.get(target)).toBe(dataB);
    expect(mocks.pendingTranslationByToastId.get(dataB.toastId)).toBe(dataB);

    translationRequests.get(messageIdB)({
      success: true,
      translatedText: 'translated B',
      originalText: 'request B',
    });

    await expect(promiseB).resolves.toBeUndefined();
    await expect(promiseA).resolves.toBeUndefined();
    expect(mocks.activeAbortControllers.get(target)).toBeUndefined();
    expect(mocks.trackerRequests.size).toBe(1);
    expect(mocks.trackerRequests.get(messageIdB).status).toBe('completed');
  });

  it('prevents stale mid-setup request from creating state or sending work', async () => {
    let resolveSourceA;
    let resolveSourceB;
    const sourceA = new Promise((resolve) => { resolveSourceA = resolve; });
    const sourceB = new Promise((resolve) => { resolveSourceB = resolve; });
    let sourceCall = 0;
    mocks.getSourceLanguageAsync.mockImplementation(() => {
      sourceCall += 1;
      return sourceCall === 1 ? sourceA : sourceB;
    });

    const translationRequests = new Map();
    mocks.safeSendMessage.mockImplementation((message) => {
      if (message?.action === 'CANCEL_TRANSLATION') return Promise.resolve(null);
      return new Promise((resolve) => translationRequests.set(message.data.options.messageId, resolve));
    });

    const promiseA = translateFieldViaSmartHandler({ text: 'request A', target });
    await vi.waitFor(() => expect(sourceCall).toBe(1));

    const promiseB = translateFieldViaSmartHandler({ text: 'request B', target });
    resolveSourceB('source-B');
    await vi.waitFor(() => expect(translationRequests.size).toBe(1));

    const dataB = mocks.pendingTranslationData.get(target);
    const showCountAfterB = mocks.showStatus.mock.calls.length;

    resolveSourceA('source-A');
    await expect(promiseA).resolves.toBeUndefined();
    expect(translationRequests.size).toBe(1);
    expect(mocks.pendingTranslationData.get(target)).toBe(dataB);
    expect(mocks.showStatus).toHaveBeenCalledTimes(showCountAfterB);

    const [messageIdB] = translationRequests.keys();
    translationRequests.get(messageIdB)({
      success: true,
      translatedText: 'translated B',
      originalText: 'request B',
    });
    await expect(promiseB).resolves.toBeUndefined();
  });

  it('rejects stale response application when B replaces sent A', async () => {
    const field = document.createElement('textarea');
    field.value = 'original';
    document.body.appendChild(field);
    field.focus();

    const translationRequests = new Map();
    mocks.safeSendMessage.mockImplementation((message) => {
      if (message?.action === 'CANCEL_TRANSLATION') return Promise.resolve(null);
      return new Promise((resolve) => translationRequests.set(message.data.options.messageId, resolve));
    });
    mocks.applyTranslation.mockImplementation(async (text, _range, _platform, _tabId, element) => {
      element.value = text;
      return true;
    });

    const promiseA = translateFieldViaSmartHandler({ text: 'request A', target: field });
    await vi.waitFor(() => expect(translationRequests.size).toBe(1));
    const messageIdA = [...translationRequests.keys()][0];

    const promiseB = translateFieldViaSmartHandler({ text: 'request B', target: field });
    await vi.waitFor(() => expect(translationRequests.size).toBe(2));
    const messageIdB = [...translationRequests.keys()].find((id) => id !== messageIdA);

    translationRequests.get(messageIdB)({
      success: true,
      translatedText: 'translated B',
      originalText: 'request B',
    });
    await expect(promiseB).resolves.toBeUndefined();

    translationRequests.get(messageIdA)({
      success: true,
      translatedText: 'translated A',
      originalText: 'request A',
    });
    await expect(promiseA).resolves.toBeUndefined();

    expect(field.value).toBe('translated B');
    expect(mocks.applyTranslation).toHaveBeenCalledTimes(1);
    document.body.removeChild(field);
  });

  it('stops stale A before application after B replaces it', async () => {
    const field = document.createElement('textarea');
    field.value = 'original';
    document.body.appendChild(field);
    field.focus();

    let resolveReplaceModeA;
    const replaceModeA = new Promise((resolve) => { resolveReplaceModeA = resolve; });
    let replaceModeCall = 0;
    mocks.determineReplaceMode.mockImplementation(() => {
      replaceModeCall += 1;
      return replaceModeCall === 1 ? replaceModeA : Promise.resolve(true);
    });

    const translationRequests = new Map();
    mocks.safeSendMessage.mockImplementation((message) => {
      if (message?.action === 'CANCEL_TRANSLATION') return Promise.resolve(null);
      return new Promise((resolve) => translationRequests.set(message.data.options.messageId, resolve));
    });
    mocks.applyTranslation.mockImplementation(async (text, _range, _platform, _tabId, element) => {
      element.value = text;
      return true;
    });

    const promiseA = translateFieldViaSmartHandler({ text: 'request A', target: field });
    await vi.waitFor(() => expect(translationRequests.size).toBe(1));
    const messageIdA = [...translationRequests.keys()][0];
    translationRequests.get(messageIdA)({
      success: true,
      translatedText: 'translated A',
      originalText: 'request A',
    });
    await vi.waitFor(() => expect(replaceModeCall).toBe(1));

    const promiseB = translateFieldViaSmartHandler({ text: 'request B', target: field });
    await vi.waitFor(() => expect(translationRequests.size).toBe(2));
    const messageIdB = [...translationRequests.keys()].find((id) => id !== messageIdA);
    translationRequests.get(messageIdB)({
      success: true,
      translatedText: 'translated B',
      originalText: 'request B',
    });
    await expect(promiseB).resolves.toBeUndefined();

    resolveReplaceModeA(true);
    await expect(promiseA).resolves.toBeUndefined();

    expect(field.value).toBe('translated B');
    expect(mocks.applyTranslation).toHaveBeenCalledTimes(1);
    document.body.removeChild(field);
  });
});
