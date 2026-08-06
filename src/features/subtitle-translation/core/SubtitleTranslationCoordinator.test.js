import { describe, it, expect, vi, beforeEach } from 'vitest';
import { subtitleTranslationCoordinator } from './SubtitleTranslationCoordinator.js';
import { SubtitleProgressTracker } from './SubtitleProgressTracker.js';
import { unifiedTranslationService } from '@/core/services/translation/UnifiedTranslationService.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

vi.mock('@/core/services/translation/UnifiedTranslationService.js', () => ({
  unifiedTranslationService: {
    handleTranslationRequest: vi.fn(),
    translationEngine: {
      getProvider: vi.fn().mockResolvedValue({
        rateLimitManager: { resetCircuitBreaker: vi.fn() }
      })
    }
  }
}));

vi.mock('@/shared/messaging/core/MessagingBus.js', () => ({
  MessagingBus: {
    broadcast: vi.fn()
  }
}));

describe('SubtitleTranslationCoordinator Stability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    subtitleTranslationCoordinator.activeJobs.clear();
  });

  it('should check for job cancellation before starting a batch', async () => {
    const jobId = 'test-job-cancel';
    
    // Mock handleTranslationRequest
    unifiedTranslationService.handleTranslationRequest.mockResolvedValue({ success: true, results: ['سلام'] });

    // Manually populate activeJobs and mark it as cancelled
    subtitleTranslationCoordinator.activeJobs.set(jobId, { 
      status: 'cancelled',
      progressTracker: { update: vi.fn() }
    });

    const result = await subtitleTranslationCoordinator._processBatch(jobId, [{ id: '1', text: 'Hello', index: 1, warnings: [] }], 'en', 'fa', 'google', {});

    expect(result.success).toBe(false);
    expect(result.error).toBe('Job cancelled before batch request');
    expect(unifiedTranslationService.handleTranslationRequest).not.toHaveBeenCalled();
  });

  it('should handle timeout protection using Promise.race', async () => {
    vi.useFakeTimers();
    try {
      const jobId = 'test-job-timeout';

      // Mock progress tracker
      const mockTracker = { update: vi.fn() };
      const batch = [{ id: '1', text: 'Hello', index: 1, warnings: [] }];
      subtitleTranslationCoordinator.activeJobs.set(jobId, {
        cues: batch,
        status: 'running',
        progressTracker: mockTracker
      });

      // Mock handleTranslationRequest to take forever
      unifiedTranslationService.handleTranslationRequest.mockImplementation(() => new Promise(() => {}));

      const promise = subtitleTranslationCoordinator._processBatch(
        jobId,
        batch,
        'en',
        'fa',
        'google',
        {}
      );

      const assertion = promise.then((result) => {
        expect(result.success).toBe(false);
        expect(result.isFatal).toBe(false);
        expect(result.error).toMatch(/timed out/);
        expect(result.error).not.toMatch(/cancell/i);
        // Source preserved: cue is failed, never translated, never cancelled
        expect(batch[0].status).toBe('failed');
        expect(batch[0].translatedText).toBeUndefined();
      });

      await vi.advanceTimersByTimeAsync(301000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('should preserve a genuine USER_CANCELLED failure, never a timeout', async () => {
    const jobId = 'test-job-cancel-type';
    const mockTracker = { update: vi.fn() };
    const batch = [{ id: '1', text: 'Hello', index: 1, warnings: [] }];
    subtitleTranslationCoordinator.activeJobs.set(jobId, {
      cues: batch,
      status: 'running',
      progressTracker: mockTracker
    });

    unifiedTranslationService.handleTranslationRequest.mockResolvedValue({
      success: false,
      error: { type: ErrorTypes.USER_CANCELLED, message: 'Translation cancelled' }
    });

    const result = await subtitleTranslationCoordinator._processBatch(
      jobId,
      batch,
      'en',
      'fa',
      'google',
      {}
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/cancell/i);
    expect(result.error).not.toMatch(/timed out/);
    // SUBTITLE coordinator keeps cancellation typed as USER_CANCELLED (fatal)
    expect(result.isFatal).toBe(true);
    expect(batch[0].translatedText).toBeUndefined();
  });
});

describe('SubtitleTranslationCoordinator Source-Preservation Contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    subtitleTranslationCoordinator.activeJobs.clear();
  });

  function cue(id, text, index) {
    return { id, text, index, warnings: [] };
  }

  function makeJob(cues) {
    const tracker = new SubtitleProgressTracker(cues.length);
    subtitleTranslationCoordinator.activeJobs.set('job', { cues, status: 'running', progressTracker: tracker });
    return tracker;
  }

  it('preserves the original cue and counts a failure for an under-returned cue (pipeline isSkipped marker)', async () => {
    const batch = [cue('1', 'Hello', 1)];
    const tracker = makeJob(batch);
    // The pipeline attaches isSkipped to a result it could not resolve.
    unifiedTranslationService.handleTranslationRequest.mockResolvedValue({
      success: true,
      results: [{ id: '1', text: 'Hello', isSkipped: true }]
    });

    await subtitleTranslationCoordinator._processBatch('job', batch, 'en', 'fa', 'google', {});

    expect(batch[0].translatedText).toBeUndefined();
    expect(batch[0].text).toBe('Hello');
    expect(batch[0].status).toBe('failed');
    const progress = tracker.getProgress();
    expect(progress.translated).toBe(0);
    expect(progress.failed).toBe(1);
  });

  it('keeps the original cue and fails when a blank translation is returned', async () => {
    const batch = [cue('b1', 'Hello', 1)];
    const tracker = makeJob(batch);
    unifiedTranslationService.handleTranslationRequest.mockResolvedValue({
      success: true,
      results: [{ id: 'b1', text: '' }]
    });

    await subtitleTranslationCoordinator._processBatch('job', batch, 'en', 'fa', 'google', {});

    expect(batch[0].translatedText).toBeUndefined();
    expect(batch[0].status).toBe('failed');
    const progress = tracker.getProgress();
    expect(progress.translated).toBe(0);
    expect(progress.failed).toBe(1);
  });

  it('treats a source-equal translation (URL -> URL) as valid, not failed', async () => {
    const batch = [cue('u1', 'URL', 1)];
    const tracker = makeJob(batch);
    unifiedTranslationService.handleTranslationRequest.mockResolvedValue({
      success: true,
      results: [{ id: 'u1', text: 'URL' }]
    });

    await subtitleTranslationCoordinator._processBatch('job', batch, 'en', 'fa', 'google', {});

    expect(batch[0].status).toBe('translated');
    expect(batch[0].translatedText).toBe('URL');
    const progress = tracker.getProgress();
    expect(progress.translated).toBe(1);
    expect(progress.failed).toBe(0);
  });

  it('counts a mixed batch correctly without reporting the missing cue as translated', async () => {
    const batch = [cue('m1', 'Hello', 1), cue('m2', 'World', 2), cue('m3', 'Again', 3)];
    const tracker = makeJob(batch);
    unifiedTranslationService.handleTranslationRequest.mockResolvedValue({
      success: true,
      results: [
        { id: 'm1', text: 'سلام' },
        { id: 'm2', text: 'World', isSkipped: true },
        { id: 'm3', text: 'دوباره' }
      ]
    });

    await subtitleTranslationCoordinator._processBatch('job', batch, 'en', 'fa', 'google', {});

    expect(batch[0].status).toBe('translated');
    expect(batch[0].translatedText).toBe('سلام');
    expect(batch[1].status).toBe('failed');
    expect(batch[1].translatedText).toBeUndefined();
    expect(batch[1].text).toBe('World');
    expect(batch[2].status).toBe('translated');
    const progress = tracker.getProgress();
    expect(progress.translated).toBe(2);
    expect(progress.failed).toBe(1);
  });

  it('keeps all cues original and fails every cue when the entire batch is unresolved', async () => {
    const batch = [cue('e1', 'One'), cue('e2', 'Two')];
    const tracker = makeJob(batch);
    unifiedTranslationService.handleTranslationRequest.mockResolvedValue({
      success: true,
      results: [
        { id: 'e1', text: 'One', isSkipped: true },
        { id: 'e2', text: 'Two', isSkipped: true }
      ]
    });

    await subtitleTranslationCoordinator._processBatch('job', batch, 'en', 'fa', 'google', {});

    batch.forEach(c => {
      expect(c.status).toBe('failed');
      expect(c.translatedText).toBeUndefined();
    });
    const progress = tracker.getProgress();
    expect(progress.translated).toBe(0);
    expect(progress.failed).toBe(2);
  });

  it('does not turn original cues into translated cues on a late timeout', async () => {
    const batch = [cue('t1', 'Hello')];
    const tracker = makeJob(batch);
    const timeoutError = new Error('Batch translation timed out');
    timeoutError.type = ErrorTypes.TRANSLATION_TIMEOUT;
    unifiedTranslationService.handleTranslationRequest.mockRejectedValue(timeoutError);

    await subtitleTranslationCoordinator._processBatch('job', batch, 'en', 'fa', 'google', {});

    expect(batch[0].translatedText).toBeUndefined();
    expect(batch[0].status).toBe('failed');
    const progress = tracker.getProgress();
    expect(progress.translated).toBe(0);
    expect(progress.failed).toBe(1);
  });
});
