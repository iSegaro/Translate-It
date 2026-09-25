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

describe('TTSStateManager handoff-aware owner-scoped stop (stopForOwner)', () => {
  const predecessorSender = { tab: { id: 10 }, frameId: 0 };
  const successorSender = { tab: { id: 20 }, frameId: 0 };
  const foreignSender = { tab: { id: 30 }, frameId: 0 };

  // Build a deterministic handoff with both predecessor (committed) and
  // successor (pending) generations, owned by different senders.
  async function seedHandoff({
    predecessorId = 'predecessor-id',
    successorId = 'successor-id',
    sharedOwner = false,
  } = {}) {
    const predecessorOwner = sharedOwner ? predecessorSender : predecessorSender;
    const successorOwner = sharedOwner ? predecessorSender : successorSender;

    const predecessor = await ttsStateManager.acquirePlaybackLease();
    await ttsStateManager.commitPlaybackLease(predecessor, {
      sender: predecessorOwner,
      ttsId: predecessorId,
      language: 'en',
      text: 'predecessor text',
    });

    const successor = await ttsStateManager.acquirePlaybackLease({
      sender: successorOwner,
      ttsId: successorId,
      language: 'fr',
      text: 'successor text',
    });

    mocks.browserAPI.runtime.sendMessage.mockClear();
    mocks.release.mockClear();
    mocks.browserAPI.tabs.sendMessage.mockClear();
    return { predecessor, successor };
  }

  it('lets the predecessor owner stop its own still-active playback while a foreign successor is pending', async () => {
    const { predecessor, successor } = await seedHandoff();

    const result = await ttsStateManager.stopForOwner(predecessorSender, {
      ttsId: 'predecessor-id',
      stopOnlyIfOwner: true,
    });

    expect(result).toMatchObject({ success: true, action: 'stopped' });
    expect(ttsStateManager.currentPlaybackToken).toBeNull();
    expect(ttsStateManager.currentTTSSender).toBeNull();
    expect(ttsStateManager.currentTTSId).toBeNull();
    // Foreign successor stays pending, untouched.
    expect(ttsStateManager.pendingPlaybackToken).not.toBeNull();
    expect(ttsStateManager.pendingPlaybackMetadata?.ttsId).toBe('successor-id');

    expect(mocks.browserAPI.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'TTS_STOP',
      target: 'offscreen',
      playbackToken: predecessor,
    });
    expect(mocks.release).toHaveBeenCalledWith({ owner: 'tts', leaseId: predecessor });
    // Successor lease must NOT be released. Use the actual UUID, never an
    // inferred prefix match: playback tokens are random UUIDs.
    const releasedLeaseIds = mocks.release.mock.calls.map(([arg]) => arg.leaseId);
    expect(releasedLeaseIds).not.toContain(successor);
  });

  it('lets the successor owner stop only its own pending generation when a foreign predecessor is active', async () => {
    const { successor } = await seedHandoff();

    const result = await ttsStateManager.stopForOwner(successorSender, {
      ttsId: 'successor-id',
      stopOnlyIfOwner: true,
    });

    expect(result).toMatchObject({ success: true, action: 'stopped' });
    expect(ttsStateManager.pendingPlaybackToken).toBeNull();
    expect(ttsStateManager.pendingPlaybackMetadata).toBeNull();
    // Foreign predecessor stays committed.
    expect(ttsStateManager.currentPlaybackToken).not.toBeNull();
    expect(ttsStateManager.currentTTSId).toBe('predecessor-id');

    expect(mocks.browserAPI.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'TTS_STOP',
      target: 'offscreen',
      playbackToken: successor,
    });
    expect(mocks.release).toHaveBeenCalledWith({ owner: 'tts', leaseId: successor });
  });

  it('stops both generations on owner-scoped stop-all when predecessor and successor share the same owner', async () => {
    const { predecessor, successor } = await seedHandoff({ sharedOwner: true });

    const result = await ttsStateManager.stopForOwner(predecessorSender, {
      ttsId: 'all',
      stopOnlyIfOwner: true,
    });

    expect(result).toMatchObject({ success: true, action: 'stopped' });
    expect(ttsStateManager.pendingPlaybackToken).toBeNull();
    expect(ttsStateManager.currentPlaybackToken).toBeNull();

    const releasedLeaseIds = mocks.release.mock.calls.map(([arg]) => arg.leaseId);
    expect(releasedLeaseIds).toEqual(expect.arrayContaining([predecessor, successor]));

    const stoppedTokens = mocks.browserAPI.runtime.sendMessage.mock.calls
      .filter(([msg]) => msg?.action === 'TTS_STOP')
      .map(([msg]) => msg.playbackToken);
    expect(stoppedTokens).toEqual(expect.arrayContaining([predecessor, successor]));
  });

  it('skips a request whose ttsId matches neither committed nor pending generations', async () => {
    await seedHandoff();

    const result = await ttsStateManager.stopForOwner(predecessorSender, {
      ttsId: 'mismatched-id',
      stopOnlyIfOwner: true,
    });

    expect(result).toEqual({ success: true, skipped: true });
    expect(ttsStateManager.pendingPlaybackToken).not.toBeNull();
    expect(ttsStateManager.currentPlaybackToken).not.toBeNull();
    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.browserAPI.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('skips a request whose sender does not own the matched generation', async () => {
    await seedHandoff();

    const result = await ttsStateManager.stopForOwner(foreignSender, {
      ttsId: 'successor-id',
      stopOnlyIfOwner: true,
    });

    expect(result).toEqual({ success: true, skipped: true, reason: 'not_owner' });
    expect(ttsStateManager.pendingPlaybackToken).not.toBeNull();
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it('owner-scoped stop-all stops only generations owned by the sender during handoff', async () => {
    const { predecessor, successor } = await seedHandoff();

    // Successor owner requests stop-all: should stop ONLY the successor.
    const successorResult = await ttsStateManager.stopForOwner(successorSender, {
      ttsId: null,
      stopOnlyIfOwner: true,
    });

    expect(successorResult).toMatchObject({ success: true, action: 'stopped' });
    expect(ttsStateManager.pendingPlaybackToken).toBeNull();
    expect(ttsStateManager.currentPlaybackToken).not.toBeNull();

    const releasedAfterFirst = mocks.release.mock.calls.map(([arg]) => arg.leaseId);
    expect(releasedAfterFirst).toContain(successor);
    expect(releasedAfterFirst).not.toContain(predecessor);

    // Predecessor owner requests stop-all: should stop ONLY the predecessor.
    mocks.release.mockClear();
    const predecessorResult = await ttsStateManager.stopForOwner(predecessorSender, {
      ttsId: undefined,
      stopOnlyIfOwner: true,
    });

    expect(predecessorResult).toMatchObject({ success: true, action: 'stopped' });
    expect(ttsStateManager.currentPlaybackToken).toBeNull();
  });

  it('keeps explicit global/manual stop behavior unchanged', async () => {
    const { predecessor, successor } = await seedHandoff();

    const result = await ttsStateManager.stopForOwner(foreignSender, {
      ttsId: null,
      stopOnlyIfOwner: false,
    });

    expect(result).toMatchObject({ success: true, action: 'stopped' });
    expect(ttsStateManager.pendingPlaybackToken).toBeNull();
    expect(ttsStateManager.currentPlaybackToken).toBeNull();

    const releasedLeaseIds = mocks.release.mock.calls.map(([arg]) => arg.leaseId);
    expect(releasedLeaseIds).toEqual(expect.arrayContaining([predecessor, successor]));

    const stoppedTokens = mocks.browserAPI.runtime.sendMessage.mock.calls
      .filter(([msg]) => msg?.action === 'TTS_STOP')
      .map(([msg]) => msg.playbackToken);
    expect(stoppedTokens).toEqual(expect.arrayContaining([predecessor, successor]));
  });

  it('rejects a late successor commit when that successor was actually stopped', async () => {
    const { successor } = await seedHandoff();

    await ttsStateManager.stopForOwner(successorSender, {
      ttsId: 'successor-id',
      stopOnlyIfOwner: true,
    });

    // Successor token is cleared from pending state; commit must return false.
    await expect(ttsStateManager.commitPlaybackLease(successor)).resolves.toBe(false);
    expect(ttsStateManager.currentPlaybackToken).not.toBe(successor);
  });

  it('Google and Edge handlers return identical stopForOwner results for the same inputs', async () => {
    // Seed two equivalent handoffs.
    const google = await seedHandoff();
    await ttsStateManager.stopForOwner(predecessorSender, {
      ttsId: 'predecessor-id',
      stopOnlyIfOwner: true,
    });
    const googleResult = await ttsStateManager.stopForOwner(foreignSender, {
      ttsId: 'successor-id',
      stopOnlyIfOwner: true,
    });
    // Reset for the Edge scenario.
    await ttsStateManager.fullReset();
    const edge = await seedHandoff();
    await ttsStateManager.stopForOwner(predecessorSender, {
      ttsId: 'predecessor-id',
      stopOnlyIfOwner: true,
    });
    const edgeResult = await ttsStateManager.stopForOwner(foreignSender, {
      ttsId: 'successor-id',
      stopOnlyIfOwner: true,
    });

    expect(google).not.toBeNull();
    expect(edge).not.toBeNull();
    expect(googleResult).toEqual(edgeResult);
    expect(googleResult).toEqual({ success: true, skipped: true, reason: 'not_owner' });
  });

  // ---------------------------------------------------------------------------
  // Specific-ttsId fencing must apply regardless of stopOnlyIfOwner. A
  // mismatched ttsId must NEVER trigger a global stop, even when ownerless.
  // ---------------------------------------------------------------------------

  it('skips a stale specific ttsId with stopOnlyIfOwner absent (fence preserved)', async () => {
    const { predecessor, successor } = await seedHandoff();

    const result = await ttsStateManager.stopForOwner(foreignSender, {
      ttsId: 'stale-id',
      stopOnlyIfOwner: undefined,
    });

    expect(result).toEqual({ success: true, skipped: true });
    // Nothing was stopped: both generations are still live.
    expect(ttsStateManager.pendingPlaybackToken).toBe(successor);
    expect(ttsStateManager.currentPlaybackToken).toBe(predecessor);
    expect(mocks.release).not.toHaveBeenCalled();
    const stoppedTokens = mocks.browserAPI.runtime.sendMessage.mock.calls
      .filter(([msg]) => msg?.action === 'TTS_STOP');
    expect(stoppedTokens).toHaveLength(0);
  });

  it('skips a stale specific ttsId with stopOnlyIfOwner false (no owner check, fence still applies)', async () => {
    const { predecessor, successor } = await seedHandoff();

    const result = await ttsStateManager.stopForOwner(foreignSender, {
      ttsId: 'stale-id',
      stopOnlyIfOwner: false,
    });

    expect(result).toEqual({ success: true, skipped: true });
    expect(ttsStateManager.pendingPlaybackToken).toBe(successor);
    expect(ttsStateManager.currentPlaybackToken).toBe(predecessor);
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it('stops matching current specific ttsId without owner check (stopOnlyIfOwner absent)', async () => {
    const { predecessor, successor } = await seedHandoff();

    const result = await ttsStateManager.stopForOwner(foreignSender, {
      ttsId: 'predecessor-id',
      stopOnlyIfOwner: undefined,
    });

    // Foreign sender with matching current ttsId is allowed when owner check
    // is not requested: only the matched generation is stopped.
    expect(result).toMatchObject({ success: true, action: 'stopped' });
    expect(ttsStateManager.currentPlaybackToken).toBeNull();
    expect(ttsStateManager.pendingPlaybackToken).toBe(successor);
    expect(mocks.release).toHaveBeenCalledWith({ owner: 'tts', leaseId: predecessor });
    const releasedLeaseIds = mocks.release.mock.calls.map(([arg]) => arg.leaseId);
    expect(releasedLeaseIds).not.toContain(successor);
  });

  it('stops matching pending specific ttsId without owner check (stopOnlyIfOwner false)', async () => {
    const { predecessor, successor } = await seedHandoff();

    const result = await ttsStateManager.stopForOwner(foreignSender, {
      ttsId: 'successor-id',
      stopOnlyIfOwner: false,
    });

    expect(result).toMatchObject({ success: true, action: 'stopped' });
    expect(ttsStateManager.pendingPlaybackToken).toBeNull();
    expect(ttsStateManager.currentPlaybackToken).toBe(predecessor);
    expect(mocks.release).toHaveBeenCalledWith({ owner: 'tts', leaseId: successor });
    const releasedLeaseIds = mocks.release.mock.calls.map(([arg]) => arg.leaseId);
    expect(releasedLeaseIds).not.toContain(predecessor);
  });

  // ---------------------------------------------------------------------------
  // Predecessor-only stop must preserve the in-flight successor request
  // tracking (currentTTSRequest / pendingRequestKey) so its deduplication
  // and handoff fencing stay intact.
  // ---------------------------------------------------------------------------

  it('predecessor-only stop preserves pending successor request tracking (currentTTSRequest / pendingRequestKey)', async () => {
    // Build committed predecessor.
    const predecessor = await ttsStateManager.acquirePlaybackLease();
    await ttsStateManager.commitPlaybackLease(predecessor, {
      sender: predecessorSender,
      ttsId: 'predecessor-id',
      language: 'en',
      text: 'predecessor text',
    });

    // Build pending successor lease + an actual in-flight successor request
    // registered through the public setPendingRequest / currentTTSRequest API.
    const successor = await ttsStateManager.acquirePlaybackLease({
      sender: successorSender,
      ttsId: 'successor-id',
      language: 'fr',
      text: 'successor text',
    });
    const successorRequestKey = ttsStateManager.createPendingRequestKey({
      engine: 'google',
      text: 'successor text',
      language: 'fr',
      ttsId: 'successor-id',
    });
    const successorRequest = Promise.resolve('successor-in-flight');
    ttsStateManager.setPendingRequest(successorRequestKey, successorRequest);
    const trackedRequestBefore = ttsStateManager.currentTTSRequest;
    const trackedKeyBefore = ttsStateManager.pendingRequestKey;

    mocks.browserAPI.runtime.sendMessage.mockClear();
    mocks.release.mockClear();

    await ttsStateManager.stopForOwner(predecessorSender, {
      ttsId: 'predecessor-id',
      stopOnlyIfOwner: true,
    });

    // Predecessor committed state is cleared.
    expect(ttsStateManager.currentPlaybackToken).toBeNull();
    expect(ttsStateManager.currentTTSSender).toBeNull();
    expect(ttsStateManager.currentTTSId).toBeNull();

    // Successor request tracking is preserved verbatim.
    expect(ttsStateManager.currentTTSRequest).toBe(trackedRequestBefore);
    expect(ttsStateManager.pendingRequestKey).toEqual(trackedKeyBefore);
    expect(ttsStateManager.isPendingRequest(successorRequestKey, successorRequest)).toBe(true);

    // Successor playback state is also preserved (handoff still viable).
    expect(ttsStateManager.pendingPlaybackToken).toBe(successor);
    expect(ttsStateManager.pendingPlaybackMetadata?.ttsId).toBe('successor-id');
  });

  // ---------------------------------------------------------------------------
  // Same-session handoff (TTSQueueManager reuses one ttsId across chunks).
  // A chunk transition can legitimately leave a committed predecessor and a
  // pending successor with the SAME ttsId (and often the same owner). The
  // owner-aware Stop must consider both generations before deciding.
  // ---------------------------------------------------------------------------

  it('same-session specific Stop with stopOnlyIfOwner stops both when sender owns both generations', async () => {
    const { predecessor, successor } = await seedHandoff({
      predecessorId: 'session-tts-id',
      successorId: 'session-tts-id',
      sharedOwner: true,
    });

    const result = await ttsStateManager.stopForOwner(predecessorSender, {
      ttsId: 'session-tts-id',
      stopOnlyIfOwner: true,
    });

    expect(result).toMatchObject({ success: true, action: 'stopped' });
    expect(ttsStateManager.pendingPlaybackToken).toBeNull();
    expect(ttsStateManager.currentPlaybackToken).toBeNull();

    const releasedLeaseIds = mocks.release.mock.calls.map(([arg]) => arg.leaseId);
    expect(releasedLeaseIds).toEqual(expect.arrayContaining([predecessor, successor]));
  });

  it('same-session specific Stop without stopOnlyIfOwner clears the queue and stops both generations', async () => {
    const { predecessor, successor } = await seedHandoff({
      predecessorId: 'session-tts-id',
      successorId: 'session-tts-id',
      sharedOwner: true,
    });
    mocks.queue.chunks.push({ id: 'chunk-1' }, { id: 'chunk-2' });
    mocks.queue.currentIndex = 0;

    const result = await ttsStateManager.stopForOwner(foreignSender, {
      ttsId: 'session-tts-id',
      stopOnlyIfOwner: false,
    });

    expect(result).toMatchObject({ success: true, action: 'stopped' });
    // Global path: queue cleared and both leases released.
    expect(mocks.queue.stop).toHaveBeenCalledTimes(1);
    expect(ttsStateManager.pendingPlaybackToken).toBeNull();
    expect(ttsStateManager.currentPlaybackToken).toBeNull();
    const releasedLeaseIds = mocks.release.mock.calls.map(([arg]) => arg.leaseId);
    expect(releasedLeaseIds).toEqual(expect.arrayContaining([predecessor, successor]));
  });

  it('same-session specific Stop affects only the generation owned by the requester when owners differ', async () => {
    const { predecessor } = await seedHandoff({
      predecessorId: 'session-tts-id',
      successorId: 'session-tts-id',
      sharedOwner: false,
    });

    // Successor owner asks to stop the session: stops ONLY its pending.
    const successorResult = await ttsStateManager.stopForOwner(successorSender, {
      ttsId: 'session-tts-id',
      stopOnlyIfOwner: true,
    });
    expect(successorResult).toMatchObject({ success: true, action: 'stopped' });
    expect(ttsStateManager.pendingPlaybackToken).toBeNull();
    expect(ttsStateManager.currentPlaybackToken).toBe(predecessor);

    // Predecessor owner asks to stop the session: stops ONLY its committed.
    const predecessorResult = await ttsStateManager.stopForOwner(predecessorSender, {
      ttsId: 'session-tts-id',
      stopOnlyIfOwner: true,
    });
    expect(predecessorResult).toMatchObject({ success: true, action: 'stopped' });
    expect(ttsStateManager.currentPlaybackToken).toBeNull();

    // The two stops targeted different generations; neither stop ever tried
    // to release the foreign generation's lease in the same call.
  });

  it('same-session owner-scoped Stop skips when the requester owns neither generation', async () => {
    await seedHandoff({
      predecessorId: 'session-tts-id',
      successorId: 'session-tts-id',
      sharedOwner: false,
    });

    const result = await ttsStateManager.stopForOwner(foreignSender, {
      ttsId: 'session-tts-id',
      stopOnlyIfOwner: true,
    });

    expect(result).toEqual({ success: true, skipped: true, reason: 'not_owner' });
    expect(ttsStateManager.pendingPlaybackToken).not.toBeNull();
    expect(ttsStateManager.currentPlaybackToken).not.toBeNull();
    expect(mocks.release).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Physical handoff boundary: once the pending PLAY command has been issued
  // to offscreen, the committed predecessor may already be physically
  // interrupted. A selective pending stop in that window must terminalize the
  // displaced predecessor through the handoff-failure path, NOT preserve it
  // as valid committed playback.
  // ---------------------------------------------------------------------------

  it('successor-owner selective stop preserves foreign predecessor when physical handoff has NOT started', async () => {
    const { predecessor, successor } = await seedHandoff();
    // pendingPlaybackStarted is false by default after acquire.

    expect(ttsStateManager.pendingPlaybackStarted).toBe(false);

    const result = await ttsStateManager.stopForOwner(successorSender, {
      ttsId: 'successor-id',
      stopOnlyIfOwner: true,
    });

    expect(result).toMatchObject({ success: true, action: 'stopped' });
    // Pending is gone, predecessor is preserved as valid committed state.
    expect(ttsStateManager.pendingPlaybackToken).toBeNull();
    expect(ttsStateManager.currentPlaybackToken).toBe(predecessor);
    expect(ttsStateManager.currentTTSId).toBe('predecessor-id');
    expect(ttsStateManager.pendingPlaybackStarted).toBe(false);

    // Only the pending lease is released.
    const releasedLeaseIds = mocks.release.mock.calls.map(([arg]) => arg.leaseId);
    expect(releasedLeaseIds).toContain(successor);
    expect(releasedLeaseIds).not.toContain(predecessor);
  });

  it('successor-owner selective stop terminalizes displaced predecessor when physical handoff HAS started', async () => {
    const { predecessor, successor } = await seedHandoff();

    // Caller (handler) marks the handoff boundary before the offscreen PLAY
    // command, simulating the race window where the predecessor has already
    // been physically interrupted.
    expect(ttsStateManager.markPendingPlaybackStarted(successor)).toBe(true);
    expect(ttsStateManager.pendingPlaybackStarted).toBe(true);

    const result = await ttsStateManager.stopForOwner(successorSender, {
      ttsId: 'successor-id',
      stopOnlyIfOwner: true,
    });

    expect(result).toMatchObject({ success: true, action: 'stopped' });
    // Pending is gone AND the predecessor is terminalized as well: cleared
    // committed state, flag reset, no longer reported as committed playback.
    expect(ttsStateManager.pendingPlaybackToken).toBeNull();
    expect(ttsStateManager.currentPlaybackToken).toBeNull();
    expect(ttsStateManager.currentTTSSender).toBeNull();
    expect(ttsStateManager.currentTTSId).toBeNull();
    expect(ttsStateManager.pendingPlaybackStarted).toBe(false);

    // Both affected leases are released (the predecessor's lease must NOT be
    // stranded).
    const releasedLeaseIds = mocks.release.mock.calls.map(([arg]) => arg.leaseId);
    expect(releasedLeaseIds).toEqual(expect.arrayContaining([predecessor, successor]));
  });

  it('markPendingPlaybackStarted is token-fenced against a stale token', async () => {
    const { successor } = await seedHandoff();

    // A stale token (different from the live pending) must NOT mark the
    // replacement pending generation.
    expect(ttsStateManager.markPendingPlaybackStarted('stale-token-uuid')).toBe(false);
    expect(ttsStateManager.pendingPlaybackStarted).toBe(false);

    // The correct token does mark it.
    expect(ttsStateManager.markPendingPlaybackStarted(successor)).toBe(true);
    expect(ttsStateManager.pendingPlaybackStarted).toBe(true);

    // After commit / fail / reset / full-stop, the flag must be cleared.
    await ttsStateManager.commitPlaybackLease(successor);
    expect(ttsStateManager.pendingPlaybackStarted).toBe(false);
  });

  it('same-session chunk transition still stops whole session after handoff boundary is marked', async () => {
    const { predecessor, successor } = await seedHandoff({
      predecessorId: 'session-tts-id',
      successorId: 'session-tts-id',
      sharedOwner: true,
    });
    expect(ttsStateManager.markPendingPlaybackStarted(successor)).toBe(true);

    const result = await ttsStateManager.stopForOwner(predecessorSender, {
      ttsId: 'session-tts-id',
      stopOnlyIfOwner: true,
    });

    expect(result).toMatchObject({ success: true, action: 'stopped' });
    expect(ttsStateManager.pendingPlaybackToken).toBeNull();
    expect(ttsStateManager.currentPlaybackToken).toBeNull();
    expect(ttsStateManager.pendingPlaybackStarted).toBe(false);

    const releasedLeaseIds = mocks.release.mock.calls.map(([arg]) => arg.leaseId);
    expect(releasedLeaseIds).toEqual(expect.arrayContaining([predecessor, successor]));
  });

  it('late successor commit after selective cancellation is rejected (post-boundary)', async () => {
    const { successor } = await seedHandoff();
    expect(ttsStateManager.markPendingPlaybackStarted(successor)).toBe(true);

    await ttsStateManager.stopForOwner(successorSender, {
      ttsId: 'successor-id',
      stopOnlyIfOwner: true,
    });

    await expect(ttsStateManager.commitPlaybackLease(successor)).resolves.toBe(false);
    expect(ttsStateManager.currentPlaybackToken).not.toBe(successor);
  });

  it('post-boundary successor-owner selective stop notifies predecessor owner with `interrupted`, not `stopped`', async () => {
    const { predecessor, successor } = await seedHandoff();
    expect(ttsStateManager.markPendingPlaybackStarted(successor)).toBe(true);
    mocks.browserAPI.tabs.sendMessage.mockClear();
    mocks.browserAPI.runtime.sendMessage.mockClear();

    await ttsStateManager.stopForOwner(successorSender, {
      ttsId: 'successor-id',
      stopOnlyIfOwner: true,
    });

    // Successor owner receives `stopped` for its own generation.
    const successorTabMessages = mocks.browserAPI.tabs.sendMessage.mock.calls
      .filter(([tabId]) => tabId === 20);
    expect(successorTabMessages.length).toBeGreaterThan(0);
    successorTabMessages.forEach(([, msg]) => {
      expect(msg.reason).toBe('stopped');
    });

    // Predecessor owner receives `interrupted` (NOT `stopped`) — the
    // predecessor was displaced by the handoff, not explicitly stopped.
    const predecessorTabMessages = mocks.browserAPI.tabs.sendMessage.mock.calls
      .filter(([tabId]) => tabId === 10);
    expect(predecessorTabMessages.length).toBeGreaterThan(0);
    predecessorTabMessages.forEach(([, msg]) => {
      expect(msg.reason).toBe('interrupted');
      expect(msg.reason).not.toBe('stopped');
    });
    expect(predecessor).toBeDefined();
  });

  it('pre-boundary selective pending stop sends no terminal notification to predecessor owner and preserves it as committed', async () => {
    const { predecessor } = await seedHandoff();
    // pendingPlaybackStarted stays false.
    mocks.browserAPI.tabs.sendMessage.mockClear();
    mocks.browserAPI.runtime.sendMessage.mockClear();

    await ttsStateManager.stopForOwner(successorSender, {
      ttsId: 'successor-id',
      stopOnlyIfOwner: true,
    });

    // Predecessor is preserved as committed state (not terminalized).
    expect(ttsStateManager.currentPlaybackToken).toBe(predecessor);
    expect(ttsStateManager.currentTTSId).toBe('predecessor-id');

    // Predecessor owner receives no terminal notification.
    const predecessorTabMessages = mocks.browserAPI.tabs.sendMessage.mock.calls
      .filter(([tabId]) => tabId === 10);
    expect(predecessorTabMessages).toHaveLength(0);
  });

  it('stale/replacement playback tokens cannot generate a predecessor terminal notification', async () => {
    const { predecessor, successor } = await seedHandoff();
    // Live handoff boundary is marked correctly.
    expect(ttsStateManager.markPendingPlaybackStarted(successor)).toBe(true);

    // A stale token for a replacement generation cannot mark the live
    // generation as having crossed the boundary.
    expect(ttsStateManager.markPendingPlaybackStarted('stale-replacement-uuid')).toBe(false);

    // A pre-existing replacement pending that has NOT been marked cannot
    // bypass the fence: only the exact pendingPlaybackToken flip is honored.
    mocks.browserAPI.tabs.sendMessage.mockClear();
    mocks.browserAPI.runtime.sendMessage.mockClear();

    await ttsStateManager.stopForOwner(successorSender, {
      ttsId: 'successor-id',
      stopOnlyIfOwner: true,
    });

    // The notification is targeted by the exact predecessor owner tab (10),
    // and the playbackToken carried in the notification matches the live
    // predecessor token, not a stale UUID.
    const predecessorTabMessages = mocks.browserAPI.tabs.sendMessage.mock.calls
      .filter(([tabId]) => tabId === 10);
    expect(predecessorTabMessages.length).toBeGreaterThan(0);
    predecessorTabMessages.forEach(([, msg]) => {
      expect(msg.playbackToken).toBe(predecessor);
      expect(msg.playbackToken).not.toBe('stale-replacement-uuid');
      expect(msg.reason).toBe('interrupted');
    });
  });

  it('same-session full stop after handoff boundary is marked still uses the global stop path with one consolidated notification per owner', async () => {
    const { successor } = await seedHandoff({
      predecessorId: 'session-tts-id',
      successorId: 'session-tts-id',
      sharedOwner: true,
    });
    expect(ttsStateManager.markPendingPlaybackStarted(successor)).toBe(true);
    mocks.browserAPI.tabs.sendMessage.mockClear();
    mocks.browserAPI.runtime.sendMessage.mockClear();

    const result = await ttsStateManager.stopForOwner(predecessorSender, {
      ttsId: 'session-tts-id',
      stopOnlyIfOwner: true,
    });

    expect(result).toMatchObject({ success: true, action: 'stopped' });
    expect(ttsStateManager.pendingPlaybackToken).toBeNull();
    expect(ttsStateManager.currentPlaybackToken).toBeNull();
    expect(ttsStateManager.pendingPlaybackStarted).toBe(false);

    // Global stop uses `stopped` reason for both notifications (not
    // `interrupted`) because the user explicitly stopped the session.
    const ownerTabMessages = mocks.browserAPI.tabs.sendMessage.mock.calls
      .filter(([tabId]) => tabId === 10);
    expect(ownerTabMessages.length).toBeGreaterThan(0);
    ownerTabMessages.forEach(([, msg]) => {
      expect(msg.reason).toBe('stopped');
      expect(msg.reason).not.toBe('interrupted');
    });
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
