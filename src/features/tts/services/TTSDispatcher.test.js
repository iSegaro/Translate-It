import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  stateManager: {
    currentTTSId: 'request-a',
    currentTTSSender: { tab: { id: 1 }, frameId: 0 },
    lastTTSLanguage: 'en',
    lastTTSText: 'active text',
    currentPlaybackToken: 'token-a',
    pendingPlaybackToken: null,
    broadcastStatus: vi.fn(),
    notifyTTSEnded: vi.fn().mockResolvedValue(undefined),
    notifyTTSRequestError: vi.fn().mockResolvedValue(undefined),
  },
  storageGet: vi.fn(),
  detect: vi.fn(),
  isAllowed: vi.fn(),
  resolveTTSSettings: vi.fn(),
  queueStart: vi.fn(),
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('@/shared/logging/logConstants.js', () => ({
  LOG_COMPONENTS: { TTS: 'tts' },
}));

vi.mock('@/features/tts/services/TTSStateManager.js', () => ({
  ttsStateManager: mocks.stateManager,
}));

vi.mock('@/shared/storage/core/StorageCore.js', () => ({
  default: { get: mocks.storageGet },
}));

vi.mock('@/shared/services/LanguageDetectionService.js', () => ({
  LanguageDetectionService: { detect: mocks.detect },
}));

vi.mock('@/features/tts/services/TTSCircuitBreaker.js', () => ({
  ttsCircuitBreaker: { isAllowed: mocks.isAllowed },
}));

vi.mock('@/features/tts/services/TTSLanguageService.js', () => ({
  TTSLanguageService: { resolveTTSSettings: mocks.resolveTTSSettings },
}));

vi.mock('@/features/tts/services/TTSQueueManager.js', () => ({
  ttsQueueManager: { start: mocks.queueStart },
}));

vi.mock('@/shared/constants/tts.js', () => ({
  TTS_ENGINES: { GOOGLE: 'google', EDGE: 'edge' },
}));

vi.mock('@/shared/constants/core.js', () => ({
  AUTO_DETECT_VALUE: 'auto',
}));

import { TTSDispatcher } from './TTSDispatcher.js';

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

beforeEach(() => {
  mocks.stateManager.currentTTSId = 'request-a';
  mocks.stateManager.currentTTSSender = { tab: { id: 1 }, frameId: 0 };
  mocks.stateManager.lastTTSLanguage = 'en';
  mocks.stateManager.lastTTSText = 'active text';
  mocks.stateManager.currentPlaybackToken = 'token-a';
  mocks.stateManager.pendingPlaybackToken = null;
  mocks.stateManager.broadcastStatus.mockReset();
  mocks.stateManager.notifyTTSEnded.mockReset().mockResolvedValue(undefined);
  mocks.stateManager.notifyTTSRequestError.mockReset().mockResolvedValue(undefined);
  mocks.storageGet.mockReset().mockResolvedValue({
    TTS_ENGINE: 'google',
    TTS_FALLBACK_ENABLED: true,
    TTS_AUTO_DETECT_ENABLED: true,
    TTS_PREFERRED_VOICES: {},
  });
  mocks.detect.mockReset();
  mocks.isAllowed.mockReset().mockResolvedValue(true);
  mocks.resolveTTSSettings.mockReset().mockReturnValue({ engine: 'google', language: 'fr' });
  mocks.queueStart.mockReset().mockResolvedValue({ success: true });
});

describe('TTSDispatcher successor resolution', () => {
  it('keeps active metadata unchanged while broadcasting successor detection', async () => {
    const detection = deferred();
    mocks.detect.mockReturnValue(detection.promise);
    const successorSender = { tab: { id: 2 }, frameId: 1 };
    const successorMessage = {
      data: {
        text: 'successor text',
        language: 'auto',
        ttsId: 'request-b',
      },
    };

    const dispatch = TTSDispatcher.dispatchTTSRequest(successorMessage, successorSender);
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.stateManager.currentTTSId).toBe('request-a');
    expect(mocks.stateManager.currentTTSSender).toEqual({ tab: { id: 1 }, frameId: 0 });
    expect(mocks.stateManager.lastTTSLanguage).toBe('en');
    expect(mocks.stateManager.lastTTSText).toBe('active text');
    expect(mocks.stateManager.broadcastStatus).not.toHaveBeenCalled();

    detection.resolve('fr');
    await dispatch;

    expect(mocks.stateManager.currentTTSId).toBe('request-a');
    expect(mocks.stateManager.currentTTSSender).toEqual({ tab: { id: 1 }, frameId: 0 });
    expect(mocks.stateManager.lastTTSLanguage).toBe('en');
    expect(mocks.stateManager.lastTTSText).toBe('active text');
    expect(mocks.stateManager.broadcastStatus).toHaveBeenCalledWith(
      'playing',
      {
        action: 'TTS_LANG_DETECTED',
        detectedSourceLanguage: 'fr',
      },
      {
        sender: successorSender,
        ttsId: 'request-b',
        detectedSourceLanguage: 'fr',
        text: 'successor text',
      },
    );
  });

  it('reports blocked successor without terminalizing committed predecessor', async () => {
    mocks.storageGet.mockResolvedValueOnce({
      TTS_ENGINE: 'google',
      TTS_FALLBACK_ENABLED: false,
      TTS_AUTO_DETECT_ENABLED: true,
      TTS_PREFERRED_VOICES: {},
    });
    mocks.isAllowed.mockResolvedValue(false);
    const successorSender = { tab: { id: 2 }, frameId: 1 };
    const successorMessage = {
      data: {
        text: 'successor text',
        language: 'fr',
        ttsId: 'request-b',
      },
    };

    const result = await TTSDispatcher.dispatchTTSRequest(successorMessage, successorSender);

    expect(result).toEqual({
      success: false,
      error: 'Circuit Breaker Open',
      errorType: 'ERRORS_CIRCUIT_BREAKER_OPEN',
    });
    expect(mocks.stateManager.notifyTTSRequestError).toHaveBeenCalledWith({
      sender: successorSender,
      ttsId: 'request-b',
      language: 'fr',
      text: 'successor text',
      error: {
        error: 'Circuit Breaker Open',
        errorType: 'ERRORS_CIRCUIT_BREAKER_OPEN',
      },
    });
    expect(mocks.stateManager.notifyTTSEnded).not.toHaveBeenCalled();
    expect(mocks.stateManager.currentPlaybackToken).toBe('token-a');
    expect(mocks.stateManager.currentTTSId).toBe('request-a');
    expect(mocks.stateManager.currentTTSSender).toEqual({ tab: { id: 1 }, frameId: 0 });
    expect(mocks.queueStart).not.toHaveBeenCalled();
  });

  it('starts queue with allowed fallback engine when primary is blocked', async () => {
    mocks.isAllowed.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const sender = { tab: { id: 2 }, frameId: 1 };
    const message = {
      data: {
        text: 'fallback text',
        language: 'fr',
        ttsId: 'request-b',
      },
    };

    await TTSDispatcher.dispatchTTSRequest(message, sender);

    expect(mocks.queueStart).toHaveBeenCalledWith('fallback text', 'fr', 'edge', message, sender);
    expect(mocks.resolveTTSSettings).toHaveBeenCalledTimes(1);
  });

  it('reports dispatcher exceptions with successor metadata without using token completion path', async () => {
    const dispatchError = new Error('settings unavailable');
    mocks.storageGet.mockRejectedValueOnce(dispatchError);
    const successorSender = { tab: { id: 2 }, frameId: 1 };
    const successorMessage = {
      data: {
        text: 'successor text',
        language: 'de',
        ttsId: 'request-b',
      },
    };

    const result = await TTSDispatcher.dispatchTTSRequest(successorMessage, successorSender);

    expect(result).toEqual({ success: false, error: 'settings unavailable' });
    expect(mocks.stateManager.notifyTTSRequestError).toHaveBeenCalledWith({
      sender: successorSender,
      ttsId: 'request-b',
      language: 'de',
      text: 'successor text',
      error: dispatchError,
    });
    expect(mocks.stateManager.notifyTTSEnded).not.toHaveBeenCalled();
    expect(mocks.stateManager.currentPlaybackToken).toBe('token-a');
    expect(mocks.stateManager.currentTTSId).toBe('request-a');
    expect(mocks.stateManager.currentTTSSender).toEqual({ tab: { id: 1 }, frameId: 0 });
    expect(mocks.queueStart).not.toHaveBeenCalled();
  });
});
