import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('@/core/contextCore.js');

const runtime = vi.hoisted(() => ({
  id: 'extension-id',
  getURL: vi.fn(() => 'chrome-extension://extension-id/test'),
}));

vi.mock('webextension-polyfill', () => ({
  default: { runtime },
}));

import {
  contextState,
  isContextError,
  isPermanentContextInvalidation,
  isTransientMessagingError,
  isValidSync,
} from './contextCore.js';

describe('contextCore error classification', () => {
  beforeEach(() => {
    contextState.isInvalidated = false;
    contextState.notificationShown = false;
    runtime.id = 'extension-id';
    runtime.getURL.mockReset().mockReturnValue('chrome-extension://extension-id/test');
  });

  it.each([
    'Receiving end does not exist',
    'Could not establish connection',
    'Message port closed',
    'Message channel closed',
  ])('classifies %s as transient without invalidating context', (message) => {
    const error = new Error(message);

    expect(isContextError(error)).toBe(true);
    expect(isTransientMessagingError(error)).toBe(true);
    expect(isPermanentContextInvalidation(error)).toBe(false);
    expect(isValidSync()).toBe(true);
    expect(contextState.isInvalidated).toBe(false);
  });

  it('recognizes permanent extension context invalidation', () => {
    const error = new Error('Extension context invalidated');

    expect(isPermanentContextInvalidation(error)).toBe(true);
    expect(isContextError(error)).toBe(true);
  });

  it.each([
    ['missing runtime id', () => { runtime.id = ''; }],
    ['runtime URL failure', () => runtime.getURL.mockImplementation(() => { throw new Error('runtime.getURL failed'); })],
  ])('marks %s as invalid through synchronous validation', (_label, invalidateRuntime) => {
    invalidateRuntime();

    expect(isValidSync()).toBe(false);
    expect(contextState.isInvalidated).toBe(true);
  });
});
