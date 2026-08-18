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
  cleanupSupersededFieldTranslationState,
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
    expect(pendingTranslationData.get(target)).toBe(data);

    clearPendingTranslationData('toast-b', first);
    clearPendingNotificationData('stale', first);

    expect(pendingTranslationByToastId.get('toast-b')).toBe(data);
    expect(pendingTranslationData.get(target)).toBe(data);
    expect(window.pendingTranslationOwner).toBe(second);
  });

  it('clears current ownership data by exact WeakMap identity', () => {
    const target = document.createElement('textarea');
    const ownership = beginFieldTranslationRequest(target).ownership;
    const data = storePendingTranslationData(target, 'field', 'default', null, null, Date.now(), 'toast-current', 'message-current', ownership);

    clearPendingTranslationData('toast-current', ownership);

    expect(pendingTranslationData.has(target)).toBe(false);
    expect(pendingTranslationByToastId.has('toast-current')).toBe(false);
    expect(window.pendingTranslationOwner).toBeNull();
    expect(data).toBeDefined();
  });

  it('does not infer WeakMap cleanup without ownership', () => {
    const target = document.createElement('textarea');
    const ownership = beginFieldTranslationRequest(target).ownership;
    const data = storePendingTranslationData(target, 'field', 'default', null, null, Date.now(), 'toast-owned', 'message-owned', ownership);

    clearPendingTranslationData('toast-owned');

    expect(pendingTranslationData.get(target)).toBe(data);
  });

  it('removes active data while preserving processed toast history', () => {
    const target = document.createElement('textarea');
    const ownership = beginFieldTranslationRequest(target).ownership;
    const data = storePendingTranslationData(target, 'field', 'default', null, null, Date.now(), 'toast-processed', 'message-processed', ownership);
    data.processed = true;

    clearPendingTranslationData('toast-processed', ownership);

    expect(pendingTranslationData.has(target)).toBe(false);
    expect(pendingTranslationByToastId.get('toast-processed')).toBe(data);
    expect(window.pendingTranslationOwner).toBeNull();
  });

  it('does not recover terminal data after current cleanup', () => {
    const target = document.createElement('textarea');
    const ownership = beginFieldTranslationRequest(target).ownership;
    storePendingTranslationData(target, 'field', 'default', null, null, Date.now(), 'toast-terminal', 'message-terminal', ownership);

    clearPendingTranslationData('toast-terminal', ownership);

    expect(getPendingTranslationData(target, null)).toBeNull();
  });

  it('keeps newer target data when stale ownership cleans up', () => {
    const target = document.createElement('textarea');
    const first = beginFieldTranslationRequest(target).ownership;
    const firstData = storePendingTranslationData(target, 'field', 'default', null, null, Date.now(), 'toast-first', 'message-first', first);
    const second = beginFieldTranslationRequest(target).ownership;
    const secondData = storePendingTranslationData(target, 'field', 'default', null, null, Date.now(), 'toast-second', 'message-second', second);

    clearPendingTranslationData('toast-first', first);

    expect(firstData).not.toBe(secondData);
    expect(pendingTranslationData.get(target)).toBe(secondData);
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

  it('cleans superseded state only when target and toast identities match', () => {
    const target = document.createElement('textarea');
    const previous = {
      target,
      toastId: 'toast-a',
      data: { target, messageId: 'request-a' },
    };
    pendingTranslationData.set(target, previous.data);
    pendingTranslationByToastId.set(previous.toastId, previous.data);
    window.pendingTranslationOwner = previous;
    window.pendingTranslationTarget = target;
    window.pendingTranslationToastId = previous.toastId;

    cleanupSupersededFieldTranslationState(previous);

    expect(pendingTranslationData.has(target)).toBe(false);
    expect(pendingTranslationByToastId.has(previous.toastId)).toBe(false);
    expect(window.pendingTranslationOwner).toBeNull();
    expect(window.pendingTranslationTarget).toBeNull();
    expect(window.pendingTranslationToastId).toBeNull();
  });

  it('does not delete newer target or toast data for same identities', () => {
    const target = document.createElement('textarea');
    const previous = {
      target,
      toastId: 'shared-toast',
      data: { target, messageId: 'request-a' },
    };
    const currentData = { target, messageId: 'request-b' };
    pendingTranslationData.set(target, currentData);
    pendingTranslationByToastId.set(previous.toastId, currentData);
    window.pendingTranslationOwner = { target, data: currentData };

    cleanupSupersededFieldTranslationState(previous);

    expect(pendingTranslationData.get(target)).toBe(currentData);
    expect(pendingTranslationByToastId.get(previous.toastId)).toBe(currentData);
    expect(window.pendingTranslationOwner).not.toBeNull();
  });

  it('is safe and idempotent for incomplete previous ownership', () => {
    expect(() => cleanupSupersededFieldTranslationState(null)).not.toThrow();

    const previous = { target: document.createElement('textarea'), data: null, toastId: null };
    expect(() => cleanupSupersededFieldTranslationState(previous)).not.toThrow();
    expect(() => cleanupSupersededFieldTranslationState(previous)).not.toThrow();
  });
});
