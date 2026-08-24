import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, onMounted: vi.fn((callback) => callback()) };
});

vi.mock('@/utils/browser/compatibility.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    deviceDetector: { ...actual.deviceDetector, isMobile: vi.fn(() => false) },
  };
});

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { useContentAppPageTranslation } from './useContentAppPageTranslation.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

describe('useContentAppPageTranslation', () => {
  let listeners;
  let mobileStore;

  beforeEach(() => {
    listeners = new Map();
    mobileStore = {
      pageTranslationData: {
        isTranslating: true,
        isAutoTranslating: false,
        isTranslated: false,
        status: 'translating',
        errorMessage: 'stale error',
        canRetry: true,
      },
      setPageTranslation: vi.fn((state) => Object.assign(mobileStore.pageTranslationData, state)),
      resetPageTranslation: vi.fn(),
      closeSheet: vi.fn(),
      openSheet: vi.fn(),
      setView: vi.fn(),
      setSheetState: vi.fn(),
      updateSelectionData: vi.fn(),
      setHasElementTranslations: vi.fn(),
    };
    window.pageEventBus = {};

    useContentAppPageTranslation(mobileStore, {
      addEventListener: vi.fn((_, action, callback) => listeners.set(action, callback)),
    });
  });

  it('stores safe structured error text and preserves fatal state semantics', async () => {
    const raw = 'raw provider response body';
    await listeners.get(MessageActions.PAGE_TRANSLATE_ERROR)({
      error: raw,
      errorDetails: { type: 'MODEL_NOT_FOUND', message: raw },
      isFatal: true,
    });

    const state = mobileStore.setPageTranslation.mock.calls[0][0];
    expect(state.errorMessage).not.toBe(raw);
    expect(state.status).toBe('error');
    expect(state.isTranslating).toBe(false);
  });

  it('suppresses Retry and preserves translated state after fatal partial output', async () => {
    mobileStore.pageTranslationData.isTranslated = true;
    mobileStore.pageTranslationData.translatedCount = 1;

    await listeners.get(MessageActions.PAGE_TRANSLATE_ERROR)({
      errorDetails: { type: ErrorTypes.NETWORK_ERROR, message: 'network failure' },
      translatedCount: 1,
      isFatal: true,
    });

    expect(mobileStore.setPageTranslation).toHaveBeenCalledWith(expect.objectContaining({
      isTranslated: true,
      translatedCount: 1,
      canRetry: false,
      status: 'error',
    }));
  });

  it.each([true, false])('clears fatal presentation while preserving translated content when isTranslated=%s', (isTranslated) => {
    mobileStore.pageTranslationData = {
      isTranslating: false,
      isAutoTranslating: false,
      isTranslated,
      translatedCount: 2,
      failedCount: 1,
      totalCount: 3,
      status: 'error',
      errorMessage: 'fatal failure',
      canRetry: false,
    };

    listeners.get(MessageActions.PAGE_TRANSLATE_RESET_ERROR)();

    expect(mobileStore.resetPageTranslation).not.toHaveBeenCalled();
    expect(mobileStore.setPageTranslation).toHaveBeenCalledWith({
      isTranslating: false,
      isAutoTranslating: false,
      isTranslated: true,
      status: 'completed',
      errorMessage: null,
      canRetry: false,
    });
    expect(mobileStore.pageTranslationData).toMatchObject({
      isTranslated: true,
      translatedCount: 2,
      failedCount: 1,
      totalCount: 3,
      status: 'completed',
      errorMessage: null,
      canRetry: false,
    });
  });

  it('keeps Retry available for fatal zero-commit output', async () => {
    await listeners.get(MessageActions.PAGE_TRANSLATE_ERROR)({
      errorDetails: { type: ErrorTypes.NETWORK_ERROR, message: 'network failure' },
      translatedCount: 0,
      isFatal: true,
    });

    expect(mobileStore.setPageTranslation).toHaveBeenCalledWith(expect.objectContaining({
      isTranslated: false,
      canRetry: true,
      status: 'error',
    }));
  });

  it('fully resets zero-commit state when fatal presentation is dismissed', () => {
    mobileStore.pageTranslationData = {
      isTranslating: false,
      isAutoTranslating: false,
      isTranslated: false,
      translatedCount: 0,
      failedCount: 3,
      totalCount: 3,
      status: 'error',
      errorMessage: 'fatal failure',
      canRetry: false,
    };

    listeners.get(MessageActions.PAGE_TRANSLATE_RESET_ERROR)();

    expect(mobileStore.resetPageTranslation).toHaveBeenCalledOnce();
    expect(mobileStore.setPageTranslation).not.toHaveBeenCalled();
  });

  it.each(['error', 'completed'])('fully resets state after restore completion from %s state', (status) => {
    mobileStore.pageTranslationData = {
      isTranslating: false,
      isAutoTranslating: false,
      isTranslated: true,
      translatedCount: 2,
      failedCount: 1,
      totalCount: 3,
      status,
      errorMessage: status === 'error' ? 'fatal failure' : null,
      canRetry: false,
    };

    listeners.get(MessageActions.PAGE_RESTORE_COMPLETE)();

    expect(mobileStore.resetPageTranslation).toHaveBeenCalledOnce();
    expect(mobileStore.setPageTranslation).not.toHaveBeenCalled();
  });

  it('marks partial completion without entering error state', async () => {
    await listeners.get(MessageActions.PAGE_TRANSLATE_COMPLETE)({
      translatedCount: 2,
      failedCount: 1,
      totalCount: 3,
    });

    expect(mobileStore.setPageTranslation).toHaveBeenCalledWith(expect.objectContaining({
      status: 'completed',
      isTranslated: true,
      translatedCount: 2,
      failedCount: 1,
      totalCount: 3,
    }));
  });

  it('ignores non-fatal page errors at presentation-state boundary', async () => {
    const before = { ...mobileStore.pageTranslationData };

    await listeners.get(MessageActions.PAGE_TRANSLATE_ERROR)({
      errorDetails: { type: 'HTTP_ERROR', statusCode: 409, message: 'retryable' },
      isFatal: false,
    });

    expect(mobileStore.setPageTranslation).not.toHaveBeenCalled();
    expect(mobileStore.pageTranslationData).toEqual(before);
  });

  it('clears stale retry state when translation starts', () => {
    listeners.get(MessageActions.PAGE_TRANSLATE_START)({});

    expect(mobileStore.setPageTranslation).toHaveBeenCalledWith(expect.objectContaining({
      errorMessage: null,
      canRetry: false,
      failedCount: 0,
    }));
  });

  it('clears stale retry state after partial completion', async () => {
    await listeners.get(MessageActions.PAGE_TRANSLATE_ERROR)({
      errorDetails: { type: 'HTTP_ERROR', statusCode: 409, message: 'retryable' },
      isFatal: false,
    });
    await listeners.get(MessageActions.PAGE_TRANSLATE_COMPLETE)({
      translatedCount: 2,
      failedCount: 1,
      totalCount: 3,
    });

    expect(mobileStore.setPageTranslation).toHaveBeenLastCalledWith(expect.objectContaining({
      status: 'completed',
      canRetry: false,
    }));
  });

  it('marks zero-result completion as terminal failure', async () => {
    await listeners.get(MessageActions.PAGE_TRANSLATE_ERROR)({
      errorDetails: { type: 'HTTP_ERROR', statusCode: 409, message: 'retryable' },
      isFatal: false,
    });
    await listeners.get(MessageActions.PAGE_TRANSLATE_COMPLETE)({
      translatedCount: 0,
      failedCount: 3,
      totalCount: 3,
    });

    expect(mobileStore.setPageTranslation).toHaveBeenCalledWith(expect.objectContaining({
      status: 'error',
      isTranslated: false,
      translatedCount: 0,
      failedCount: 3,
      totalCount: 3,
    }));
    expect(mobileStore.setPageTranslation).toHaveBeenLastCalledWith(expect.objectContaining({
      status: 'error',
      canRetry: false,
    }));
  });

  it('does not surface structured cancellation/context errors', async () => {
    await listeners.get(MessageActions.PAGE_TRANSLATE_ERROR)({
      error: 'cancelled',
      errorDetails: { type: 'TRANSLATION_CANCELLED', message: 'cancelled' },
      isFatal: true,
    });

    expect(mobileStore.setPageTranslation).not.toHaveBeenCalled();
  });

  it('does not mutate visible state for structured context errors', async () => {
    await listeners.get(MessageActions.PAGE_TRANSLATE_ERROR)({
      error: 'context invalidated',
      errorDetails: { type: 'EXTENSION_CONTEXT_INVALIDATED', message: 'context invalidated' },
      isFatal: true,
    });

    expect(mobileStore.setPageTranslation).not.toHaveBeenCalled();
  });

  it.each([
    [{ type: 'HTTP_ERROR', statusCode: 404, message: 'HTTP 404' }, false],
    [{ type: 'HTTP_ERROR', statusCode: 409, message: 'HTTP 409' }, true],
    [{ type: ErrorTypes.API_KEY_INVALID, message: 'invalid key' }, false],
  ])('stores public retry decision for %s', async (errorDetails, canRetry) => {
    await listeners.get(MessageActions.PAGE_TRANSLATE_ERROR)({
      errorDetails,
      isFatal: true,
    });

    expect(mobileStore.setPageTranslation).toHaveBeenCalledWith(expect.objectContaining({ canRetry }));
  });
});
