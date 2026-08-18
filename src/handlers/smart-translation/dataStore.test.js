import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  tracker: {
    createRequest: vi.fn(),
    associateWithElement: vi.fn(),
    getRequestByToastId: vi.fn(),
    findRequestByElement: vi.fn(),
    getRequest: vi.fn(),
  },
}));

vi.mock('@/shared/config/config.js', () => ({
  TranslationMode: { Field: 'field' },
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

vi.mock('@/shared/logging/logConstants.js', () => ({
  LOG_COMPONENTS: { TRANSLATION: 'translation' },
}));

vi.mock('@/core/services/translation/TranslationRequestTracker.js', () => ({
  translationRequestTracker: mocks.tracker,
}));

vi.mock('./state.js', () => ({
  resourceTracker: { clearTimer: vi.fn() },
  messageSources: new Map(),
  processedMessageIds: new Set(),
}));

vi.mock('./constants.js', () => ({
  MAX_AGE: 60_000,
  MAX_PROCESSED_MESSAGE_IDS: 100,
}));

import {
  activeAbortControllers,
  beginFieldTranslationRequest,
  clearPendingNotificationData,
  clearPendingTranslationData,
  fieldRequestOwners,
  isCurrentFieldTranslationRequest,
  pendingTranslationByToastId,
  releaseFieldTranslationRequest,
  storePendingTranslationData,
} from './dataStore.js';

describe('Field request ownership data store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pendingTranslationByToastId.clear();
    window.pendingTranslationOwner = null;
    window.pendingTranslationTarget = null;
    window.pendingTranslationToastId = null;
  });

  it('installs new owner before setup and aborts previous controller-only owner', () => {
    const target = document.createElement('textarea');
    const first = beginFieldTranslationRequest(target).ownership;
    const second = beginFieldTranslationRequest(target).ownership;

    expect(first.replaced).toBe(true);
    expect(first.controller.signal.aborted).toBe(true);
    expect(fieldRequestOwners.get(target)).toBe(second);
    expect(activeAbortControllers.get(target)).toBe(second.controller);
    expect(isCurrentFieldTranslationRequest(target, first)).toBe(false);
    expect(isCurrentFieldTranslationRequest(target, second)).toBe(true);
  });

  it('rejects stale pending writes and stale cleanup', () => {
    const target = document.createElement('textarea');
    const first = beginFieldTranslationRequest(target).ownership;
    const second = beginFieldTranslationRequest(target).ownership;
    const data = storePendingTranslationData(target, 'field', 'default', null, null, Date.now(), 'toast-b', 'message-b', second);

    expect(storePendingTranslationData(target, 'field', 'default', null, null, Date.now(), 'toast-a', 'message-a', first)).toBeNull();
    expect(pendingTranslationByToastId.get('toast-b')).toBe(data);

    clearPendingTranslationData('toast-b', first);
    clearPendingNotificationData('stale', first);

    expect(pendingTranslationByToastId.get('toast-b')).toBe(data);
    expect(window.pendingTranslationOwner).toBe(second);
  });

  it('only current owner can release controller and ownership', () => {
    const target = document.createElement('textarea');
    const first = beginFieldTranslationRequest(target).ownership;
    const second = beginFieldTranslationRequest(target).ownership;

    expect(releaseFieldTranslationRequest(target, first)).toBe(false);
    expect(fieldRequestOwners.get(target)).toBe(second);
    expect(activeAbortControllers.get(target)).toBe(second.controller);

    expect(releaseFieldTranslationRequest(target, second)).toBe(true);
    expect(fieldRequestOwners.get(target)).toBeUndefined();
    expect(activeAbortControllers.get(target)).toBeUndefined();
  });
});
