import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserSpeechSTTProvider } from './BrowserSpeechSTTProvider.js';
import { STT_PROVIDER_STATUS, STT_PROVIDER_ERROR_CODES } from '../BaseSTTProvider.js';

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}));

describe('BrowserSpeechSTTProvider', () => {
  let startSpy;
  let stopSpy;
  let abortSpy;

  class MockSpeechRecognition {
    constructor() {
      this.continuous = false;
      this.interimResults = false;
      this.maxAlternatives = 0;
      this.lang = '';
      this.onresult = null;
      this.onerror = null;
      this.onend = null;
      startSpy = vi.fn(() => {
        this.started = true;
      });
      stopSpy = vi.fn(() => {
        this.stopped = true;
        this.onend?.();
      });
      abortSpy = vi.fn(() => {
        this.aborted = true;
        this.onend?.();
      });
    }

    start() {
      startSpy();
    }

    stop() {
      stopSpy();
    }

    abort() {
      abortSpy();
    }
  }

  beforeEach(() => {
    globalThis.SpeechRecognition = MockSpeechRecognition;
    globalThis.webkitSpeechRecognition = undefined;
    startSpy = null;
    stopSpy = null;
    abortSpy = null;
  });

  it('starts a session and emits only finalized transcript results', async () => {
    const onTranscriptResult = vi.fn();
    const provider = new BrowserSpeechSTTProvider();

    const status = await provider.startSession({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      language: 'en-US',
      onTranscriptResult
    });

    expect(status.state).toBe(STT_PROVIDER_STATUS.TRANSCRIBING);
    expect(startSpy).toHaveBeenCalledTimes(1);
    expect(provider.recognition.continuous).toBe(true);
    expect(provider.recognition.interimResults).toBe(true);
    expect(provider.recognition.maxAlternatives).toBe(1);

    provider.recognition.onresult?.({
      resultIndex: 0,
      results: [
        { isFinal: false, 0: { transcript: 'interim text' }, length: 1 },
        { isFinal: true, 0: { transcript: 'final text' }, length: 1 }
      ]
    });

    expect(onTranscriptResult).toHaveBeenCalledTimes(1);
    const emitted = onTranscriptResult.mock.calls[0][0];
    expect(emitted.text).toBe('final text');
    expect(emitted.isFinal).toBe(true);
    expect(emitted.segmentStartMs).toBe(0);
    expect(emitted.segmentEndMs).toBeGreaterThan(0);
  });

  it('stops and aborts an active session', async () => {
    const provider = new BrowserSpeechSTTProvider();

    await provider.startSession({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a'
    });

    await provider.stopSession({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a'
    });
    expect(stopSpy).toHaveBeenCalledTimes(1);

    await provider.startSession({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a'
    });

    await provider.abortSession({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a'
    });
    expect(abortSpy).toHaveBeenCalledTimes(1);
    expect(provider.state).toBe(STT_PROVIDER_STATUS.READY);
  });

  it('rejects unsupported browsers', async () => {
    globalThis.SpeechRecognition = undefined;
    globalThis.webkitSpeechRecognition = undefined;

    const provider = new BrowserSpeechSTTProvider();
    await expect(provider.startSession({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a'
    })).rejects.toMatchObject({
      code: STT_PROVIDER_ERROR_CODES.PROVIDER_NOT_FOUND
    });
  });

  it('uses an injected recognition constructor even when globals are unavailable', async () => {
    globalThis.SpeechRecognition = undefined;
    globalThis.webkitSpeechRecognition = undefined;

    const provider = new BrowserSpeechSTTProvider({
      recognitionConstructor: MockSpeechRecognition
    });

    expect(provider.state).toBe(STT_PROVIDER_STATUS.READY);

    await provider.startSession({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a'
    });

    expect(provider.recognition).toBeInstanceOf(MockSpeechRecognition);
  });
});
