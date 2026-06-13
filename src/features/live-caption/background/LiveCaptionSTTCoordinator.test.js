import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveCaptionSTTCoordinator } from './LiveCaptionSTTCoordinator.js';
import { LiveCaptionSessionManager } from '../core/LiveCaptionSessionManager.js';
import { LiveCaptionCaptureCoordinator } from './LiveCaptionCaptureCoordinator.js';
import { createSTTProviderError, STT_PROVIDER_ERROR_CODES } from '../stt/BaseSTTProvider.js';
import {
  LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES
} from './liveCaptionTranscriptContracts.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { getLiveCaptionSttProviderAsync } from '@/shared/config/config.js';

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}));

vi.mock('@/shared/config/config.js', () => ({
  getLiveCaptionSttProviderAsync: vi.fn().mockResolvedValue('openai_whisper')
}));

describe('live-caption STT coordinator', () => {
  let sessionManager;
  let captureCoordinator;
  let mockProvider;
  let mockFactory;
  let mockCache;
  let mockTranscriptEventCoordinator;
  let mockOnTranscriptSegment;
  let coordinator;

  beforeEach(() => {
    sessionManager = new LiveCaptionSessionManager();
    captureCoordinator = new LiveCaptionCaptureCoordinator();
    getLiveCaptionSttProviderAsync.mockResolvedValue('openai_whisper');

    mockProvider = {
      providerId: 'openai_whisper',
      transcribeChunk: vi.fn().mockResolvedValue({ text: 'Hello, World!' })
    };

    mockFactory = {
      getProvider: vi.fn().mockResolvedValue(mockProvider),
      getDefaultProviderId: vi.fn().mockReturnValue('openai_whisper'),
      getProviderDefinition: vi.fn().mockReturnValue({ displayName: 'OpenAI Whisper' })
    };

    mockCache = {
      appendTranscriptSegment: vi.fn().mockResolvedValue({})
    };

    mockTranscriptEventCoordinator = {
      handleTranscriptEvent: vi.fn((event) => ({
        handled: true,
        persisted: false,
        status: 'canonical_final',
        eventType: event.eventType,
        event,
        normalizedEvent: event,
        canonicalEvent: event,
        reason: null,
        error: null,
        metadata: {
          eventId: event.eventId,
          segmentId: event.segmentId,
          revision: event.revision,
          isFinal: event.isFinal
        }
      }))
    };

    mockOnTranscriptSegment = vi.fn().mockResolvedValue(undefined);

    coordinator = new LiveCaptionSTTCoordinator({
      sessionManager,
      captureCoordinator,
      sttFactory: mockFactory,
      cache: mockCache,
      transcriptEventCoordinator: mockTranscriptEventCoordinator,
      onTranscriptSegment: mockOnTranscriptSegment
    });
  });

  it('ignores chunks for inactive or invalid sessions', async () => {
    const chunk = {
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      chunkStartMs: 0,
      chunkEndMs: 3000,
      mimeType: 'audio/webm',
      chunkPayload: { size: 100 }
    };

    // No session created yet, should be ignored
    await coordinator.handleFinalizedChunk(chunk);
    expect(mockFactory.getProvider).not.toHaveBeenCalled();

    // Create page session, but no video session attached
    const pageSession = sessionManager.getOrCreateSession(7);
    pageSession.sessionId = 'session-1';
    await coordinator.handleFinalizedChunk(chunk);
    expect(mockFactory.getProvider).not.toHaveBeenCalled();
  });

  it('queues chunks and processes them sequentially (FIFO)', async () => {
    // Setup sessions
    const pageSession = sessionManager.getOrCreateSession(7);
    pageSession.sessionId = 'session-1';
    const mockVideoSession = {
      sessionId: 'video-1',
      videoFingerprint: 'video-a',
      addTranscriptSegment: vi.fn()
    };
    pageSession.activeVideoSession = mockVideoSession;

    // We will control when transcription resolves
    let resolveFirst;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    mockProvider.transcribeChunk = vi.fn()
      .mockImplementationOnce(() => firstPromise.then(() => ({ text: 'First Chunk' })))
      .mockImplementationOnce(() => Promise.resolve({ text: 'Second Chunk' }));

    const chunk1 = {
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      chunkStartMs: 0,
      chunkEndMs: 3000,
      mimeType: 'audio/webm',
      chunkPayload: { size: 100 }
    };

    const chunk2 = {
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      chunkStartMs: 3000,
      chunkEndMs: 6000,
      mimeType: 'audio/webm',
      chunkPayload: { size: 200 }
    };

    // Send first chunk
    await coordinator.handleFinalizedChunk(chunk1);
    await new Promise((resolve) => setTimeout(resolve, 0)); // flush async config lookup microtasks
    expect(mockProvider.transcribeChunk).toHaveBeenCalledTimes(1);

    // Send second chunk while first is in-flight
    await coordinator.handleFinalizedChunk(chunk2);
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Should not call transcribeChunk yet since queue is processing chunk1
    expect(mockProvider.transcribeChunk).toHaveBeenCalledTimes(1);

    // Resolve first chunk
    resolveFirst();
    
    // Allow microtasks to execute
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockProvider.transcribeChunk).toHaveBeenCalledTimes(2);
    expect(mockTranscriptEventCoordinator.handleTranscriptEvent).toHaveBeenCalledTimes(2);
    expect(mockVideoSession.addTranscriptSegment).toHaveBeenCalledTimes(2);
    expect(mockOnTranscriptSegment).toHaveBeenCalledTimes(2);

    expect(mockVideoSession.addTranscriptSegment).toHaveBeenNthCalledWith(1, expect.objectContaining({
      text: 'First Chunk',
      startMs: 0,
      endMs: 3000
    }));

    expect(mockVideoSession.addTranscriptSegment).toHaveBeenNthCalledWith(2, expect.objectContaining({
      text: 'Second Chunk',
      startMs: 3000,
      endMs: 6000
    }));

    expect(mockCache.appendTranscriptSegment).toHaveBeenCalledTimes(2);
    expect(mockCache.appendTranscriptSegment).toHaveBeenCalledWith(expect.objectContaining({
      text: 'First Chunk',
      segmentStartMs: 0,
      segmentEndMs: 3000,
      isIncognito: false
    }));

    expect(mockTranscriptEventCoordinator.handleTranscriptEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.FINAL,
        text: 'First Chunk',
        segmentStartMs: 0,
        segmentEndMs: 3000,
        isFinal: true
      })
    );
    expect(mockTranscriptEventCoordinator.handleTranscriptEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.FINAL,
        text: 'Second Chunk',
        segmentStartMs: 3000,
        segmentEndMs: 6000,
        isFinal: true
      })
    );

    expect(mockOnTranscriptSegment).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        text: 'First Chunk',
        startMs: 0,
        endMs: 3000,
        providerId: 'openai_whisper'
      }),
      { tabId: 7 }
    );
    expect(mockOnTranscriptSegment).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        text: 'Second Chunk',
        startMs: 3000,
        endMs: 6000,
        providerId: 'openai_whisper'
      }),
      { tabId: 7 }
    );
  });

  it('skips one failed local_whisper chunk and continues processing the next chunk', async () => {
    getLiveCaptionSttProviderAsync.mockResolvedValue('local_whisper');

    const pageSession = sessionManager.getOrCreateSession(7);
    pageSession.sessionId = 'session-1';
    const mockVideoSession = {
      sessionId: 'video-1',
      videoFingerprint: 'video-a',
      addTranscriptSegment: vi.fn()
    };
    pageSession.activeVideoSession = mockVideoSession;

    mockProvider = {
      providerId: 'local_whisper',
      transcribeChunk: vi.fn()
        .mockRejectedValueOnce(createSTTProviderError(
          STT_PROVIDER_ERROR_CODES.TRANSCRIPTION_FAILED,
          'Local Whisper request failed',
          { type: ErrorTypes.NETWORK_ERROR }
        ))
        .mockResolvedValueOnce({ text: 'Recovered chunk' })
    };

    mockFactory.getProvider.mockResolvedValue(mockProvider);

    const chunk1 = {
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      chunkStartMs: 0,
      chunkEndMs: 3000,
      mimeType: 'audio/webm',
      chunkPayload: { size: 100 }
    };

    const chunk2 = {
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      chunkStartMs: 3000,
      chunkEndMs: 6000,
      mimeType: 'audio/webm',
      chunkPayload: { size: 100 }
    };

    await coordinator.handleFinalizedChunk(chunk1);
    await coordinator.handleFinalizedChunk(chunk2);

    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(mockProvider.transcribeChunk).toHaveBeenCalledTimes(2);
    expect(mockVideoSession.addTranscriptSegment).toHaveBeenCalledTimes(1);
    expect(pageSession.lifecycleState).not.toBe('error');
    expect(captureCoordinator.status).not.toBe('error');
    expect(coordinator.getOrCreateQueue('session-1').chunks).toHaveLength(0);
  });

  it('treats transcript event normalization failures as STT processing failures without updating session or cache', async () => {
    const pageSession = sessionManager.getOrCreateSession(7);
    pageSession.sessionId = 'session-1';
    const mockVideoSession = {
      sessionId: 'video-1',
      videoFingerprint: 'video-a',
      addTranscriptSegment: vi.fn()
    };
    pageSession.activeVideoSession = mockVideoSession;
    captureCoordinator.setSessionContext({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a'
    });

    const transcriptEventError = new Error('Transcript event normalization failed');
    mockTranscriptEventCoordinator.handleTranscriptEvent = vi.fn().mockImplementation(() => {
      throw transcriptEventError;
    });

    mockProvider = {
      providerId: 'openai_whisper',
      transcribeChunk: vi.fn().mockResolvedValue({ text: 'Hello from batch' })
    };
    mockFactory.getProvider.mockResolvedValue(mockProvider);

    const chunk = {
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      chunkStartMs: 0,
      chunkEndMs: 3000,
      mimeType: 'audio/webm',
      chunkPayload: { size: 100 }
    };

    await coordinator.handleFinalizedChunk(chunk);

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockProvider.transcribeChunk).toHaveBeenCalledTimes(1);
    expect(mockTranscriptEventCoordinator.handleTranscriptEvent).toHaveBeenCalledTimes(1);
    expect(mockVideoSession.addTranscriptSegment).not.toHaveBeenCalled();
    expect(mockCache.appendTranscriptSegment).not.toHaveBeenCalled();
    expect(mockOnTranscriptSegment).not.toHaveBeenCalled();
    expect(pageSession.lifecycleState).toBe('error');
    expect(captureCoordinator.status).toBe('error');
    expect(coordinator.sessionQueues.has('session-1')).toBe(false);
  });

  it('fails closed after three consecutive local_whisper chunk failures', async () => {
    getLiveCaptionSttProviderAsync.mockResolvedValue('local_whisper');

    const pageSession = sessionManager.getOrCreateSession(7);
    pageSession.sessionId = 'session-1';
    const mockVideoSession = {
      sessionId: 'video-1',
      videoFingerprint: 'video-a',
      addTranscriptSegment: vi.fn()
    };
    pageSession.activeVideoSession = mockVideoSession;
    captureCoordinator.setSessionContext({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a'
    });

    mockProvider = {
      providerId: 'local_whisper',
      transcribeChunk: vi.fn().mockRejectedValue(createSTTProviderError(
        STT_PROVIDER_ERROR_CODES.TRANSCRIPTION_FAILED,
        'Local Whisper request failed',
        { type: ErrorTypes.NETWORK_ERROR }
      ))
    };
    mockFactory.getProvider.mockResolvedValue(mockProvider);

    const createChunk = (startMs) => ({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      chunkStartMs: startMs,
      chunkEndMs: startMs + 3000,
      mimeType: 'audio/webm',
      chunkPayload: { size: 100 }
    });

    await coordinator.handleFinalizedChunk(createChunk(0));
    await coordinator.handleFinalizedChunk(createChunk(3000));
    await coordinator.handleFinalizedChunk(createChunk(6000));

    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(mockProvider.transcribeChunk).toHaveBeenCalledTimes(3);
    expect(pageSession.lifecycleState).toBe('error');
    expect(captureCoordinator.status).toBe('error');
    expect(coordinator.sessionQueues.has('session-1')).toBe(false);
  });

  it('fails closed and cleans up on queue overflow (limit = 5)', async () => {
    const pageSession = sessionManager.getOrCreateSession(7);
    pageSession.sessionId = 'session-1';
    const mockVideoSession = {
      sessionId: 'video-1',
      videoFingerprint: 'video-a',
      addTranscriptSegment: vi.fn()
    };
    pageSession.activeVideoSession = mockVideoSession;
    captureCoordinator.setSessionContext({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a'
    });

    // Freeze transcription to accumulate chunks in queue
    mockProvider.transcribeChunk = vi.fn().mockImplementation(() => new Promise(() => {}));

    const createChunk = (startMs) => ({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      chunkStartMs: startMs,
      chunkEndMs: startMs + 3000,
      mimeType: 'audio/webm',
      chunkPayload: { size: 100 }
    });

    // Enqueue 5 chunks (first gets active, remaining 4 get queued)
    for (let i = 0; i < 5; i++) {
      await coordinator.handleFinalizedChunk(createChunk(i * 3000));
    }

    const queue = coordinator.getOrCreateQueue('session-1');
    expect(queue.chunks.length).toBe(5);

    // Enqueue 6th chunk -> expect queue overflow exception
    await expect(coordinator.handleFinalizedChunk(createChunk(15000)))
      .rejects.toThrow(/Queue overflow/);

    // Should fail closed
    expect(pageSession.lifecycleState).toBe('error');
    expect(captureCoordinator.status).toBe('error');
    expect(coordinator.sessionQueues.has('session-1')).toBe(false);
  });

  it('aborts active request and clears queue on stop', async () => {
    const pageSession = sessionManager.getOrCreateSession(7);
    pageSession.sessionId = 'session-1';
    const mockVideoSession = {
      sessionId: 'video-1',
      videoFingerprint: 'video-a',
      addTranscriptSegment: vi.fn()
    };
    pageSession.activeVideoSession = mockVideoSession;

    let aborted = false;
    mockProvider.transcribeChunk = vi.fn().mockImplementation((payload, options) => {
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          aborted = true;
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    await coordinator.handleFinalizedChunk({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      chunkStartMs: 0,
      chunkEndMs: 3000,
      mimeType: 'audio/webm',
      chunkPayload: { size: 100 }
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    // Stop coordinator session
    await coordinator.stopSession('session-1');

    expect(aborted).toBe(true);
    expect(coordinator.sessionQueues.has('session-1')).toBe(false);
  });

  it('aborts active request and clears queue on pause', async () => {
    const pageSession = sessionManager.getOrCreateSession(7);
    pageSession.sessionId = 'session-1';
    const mockVideoSession = {
      sessionId: 'video-1',
      videoFingerprint: 'video-a',
      addTranscriptSegment: vi.fn()
    };
    pageSession.activeVideoSession = mockVideoSession;

    let aborted = false;
    mockProvider.transcribeChunk = vi.fn().mockImplementation((payload, options) => {
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          aborted = true;
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    await coordinator.handleFinalizedChunk({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      chunkStartMs: 0,
      chunkEndMs: 3000,
      mimeType: 'audio/webm',
      chunkPayload: { size: 100 }
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    await coordinator.pauseSession('session-1');

    expect(aborted).toBe(true);
    expect(coordinator.sessionQueues.has('session-1')).toBe(false);
  });

  it('handles provider failures and transitions to error state', async () => {
    const pageSession = sessionManager.getOrCreateSession(7);
    pageSession.sessionId = 'session-1';
    const mockVideoSession = {
      sessionId: 'video-1',
      videoFingerprint: 'video-a',
      addTranscriptSegment: vi.fn()
    };
    pageSession.activeVideoSession = mockVideoSession;
    captureCoordinator.setSessionContext({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a'
    });

    const error = createSTTProviderError(
      STT_PROVIDER_ERROR_CODES.TRANSCRIPTION_FAILED,
      'Whisper down',
      { type: ErrorTypes.NETWORK_ERROR }
    );
    mockProvider.transcribeChunk = vi.fn().mockRejectedValue(error);

    await coordinator.handleFinalizedChunk({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      chunkStartMs: 0,
      chunkEndMs: 3000,
      mimeType: 'audio/webm',
      chunkPayload: { size: 100 }
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    // Wait a brief moment for async queue loop to execute catch block
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(pageSession.lifecycleState).toBe('error');
    expect(captureCoordinator.status).toBe('error');
    expect(coordinator.sessionQueues.has('session-1')).toBe(false);
  });
});
