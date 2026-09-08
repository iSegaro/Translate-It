import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  currentOwner: { tab: { id: 1 }, frameId: 0 },
  pendingOwner: { tab: { id: 2 }, frameId: 0 },
  stateManager: {
    currentTTSId: 'current',
    currentTTSSender: null,
    pendingPlaybackToken: null,
    pendingPlaybackMetadata: null,
    isCurrentOwner: vi.fn(),
    stopPlayback: vi.fn(),
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
  TTS_ENGINES: { GOOGLE: 'google' },
}));

vi.mock('@/features/tts/constants/ttsProviders.js', () => ({
  PROVIDER_CONFIGS: { google: {} },
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

beforeEach(() => {
  mocks.stateManager.currentTTSId = 'current';
  mocks.stateManager.currentTTSSender = mocks.currentOwner;
  mocks.stateManager.pendingPlaybackToken = 'successor-token';
  mocks.stateManager.pendingPlaybackMetadata = {
    sender: mocks.pendingOwner,
    ttsId: 'successor',
  };
  mocks.stateManager.isCurrentOwner.mockReset().mockImplementation(
    (sender, owner = mocks.stateManager.currentTTSSender) => sender === owner,
  );
  mocks.stateManager.stopPlayback.mockReset().mockResolvedValue({
    success: true,
    action: 'stopped',
  });
  mocks.stateManager.notifyTTSEnded.mockReset().mockResolvedValue(undefined);
});

describe.each(handlers)('%s TTS stop handler', (provider, handleStop) => {
  it('stops pending successor when ID and owner match', async () => {
    await expect(handleStop(
      { data: { ttsId: 'successor', stopOnlyIfOwner: true } },
      mocks.pendingOwner,
    )).resolves.toEqual({ success: true, action: 'stopped' });

    expect(mocks.stateManager.isCurrentOwner).toHaveBeenCalledWith(
      mocks.pendingOwner,
      mocks.pendingOwner,
    );
    expect(mocks.stateManager.stopPlayback).toHaveBeenCalledTimes(1);
  });

  it('skips pending successor with wrong ID', async () => {
    await expect(handleStop(
      { data: { ttsId: 'wrong-id', stopOnlyIfOwner: true } },
      mocks.pendingOwner,
    )).resolves.toEqual({ success: true, skipped: true });

    expect(mocks.stateManager.isCurrentOwner).not.toHaveBeenCalled();
    expect(mocks.stateManager.stopPlayback).not.toHaveBeenCalled();
  });

  it('skips stale predecessor ID and owner while successor is pending', async () => {
    await expect(handleStop(
      { data: { ttsId: 'current', stopOnlyIfOwner: true } },
      mocks.currentOwner,
    )).resolves.toEqual({ success: true, skipped: true });

    expect(mocks.stateManager.isCurrentOwner).not.toHaveBeenCalled();
    expect(mocks.stateManager.stopPlayback).not.toHaveBeenCalled();
  });

  it('skips pending successor from wrong owner', async () => {
    await expect(handleStop(
      { data: { ttsId: 'successor', stopOnlyIfOwner: true } },
      mocks.currentOwner,
    )).resolves.toEqual({ success: true, skipped: true, reason: 'not_owner' });

    expect(mocks.stateManager.isCurrentOwner).toHaveBeenCalledWith(
      mocks.currentOwner,
      mocks.pendingOwner,
    );
    expect(mocks.stateManager.stopPlayback).not.toHaveBeenCalled();
  });

  it('skips stale predecessor owner during pending stop-all', async () => {
    await expect(handleStop(
      { data: { ttsId: 'all', stopOnlyIfOwner: true } },
      mocks.currentOwner,
    )).resolves.toEqual({ success: true, skipped: true, reason: 'not_owner' });

    expect(mocks.stateManager.isCurrentOwner).toHaveBeenCalledWith(
      mocks.currentOwner,
      mocks.pendingOwner,
    );
    expect(mocks.stateManager.stopPlayback).not.toHaveBeenCalled();

    await expect(handleStop(
      { data: { ttsId: 'all', stopOnlyIfOwner: true } },
      mocks.pendingOwner,
    )).resolves.toEqual({ success: true, action: 'stopped' });

    expect(mocks.stateManager.stopPlayback).toHaveBeenCalledTimes(1);
  });

  it('keeps ownerless stop-all unconditional during pending playback', async () => {
    await expect(handleStop(
      { data: { ttsId: 'all', stopOnlyIfOwner: false } },
      mocks.currentOwner,
    )).resolves.toEqual({ success: true, action: 'stopped' });

    expect(mocks.stateManager.isCurrentOwner).not.toHaveBeenCalled();
    expect(mocks.stateManager.stopPlayback).toHaveBeenCalledTimes(1);
  });

  it('keeps current playback checks when no successor is pending', async () => {
    mocks.stateManager.pendingPlaybackToken = null;
    mocks.stateManager.pendingPlaybackMetadata = null;

    await expect(handleStop(
      { data: { ttsId: 'current', stopOnlyIfOwner: true } },
      mocks.currentOwner,
    )).resolves.toEqual({ success: true, action: 'stopped' });

    await expect(handleStop(
      { data: { ttsId: 'current', stopOnlyIfOwner: true } },
      mocks.pendingOwner,
    )).resolves.toEqual({ success: true, skipped: true, reason: 'not_owner' });
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
