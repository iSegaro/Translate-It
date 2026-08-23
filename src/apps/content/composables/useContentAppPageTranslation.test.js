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
  ])('stores public retry decision for %s', async (errorDetails, canRetry) => {
    await listeners.get(MessageActions.PAGE_TRANSLATE_ERROR)({
      errorDetails,
      isFatal: true,
    });

    expect(mobileStore.setPageTranslation).toHaveBeenCalledWith(expect.objectContaining({ canRetry }));
  });
});
