import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  browserAPI: {
    offscreen: undefined,
    runtime: {
      sendMessage: vi.fn(),
    },
    tabs: {
      sendMessage: vi.fn(),
    },
  },
  acquire: vi.fn(),
  release: vi.fn(),
  ensureDocument: vi.fn(),
  queue: {
    chunks: [],
    currentIndex: -1,
    onChunkEnded: vi.fn(),
    stop: vi.fn(),
  },
}));

vi.mock('@/features/tts/core/useBrowserAPI.js', () => ({
  initializebrowserAPI: vi.fn(async () => mocks.browserAPI),
}));

vi.mock('@/features/tts/services/TTSQueueManager.js', () => ({
  ttsQueueManager: mocks.queue,
}));

vi.mock('@/shared/runtime/OffscreenRuntimeLeaseManager.js', () => ({
  offscreenRuntimeLeaseManager: {
    acquire: mocks.acquire,
    release: mocks.release,
    ensureDocument: mocks.ensureDocument,
  },
}));

import { TTSStateManager, ttsStateManager } from './TTSStateManager.js';

function resetState() {
  ttsStateManager.fullReset();
  mocks.queue.chunks.length = 0;
  mocks.queue.currentIndex = -1;
  mocks.queue.stop.mockReset();
}

beforeEach(() => {
  resetState();
  mocks.browserAPI.offscreen = { hasDocument: vi.fn(async () => true) };
  mocks.browserAPI.runtime.sendMessage.mockReset().mockResolvedValue(undefined);
  mocks.browserAPI.tabs.sendMessage.mockReset().mockResolvedValue(undefined);
  mocks.acquire.mockReset().mockResolvedValue(true);
  mocks.release.mockReset().mockResolvedValue(true);
  mocks.ensureDocument.mockReset().mockResolvedValue(true);
  mocks.queue.onChunkEnded.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  resetState();
});

describe('TTSStateManager offscreen lease lifecycle', () => {
  it('acquires stable TTS playback identity', async () => {
    const playbackToken = await ttsStateManager.acquirePlaybackLease();

    expect(mocks.acquire).toHaveBeenCalledWith({
      owner: 'tts',
      leaseId: playbackToken,
      requiredReasons: ['AUDIO_PLAYBACK'],
    });
    expect(playbackToken).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('keeps UUID identities unique across recreated state managers', async () => {
    const firstManager = new TTSStateManager();
    const secondManager = new TTSStateManager();

    const firstToken = await firstManager.acquirePlaybackLease();
    const secondToken = await secondManager.acquirePlaybackLease();

    expect(secondToken).not.toBe(firstToken);
    expect(mocks.acquire).toHaveBeenNthCalledWith(1, expect.objectContaining({ leaseId: firstToken }));
    expect(mocks.acquire).toHaveBeenNthCalledWith(2, expect.objectContaining({ leaseId: secondToken }));
  });

  it('acquires successor lease before releasing predecessor lease', async () => {
    const predecessor = await ttsStateManager.acquirePlaybackLease();
    await ttsStateManager.commitPlaybackLease(predecessor);
    mocks.release.mockClear();

    const successor = await ttsStateManager.acquirePlaybackLease();

    expect(ttsStateManager.currentPlaybackToken).toBe(predecessor);
    expect(ttsStateManager.predecessorPlaybackToken).toBe(predecessor);
    expect(mocks.acquire).toHaveBeenLastCalledWith({
      owner: 'tts',
      leaseId: successor,
      requiredReasons: ['AUDIO_PLAYBACK'],
    });
    expect(mocks.release).not.toHaveBeenCalled();

    await ttsStateManager.commitPlaybackLease(successor);

    expect(ttsStateManager.currentPlaybackToken).toBe(successor);
    expect(mocks.release).toHaveBeenCalledWith({ owner: 'tts', leaseId: predecessor });
  });

  it('releases failed successor without clearing valid predecessor state', async () => {
    const predecessor = await ttsStateManager.acquirePlaybackLease();
    await ttsStateManager.commitPlaybackLease(predecessor);
    mocks.release.mockClear();

    const successor = await ttsStateManager.acquirePlaybackLease();
    await ttsStateManager.releaseOffscreenLease(successor);

    expect(mocks.release).toHaveBeenCalledWith({ owner: 'tts', leaseId: successor });
    expect(ttsStateManager.currentPlaybackToken).toBe(predecessor);
  });

  it('does not release or reset newer playback for stale completion', async () => {
    const staleToken = await ttsStateManager.acquirePlaybackLease();
    await ttsStateManager.commitPlaybackLease(staleToken);
    const staleSender = { tab: { id: 1 }, frameId: 0 };
    ttsStateManager.currentTTSSender = staleSender;
    ttsStateManager.currentTTSId = 'stale';

    const currentToken = await ttsStateManager.acquirePlaybackLease();
    await ttsStateManager.commitPlaybackLease(currentToken);
    const currentSender = { tab: { id: 2 }, frameId: 0 };
    ttsStateManager.currentTTSSender = currentSender;
    ttsStateManager.currentTTSId = 'current';

    await ttsStateManager.notifyTTSEnded('completed', null, staleToken);

    expect(mocks.release).toHaveBeenCalledWith({ owner: 'tts', leaseId: staleToken });
    expect(mocks.browserAPI.runtime.sendMessage).not.toHaveBeenCalled();
    expect(ttsStateManager.currentPlaybackToken).toBe(currentToken);
    expect(ttsStateManager.currentTTSSender).toBe(currentSender);
    expect(ttsStateManager.currentTTSId).toBe('current');
  });

  it('releases matching playback generation on terminal completion', async () => {
    const playbackToken = await ttsStateManager.acquirePlaybackLease();
    await ttsStateManager.commitPlaybackLease(playbackToken);

    await ttsStateManager.notifyTTSEnded('completed', null, playbackToken);

    expect(mocks.release).toHaveBeenCalledWith({ owner: 'tts', leaseId: playbackToken });
    expect(ttsStateManager.currentPlaybackToken).toBeNull();
  });

  it('releases token lease after restart-like current state loss', async () => {
    const playbackToken = await ttsStateManager.acquirePlaybackLease();
    await ttsStateManager.commitPlaybackLease(playbackToken);
    ttsStateManager.currentPlaybackToken = null;
    mocks.release.mockClear();

    await ttsStateManager.notifyTTSEnded('completed', null, playbackToken);

    expect(mocks.release).toHaveBeenCalledWith({ owner: 'tts', leaseId: playbackToken });
    expect(mocks.browserAPI.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('does not complete stale generation after broadcast starts newer playback', async () => {
    const playbackToken = await ttsStateManager.acquirePlaybackLease();
    await ttsStateManager.commitPlaybackLease(playbackToken);
    const sender = { tab: { id: 7 }, frameId: 0 };
    ttsStateManager.currentTTSSender = sender;
    ttsStateManager.currentTTSId = 'old';

    let newerPlaybackToken;
    const newerSender = { tab: { id: 8 }, frameId: 1 };
    mocks.browserAPI.runtime.sendMessage.mockImplementationOnce(async () => {
      newerPlaybackToken = await ttsStateManager.acquirePlaybackLease();
      await ttsStateManager.commitPlaybackLease(newerPlaybackToken);
      ttsStateManager.currentTTSSender = newerSender;
      ttsStateManager.currentTTSId = 'new';
    });

    await ttsStateManager.notifyTTSEnded('completed', null, playbackToken);

    expect(newerPlaybackToken).not.toBe(playbackToken);
    expect(mocks.release).toHaveBeenCalledWith({ owner: 'tts', leaseId: playbackToken });
    expect(mocks.browserAPI.tabs.sendMessage).toHaveBeenCalledTimes(1);
    expect(ttsStateManager.currentPlaybackToken).toBe(newerPlaybackToken);
    expect(ttsStateManager.currentTTSSender).toBe(newerSender);
    expect(ttsStateManager.currentTTSId).toBe('new');
  });

  it('notifies active metadata while successor request is still resolving', async () => {
    const activeToken = await ttsStateManager.acquirePlaybackLease({
      sender: { tab: { id: 1 }, frameId: 0 },
      ttsId: 'request-a',
      language: 'en',
      text: 'active text'
    });
    await ttsStateManager.commitPlaybackLease(activeToken);
    const successorRequest = new Promise(() => {});
    const successorKey = ttsStateManager.createPendingRequestKey({
      engine: 'google',
      text: 'successor text',
      language: 'fr',
      ttsId: 'request-b'
    });
    ttsStateManager.setPendingRequest(successorKey, successorRequest);

    await ttsStateManager.notifyTTSEnded('completed', null, activeToken);

    expect(mocks.browserAPI.tabs.sendMessage).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        ttsId: 'request-a',
        detectedSourceLanguage: 'en'
      }),
      { frameId: 0 }
    );
    expect(mocks.browserAPI.tabs.sendMessage).not.toHaveBeenCalledWith(
      2,
      expect.anything(),
      expect.anything()
    );
    expect(ttsStateManager.pendingRequestKey).toEqual(successorKey);
    expect(ttsStateManager.currentTTSRequest).toBe(successorRequest);
  });

  it('does not release lease for intermediate queued completion', async () => {
    const playbackToken = await ttsStateManager.acquirePlaybackLease();
    await ttsStateManager.commitPlaybackLease(playbackToken);
    mocks.queue.chunks.push('first', 'last');
    mocks.queue.currentIndex = 0;

    await ttsStateManager.notifyTTSEnded('completed', null, playbackToken);

    expect(mocks.queue.onChunkEnded).toHaveBeenCalledWith('completed');
    expect(mocks.release).toHaveBeenCalledWith({ owner: 'tts', leaseId: playbackToken });
  });

  it('does not let old stop completion clear newer playback', async () => {
    const oldToken = await ttsStateManager.acquirePlaybackLease();
    await ttsStateManager.commitPlaybackLease(oldToken);
    const stopSend = mocks.browserAPI.runtime.sendMessage.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 0))
    );

    const stopPromise = ttsStateManager.stopAudioOnly(oldToken);
    const newToken = await ttsStateManager.acquirePlaybackLease();
    await ttsStateManager.commitPlaybackLease(newToken);
    await stopPromise;
    await ttsStateManager.notifyTTSEnded('stopped', null, oldToken);

    expect(stopSend).toHaveBeenCalledWith({ action: 'TTS_STOP', target: 'offscreen', playbackToken: oldToken });
    expect(ttsStateManager.currentPlaybackToken).toBe(newToken);
    expect(mocks.release).toHaveBeenCalledWith({ owner: 'tts', leaseId: oldToken });
  });

  it('does not release playback without a matching token', async () => {
    await expect(ttsStateManager.releaseOffscreenLease()).resolves.toBe(false);

    expect(mocks.release).not.toHaveBeenCalled();
  });

  it('reports successor pre-playback error without changing committed predecessor', async () => {
    const predecessorSender = { tab: { id: 1 }, frameId: 0 };
    const predecessor = await ttsStateManager.acquirePlaybackLease({
      sender: predecessorSender,
      ttsId: 'request-a',
      language: 'en',
      text: 'active text'
    });
    await ttsStateManager.commitPlaybackLease(predecessor);
    mocks.release.mockClear();
    mocks.browserAPI.runtime.sendMessage.mockClear();
    mocks.browserAPI.tabs.sendMessage.mockClear();

    const successorSender = { tab: { id: 2 }, frameId: 1 };
    await ttsStateManager.notifyTTSRequestError({
      sender: successorSender,
      ttsId: 'request-b',
      language: 'fr',
      text: 'successor text',
      error: { error: 'Circuit Breaker Open', errorType: 'ERRORS_CIRCUIT_BREAKER_OPEN' }
    });

    expect(ttsStateManager.currentPlaybackToken).toBe(predecessor);
    expect(ttsStateManager.currentTTSSender).toEqual(predecessorSender);
    expect(ttsStateManager.currentTTSId).toBe('request-a');
    expect(ttsStateManager.lastTTSLanguage).toBe('en');
    expect(ttsStateManager.lastTTSText).toBe('active text');
    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.browserAPI.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      action: 'GOOGLE_TTS_ENDED',
      status: 'error',
      reason: 'error',
      ttsId: 'request-b',
      detectedSourceLanguage: 'fr',
      error: 'Circuit Breaker Open',
      errorType: 'ERRORS_CIRCUIT_BREAKER_OPEN'
    }));
    expect(mocks.browserAPI.tabs.sendMessage).toHaveBeenCalledWith(
      2,
      expect.objectContaining({
        action: 'GOOGLE_TTS_ENDED',
        status: 'error',
        reason: 'error',
        ttsId: 'request-b',
        detectedSourceLanguage: 'fr',
        error: 'Circuit Breaker Open',
        errorType: 'ERRORS_CIRCUIT_BREAKER_OPEN'
      }),
      { frameId: 1 }
    );
    expect(mocks.browserAPI.runtime.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'TTS_STOP' })
    );
    expect(mocks.browserAPI.tabs.sendMessage).not.toHaveBeenCalledWith(
      1,
      expect.anything(),
      expect.anything()
    );
  });

  it('swallows request error notification transport failures', async () => {
    const predecessor = await ttsStateManager.acquirePlaybackLease({
      sender: { tab: { id: 1 }, frameId: 0 },
      ttsId: 'request-a',
      language: 'en',
      text: 'active text'
    });
    await ttsStateManager.commitPlaybackLease(predecessor);
    mocks.browserAPI.tabs.sendMessage.mockRejectedValue(new Error('tab closed'));
    mocks.browserAPI.runtime.sendMessage.mockRejectedValue(new Error('runtime unavailable'));

    await expect(ttsStateManager.notifyTTSRequestError({
      sender: { tab: { id: 2 }, frameId: 1 },
      ttsId: 'request-b',
      language: 'fr',
      text: 'successor text',
      error: 'settings unavailable'
    })).resolves.toBeUndefined();

    expect(ttsStateManager.currentPlaybackToken).toBe(predecessor);
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it('does not release playback for an error before lease acquisition', async () => {
    await ttsStateManager.notifyTTSEnded('error', { error: 'synthesis failed' });

    expect(mocks.release).not.toHaveBeenCalled();
  });

  it('stops audio when manager confirms offscreen document exists', async () => {
    await ttsStateManager.stopAudioOnly();

    expect(mocks.ensureDocument).toHaveBeenCalledTimes(1);
    expect(mocks.browserAPI.offscreen.hasDocument).not.toHaveBeenCalled();
    expect(mocks.browserAPI.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'TTS_STOP',
      target: 'offscreen',
    });
  });

  it('does nothing when manager finds no offscreen document', async () => {
    mocks.ensureDocument.mockResolvedValue(false);

    await ttsStateManager.stopAudioOnly();

    expect(mocks.ensureDocument).toHaveBeenCalledTimes(1);
    expect(mocks.browserAPI.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('atomically stops pending successor and rejects late commit', async () => {
    const predecessor = await ttsStateManager.acquirePlaybackLease();
    await ttsStateManager.commitPlaybackLease(predecessor, {
      sender: { tab: { id: 1 }, frameId: 0 },
      ttsId: 'old',
      language: 'en'
    });
    const successor = await ttsStateManager.acquirePlaybackLease({
      sender: { tab: { id: 2 }, frameId: 0 },
      ttsId: 'new',
      language: 'fr'
    });
    mocks.browserAPI.runtime.sendMessage.mockClear();
    mocks.release.mockClear();

    const stopPromise = ttsStateManager.stopPlayback();

    expect(ttsStateManager.pendingPlaybackToken).toBeNull();
    expect(ttsStateManager.currentPlaybackToken).toBeNull();
    expect(await ttsStateManager.commitPlaybackLease(successor)).toBe(false);
    await stopPromise;

    expect(mocks.browserAPI.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'TTS_STOP',
      target: 'offscreen',
      playbackToken: successor
    });
    expect(mocks.release).toHaveBeenCalledWith({ owner: 'tts', leaseId: successor });
    expect(mocks.release).toHaveBeenCalledWith({ owner: 'tts', leaseId: predecessor });
  });

  it('terminalizes successor failure and displaced predecessor', async () => {
    const predecessor = await ttsStateManager.acquirePlaybackLease();
    await ttsStateManager.commitPlaybackLease(predecessor, {
      sender: { tab: { id: 3 }, frameId: 0 },
      ttsId: 'old',
      language: 'en'
    });
    const successor = await ttsStateManager.acquirePlaybackLease({
      sender: { tab: { id: 4 }, frameId: 0 },
      ttsId: 'new',
      language: 'de'
    });
    mocks.release.mockClear();

    await ttsStateManager.failPlaybackHandoff(successor, { error: 'playback failed' });

    expect(ttsStateManager.currentPlaybackToken).toBeNull();
    expect(ttsStateManager.pendingPlaybackToken).toBeNull();
    expect(mocks.browserAPI.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'TTS_STOP',
      target: 'offscreen',
      playbackToken: successor,
    });
    expect(mocks.browserAPI.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'TTS_STOP',
      target: 'offscreen',
      playbackToken: predecessor,
    });
    expect(mocks.release).toHaveBeenCalledWith({ owner: 'tts', leaseId: successor });
    expect(mocks.release).toHaveBeenCalledWith({ owner: 'tts', leaseId: predecessor });
    expect(mocks.browserAPI.runtime.sendMessage.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.release.mock.invocationCallOrder[0]);
    expect(mocks.browserAPI.tabs.sendMessage).toHaveBeenCalledWith(
      4,
      expect.objectContaining({ reason: 'error', error: 'playback failed' }),
      { frameId: 0 }
    );
  });
});

describe('TTSStateManager Firefox audio lifecycle', () => {
  const audios = [];

  beforeEach(() => {
    audios.length = 0;
    vi.stubGlobal('Audio', class FakeAudio {
      constructor(url) {
        this.url = url;
        this.src = url;
        this.pause = vi.fn();
        this.play = vi.fn().mockResolvedValue(undefined);
        audios.push(this);
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ignores stale Firefox audio terminal callbacks', async () => {
    const manager = new TTSStateManager();
    const notifyTTSEnded = vi.spyOn(manager, 'notifyTTSEnded').mockResolvedValue(undefined);

    await manager.playFirefoxAudio('old-audio', {
      sender: { tab: { id: 1 }, frameId: 0 },
      ttsId: 'old',
      language: 'en',
      text: 'old text'
    });
    const oldAudio = audios[0];

    await manager.playFirefoxAudio('new-audio', {
      sender: { tab: { id: 2 }, frameId: 1 },
      ttsId: 'new',
      language: 'fr',
      text: 'new text'
    });
    const newAudio = audios[1];

    oldAudio.onended();
    oldAudio.onerror(new Error('stale audio failed'));

    expect(manager.activeFirefoxAudio).toBe(newAudio);
    expect(manager.currentTTSId).toBe('new');
    expect(manager.currentTTSSender).toEqual({ tab: { id: 2 }, frameId: 1 });
    expect(notifyTTSEnded).not.toHaveBeenCalled();
  });
});
