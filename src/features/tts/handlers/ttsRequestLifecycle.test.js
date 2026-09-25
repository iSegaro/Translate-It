import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const stateManager = {
    currentTTSRequest: null,
    pendingRequestKey: null,
    createPendingRequestKey: ({ engine, text, language, ttsId = null }) => ({
      engine,
      text,
      language,
      ...(ttsId === null || ttsId === undefined ? {} : { ttsId }),
    }),
    getPendingRequest(key) {
      if (!this.currentTTSRequest || !this.pendingRequestKey) return null;
      return ['engine', 'text', 'language', 'ttsId'].every((field) => (
        (this.pendingRequestKey[field] ?? null) === (key[field] ?? null)
      )) ? this.currentTTSRequest : null;
    },
    setPendingRequest(key, request) {
      this.pendingRequestKey = key;
      this.currentTTSRequest = request;
    },
    clearPendingRequest(key, request) {
      if (this.currentTTSRequest !== request || !this.getPendingRequest(key)) return false;
      this.pendingRequestKey = null;
      this.currentTTSRequest = null;
      return true;
    },
    notifyTTSEnded: vi.fn().mockResolvedValue(undefined),
    failPlaybackHandoff: vi.fn().mockResolvedValue(undefined),
    acquirePlaybackLease: vi.fn(),
    commitPlaybackLease: vi.fn(),
    playFirefoxAudio: vi.fn(),
  };

  return {
    stateManager,
    isChromium: vi.fn(() => false),
    initializebrowserAPI: vi.fn(async () => ({ runtime: { sendMessage: vi.fn() } })),
    edgeVoice: vi.fn(),
    edgeSynthesize: vi.fn(),
  };
});

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('@/shared/logging/logConstants.js', () => ({
  LOG_COMPONENTS: { TTS: 'tts' },
}));

vi.mock('@/features/tts/services/TTSStateManager.js', () => ({
  ttsStateManager: mocks.stateManager,
}));

vi.mock('@/core/browserHandlers.js', () => ({
  isChromium: mocks.isChromium,
}));

vi.mock('@/features/tts/core/useBrowserAPI.js', () => ({
  initializebrowserAPI: mocks.initializebrowserAPI,
}));

vi.mock('@/features/tts/services/TTSLanguageService.js', () => ({
  TTSLanguageService: {
    getEdgeVoiceForLanguage: mocks.edgeVoice,
  },
}));

vi.mock('@/features/tts/services/EdgeTTSClient.js', () => ({
  EdgeTTSClient: {
    synthesize: mocks.edgeSynthesize,
  },
}));

vi.mock('@/shared/constants/tts.js', () => ({
  TTS_ENGINES: { GOOGLE: 'google', EDGE: 'edge' },
}));

vi.mock('@/shared/messaging/core/MessageActions.js', () => ({
  MessageActions: { PLAY_OFFSCREEN_AUDIO: 'PLAY_OFFSCREEN_AUDIO' },
}));

vi.mock('@/features/tts/constants/ttsProviders.js', () => ({
  PROVIDER_CONFIGS: {
    google: {
      defaultLanguage: 'en',
      supportedLanguages: new Set(['en', 'fr']),
      encoding: 'UTF-8',
      clientParam: 'gtx',
      baseUrl: 'https://example.test/tts',
      cleaningRegex: /[^\w\s.!?]/g,
      maxTextLength: 200,
    },
  },
}));

import { handleEdgeTTSSpeak } from './handleEdgeTTS.js';
import { handleGoogleTTSSpeak } from './handleGoogleTTS.js';

const sender = { tab: { id: 7 }, frameId: 0 };

function pendingPlayback() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  mocks.stateManager.playFirefoxAudio.mockReturnValue(promise);
  return resolve;
}

beforeEach(() => {
  mocks.stateManager.currentTTSRequest = null;
  mocks.stateManager.pendingRequestKey = null;
  mocks.stateManager.notifyTTSEnded.mockReset().mockResolvedValue(undefined);
  mocks.stateManager.failPlaybackHandoff.mockReset().mockResolvedValue(undefined);
  mocks.stateManager.playFirefoxAudio.mockReset();
  mocks.edgeVoice.mockReset().mockResolvedValue('en-US-JennyNeural');
  mocks.edgeSynthesize.mockReset().mockResolvedValue({
    arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([1, 2]).buffer),
  });
});

describe.each([
  ['Google', handleGoogleTTSSpeak, 'google'],
  ['Edge', handleEdgeTTSSpeak, 'edge'],
])('%s pending request identity', (provider, handleSpeak, engine) => {
  it('returns same promise for matching pending metadata', async () => {
    const releasePlayback = pendingPlayback();
    const message = {
      data: { text: 'same text', language: 'en', ttsId: 'request-a' },
    };

    const first = handleSpeak(message, sender);
    const duplicate = handleSpeak({ ...message, data: { ...message.data } }, sender);

    expect(duplicate).toBe(first);
    expect(mocks.stateManager.playFirefoxAudio).toHaveBeenCalledTimes(0);

    releasePlayback();
    await expect(first).resolves.toMatchObject({ success: true, processedVia: `${engine}-tts` });
  });

  it('keeps distinct request handoff and only newer request clears pending state', async () => {
    const releasePlayback = pendingPlayback();
    const first = handleSpeak({
      data: { text: 'first text', language: 'en', ttsId: 'request-a' },
    }, sender);
    const second = handleSpeak({
      data: { text: 'second text', language: 'en', ttsId: 'request-b' },
    }, sender);

    expect(second).not.toBe(first);
    expect(mocks.stateManager.notifyTTSEnded).toHaveBeenCalledWith('interrupted');

    releasePlayback();
    await expect(first).resolves.toMatchObject({ success: true });
    await expect(second).resolves.toMatchObject({ success: true });
    expect(mocks.stateManager.currentTTSRequest).toBeNull();
  });
});
