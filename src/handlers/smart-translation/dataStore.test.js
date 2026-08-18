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
  getPendingTranslationData,
  isCurrentFieldTranslationRequest,
  pendingTranslationByToastId,
  pendingTranslationData,
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
    window.pendingTranslationMode = null;
    window.pendingTranslationPlatform = null;
    window.pendingTranslationTabId = null;
    window.pendingSelectionRange = null;
    window.pendingTranslationTimestamp = null;
    mocks.tracker.getRequestByToastId.mockReturnValue(null);
    mocks.tracker.findRequestByElement.mockReturnValue(undefined);
    mocks.tracker.getRequest.mockReturnValue(undefined);
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

  it('uses active tracker-backed element data when association is valid', () => {
    const target = document.createElement('textarea');
    const request = {
      messageId: 'active-request',
      mode: 'field',
      timestamp: 123,
      metadata: { source: 'default', platform: 'default', tabId: 7, toastId: 'active-toast', selectionRange: null },
      elementData: { id: 'field-id', selector: '#field-id' },
    };
    mocks.tracker.findRequestByElement.mockReturnValue('active-request');
    mocks.tracker.getRequest.mockReturnValue(request);

    expect(getPendingTranslationData(target, null)).toEqual({
      target,
      mode: 'field',
      platform: 'default',
      tabId: 7,
      selectionRange: null,
      timestamp: 123,
      toastId: 'active-toast',
      messageId: 'active-request',
      targetId: 'field-id',
      targetSelector: '#field-id',
    });
  });

  it('ignores terminal tracker association and continues fallback chain', () => {
    const target = document.createElement('textarea');
    const fallback = { target, mode: 'field', messageId: 'fallback-request' };
    pendingTranslationByToastId.set('fallback-toast', fallback);

    expect(getPendingTranslationData(target, 'fallback-toast')).toBe(fallback);
  });

  it('ignores missing tracker request and continues to pending toast fallback', () => {
    const target = document.createElement('textarea');
    const fallback = { target, mode: 'field', messageId: 'fallback-request' };
    pendingTranslationByToastId.set('fallback-toast', fallback);
    mocks.tracker.findRequestByElement.mockReturnValue('missing-request');

    expect(getPendingTranslationData(target, 'fallback-toast')).toBe(fallback);
  });

  it('continues to pendingTranslationData fallback when element association is stale', () => {
    const target = document.createElement('textarea');
    const fallback = { target, mode: 'field', messageId: 'weak-request' };
    pendingTranslationData.set(target, fallback);

    expect(getPendingTranslationData(target, null)).toBe(fallback);
  });

  it('keeps ownership data ahead of tracker and fallback sources', () => {
    const target = document.createElement('textarea');
    const ownership = beginFieldTranslationRequest(target).ownership;
    ownership.data = { target, mode: 'field', messageId: 'owned-request' };
    pendingTranslationData.set(target, { messageId: 'weak-request' });
    mocks.tracker.findRequestByElement.mockReturnValue('tracker-request');

    expect(getPendingTranslationData(target, null, ownership)).toBe(ownership.data);
  });
});
