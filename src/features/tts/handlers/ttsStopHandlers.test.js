import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  stateManager: {
    stopForOwner: vi.fn(),
    notifyTTSEnded: vi.fn(),
  },
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    warn: vi.fn(),
  })),
}));

vi.mock('@/shared/logging/logConstants.js', () => ({
  LOG_COMPONENTS: { TTS: 'tts' },
}));

vi.mock('@/features/tts/services/TTSStateManager.js', () => ({
  ttsStateManager: mocks.stateManager,
}));

vi.mock('@/features/tts/core/useBrowserAPI.js', () => ({
  initializebrowserAPI: vi.fn(),
}));

vi.mock('@/core/browserHandlers.js', () => ({
  isChromium: vi.fn(),
}));

vi.mock('@/shared/messaging/core/MessageActions.js', () => ({
  MessageActions: {},
}));

vi.mock('@/shared/constants/tts.js', () => ({
  TTS_ENGINES: { GOOGLE: 'google', EDGE: 'edge' },
}));

vi.mock('@/features/tts/constants/ttsProviders.js', () => ({
  PROVIDER_CONFIGS: { google: {}, edge: {} },
}));

vi.mock('@/features/tts/services/EdgeTTSClient.js', () => ({
  EdgeTTSClient: {},
}));

vi.mock('@/features/tts/services/TTSLanguageService.js', () => ({
  TTSLanguageService: {},
}));

import { handleEdgeTTSStopAll } from './handleEdgeTTS.js';
import { handleGoogleTTSStopAll, handleGoogleTTSEnded } from './handleGoogleTTS.js';

const handlers = [
  ['Google', handleGoogleTTSStopAll],
  ['Edge', handleEdgeTTSStopAll],
];

const ownerSender = { tab: { id: 1 }, frameId: 0 };

beforeEach(() => {
  mocks.stateManager.stopForOwner.mockReset().mockImplementation(
    async (_sender, { stopOnlyIfOwner }) => (
      stopOnlyIfOwner ? { success: true, skipped: true, reason: 'not_owner' }
        : { success: true, action: 'stopped' }
    ),
  );
  mocks.stateManager.notifyTTSEnded.mockReset().mockResolvedValue(undefined);
});

describe.each(handlers)('%s TTS stop handler delegation', (_provider, handleStop) => {
  it('delegates specific owner-scoped stop to TTSStateManager.stopForOwner', async () => {
    mocks.stateManager.stopForOwner.mockResolvedValueOnce({
      success: true,
      action: 'stopped',
      playbackToken: 'successor-token',
    });

    await expect(handleStop(
      { data: { ttsId: 'successor', stopOnlyIfOwner: true } },
      ownerSender,
    )).resolves.toEqual({
      success: true,
      action: 'stopped',
      playbackToken: 'successor-token',
    });

    expect(mocks.stateManager.stopForOwner).toHaveBeenCalledWith(
      ownerSender,
      { ttsId: 'successor', stopOnlyIfOwner: true },
    );
  });

  it('returns the StateManager skip result for mismatched owner/ttsId', async () => {
    mocks.stateManager.stopForOwner.mockResolvedValueOnce({
      success: true,
      skipped: true,
      reason: 'not_owner',
    });

    await expect(handleStop(
      { data: { ttsId: 'foreign', stopOnlyIfOwner: true } },
      ownerSender,
    )).resolves.toEqual({ success: true, skipped: true, reason: 'not_owner' });

    expect(mocks.stateManager.stopForOwner).toHaveBeenCalledTimes(1);
  });

  it('delegates global/manual stop with stopOnlyIfOwner false', async () => {
    mocks.stateManager.stopForOwner.mockResolvedValueOnce({
      success: true,
      action: 'stopped',
      playbackToken: 'current-token',
    });

    await expect(handleStop(
      { data: { ttsId: 'all', stopOnlyIfOwner: false } },
      ownerSender,
    )).resolves.toEqual({
      success: true,
      action: 'stopped',
      playbackToken: 'current-token',
    });

    expect(mocks.stateManager.stopForOwner).toHaveBeenCalledWith(
      ownerSender,
      { ttsId: 'all', stopOnlyIfOwner: false },
    );
  });

  it('tolerates a missing message.data payload by delegating with undefined fields', async () => {
    mocks.stateManager.stopForOwner.mockResolvedValueOnce({
      success: true,
      action: 'stopped',
      playbackToken: 'current-token',
    });

    await expect(handleStop({}, ownerSender)).resolves.toEqual({
      success: true,
      action: 'stopped',
      playbackToken: 'current-token',
    });

    expect(mocks.stateManager.stopForOwner).toHaveBeenCalledWith(
      ownerSender,
      { ttsId: undefined, stopOnlyIfOwner: undefined },
    );
  });

  it('returns a structured error result when the StateManager throws', async () => {
    mocks.stateManager.stopForOwner.mockRejectedValueOnce(new Error('boom'));

    await expect(handleStop(
      { data: { ttsId: 'all', stopOnlyIfOwner: true } },
      ownerSender,
    )).resolves.toEqual({ success: false, error: 'boom' });
  });
});

describe('Google TTS completion handler', () => {
  it.each(['stopped', 'interrupted'])('preserves %s terminal reason', async (reason) => {
    await expect(handleGoogleTTSEnded({
      reason,
      playbackToken: 'playback-token'
    })).resolves.toEqual({ success: true, action: 'cleared' });

    expect(mocks.stateManager.notifyTTSEnded).toHaveBeenCalledWith(
      reason,
      null,
      'playback-token',
    );
  });
});