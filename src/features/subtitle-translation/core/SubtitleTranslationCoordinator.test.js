import { describe, it, expect, vi, beforeEach } from 'vitest';
import { subtitleTranslationCoordinator } from './SubtitleTranslationCoordinator.js';
import { SubtitleProgressTracker } from './SubtitleProgressTracker.js';
import { unifiedTranslationService } from '@/core/services/translation/UnifiedTranslationService.js';
import { TranslationMode } from '@/shared/config/config.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { SubtitleParserFactory } from '../parsers/SubtitleParserFactory.js';
import { SubtitleBatchPlanner } from './SubtitleBatchPlanner.js';
import { MessagingBus } from '@/shared/messaging/core/MessagingBus.js';

vi.mock('../parsers/SubtitleParserFactory.js', () => ({
  SubtitleParserFactory: {
    getAdapter: vi.fn(() => ({
      parse: vi.fn(() => ({ cues: [] })),
      serialize: vi.fn(() => '')
    }))
  }
}));

vi.mock('./SubtitleBatchPlanner.js', () => ({
  SubtitleBatchPlanner: { plan: vi.fn(() => []) }
}));

vi.mock('./SubtitleProviderLimitsResolver.js', () => ({
  SubtitleProviderLimitsResolver: { resolve: vi.fn(() => ({ characterLimit: 500, maxChunks: 10 })) }
}));

vi.mock('@/core/services/translation/UnifiedTranslationService.js', () => ({
  unifiedTranslationService: {
    handleTranslationRequest: vi.fn(),
    handleTimeout: vi.fn().mockResolvedValue({ handled: true, success: true }),
    cancelRequest: vi.fn().mockResolvedValue({ handled: true, success: true }),
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

  const makeCue = (id, text, index) => ({ id, text, index, warnings: [] });

  it.each(['deepl', 'edge'])('forwards selected %s as explicit canonical provider', async (providerId) => {
    const cue = makeCue(`${providerId}-cue`, 'Hello', 1);
    subtitleTranslationCoordinator.activeJobs.set(`job-${providerId}`, {
      cues: [cue],
      status: 'running',
      progressTracker: new SubtitleProgressTracker(1),
      activeBatchMessageId: null
    });
    unifiedTranslationService.handleTranslationRequest.mockResolvedValue({
      success: true,
      results: [{ id: cue.id, text: 'Translated' }]
    });

    const result = await subtitleTranslationCoordinator._processBatch(
      `job-${providerId}`,
      [cue],
      'en',
      'fa',
      providerId,
      {}
    );

    expect(result.success).toBe(true);
    const message = unifiedTranslationService.handleTranslationRequest.mock.calls[0][0];
    expect(message.data).toMatchObject({
      provider: providerId,
      isExplicitProvider: true,
      mode: TranslationMode.Subtitle
    });
    expect(message.data).not.toHaveProperty('providerId');
  });

  it('preserves existing batch payload fields with explicit provider ownership', async () => {
    const previousCue = makeCue('previous', 'Earlier', 1);
    const currentCue = makeCue('current', 'Hello', 2);
    subtitleTranslationCoordinator.activeJobs.set('job-payload', {
      cues: [previousCue, currentCue],
      status: 'running',
      progressTracker: new SubtitleProgressTracker(1),
      activeBatchMessageId: null
    });
    unifiedTranslationService.handleTranslationRequest.mockResolvedValue({
      success: true,
      results: [{ id: currentCue.id, text: 'Translated' }]
    });

    const result = await subtitleTranslationCoordinator._processBatch(
      'job-payload',
      [currentCue],
      'en',
      'fa',
      'deepl',
      { useContext: true }
    );

    expect(result.success).toBe(true);
    const message = unifiedTranslationService.handleTranslationRequest.mock.calls[0][0];
    expect(message.data).toMatchObject({
      items: [{ id: currentCue.id, text: 'Hello', context: 'Previous cues: Earlier' }],
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      provider: 'deepl',
      isExplicitProvider: true,
      mode: TranslationMode.Subtitle,
      metadata: { batchInstruction: expect.anything() },
      contextMetadata: { dialogueContext: 'Subtitle dialogue: Earlier' }
    });
    expect(message.data).toHaveProperty('promptTemplate');
    expect(message.data).toHaveProperty('instruction');
    expect(message.data).not.toHaveProperty('providerId');
  });

  it('continues to next batch after an exhausted SERVER_ERROR', async () => {
    const firstCue = makeCue('server-error-cue', 'First source', 1);
    const secondCue = makeCue('next-cue', 'Second source', 2);
    SubtitleParserFactory.getAdapter.mockReturnValue({
      parse: vi.fn(() => ({ cues: [firstCue, secondCue] })),
      serialize: vi.fn(() => 'serialized')
    });
    SubtitleBatchPlanner.plan.mockReturnValue([[firstCue], [secondCue]]);
    unifiedTranslationService.handleTranslationRequest
      .mockResolvedValueOnce({
        success: false,
        errorDetails: {
          message: 'HTTP 500',
          type: ErrorTypes.SERVER_ERROR,
          statusCode: 500,
          providerName: 'Lingva'
        }
      })
      .mockResolvedValueOnce({
        success: true,
        results: [{ id: secondCue.id, text: 'Second translated' }]
      });

    await subtitleTranslationCoordinator.startJob({
      jobId: 'job-server-error-continue',
      content: 'subtitle',
      filename: 'sample.srt',
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      providerId: 'google',
      options: {}
    });

    expect(unifiedTranslationService.handleTranslationRequest).toHaveBeenCalledTimes(2);
    expect(firstCue.status).toBe('failed');
    expect(firstCue.text).toBe('First source');
    expect(firstCue.translatedText).toBeUndefined();
    expect(secondCue.status).toBe('translated');
    expect(secondCue.translatedText).toBe('Second translated');

    const complete = MessagingBus.broadcast.mock.calls
      .map(([message]) => message)
      .find(message => message.action === MessageActions.SUBTITLE_TRANSLATE_COMPLETE);
    expect(complete.payload.stats).toMatchObject({ translated: 1, failed: 1, skipped: 0 });
    expect(complete.payload.errorDetails).toMatchObject({
      type: ErrorTypes.SERVER_ERROR,
      statusCode: 500
    });
  });

  it('stops after SERVER_ERROR becomes CIRCUIT_BREAKER_OPEN and rescues prior progress', async () => {
    const firstCue = makeCue('translated-cue', 'Translated source', 1);
    const failedCue = makeCue('circuit-cue', 'Circuit source', 2);
    const untouchedCue = makeCue('untouched-cue', 'Untouched source', 3);
    SubtitleParserFactory.getAdapter.mockReturnValue({
      parse: vi.fn(() => ({ cues: [firstCue, failedCue, untouchedCue] })),
      serialize: vi.fn(() => 'serialized')
    });
    SubtitleBatchPlanner.plan.mockReturnValue([[firstCue], [failedCue], [untouchedCue]]);
    unifiedTranslationService.handleTranslationRequest
      .mockResolvedValueOnce({
        success: true,
        results: [{ id: firstCue.id, text: 'Translated result' }]
      })
      .mockResolvedValueOnce({
        success: false,
        errorDetails: {
          message: 'Circuit breaker open',
          type: ErrorTypes.CIRCUIT_BREAKER_OPEN,
          originalType: ErrorTypes.SERVER_ERROR,
          statusCode: 500,
          providerName: 'Lingva'
        }
      });

    await subtitleTranslationCoordinator.startJob({
      jobId: 'job-server-circuit-stop',
      content: 'subtitle',
      filename: 'sample.srt',
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      providerId: 'google',
      options: {}
    });

    expect(unifiedTranslationService.handleTranslationRequest).toHaveBeenCalledTimes(2);
    expect(firstCue.status).toBe('translated');
    expect(firstCue.translatedText).toBe('Translated result');
    expect(failedCue.status).toBe('failed');
    expect(failedCue.text).toBe('Circuit source');
    expect(untouchedCue.status).toBeUndefined();
    expect(untouchedCue.translatedText).toBeUndefined();

    const complete = MessagingBus.broadcast.mock.calls
      .map(([message]) => message)
      .find(message => message.action === MessageActions.SUBTITLE_TRANSLATE_COMPLETE);
    expect(complete.payload.stats).toMatchObject({ translated: 1, failed: 1, skipped: 1 });
    expect(complete.payload.errorDetails).toMatchObject({
      type: ErrorTypes.CIRCUIT_BREAKER_OPEN,
      originalType: ErrorTypes.SERVER_ERROR,
      statusCode: 500
    });
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
    expect(result.errorDetails.message).toBe('Job cancelled before batch request');
    expect(unifiedTranslationService.handleTranslationRequest).not.toHaveBeenCalled();
  });

  it.each([undefined, null])('owns %s startup payload failure and emits canonical details', async (payload) => {
    await expect(subtitleTranslationCoordinator.startJob(payload)).resolves.toBeUndefined();

    expect(MessagingBus.broadcast).toHaveBeenCalledWith(expect.objectContaining({
      action: MessageActions.SUBTITLE_TRANSLATE_ERROR,
      payload: expect.objectContaining({
        jobId: undefined,
        errorDetails: expect.objectContaining({
          message: expect.any(String),
          type: expect.any(String)
        })
      })
    }));
    const errorPayload = MessagingBus.broadcast.mock.calls.at(-1)[0].payload;
    expect(errorPayload).not.toHaveProperty('error');
    expect(subtitleTranslationCoordinator.activeJobs.size).toBe(0);
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
        expect(result.errorDetails.message).toMatch(/timed out/);
        expect(result.errorDetails.message).not.toMatch(/cancell/i);
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
    expect(result.errorDetails.message).toMatch(/cancell/i);
    expect(result.errorDetails.message).not.toMatch(/timed out/);
    // SUBTITLE coordinator keeps cancellation typed as USER_CANCELLED (fatal)
    expect(result.isFatal).toBe(true);
    expect(batch[0].translatedText).toBeUndefined();
  });

  it('preserves canonical provider error identity across batch result boundary', async () => {
    const jobId = 'test-job-canonical-error';
    const mockTracker = { update: vi.fn() };
    const batch = [{ id: '1', text: 'Hello', index: 1, warnings: [] }];
    subtitleTranslationCoordinator.activeJobs.set(jobId, {
      cues: batch,
      status: 'running',
      progressTracker: mockTracker
    });
    unifiedTranslationService.handleTranslationRequest.mockResolvedValue({
      success: false,
      error: {
        message: 'Provider failed',
        type: 'PROVIDER_ERROR',
        originalType: 'HTTP_ERROR',
        statusCode: 503,
        context: 'subtitle-batch',
        providerName: 'Provider',
        providerId: 'provider-id',
        code: 'UPSTREAM_FAILURE',
        errorCode: 'E_UPSTREAM',
        translationOutcome: { partial: true },
        cause: 'private',
        arbitrary: { ignored: true }
      }
    });

    const result = await subtitleTranslationCoordinator._processBatch(
      jobId,
      batch,
      'en',
      'fa',
      'google',
      {}
    );

    expect(result).toMatchObject({
      success: false,
      errorDetails: {
        message: 'Provider failed',
        type: 'PROVIDER_ERROR',
        originalType: 'HTTP_ERROR',
        statusCode: 503,
        context: 'subtitle-batch',
        providerName: 'Provider',
        providerId: 'provider-id',
        code: 'UPSTREAM_FAILURE',
        errorCode: 'E_UPSTREAM',
        translationOutcome: { partial: true }
      }
    });
    expect(result.errorDetails).not.toHaveProperty('cause');
    expect(result.errorDetails).not.toHaveProperty('arbitrary');
    expect(batch[0].status).toBe('failed');
    expect(batch[0].translatedText).toBeUndefined();
  });

  it('prefers canonical errorDetails over a conflicting object error', async () => {
    const jobId = 'test-job-details-vs-object';
    const mockTracker = { update: vi.fn() };
    const batch = [{ id: '1', text: 'Hello', index: 1, warnings: [] }];
    subtitleTranslationCoordinator.activeJobs.set(jobId, {
      cues: batch,
      status: 'running',
      progressTracker: mockTracker
    });
    unifiedTranslationService.handleTranslationRequest.mockResolvedValue({
      success: false,
      error: { message: 'legacy failure', type: 'LEGACY_ERROR' },
      errorDetails: {
        message: 'canonical failure',
        type: 'PROVIDER_ERROR',
        originalType: 'HTTP_ERROR',
        statusCode: 503,
        context: 'subtitle-batch',
        providerName: 'Provider',
        providerId: 'provider-id',
        code: 'UPSTREAM_FAILURE',
        errorCode: 'E_UPSTREAM',
        translationOutcome: { partial: true }
      }
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
    expect(result.errorDetails).toMatchObject({
      message: 'canonical failure',
      type: 'PROVIDER_ERROR',
      originalType: 'HTTP_ERROR',
      statusCode: 503,
      context: 'subtitle-batch',
      providerName: 'Provider',
      providerId: 'provider-id',
      code: 'UPSTREAM_FAILURE',
      errorCode: 'E_UPSTREAM',
      translationOutcome: { partial: true }
    });
    expect(result.errorDetails).not.toHaveProperty('cause');
    expect(result.errorDetails).not.toHaveProperty('arbitrary');
    expect(batch[0].status).toBe('failed');
  });

  it('prefers canonical errorDetails over a string error', async () => {
    const jobId = 'test-job-details-vs-string';
    const mockTracker = { update: vi.fn() };
    const batch = [{ id: '1', text: 'Hello', index: 1, warnings: [] }];
    subtitleTranslationCoordinator.activeJobs.set(jobId, {
      cues: batch,
      status: 'running',
      progressTracker: mockTracker
    });
    unifiedTranslationService.handleTranslationRequest.mockResolvedValue({
      success: false,
      error: 'legacy/raw failure',
      errorDetails: {
        message: 'canonical failure',
        type: 'API_KEY_INVALID',
        originalType: 'AUTH_ERROR',
        statusCode: 401,
        providerName: 'Provider',
        providerId: 'provider-id',
        code: 'INVALID_CREDENTIALS',
        errorCode: 'E_AUTH'
      }
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
    expect(result.errorDetails).toMatchObject({
      message: 'canonical failure',
      type: 'API_KEY_INVALID',
      originalType: 'AUTH_ERROR',
      statusCode: 401,
      providerName: 'Provider',
      providerId: 'provider-id',
      code: 'INVALID_CREDENTIALS',
      errorCode: 'E_AUTH'
    });
    expect(result.errorDetails).not.toHaveProperty('cause');
    expect(result.errorDetails).not.toHaveProperty('arbitrary');
  });

  it('keeps canonical identity for an errorDetails-only failure, never degrading to Unknown error', async () => {
    const jobId = 'test-job-details-only';
    const mockTracker = { update: vi.fn() };
    const batch = [{ id: '1', text: 'Hello', index: 1, warnings: [] }];
    subtitleTranslationCoordinator.activeJobs.set(jobId, {
      cues: batch,
      status: 'running',
      progressTracker: mockTracker
    });
    unifiedTranslationService.handleTranslationRequest.mockResolvedValue({
      success: false,
      errorDetails: {
        message: 'canonical failure',
        type: 'PROVIDER_ERROR',
        originalType: 'HTTP_ERROR',
        statusCode: 503,
        providerName: 'Provider',
        providerId: 'provider-id',
        code: 'UPSTREAM_FAILURE',
        errorCode: 'E_UPSTREAM'
      }
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
    expect(result.errorDetails).toMatchObject({
      message: 'canonical failure',
      type: 'PROVIDER_ERROR',
      originalType: 'HTTP_ERROR',
      statusCode: 503,
      providerName: 'Provider',
      providerId: 'provider-id',
      code: 'UPSTREAM_FAILURE',
      errorCode: 'E_UPSTREAM'
    });
    expect(result.errorDetails.message).not.toBe('Unknown error');
    expect(result.errorDetails).not.toHaveProperty('cause');
    expect(result.errorDetails).not.toHaveProperty('arbitrary');
  });

  it('falls back to the legacy error when errorDetails is malformed', async () => {
    const jobId = 'test-job-malformed-details';
    const mockTracker = { update: vi.fn() };
    const batch = [{ id: '1', text: 'Hello', index: 1, warnings: [] }];
    subtitleTranslationCoordinator.activeJobs.set(jobId, {
      cues: batch,
      status: 'running',
      progressTracker: mockTracker
    });
    unifiedTranslationService.handleTranslationRequest.mockResolvedValue({
      success: false,
      error: {
        message: 'legacy failure',
        type: 'LEGACY_ERROR',
        originalType: 'LEGACY_ORIGIN',
        statusCode: 502,
        providerName: 'Legacy',
        providerId: 'legacy-id',
        code: 'LEGACY_CODE',
        errorCode: 'E_LEGACY'
      },
      errorDetails: { arbitrary: true }
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
    expect(result.errorDetails).toMatchObject({
      message: 'legacy failure',
      type: 'LEGACY_ERROR',
      originalType: 'LEGACY_ORIGIN',
      statusCode: 502,
      providerName: 'Legacy',
      providerId: 'legacy-id',
      code: 'LEGACY_CODE',
      errorCode: 'E_LEGACY'
    });
    expect(result.errorDetails).not.toHaveProperty('cause');
    expect(result.errorDetails).not.toHaveProperty('arbitrary');
  });

  it('emits structured error events without the legacy error field', () => {
    const error = Object.assign(new Error('Provider failed'), {
      type: 'PROVIDER_ERROR',
      originalType: 'HTTP_ERROR',
      statusCode: 503,
      providerName: 'Provider',
      providerId: 'provider-id'
    });

    subtitleTranslationCoordinator._notifyError('job-error-event', error.message, error);

    const payload = MessagingBus.broadcast.mock.calls.at(-1)[0].payload;
    expect(payload).toEqual({
      jobId: 'job-error-event',
      errorDetails: {
        message: 'Provider failed',
        type: 'PROVIDER_ERROR',
        originalType: 'HTTP_ERROR',
        statusCode: 503,
        providerName: 'Provider',
        providerId: 'provider-id'
      }
    });
    expect(payload).not.toHaveProperty('error');
  });

  it('passes only canonical details to the tracker on fatal batch failure', async () => {
    const cue = { id: 'fatal-1', text: 'Hello', index: 1, warnings: [] };
    SubtitleParserFactory.getAdapter.mockReturnValue({
      parse: vi.fn(() => ({ cues: [cue] })),
      serialize: vi.fn(() => 'serialized')
    });
    SubtitleBatchPlanner.plan.mockReturnValue([[cue]]);
    unifiedTranslationService.handleTranslationRequest.mockResolvedValue({
      success: false,
      error: { message: 'Provider failed', type: ErrorTypes.API_KEY_INVALID }
    });
    const setTerminalError = vi.spyOn(SubtitleProgressTracker.prototype, 'setTerminalError');

    try {
      await subtitleTranslationCoordinator.startJob({
        jobId: 'job-fatal-details',
        content: 'subtitle',
        filename: 'sample.srt',
        sourceLanguage: 'en',
        targetLanguage: 'fa',
        providerId: 'google',
        options: {}
      });

      expect(setTerminalError).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Provider failed',
        type: ErrorTypes.API_KEY_INVALID
      }));
      expect(setTerminalError.mock.calls[0]).toHaveLength(1);
    } finally {
      setTerminalError.mockRestore();
    }
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

  it('continues after a formatting-token failure and counts translated and failed cues separately', async () => {
    const batch = [
      cue('format-valid-a', '<i>Hello</i>', 1),
      cue('format-corrupt-b', '{\\an8}Styled', 2),
      cue('format-valid-c', 'Line 1\nLine 2', 3)
    ];
    const tracker = makeJob(batch);
    unifiedTranslationService.handleTranslationRequest.mockResolvedValue({
      success: true,
      results: [
        { id: batch[0].id, text: '@@SUB_TAG_0@@Hola@@SUB_TAG_1@@' },
        { id: batch[1].id, text: 'Estilo perdido' },
        { id: batch[2].id, text: 'Linea 1@@SUB_NL_0@@Linea 2' }
      ]
    });

    const result = await subtitleTranslationCoordinator._processBatch('job', batch, 'en', 'fa', 'google', {});

    expect(result.success).toBe(true);
    expect(batch[0]).toMatchObject({ status: 'translated', translatedText: '<i>Hola</i>' });
    expect(batch[1]).toMatchObject({ status: 'failed', translatedText: '', text: '{\\an8}Styled' });
    expect(batch[2]).toMatchObject({ status: 'translated', translatedText: 'Linea 1\nLinea 2' });
    expect(tracker.getProgress()).toMatchObject({ translated: 2, failed: 1, processed: 3 });
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

describe('SubtitleTranslationCoordinator Timeout Ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    subtitleTranslationCoordinator.activeJobs.clear();
  });

  it('calls the canonical service timeout lifecycle for the exact batch on outer timeout', async () => {
    vi.useFakeTimers();
    try {
      const jobId = 'job-outer-owns';
      const batch = [{ id: '1', text: 'Hello', index: 1, warnings: [] }];
      subtitleTranslationCoordinator.activeJobs.set(jobId, {
        cues: batch,
        status: 'running',
        progressTracker: { update: vi.fn() },
        activeBatchMessageId: null
      });

      unifiedTranslationService.handleTranslationRequest.mockImplementation(() => new Promise(() => {}));

      const promise = subtitleTranslationCoordinator._processBatch(jobId, batch, 'en', 'fa', 'google', {});
      await vi.advanceTimersByTimeAsync(301000);
      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.isFatal).toBe(false);
      expect(result.errorDetails.message).toMatch(/timed out/);

      const sentMessage = unifiedTranslationService.handleTranslationRequest.mock.calls[0][0];
      expect(unifiedTranslationService.handleTimeout).toHaveBeenCalledWith(sentMessage.messageId);
      // No zombie: the job no longer tracks a live batch request.
      expect(subtitleTranslationCoordinator.activeJobs.get(jobId).activeBatchMessageId).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears the outer timer and never triggers the timeout lifecycle on success', async () => {
    vi.useFakeTimers();
    try {
      const jobId = 'job-clean-success';
      const batch = [{ id: '1', text: 'Hello', index: 1, warnings: [] }];
      subtitleTranslationCoordinator.activeJobs.set(jobId, {
        cues: batch,
        status: 'running',
        progressTracker: { update: vi.fn() },
        activeBatchMessageId: null
      });

      unifiedTranslationService.handleTranslationRequest.mockResolvedValue({
        success: true,
        results: [{ id: '1', text: 'سلام' }]
      });

      await subtitleTranslationCoordinator._processBatch(jobId, batch, 'en', 'fa', 'google', {});
      await vi.advanceTimersByTimeAsync(301000);

      expect(unifiedTranslationService.handleTimeout).not.toHaveBeenCalled();
      expect(subtitleTranslationCoordinator.activeJobs.get(jobId).activeBatchMessageId).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears the outer timer and never triggers the timeout lifecycle on a normal error', async () => {
    vi.useFakeTimers();
    try {
      const jobId = 'job-clean-error';
      const batch = [{ id: '1', text: 'Hello', index: 1, warnings: [] }];
      subtitleTranslationCoordinator.activeJobs.set(jobId, {
        cues: batch,
        status: 'running',
        progressTracker: { update: vi.fn() },
        activeBatchMessageId: null
      });

      unifiedTranslationService.handleTranslationRequest.mockResolvedValue({
        success: false,
        error: { type: ErrorTypes.USER_CANCELLED, message: 'Translation cancelled' }
      });

      await subtitleTranslationCoordinator._processBatch(jobId, batch, 'en', 'fa', 'google', {});
      await vi.advanceTimersByTimeAsync(301000);

      expect(unifiedTranslationService.handleTimeout).not.toHaveBeenCalled();
      expect(subtitleTranslationCoordinator.activeJobs.get(jobId).activeBatchMessageId).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a failing handleTimeout does not replace the local timeout result', async () => {
    vi.useFakeTimers();
    try {
      const jobId = 'job-timeout-service-fail';
      const batch = [{ id: '1', text: 'Hello', index: 1, warnings: [] }];
      subtitleTranslationCoordinator.activeJobs.set(jobId, {
        cues: batch,
        status: 'running',
        progressTracker: { update: vi.fn() },
        activeBatchMessageId: null
      });

      unifiedTranslationService.handleTranslationRequest.mockImplementation(() => new Promise(() => {}));
      unifiedTranslationService.handleTimeout.mockRejectedValue(new Error('service down'));

      const promise = subtitleTranslationCoordinator._processBatch(jobId, batch, 'en', 'fa', 'google', {});
      await vi.advanceTimersByTimeAsync(301000);
      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.errorDetails.message).toMatch(/timed out/);
      expect(unifiedTranslationService.handleTimeout).toHaveBeenCalled();
      expect(subtitleTranslationCoordinator.activeJobs.get(jobId).activeBatchMessageId).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancelJob cancels the in-flight batch request via the service', async () => {
    const jobId = 'job-cancel-inflight';
    subtitleTranslationCoordinator.activeJobs.set(jobId, {
      cues: [],
      status: 'running',
      progressTracker: { update: vi.fn() },
      activeBatchMessageId: 'msg-123'
    });

    subtitleTranslationCoordinator.cancelJob(jobId);

    expect(unifiedTranslationService.cancelRequest).toHaveBeenCalledWith('msg-123', 'user-cancel');
    expect(subtitleTranslationCoordinator.activeJobs.get(jobId).status).toBe('cancelled');
    // Active ID cleared so a stale finally cannot cancel a newer batch.
    expect(subtitleTranslationCoordinator.activeJobs.get(jobId).activeBatchMessageId).toBeNull();
  });

  it('cancelJob does not call cancelRequest when no batch is in flight', async () => {
    const jobId = 'job-cancel-idle';
    subtitleTranslationCoordinator.activeJobs.set(jobId, {
      cues: [],
      status: 'running',
      progressTracker: { update: vi.fn() },
      activeBatchMessageId: null
    });

    subtitleTranslationCoordinator.cancelJob(jobId);

    expect(unifiedTranslationService.cancelRequest).not.toHaveBeenCalled();
    expect(subtitleTranslationCoordinator.activeJobs.get(jobId).status).toBe('cancelled');
  });

  it('a stale finally does not clear a newer batch active ID', async () => {
    const jobId = 'job-stale-finally';
    const batchA = [{ id: 'a', text: 'A', index: 1, warnings: [] }];
    const batchB = [{ id: 'b', text: 'B', index: 2, warnings: [] }];
    subtitleTranslationCoordinator.activeJobs.set(jobId, {
      cues: [...batchA, ...batchB],
      status: 'running',
      progressTracker: { update: vi.fn() },
      activeBatchMessageId: null
    });

    const pending = [];
    unifiedTranslationService.handleTranslationRequest.mockImplementation((message) => {
      const call = { messageId: message.messageId };
      call.promise = new Promise(resolve => { call.resolve = resolve; });
      pending.push(call);
      return call.promise;
    });

    const promiseA = subtitleTranslationCoordinator._processBatch(jobId, batchA, 'en', 'fa', 'google', {});
    const promiseB = subtitleTranslationCoordinator._processBatch(jobId, batchB, 'en', 'fa', 'google', {});
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(pending).toHaveLength(2);
    const [callA, callB] = pending;
    expect(callA.messageId).toBeTruthy();

    callA.resolve({ success: true, results: [{ id: 'a', text: 'A' }] });
    await promiseA;
    // B is still in flight and owns the active ID; A's stale finally must leave it.
    expect(subtitleTranslationCoordinator.activeJobs.get(jobId).activeBatchMessageId).toBe(callB.messageId);

    callB.resolve({ success: true, results: [{ id: 'b', text: 'B' }] });
    await promiseB;
    expect(subtitleTranslationCoordinator.activeJobs.get(jobId).activeBatchMessageId).toBeNull();
  });

  it('waits for canonical timeout cleanup to settle before finishing the batch', async () => {
    vi.useFakeTimers();
    try {
      const jobId = 'job-cleanup-gate';
      const batch = [{ id: '1', text: 'Hello', index: 1, warnings: [] }];
      subtitleTranslationCoordinator.activeJobs.set(jobId, {
        cues: batch,
        status: 'running',
        progressTracker: { update: vi.fn() },
        activeBatchMessageId: null
      });

      // Request hangs forever; timeout cleanup stays pending until we release it.
      unifiedTranslationService.handleTranslationRequest.mockImplementation(() => new Promise(() => {}));
      let resolveCleanup;
      unifiedTranslationService.handleTimeout.mockImplementation(() => new Promise(resolve => { resolveCleanup = resolve; }));

      const promise = subtitleTranslationCoordinator._processBatch(jobId, batch, 'en', 'fa', 'google', {});
      await vi.advanceTimersByTimeAsync(301000);

      // Cleanup still pending: the batch must not have finished.
      let settled = false;
      promise.then(() => { settled = true; });
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toBe(false);

      resolveCleanup({ handled: true, success: true });
      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.isFatal).toBe(false);
      expect(result.errorDetails.message).toMatch(/timed out/);
      const sentMessage = unifiedTranslationService.handleTranslationRequest.mock.calls[0][0];
      expect(unifiedTranslationService.handleTimeout).toHaveBeenCalledWith(sentMessage.messageId);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not start the next batch before the previous timeout cleanup settles', async () => {
    vi.useFakeTimers();
    try {
      const jobId = 'job-next-batch-gate';
      const cue1 = { id: '1', text: 'Hello', index: 1, warnings: [] };
      const cue2 = { id: '2', text: 'World', index: 2, warnings: [] };
      SubtitleParserFactory.getAdapter.mockReturnValue({
        parse: vi.fn(() => ({ cues: [cue1, cue2] })),
        serialize: vi.fn(() => 'serialized')
      });
      SubtitleBatchPlanner.plan.mockReturnValue([[cue1], [cue2]]);

      // Batch 1 hangs; batch 2 would succeed.
      unifiedTranslationService.handleTranslationRequest
        .mockImplementationOnce(() => new Promise(() => {}))
        .mockImplementationOnce(() => Promise.resolve({ success: true, results: [{ id: '2', text: 'سلام' }] }));

      let resolveCleanup;
      unifiedTranslationService.handleTimeout.mockImplementation(() => new Promise(resolve => { resolveCleanup = resolve; }));

      const jobPromise = subtitleTranslationCoordinator.startJob({
        jobId,
        content: '1\n00:00:01,000 --> 00:00:02,000\nHello',
        filename: 'test.srt',
        sourceLanguage: 'en',
        targetLanguage: 'fa',
        providerId: 'google',
        options: {}
      });

      await vi.advanceTimersByTimeAsync(301000);

      // Batch 1 timed out but cleanup is still pending: batch 2 must NOT have started.
      expect(unifiedTranslationService.handleTranslationRequest).toHaveBeenCalledTimes(1);

      resolveCleanup({ handled: true, success: true });
      await jobPromise;

      expect(unifiedTranslationService.handleTranslationRequest).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps TRANSLATION_TIMEOUT primary when canonical cleanup fails', async () => {
    vi.useFakeTimers();
    try {
      const jobId = 'job-cleanup-fallback';
      const batch = [{ id: '1', text: 'Hello', index: 1, warnings: [] }];
      subtitleTranslationCoordinator.activeJobs.set(jobId, {
        cues: batch,
        status: 'running',
        progressTracker: { update: vi.fn() },
        activeBatchMessageId: null
      });

      unifiedTranslationService.handleTranslationRequest.mockImplementation(() => new Promise(() => {}));
      unifiedTranslationService.handleTimeout.mockRejectedValue(new Error('cleanup exploded'));

      const promise = subtitleTranslationCoordinator._processBatch(jobId, batch, 'en', 'fa', 'google', {});
      await vi.advanceTimersByTimeAsync(301000);
      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.isFatal).toBe(false);
      expect(result.errorDetails.message).toMatch(/timed out/);
      expect(unifiedTranslationService.cancelRequest).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not fall back to cancelRequest when handleTimeout succeeds', async () => {
    vi.useFakeTimers();
    try {
      const jobId = 'job-cleanup-success';
      const batch = [{ id: '1', text: 'Hello', index: 1, warnings: [] }];
      subtitleTranslationCoordinator.activeJobs.set(jobId, {
        cues: batch,
        status: 'running',
        progressTracker: { update: vi.fn() },
        activeBatchMessageId: null
      });

      unifiedTranslationService.handleTranslationRequest.mockImplementation(() => new Promise(() => {}));
      unifiedTranslationService.handleTimeout.mockResolvedValue({ handled: true, success: true });

      const promise = subtitleTranslationCoordinator._processBatch(jobId, batch, 'en', 'fa', 'google', {});
      await vi.advanceTimersByTimeAsync(301000);
      const result = await promise;

      expect(result.errorDetails.message).toMatch(/timed out/);
      expect(unifiedTranslationService.cancelRequest).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
