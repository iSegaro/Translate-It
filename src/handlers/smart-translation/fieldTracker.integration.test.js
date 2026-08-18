import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RequestStatus,
  TranslationRequestTracker,
} from '@/core/services/translation/TranslationRequestTracker.js';
import { TranslationMode } from '@/shared/config/config.js';

describe('content-side Field tracker lifecycle', () => {
  let tracker;

  beforeEach(() => {
    vi.useFakeTimers();
    tracker = new TranslationRequestTracker();
  });

  afterEach(() => {
    tracker.stopCleanup();
    vi.useRealTimers();
  });

  function createRequest(messageId) {
    return tracker.createRequest({
      messageId,
      data: { mode: TranslationMode.Field, text: messageId, toastId: `toast-${messageId}` },
      sender: { tab: { id: 1 }, frameId: 0 },
    });
  }

  it('transitions successful Field request to COMPLETED and counts once', () => {
    createRequest('success');

    expect(tracker.isRequestActive('success')).toBe(true);
    expect(tracker.completeRequest('success', { success: true, result: { applied: true } }))
      .toMatchObject({ accepted: true, status: RequestStatus.COMPLETED });
    expect(tracker.getRequest('success').status).toBe(RequestStatus.COMPLETED);
    expect(tracker.getStatistics()).toMatchObject({
      totalCompleted: 1,
      totalFailed: 0,
      totalTimeouts: 0,
      totalCancelled: 0,
    });
  });

  it('transitions provider/application failure to FAILED and counts once', () => {
    createRequest('failure');

    expect(tracker.failRequest('failure', new Error('application failed')))
      .toMatchObject({ accepted: true, status: RequestStatus.FAILED });
    expect(tracker.getRequest('failure')).toMatchObject({ status: RequestStatus.FAILED });
    expect(tracker.getStatistics()).toMatchObject({
      totalCompleted: 0,
      totalFailed: 1,
      totalTimeouts: 0,
      totalCancelled: 0,
    });
  });

  it('transitions timeout to TIMEOUT without FAILED or CANCELLED', () => {
    createRequest('timeout');

    expect(tracker.markTimeout('timeout'))
      .toMatchObject({ accepted: true, status: RequestStatus.TIMEOUT });
    expect(tracker.getRequest('timeout')).toMatchObject({ status: RequestStatus.TIMEOUT });
    expect(tracker.getStatistics()).toMatchObject({
      totalCompleted: 0,
      totalFailed: 0,
      totalTimeouts: 1,
      totalCancelled: 0,
    });
  });

  it('transitions user cancellation to CANCELLED and counts once', () => {
    createRequest('cancelled');

    expect(tracker.cancelRequest('cancelled', 'user_cancelled'))
      .toMatchObject({ accepted: true, status: RequestStatus.CANCELLED });
    expect(tracker.getRequest('cancelled')).toMatchObject({
      status: RequestStatus.CANCELLED,
      cancelReason: 'user_cancelled',
    });
    expect(tracker.getStatistics()).toMatchObject({
      totalCompleted: 0,
      totalFailed: 0,
      totalTimeouts: 0,
      totalCancelled: 1,
    });
  });

  it('cancels replaced A, rejects late A transitions, and completes B independently', () => {
    createRequest('request-a');
    createRequest('request-b');

    expect(tracker.cancelRequest('request-a', 'replacement'))
      .toMatchObject({ accepted: true, status: RequestStatus.CANCELLED });
    expect(tracker.getRequest('request-a')).toMatchObject({
      status: RequestStatus.CANCELLED,
      cancelReason: 'replacement',
    });
    expect(tracker.isRequestActive('request-b')).toBe(true);

    expect(tracker.failRequest('request-a', new Error('late failure')))
      .toMatchObject({ accepted: false, reason: 'already_terminal' });
    expect(tracker.completeRequest('request-a', { success: true }))
      .toMatchObject({ accepted: false, reason: 'already_terminal' });
    expect(tracker.markTimeout('request-a'))
      .toMatchObject({ accepted: false, reason: 'already_terminal' });

    expect(tracker.completeRequest('request-b', { success: true }))
      .toMatchObject({ accepted: true, status: RequestStatus.COMPLETED });
    expect(tracker.getStatistics()).toMatchObject({
      totalCompleted: 1,
      totalFailed: 0,
      totalTimeouts: 0,
      totalCancelled: 1,
    });
  });
});
