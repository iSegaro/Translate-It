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
  // Simulated offscreen current physical playback token. When a TTS_STOP
  // request matches this token, the simulated offscreen returns
  // `{ success: true, stopped: true }`; otherwise it returns
  // `{ success: true, skipped: true }`. Mirrors src/html/offscreen.js
  // handleTTSStop behavior so token-scoped selective cleanup tests can
  // observe the authoritative boundary signal deterministically.
  offscreenCurrentToken: null,
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
  // Default: simulate offscreen TTS_STOP behavior mirroring
  // src/html/offscreen.js handleTTSStop:
  //   - supplied token == current physical  → { success: true, stopped: true, playbackToken }
  //   - supplied token != current physical  → { success: true, skipped: true, currentPlaybackToken }
  //   - no supplied token (legacy)          → { success: true, stopped: true }
  // Tests can override the simulated offscreen behavior per case.
  mocks.offscreenCurrentToken = undefined; // sentinel: "not set" → fall back to StateManager
  mocks.offscreenFailureMode = null; // 'unavailable' | 'transport' | null
  // By default the simulated offscreen current mirrors StateManager's
  // currentPlaybackToken: committing a generation makes it the physical
  // current, stopping clears it. This lets the existing selective-stop
  // tests assert Branch B (predecessor preserved) without per-test setup.
  mocks.browserAPI.runtime.sendMessage.mockReset().mockImplementation(async (message) => {
    if (message?.action === 'TTS_STOP') {
      if (mocks.offscreenFailureMode === 'transport') {
        // Simulated transport failure on the runtime side.
        throw new Error('runtime unavailable');
      }
      // When the test did not override offscreenCurrentToken explicitly,
      // mirror StateManager's current physical playback so that ordinary
      // selective-stop scenarios naturally land on Branch B (predecessor
      // preserved). Tests that want different branches set
      // mocks.offscreenCurrentToken themselves (including null) before
      // the stop call.
      const effectiveCurrent = mocks.offscreenCurrentToken !== undefined
        ? mocks.offscreenCurrentToken
        : ttsStateManager.currentPlaybackToken;
      if (message.playbackToken && message.playbackToken === effectiveCurrent) {
        // Mirror offscreen: tombstone + stop the current physical playback.
        mocks.offscreenCurrentToken = null;
        return { success: true, stopped: true, playbackToken: message.playbackToken };
      }
      if (message.playbackToken) {
        // Foreign token: tombstone the supplied token, report who is current.
        return {
          success: true,
          skipped: true,
          currentPlaybackToken: effectiveCurrent,
        };
      }
      // No supplied token (legacy global path).
      return { success: true, stopped: true };
    }
    return undefined;
  });
  mocks.browserAPI.tabs.sendMessage.mockReset().mockResolvedValue(undefined);
  mocks.acquire.mockReset().mockResolvedValue(true);
  mocks.release.mockReset().mockResolvedValue(true);
  mocks.ensureDocument.mockReset().mockImplementation(async () => {
    // When offscreenFailureMode === 'unavailable', mirror the real
    // ensureDocument() returning false (no offscreen document), which
    // exercises the actual `stopPlaybackToken()` offscreen-unavailable
    // path rather than only stubbing sendMessage to return undefined.
    return mocks.offscreenFailureMode !== 'unavailable';
  });
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

  async function expectBranchDToPreservePredecessor(result, predecessor, successor) {
    expect(result).toMatchObject({
      success: false,
      error: 'offscreen_state_unknown',
      predecessorDisplaced: false,
      classification: 'D',
    });
    expect(ttsStateManager.currentPlaybackToken).toBe(predecessor);
    expect(ttsStateManager.currentTTSSender).toBe(predecessorSender);
    expect(ttsStateManager.currentTTSId).toBe('predecessor-id');
    expect(ttsStateManager.pendingPlaybackToken).toBeNull();

    const releasedLeaseIds = mocks.release.mock.calls.map(([arg]) => arg.leaseId);
    expect(releasedLeaseIds).toContain(successor);
    expect(releasedLeaseIds).not.toContain(predecessor);

    const predecessorTabMessages = mocks.browserAPI.tabs.sendMessage.mock.calls
      .filter(([tabId]) => tabId === predecessorSender.tab.id);
    expect(predecessorTabMessages).toHaveLength(0);
    await expect(ttsStateManager.commitPlaybackLease(successor)).resolves.toBe(false);
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
  // Physical handoff boundary via offscreen truth.
  //
  // Background can NOT reliably know whether the pending PLAY has displaced
  // the predecessor by marking a flag ahead of runtime.sendMessage(). The
  // offscreen runtime itself returns the authoritative answer via the
  // token-scoped TTS_STOP response:
  //   - token matches offscreen's current physical playback → stopped: true
  //   - token is foreign / no current playback              → skipped: true
  //
  // The StateManager uses that response as the boundary signal. No
  // background-side timing flag is used.
  // ---------------------------------------------------------------------------

  it('Branch B: STOP skipped AND offscreen current IS the captured predecessor → preserved as committed', async () => {
    const { predecessor, successor } = await seedHandoff();
    // Branch B: offscreen reports the captured predecessor is still the
    // physical current playback. This is the ONLY case where preservation is
    // positively proven.
    mocks.offscreenCurrentToken = predecessor;
    mocks.browserAPI.tabs.sendMessage.mockClear();
    mocks.browserAPI.runtime.sendMessage.mockClear();

    const result = await ttsStateManager.stopForOwner(successorSender, {
      ttsId: 'successor-id',
      stopOnlyIfOwner: true,
    });

    expect(result).toMatchObject({
      success: true,
      action: 'stopped',
      predecessorDisplaced: false,
      classification: 'B',
    });
    // Predecessor preserved as valid committed state.
    expect(ttsStateManager.pendingPlaybackToken).toBeNull();
    expect(ttsStateManager.currentPlaybackToken).toBe(predecessor);
    expect(ttsStateManager.currentTTSId).toBe('predecessor-id');

    // Only the pending lease is released.
    const releasedLeaseIds = mocks.release.mock.calls.map(([arg]) => arg.leaseId);
    expect(releasedLeaseIds).toContain(successor);
    expect(releasedLeaseIds).not.toContain(predecessor);

    // Predecessor owner receives no terminal notification.
    const predecessorTabMessages = mocks.browserAPI.tabs.sendMessage.mock.calls
      .filter(([tabId]) => tabId === 10);
    expect(predecessorTabMessages).toHaveLength(0);
  });

  it('Branch A: STOP returns stopped: true → predecessor reconciled as displaced', async () => {
    const { predecessor, successor } = await seedHandoff();
    // Branch A: the pending PLAY already displaced the predecessor as the
    // current physical playback.
    mocks.offscreenCurrentToken = successor;

    const result = await ttsStateManager.stopForOwner(successorSender, {
      ttsId: 'successor-id',
      stopOnlyIfOwner: true,
    });

    expect(result).toMatchObject({
      success: true,
      action: 'stopped',
      predecessorDisplaced: true,
      classification: 'A',
    });
    expect(ttsStateManager.pendingPlaybackToken).toBeNull();
    expect(ttsStateManager.currentPlaybackToken).toBeNull();
    expect(ttsStateManager.currentTTSSender).toBeNull();
    expect(ttsStateManager.currentTTSId).toBeNull();

    const releasedLeaseIds = mocks.release.mock.calls.map(([arg]) => arg.leaseId);
    expect(releasedLeaseIds).toEqual(expect.arrayContaining([predecessor, successor]));
  });

  it('Branch C-null: STOP skipped + offscreen current is null → captured predecessor is reconciled as stale (NOT falsely preserved)', async () => {
    const { predecessor, successor } = await seedHandoff();
    // Branch C-null: nothing is physically playing. Offscreen does NOT
    // prove the captured predecessor is still alive; StateManager must
    // reconcile it as stale rather than falsely preserve it.
    mocks.offscreenCurrentToken = null;
    mocks.browserAPI.tabs.sendMessage.mockClear();
    mocks.browserAPI.runtime.sendMessage.mockClear();

    const result = await ttsStateManager.stopForOwner(successorSender, {
      ttsId: 'successor-id',
      stopOnlyIfOwner: true,
    });

    expect(result).toMatchObject({
      success: true,
      action: 'stopped',
      predecessorDisplaced: false,
      classification: 'C-null',
    });
    // Captured predecessor reconciled: cleared, lease released, owner notified.
    expect(ttsStateManager.pendingPlaybackToken).toBeNull();
    expect(ttsStateManager.currentPlaybackToken).toBeNull();
    expect(ttsStateManager.currentTTSSender).toBeNull();
    expect(ttsStateManager.currentTTSId).toBeNull();
    const releasedLeaseIds = mocks.release.mock.calls.map(([arg]) => arg.leaseId);
    expect(releasedLeaseIds).toEqual(expect.arrayContaining([predecessor, successor]));

    // Predecessor owner receives `interrupted` (NOT `stopped`).
    const predecessorTabMessages = mocks.browserAPI.tabs.sendMessage.mock.calls
      .filter(([tabId]) => tabId === 10);
    expect(predecessorTabMessages.length).toBeGreaterThan(0);
    predecessorTabMessages.forEach(([, msg]) => {
      expect(msg.reason).toBe('interrupted');
    });
  });

  it('Branch C-different: STOP skipped + offscreen current is a newer/different token → captured stale predecessor reconciled ONLY if StateManager still references it', async () => {
    const { predecessor, successor } = await seedHandoff();

    // Simulate the race: while the pending cleanup is awaiting the offscreen
    // TTS_STOP, a replacement generation is acquired and committed, becoming
    // the new physical current playback. The captured predecessor token
    // (taken synchronously before await) is no longer in StateManager, and
    // offscreen's current is the replacement (different from captured
    // predecessor). StateManager must not touch the replacement and must
    // not synthesize a predecessor terminal notification (the captured
    // token is no longer referenced).
    mocks.browserAPI.runtime.sendMessage.mockImplementation(async (message) => {
      if (message?.action === 'TTS_STOP' && message.playbackToken === successor) {
        const replacement = await ttsStateManager.acquirePlaybackLease({
          sender: successorSender,
          ttsId: 'replacement-id',
          language: 'fr',
          text: 'replacement text',
        });
        await ttsStateManager.commitPlaybackLease(replacement, {
          sender: successorSender,
          ttsId: 'replacement-id',
          language: 'fr',
          text: 'replacement text',
        });
        // Offscreen current is the NEWER replacement; the supplied pending
        // token does NOT match → Branch C-different.
        return {
          success: true,
          skipped: true,
          currentPlaybackToken: replacement,
        };
      }
      return undefined;
    });
    mocks.offscreenCurrentToken = null;
    mocks.browserAPI.tabs.sendMessage.mockClear();
    mocks.browserAPI.runtime.sendMessage.mockClear();

    const result = await ttsStateManager.stopForOwner(successorSender, {
      ttsId: 'successor-id',
      stopOnlyIfOwner: true,
    });

    expect(result).toMatchObject({
      success: true,
      action: 'stopped',
      classification: 'C-different',
    });
    // Replacement generation survives untouched.
    const replacementPlaybackToken = ttsStateManager.currentPlaybackToken;
    expect(replacementPlaybackToken).not.toBe(predecessor);
    expect(replacementPlaybackToken).not.toBe(successor);
    expect(ttsStateManager.currentTTSId).toBe('replacement-id');

    // No predecessor terminal notification (StateManager no longer
    // references the captured predecessor; we did not falsely claim a
    // reconciliation against a foreign token).
    const predecessorTabMessages = mocks.browserAPI.tabs.sendMessage.mock.calls
      .filter(([tabId]) => tabId === 10);
    expect(predecessorTabMessages).toHaveLength(0);
  });

  it('same-session chunk transition still stops whole session when predecessor and successor share the same owner', async () => {
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

  it('late successor commit after selective cancellation is rejected (token-fenced)', async () => {
    const { successor } = await seedHandoff();
    mocks.offscreenCurrentToken = successor;

    await ttsStateManager.stopForOwner(successorSender, {
      ttsId: 'successor-id',
      stopOnlyIfOwner: true,
    });

    await expect(ttsStateManager.commitPlaybackLease(successor)).resolves.toBe(false);
    expect(ttsStateManager.currentPlaybackToken).not.toBe(successor);
  });

  it('post-boundary successor-owner selective stop notifies predecessor owner with `interrupted`, not `stopped`', async () => {
    const { predecessor, successor } = await seedHandoff();
    mocks.offscreenCurrentToken = successor;
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

  it('stale/replacement playback tokens cannot generate a predecessor terminal notification', async () => {
    const { predecessor, successor } = await seedHandoff();
    // Simulated offscreen already knows the pending token is current.
    mocks.offscreenCurrentToken = successor;

    mocks.browserAPI.tabs.sendMessage.mockClear();
    mocks.browserAPI.runtime.sendMessage.mockClear();

    await ttsStateManager.stopForOwner(successorSender, {
      ttsId: 'successor-id',
      stopOnlyIfOwner: true,
    });

    const predecessorTabMessages = mocks.browserAPI.tabs.sendMessage.mock.calls
      .filter(([tabId]) => tabId === 10);
    expect(predecessorTabMessages.length).toBeGreaterThan(0);
    predecessorTabMessages.forEach(([, msg]) => {
      // The notification carries the exact live predecessor token, not any
      // stale replacement UUID.
      expect(msg.playbackToken).toBe(predecessor);
      expect(msg.playbackToken).not.toBe('stale-replacement-uuid');
      expect(msg.reason).toBe('interrupted');
    });
  });

  it('replacement generation that appears during async pending cleanup is NEVER cleared', async () => {
    const { predecessor, successor } = await seedHandoff();

    // Simulate the race: while the pending cleanup is awaiting the offscreen
    // TTS_STOP, a replacement pending generation appears. The captured
    // predecessor token must remain the only generation that may be cleared;
    // the replacement must survive untouched.
    let replacementToken;
    mocks.browserAPI.runtime.sendMessage.mockImplementation(async (message) => {
      if (message?.action === 'TTS_STOP' && message.playbackToken === successor) {
        // While this awaited token-scoped stop is in flight, a brand-new
        // successor is acquired and committed.
        replacementToken = await ttsStateManager.acquirePlaybackLease({
          sender: successorSender,
          ttsId: 'replacement-id',
          language: 'fr',
          text: 'replacement',
        });
        await ttsStateManager.commitPlaybackLease(replacementToken);
        return { success: true, stopped: true };
      }
      return undefined;
    });
    mocks.offscreenCurrentToken = successor;

    await ttsStateManager.stopForOwner(successorSender, {
      ttsId: 'successor-id',
      stopOnlyIfOwner: true,
    });

    // Replacement generation survived — it must NOT be cleared by the
    // pending cleanup. The committed state points to the replacement, not
    // to the captured predecessor token.
    expect(ttsStateManager.currentPlaybackToken).toBe(replacementToken);
    expect(ttsStateManager.currentTTSId).toBe('replacement-id');
    // Captured predecessor token was terminalized (its lease released, its
    // metadata cleared) but only because currentPlaybackToken still
    // matched at the time of the post-await check; the fence logic must
    // not have touched the replacement.
    expect(replacementToken).not.toBe(predecessor);
  });

  it('tombstoned token cannot become current or interrupt existing playback after pending cancellation (Branch B)', async () => {
    const { predecessor, successor } = await seedHandoff();
    // Branch B: offscreen confirms the captured predecessor is the current
    // physical playback. The pending PLAY had not displaced it.
    mocks.offscreenCurrentToken = predecessor;

    await ttsStateManager.stopForOwner(successorSender, {
      ttsId: 'successor-id',
      stopOnlyIfOwner: true,
    });

    // The tombstoned pending token must NOT be adoptable by any later
    // PLAY: commitPlaybackLease is fenced against it, and the offscreen
    // tombstone (canceledPlaybackTokens) would reject any delayed PLAY in
    // the real runtime. Here we verify the StateManager-side fence.
    await expect(ttsStateManager.commitPlaybackLease(successor)).resolves.toBe(false);
    expect(ttsStateManager.currentPlaybackToken).toBe(predecessor);

    // The live predecessor is preserved — a delayed PLAY for the canceled
    // successor token cannot have displaced it.
    expect(ttsStateManager.currentTTSSender).toBe(predecessorSender);
    expect(ttsStateManager.currentTTSId).toBe('predecessor-id');
  });

  it('selective pending stop without a predecessor (first playback) never emits tokenless TTS_STOP', async () => {
    // No committed predecessor: just a freshly acquired pending.
    const pending = await ttsStateManager.acquirePlaybackLease({
      sender: successorSender,
      ttsId: 'first-pending-id',
      language: 'fr',
      text: 'first pending',
    });
    mocks.offscreenCurrentToken = pending;
    const callsBefore = mocks.browserAPI.runtime.sendMessage.mock.calls.length;

    const result = await ttsStateManager.stopForOwner(successorSender, {
      ttsId: 'first-pending-id',
      stopOnlyIfOwner: true,
    });

    expect(result).toMatchObject({ success: true, action: 'stopped' });
    const stopCalls = mocks.browserAPI.runtime.sendMessage.mock.calls
      .slice(callsBefore)
      .filter(([msg]) => msg?.action === 'TTS_STOP');
    expect(stopCalls).toHaveLength(1);
    // Every TTS_STOP in the selective path carries an exact playbackToken.
    stopCalls.forEach(([msg]) => {
      expect(msg.playbackToken).toBe(pending);
      expect(msg.playbackToken).not.toBeNull();
      expect(msg.playbackToken).not.toBeUndefined();
    });
  });

  it('null playback token in stopPlaybackToken returns a safe skipped result and never reaches offscreen', async () => {
    const beforeCalls = mocks.browserAPI.runtime.sendMessage.mock.calls.length;
    const result = await ttsStateManager.stopPlaybackToken(null);
    expect(result).toEqual({ success: true, skipped: true, reason: 'missing_token' });

    const resultUndef = await ttsStateManager.stopPlaybackToken(undefined);
    expect(resultUndef).toEqual({ success: true, skipped: true, reason: 'missing_token' });

    const resultEmpty = await ttsStateManager.stopPlaybackToken('');
    expect(resultEmpty).toEqual({ success: true, skipped: true, reason: 'missing_token' });

    const stopCalls = mocks.browserAPI.runtime.sendMessage.mock.calls
      .slice(beforeCalls)
      .filter(([msg]) => msg?.action === 'TTS_STOP');
    expect(stopCalls).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Branch D: offscreen unavailable / transport failure means physical state
  // is unknown. Invalidate and release only the pending generation; preserve
  // the captured predecessor and do not notify its owner.
  // ---------------------------------------------------------------------------

  it('Branch D: offscreen unavailable preserves predecessor; result is explicit failure', async () => {
    const { predecessor, successor } = await seedHandoff();
    mocks.offscreenCurrentToken = null;
    mocks.offscreenFailureMode = 'unavailable';
    mocks.browserAPI.tabs.sendMessage.mockClear();
    mocks.browserAPI.runtime.sendMessage.mockClear();

    const result = await ttsStateManager.stopForOwner(successorSender, {
      ttsId: 'successor-id',
      stopOnlyIfOwner: true,
    });

    await expectBranchDToPreservePredecessor(result, predecessor, successor);
  });

  it('Branch D with live predecessor: predecessor remains current, lease preserved, no notification, result is explicit failure', async () => {
    const { predecessor, successor } = await seedHandoff();
    mocks.offscreenFailureMode = 'transport';
    mocks.browserAPI.tabs.sendMessage.mockClear();

    const result = await ttsStateManager.stopForOwner(successorSender, {
      ttsId: 'successor-id',
      stopOnlyIfOwner: true,
    });

    await expectBranchDToPreservePredecessor(result, predecessor, successor);
  });

  it('Branch D: offscreen transport failure preserves the predecessor', async () => {
    const { predecessor, successor } = await seedHandoff();
    mocks.offscreenCurrentToken = null;
    mocks.offscreenFailureMode = 'transport';
    mocks.browserAPI.tabs.sendMessage.mockClear();
    mocks.browserAPI.runtime.sendMessage.mockClear();

    const result = await ttsStateManager.stopForOwner(successorSender, {
      ttsId: 'successor-id',
      stopOnlyIfOwner: true,
    });

    await expectBranchDToPreservePredecessor(result, predecessor, successor);
  });

  it('Branch D with a replacement committed generation: captured predecessor already gone, replacement is untouched', async () => {
    const { predecessor, successor } = await seedHandoff();

    // Simulate the race: while the pending cleanup is awaiting the offscreen
    // TTS_STOP, a replacement generation is acquired and committed, becoming
    // the new committed generation in StateManager. offscreen transport
    // fails (Branch D). StateManager no longer points to the captured
    // predecessor token; the replacement must survive untouched.
    mocks.browserAPI.runtime.sendMessage.mockImplementation(async (message) => {
      if (message?.action === 'TTS_STOP' && message.playbackToken === successor) {
        const replacement = await ttsStateManager.acquirePlaybackLease({
          sender: successorSender,
          ttsId: 'replacement-id',
          language: 'fr',
          text: 'replacement text',
        });
        await ttsStateManager.commitPlaybackLease(replacement, {
          sender: successorSender,
          ttsId: 'replacement-id',
          language: 'fr',
          text: 'replacement text',
        });
        // Simulated transport failure on the runtime side.
        throw new Error('runtime unavailable');
      }
      return undefined;
    });
    mocks.offscreenCurrentToken = null;
    mocks.offscreenFailureMode = null;
    mocks.browserAPI.tabs.sendMessage.mockClear();
    mocks.browserAPI.runtime.sendMessage.mockClear();

    const result = await ttsStateManager.stopForOwner(successorSender, {
      ttsId: 'successor-id',
      stopOnlyIfOwner: true,
    });

    expect(result).toMatchObject({
      success: false,
      error: 'offscreen_state_unknown',
      classification: 'D',
    });
    // Replacement survives untouched; StateManager no longer points to the
    // captured predecessor so we must not fabricate a predecessor terminal
    // notification against a foreign generation.
    const replacementPlaybackToken = ttsStateManager.currentPlaybackToken;
    expect(replacementPlaybackToken).not.toBe(predecessor);
    expect(replacementPlaybackToken).not.toBe(successor);
    expect(ttsStateManager.currentTTSId).toBe('replacement-id');
    expect(mocks.release.mock.calls.map(([arg]) => arg.leaseId)).toContain(successor);
    await expect(ttsStateManager.commitPlaybackLease(successor)).resolves.toBe(false);

    // No predecessor terminal notification (StateManager no longer
    // references the captured predecessor; we don't synthesize one).
    const predecessorTabMessages = mocks.browserAPI.tabs.sendMessage.mock.calls
      .filter(([tabId]) => tabId === 10);
    expect(predecessorTabMessages).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Late logically-cancelled PLAY/commit: failPlaybackHandoff for a stale
  // (already cancelled) token must still exact-token-stop/tombstone in
  // offscreen rather than merely releasing its lease. A delayed PLAY for
  // the cancelled token must remain fenced.
  // ---------------------------------------------------------------------------

  it('failPlaybackHandoff for a stale token exact-token-stops and tombstones; late PLAY for that token is rejected', async () => {
    const predecessor = await ttsStateManager.acquirePlaybackLease();
    await ttsStateManager.commitPlaybackLease(predecessor, {
      sender: predecessorSender,
      ttsId: 'predecessor-id',
      language: 'en',
      text: 'predecessor text',
    });

    const stale = await ttsStateManager.acquirePlaybackLease({
      sender: successorSender,
      ttsId: 'successor-id',
      language: 'fr',
      text: 'successor text',
    });
    // Logically cancel the pending via selective stop.
    mocks.offscreenCurrentToken = predecessor; // Branch B: predecessor preserved
    await ttsStateManager.stopForOwner(successorSender, {
      ttsId: 'successor-id',
      stopOnlyIfOwner: true,
    });
    expect(ttsStateManager.pendingPlaybackToken).toBeNull();

    // A delayed handler failure path arrives for the cancelled token.
    // StateManager's pending/current slots no longer reference it.
    const callsBefore = mocks.browserAPI.runtime.sendMessage.mock.calls.length;
    const result = await ttsStateManager.failPlaybackHandoff(stale);
    expect(result).toBe(false);

    // failPlaybackHandoff issued an exact-token TTS_STOP to tombstone the
    // stale token before releasing its lease.
    const stopCalls = mocks.browserAPI.runtime.sendMessage.mock.calls
      .slice(callsBefore)
      .filter(([msg]) => msg?.action === 'TTS_STOP');
    expect(stopCalls.length).toBeGreaterThanOrEqual(1);
    stopCalls.forEach(([msg]) => {
      expect(msg.playbackToken).toBe(stale);
      expect(msg.playbackToken).not.toBeNull();
    });

    // The lease is released (the existing release path still runs).
    const releaseForStale = mocks.release.mock.calls
      .filter(([arg]) => arg.leaseId === stale);
    expect(releaseForStale.length).toBeGreaterThanOrEqual(1);

    // StateManager state is untouched (the live predecessor is unaffected).
    expect(ttsStateManager.currentPlaybackToken).toBe(predecessor);
    expect(ttsStateManager.currentTTSId).toBe('predecessor-id');
  });

  // ---------------------------------------------------------------------------
  // Strict offscreen response-identity validation.
  //
  // Classification must validate the COMPLETE response identity. A missing,
  // contradictory, or mismatched identity field is malformed and routes to
  // Branch D — never silently inferred as Branch A or B/C. The caller must
  // be able to distinguish confirmed stop/reconciliation from unknown state.
  // ---------------------------------------------------------------------------

  it('offscreen_unavailable response (no currentPlaybackToken) is Branch D, never C-null', async () => {
    const { predecessor, successor } = await seedHandoff();
    // stopPlaybackToken returns this exact shape when ensureDocument() is
    // false: skipped:true, reason:'offscreen_unavailable', NO
    // currentPlaybackToken property.
    mocks.offscreenCurrentToken = null;
    mocks.offscreenFailureMode = 'unavailable';
    mocks.browserAPI.tabs.sendMessage.mockClear();
    mocks.browserAPI.runtime.sendMessage.mockClear();

    const result = await ttsStateManager.stopForOwner(successorSender, {
      ttsId: 'successor-id',
      stopOnlyIfOwner: true,
    });

    // Must be classified D (unconfirmed physical state), NOT C-null
    // (which would falsely claim "nothing is playing"). The result must be
    // an explicit failure, not the normal successful pre-boundary shape.
    await expectBranchDToPreservePredecessor(result, predecessor, successor);
    expect(result.classification).not.toBe('C-null');
    expect(result.success).not.toBe(true);
  });

  it('{ success:true, skipped:true } with no currentPlaybackToken → Branch D', async () => {
    const { predecessor, successor } = await seedHandoff();
    // Directly inject a malformed response that lacks currentPlaybackToken.
    mocks.offscreenCurrentToken = null;
    mocks.browserAPI.runtime.sendMessage.mockReset().mockImplementation(async (message) => {
      if (message?.action === 'TTS_STOP') {
        // Malformed: skipped but no currentPlaybackToken property.
        return { success: true, skipped: true };
      }
      return undefined;
    });
    mocks.browserAPI.tabs.sendMessage.mockClear();

    const result = await ttsStateManager.stopForOwner(successorSender, {
      ttsId: 'successor-id',
      stopOnlyIfOwner: true,
    });

    await expectBranchDToPreservePredecessor(result, predecessor, successor);
  });

  it('explicit { success:true, skipped:true, currentPlaybackToken:null } → Branch C-null', async () => {
    await seedHandoff();
    mocks.offscreenCurrentToken = null; // authoritative: nothing is playing
    mocks.browserAPI.tabs.sendMessage.mockClear();
    mocks.browserAPI.runtime.sendMessage.mockClear();

    const result = await ttsStateManager.stopForOwner(successorSender, {
      ttsId: 'successor-id',
      stopOnlyIfOwner: true,
    });

    // Explicit null is a meaningful "nothing is current" signal — this IS
    // authoritative enough for C-null (not the ambiguous absent-property D).
    expect(result).toMatchObject({
      success: true,
      action: 'stopped',
      predecessorDisplaced: false,
      classification: 'C-null',
    });
  });

  it('{ success:true, stopped:true, playbackToken: pendingToken } → Branch A', async () => {
    const { successor } = await seedHandoff();
    mocks.offscreenCurrentToken = successor;

    const result = await ttsStateManager.stopForOwner(successorSender, {
      ttsId: 'successor-id',
      stopOnlyIfOwner: true,
    });

    expect(result).toMatchObject({
      success: true,
      action: 'stopped',
      predecessorDisplaced: true,
      classification: 'A',
    });
  });

  it('{ success:true, stopped:true } without playbackToken → Branch D (malformed identity)', async () => {
    const { predecessor, successor } = await seedHandoff();
    mocks.offscreenCurrentToken = successor;
    mocks.browserAPI.runtime.sendMessage.mockReset().mockImplementation(async (message) => {
      if (message?.action === 'TTS_STOP') {
        // Malformed: stopped:true but no playbackToken field at all.
        return { success: true, stopped: true };
      }
      return undefined;
    });
    mocks.browserAPI.tabs.sendMessage.mockClear();

    const result = await ttsStateManager.stopForOwner(successorSender, {
      ttsId: 'successor-id',
      stopOnlyIfOwner: true,
    });

    await expectBranchDToPreservePredecessor(result, predecessor, successor);
  });

  it('{ success:true, stopped:true, playbackToken:\'different-token\' } → Branch D (mismatched identity)', async () => {
    const { predecessor, successor } = await seedHandoff();
    mocks.offscreenCurrentToken = successor;
    mocks.browserAPI.runtime.sendMessage.mockReset().mockImplementation(async (message) => {
      if (message?.action === 'TTS_STOP') {
        // Malformed: stopped:true but the returned playbackToken does not
        // match the pending token we sent.
        return { success: true, stopped: true, playbackToken: 'different-token' };
      }
      return undefined;
    });
    mocks.browserAPI.tabs.sendMessage.mockClear();

    const result = await ttsStateManager.stopForOwner(successorSender, {
      ttsId: 'successor-id',
      stopOnlyIfOwner: true,
    });

    await expectBranchDToPreservePredecessor(result, predecessor, successor);
  });

  it('contradictory { success:true, stopped:true, skipped:true } → Branch D', async () => {
    const { predecessor, successor } = await seedHandoff();
    mocks.offscreenCurrentToken = successor;
    mocks.browserAPI.runtime.sendMessage.mockReset().mockImplementation(async (message) => {
      if (message?.action === 'TTS_STOP') {
        // Contradictory shape: both stopped and skipped.
        return { success: true, stopped: true, skipped: true, playbackToken: successor };
      }
      return undefined;
    });
    mocks.browserAPI.tabs.sendMessage.mockClear();

    const result = await ttsStateManager.stopForOwner(successorSender, {
      ttsId: 'successor-id',
      stopOnlyIfOwner: true,
    });

    await expectBranchDToPreservePredecessor(result, predecessor, successor);
  });

  it('Branch D: pending generation remains locally invalidated, newer generations untouched, result does NOT claim normal success', async () => {
    const { predecessor, successor } = await seedHandoff();
    mocks.offscreenFailureMode = 'transport';
    mocks.browserAPI.tabs.sendMessage.mockClear();
    mocks.browserAPI.runtime.sendMessage.mockClear();

    const result = await ttsStateManager.stopForOwner(successorSender, {
      ttsId: 'successor-id',
      stopOnlyIfOwner: true,
    });

    // Result explicitly signals unconfirmed physical state (not a normal
    // successful stop).
    expect(result.success).toBe(false);
    expect(result.classification).toBe('D');
    // Pending logical generation is still invalidated (late commit rejected).
    expect(ttsStateManager.pendingPlaybackToken).toBeNull();
    await expect(ttsStateManager.commitPlaybackLease(successor)).resolves.toBe(false);
    // The captured predecessor remains current because physical state is
    // unknown; any newer generation that replaced it during the async window
    // would likewise be preserved by the token-fence.
    expect(ttsStateManager.currentPlaybackToken).toBe(predecessor);
    expect(ttsStateManager.currentTTSSender).toBe(predecessorSender);
    expect(ttsStateManager.currentTTSId).toBe('predecessor-id');
    expect(mocks.release.mock.calls.map(([arg]) => arg.leaseId)).toContain(successor);
    expect(mocks.release.mock.calls.map(([arg]) => arg.leaseId)).not.toContain(predecessor);
    expect(mocks.browserAPI.tabs.sendMessage.mock.calls
      .filter(([tabId]) => tabId === predecessorSender.tab.id)).toHaveLength(0);
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
