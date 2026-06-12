import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  probeBrowserSpeechRuntime,
  BROWSER_SPEECH_PROBE_ACTION
} from './liveCaptionBrowserSpeechProbe.js';

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}));

describe('live-caption browser speech probe', () => {
  class MockSpeechRecognition {
    constructor() {
      this.onstart = null;
      this.onerror = null;
      this.onend = null;
    }

    start() {
      queueMicrotask(() => {
        this.onstart?.();
      });
    }

    abort() {
      this.onend?.();
    }
  }

  beforeEach(() => {
    globalThis.SpeechRecognition = MockSpeechRecognition;
    globalThis.webkitSpeechRecognition = undefined;
  });

  it('returns a structured offscreen probe result when speech recognition can start', async () => {
    const result = await probeBrowserSpeechRuntime({
      timeoutMs: 100
    });

    expect(result).toEqual(expect.objectContaining({
      runtime: 'offscreen',
      hasSpeechRecognition: true,
      hasWebkitSpeechRecognition: false,
      canConstruct: true,
      canStart: true,
      errorName: null,
      errorMessage: null
    }));
    expect(result.userAgent).toEqual(expect.any(String));
    expect(BROWSER_SPEECH_PROBE_ACTION).toBe('live-caption/offscreen/browser-speech/probe');
  });
});
