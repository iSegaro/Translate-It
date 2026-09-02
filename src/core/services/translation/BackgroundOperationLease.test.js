import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';

const mocks = vi.hoisted(() => ({
  sessionSet: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      session: {
        set: mocks.sessionSet,
      },
    },
  },
}));

import {
  backgroundOperationLease,
  withBackgroundOperationLease,
} from './BackgroundOperationLease.js';

function clearLeases() {
  for (const operationId of backgroundOperationLease.getStatus().activeOperationIds) {
    while (backgroundOperationLease.release(operationId)) {
      // Release every reference owned by test setup.
    }
  }
}

describe('BackgroundOperationLease', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.sessionSet.mockReset().mockResolvedValue(undefined);
    browser.storage.session = { set: mocks.sessionSet };
    clearLeases();
  });

  afterEach(() => {
    clearLeases();
    vi.useRealTimers();
  });

  it('starts heartbeat for first operation and stops after release', () => {
    const lease = backgroundOperationLease.acquire('A');

    expect(backgroundOperationLease.getStatus()).toMatchObject({
      activeOperationIds: ['A'],
      activeOperationCount: 1,
      timerActive: true,
    });
    expect(mocks.sessionSet).toHaveBeenCalledTimes(1);

    lease.release();

    expect(backgroundOperationLease.getStatus()).toMatchObject({
      activeOperationIds: [],
      activeOperationCount: 0,
      timer: null,
      timerActive: false,
    });
  });

  it('keeps heartbeat active while another operation remains', () => {
    const first = backgroundOperationLease.acquire('A');
    const second = backgroundOperationLease.acquire('B');

    first.release();
    expect(backgroundOperationLease.getStatus()).toMatchObject({
      activeOperationIds: ['B'],
      activeOperationCount: 1,
      timerActive: true,
    });

    second.release();
    expect(backgroundOperationLease.getStatus().timer).toBeNull();
  });

  it('keeps duplicate acquire/release calls reference-counted', () => {
    const first = backgroundOperationLease.acquire('A');
    const second = backgroundOperationLease.acquire('A');

    first.release();
    expect(backgroundOperationLease.getStatus().activeOperationCount).toBe(1);
    expect(backgroundOperationLease.getStatus().timerActive).toBe(true);

    second.release();
    expect(backgroundOperationLease.getStatus().activeOperationCount).toBe(0);
  });

  it.each([
    ['success', () => 'result'],
    ['failure', () => { throw new Error('failed'); }],
  ])('releases lease on %s', async (_label, operation) => {
    const promise = withBackgroundOperationLease('operation', async () => operation());

    if (_label === 'failure') await expect(promise).rejects.toThrow('failed');
    else await expect(promise).resolves.toBe('result');

    expect(backgroundOperationLease.getStatus().activeOperationCount).toBe(0);
    expect(backgroundOperationLease.getStatus().timer).toBeNull();
  });

  it('sends periodic heartbeats without creating a permanent timer', async () => {
    const lease = backgroundOperationLease.acquire('slow');

    await vi.advanceTimersByTimeAsync(44_000);
    expect(mocks.sessionSet).toHaveBeenCalledTimes(3);

    lease.release();
    await vi.advanceTimersByTimeAsync(44_000);
    expect(mocks.sessionSet).toHaveBeenCalledTimes(3);
  });

  it('continues without a timer when session storage is unsupported', () => {
    browser.storage.session = undefined;

    const lease = backgroundOperationLease.acquire('unsupported');

    expect(backgroundOperationLease.getStatus()).toMatchObject({
      activeOperationCount: 1,
      timer: null,
      timerActive: false,
    });
    lease.release();
    expect(mocks.sessionSet).not.toHaveBeenCalled();
  });

  it('swallows heartbeat API failures', async () => {
    mocks.sessionSet.mockRejectedValue(new Error('unsupported'));

    const lease = backgroundOperationLease.acquire('api-failure');
    await vi.advanceTimersByTimeAsync(22_000);

    expect(backgroundOperationLease.getStatus().activeOperationCount).toBe(1);
    lease.release();
  });
});
