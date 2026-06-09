import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import useLiveCaptionStore from '../stores/liveCaption.js';
import { LiveCaptionRuntimeController } from './LiveCaptionRuntimeController.js';
import { LIVE_CAPTION_ACTIONS } from '../constants/liveCaptionActions.js';
import { LIVE_CAPTION_RUNTIME_STATES } from '../constants/liveCaptionRuntimeStates.js';
import { LIVE_CAPTION_CLEANUP_REASONS } from '../core/contracts.js';
import { createVideoFingerprint } from '../core/VideoFingerprint.js';
import { LIVE_CAPTION_CLEANUP_RESULT_STATUSES } from '../core/LiveCaptionCleanupCoordinator.js';
import { LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES } from '../background/liveCaptionRuntimeContracts.js';

const mocks = vi.hoisted(() => ({
  offscreenBridge: vi.fn(),
  sttFactory: vi.fn(),
  translationAdapter: vi.fn(),
  cacheFacade: vi.fn()
}));

vi.mock('@/features/live-caption/background/LiveCaptionOffscreenBridge.js', () => ({
  LiveCaptionOffscreenBridge: mocks.offscreenBridge
}));

vi.mock('@/features/live-caption/stt/STTProviderFactory.js', () => ({
  STTProviderFactory: mocks.sttFactory
}));

vi.mock('@/features/live-caption/background/LiveCaptionTranslationAdapter.js', () => ({
  LiveCaptionTranslationAdapter: mocks.translationAdapter
}));

vi.mock('@/features/live-caption/cache/LiveCaptionCache.js', () => ({
  LiveCaptionCache: mocks.cacheFacade
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}));

function createSupportedPlatformSupport() {
  return {
    supported: true,
    reason: 'supported',
    message: 'supported',
    browserName: 'chrome',
    platform: 'desktop',
    isMobile: false
  };
}

function createRuntimeBrowserApi() {
  const sendMessage = vi.fn(async (request) => {
    const runtimeStatusByAction = {
      [LIVE_CAPTION_ACTIONS.RUNTIME_START]: LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.START_NOT_IMPLEMENTED,
      [LIVE_CAPTION_ACTIONS.RUNTIME_STOP]: LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.STOP_NOT_IMPLEMENTED,
      [LIVE_CAPTION_ACTIONS.RUNTIME_STATUS]: LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.STATUS_NOT_IMPLEMENTED,
      [LIVE_CAPTION_ACTIONS.RUNTIME_PAUSE]: LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.PAUSE_NOT_IMPLEMENTED,
      [LIVE_CAPTION_ACTIONS.RUNTIME_RESUME]: LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.RESUME_NOT_IMPLEMENTED
    };

    return {
      success: true,
      ok: true,
      action: request.action,
      status: runtimeStatusByAction[request.action] ?? LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.OK,
      runtimeState: request.action === LIVE_CAPTION_ACTIONS.RUNTIME_STOP ? 'idle' : request.action === LIVE_CAPTION_ACTIONS.RUNTIME_PAUSE ? 'paused' : 'running',
      sessionId: request.data?.sessionId ?? null,
      tabId: request.data?.tabId ?? null,
      videoFingerprint: request.data?.videoFingerprint ?? null,
      requestId: request.messageId ?? null
    };
  });

  return {
    runtime: {
      sendMessage
    }
  };
}

function createVideo({
  src,
  paused = false,
  muted = false,
  volume = 1,
  width = 640,
  height = 360,
  top = 0,
  left = 0
} = {}) {
  const video = document.createElement('video');

  Object.defineProperty(video, 'currentSrc', {
    configurable: true,
    value: src
  });
  Object.defineProperty(video, 'paused', {
    configurable: true,
    writable: true,
    value: paused
  });
  Object.defineProperty(video, 'ended', {
    configurable: true,
    writable: true,
    value: false
  });
  Object.defineProperty(video, 'muted', {
    configurable: true,
    writable: true,
    value: muted
  });
  Object.defineProperty(video, 'volume', {
    configurable: true,
    writable: true,
    value: volume
  });
  video.getBoundingClientRect = vi.fn(() => ({
    top,
    left,
    right: left + width,
    bottom: top + height,
    width,
    height
  }));

  return video;
}

describe('live-caption runtime controller', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('starts lazily and protects against duplicate start requests', async () => {
    const store = useLiveCaptionStore();
    store.acceptConsent();

    const controller = new LiveCaptionRuntimeController({
      store,
      documentRef: document,
      windowRef: window,
      platformSupport: createSupportedPlatformSupport()
    });

    await controller.start({ tabId: 11 });
    const firstSessionId = controller.pageSession?.sessionId;

    expect(controller.started).toBe(true);
    expect(store.runtimeStatus).toBe(LIVE_CAPTION_RUNTIME_STATES.RUNNING);
    expect(store.overlayVisible).toBe(true);
    expect(firstSessionId).toBeTypeOf('string');
    expect(controller.sessionManager.getSession(11)).not.toBe(null);

    await controller.start({ tabId: 11 });

    expect(controller.pageSession?.sessionId).toBe(firstSessionId);
    expect(controller.sessionManager.getAllSessionSnapshots()).toHaveLength(1);
  });

  it('shares the same in-flight promise for concurrent start calls', async () => {
    const store = useLiveCaptionStore();
    store.acceptConsent();

    const controller = new LiveCaptionRuntimeController({
      store,
      documentRef: document,
      windowRef: window,
      platformSupport: createSupportedPlatformSupport()
    });

    controller._setupObservers = vi.fn();
    controller.syncActiveVideo = vi.fn().mockResolvedValue(controller.getSnapshot());

    const firstStart = controller.start({ tabId: 11 });
    const secondStart = controller.start({ tabId: 11 });

    const [firstResult, secondResult] = await Promise.all([firstStart, secondStart]);

    expect(controller._setupObservers).toHaveBeenCalledTimes(1);
    expect(controller.syncActiveVideo).toHaveBeenCalledTimes(1);
    expect(controller.sessionManager.getAllSessionSnapshots()).toHaveLength(1);
    expect(firstResult.sessionId).toBe(secondResult.sessionId);
    expect(firstResult.runtimeStatus).toBe(LIVE_CAPTION_RUNTIME_STATES.RUNNING);
    expect(secondResult.runtimeStatus).toBe(LIVE_CAPTION_RUNTIME_STATES.RUNNING);
  });

  it('routes runtime lifecycle requests through the background messaging shell', async () => {
    const store = useLiveCaptionStore();
    store.acceptConsent();
    const browserApi = createRuntimeBrowserApi();

    const controller = new LiveCaptionRuntimeController({
      store,
      documentRef: document,
      windowRef: window,
      browserApi,
      platformSupport: createSupportedPlatformSupport()
    });

    await controller.start({ tabId: 11 });
    const statusResponse = await controller.requestRuntimeStatus('manual-status');
    await controller.pause();
    await controller.resume();
    await controller.stop(LIVE_CAPTION_CLEANUP_REASONS.STOP);

    expect(browserApi.runtime.sendMessage).toHaveBeenCalledTimes(5);
    expect(browserApi.runtime.sendMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        action: LIVE_CAPTION_ACTIONS.RUNTIME_START,
        context: 'live-caption',
        data: expect.objectContaining({
          tabId: 11,
          requestSource: 'content'
        })
      })
    );
    expect(browserApi.runtime.sendMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        action: LIVE_CAPTION_ACTIONS.RUNTIME_STATUS
      })
    );
    expect(browserApi.runtime.sendMessage).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        action: LIVE_CAPTION_ACTIONS.RUNTIME_PAUSE
      })
    );
    expect(browserApi.runtime.sendMessage).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        action: LIVE_CAPTION_ACTIONS.RUNTIME_RESUME
      })
    );
    expect(browserApi.runtime.sendMessage).toHaveBeenNthCalledWith(
      5,
      expect.objectContaining({
        action: LIVE_CAPTION_ACTIONS.RUNTIME_STOP
      })
    );
    expect(statusResponse.status).toBe(LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.STATUS_NOT_IMPLEMENTED);
    expect(controller.lastRuntimeResponse.status).toBe(LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.STOP_NOT_IMPLEMENTED);
  });

  it('detects the active video and replaces the active session when the winner changes', async () => {
    const store = useLiveCaptionStore();
    store.acceptConsent();

    const firstVideo = createVideo({
      src: 'https://example.com/a.mp4',
      paused: false,
      width: 640,
      height: 360
    });
    const secondVideo = createVideo({
      src: 'https://example.com/b.mp4',
      paused: true,
      width: 320,
      height: 180,
      left: 700
    });

    document.body.append(firstVideo, secondVideo);

    const controller = new LiveCaptionRuntimeController({
      store,
      documentRef: document,
      windowRef: window,
      platformSupport: createSupportedPlatformSupport()
    });

    await controller.start({ tabId: 11 });

    const firstFingerprint = createVideoFingerprint(firstVideo, {
      baseUrl: window.location.origin
    });
    expect(store.activeVideoFingerprint).toBe(firstFingerprint);
    expect(store.activeVideoState).toMatchObject({
      videoFingerprint: firstFingerprint,
      handoffAction: 'create_new_video_session'
    });

    Object.defineProperty(firstVideo, 'paused', {
      configurable: true,
      writable: true,
      value: true
    });
    Object.defineProperty(secondVideo, 'paused', {
      configurable: true,
      writable: true,
      value: false
    });

    await controller.syncActiveVideo('video-change');

    const secondFingerprint = createVideoFingerprint(secondVideo, {
      baseUrl: window.location.origin
    });

    expect(store.activeVideoFingerprint).toBe(secondFingerprint);
    expect(controller.currentVideoElement).toBe(secondVideo);
    expect(controller.pageSession?.activeVideoSession?.videoFingerprint).toBe(secondFingerprint);
    expect(store.activeVideoState).toMatchObject({
      videoFingerprint: secondFingerprint,
      handoffAction: 'replace_active_video'
    });
  });

  it('pauses, resumes, and destroys cleanup-safe runtime state', async () => {
    const store = useLiveCaptionStore();
    store.acceptConsent();

    const video = createVideo({
      src: 'https://example.com/a.mp4',
      paused: false
    });
    document.body.append(video);

    const controller = new LiveCaptionRuntimeController({
      store,
      documentRef: document,
      windowRef: window,
      platformSupport: createSupportedPlatformSupport()
    });

    await controller.start({ tabId: 11 });
    await controller.pause();

    expect(controller.paused).toBe(true);
    expect(store.runtimeStatus).toBe(LIVE_CAPTION_RUNTIME_STATES.PAUSED);

    await controller.resume();

    expect(controller.paused).toBe(false);
    expect(store.runtimeStatus).toBe(LIVE_CAPTION_RUNTIME_STATES.RUNNING);

    await controller.stop(LIVE_CAPTION_CLEANUP_REASONS.STOP);

    expect(store.runtimeStatus).toBe(LIVE_CAPTION_RUNTIME_STATES.STOPPED);
    expect(store.overlayVisible).toBe(false);
    expect(store.isEnabled).toBe(false);
    expect(controller.sessionManager.getSession(11)).toBe(null);

    await controller.destroy(LIVE_CAPTION_CLEANUP_REASONS.MANUAL);

    expect(controller.destroyed).toBe(true);
    expect(store.runtimeStatus).toBe(LIVE_CAPTION_RUNTIME_STATES.DESTROYED);
  });

  it('reconciles fail-closed session-manager cleanup metadata into the final cleanup result', async () => {
    const store = useLiveCaptionStore();
    store.acceptConsent();

    const controller = new LiveCaptionRuntimeController({
      store,
      documentRef: document,
      windowRef: window,
      platformSupport: createSupportedPlatformSupport()
    });

    await controller.start({ tabId: 11 });

    controller.sessionManager.cleanupByTabId = vi.fn(() => null);
    controller.sessionManager.getSessionCleanupMetadata = vi.fn(() => ({
      tabId: 11,
      sessionId: controller.pageSession?.sessionId ?? null,
      reason: LIVE_CAPTION_CLEANUP_REASONS.STOP,
      status: LIVE_CAPTION_CLEANUP_RESULT_STATUSES.FAIL_CLOSED,
      error: {
        code: 'LIVE_CAPTION_SESSION_MANAGER_CLEANUP_FAILED',
        message: 'cleanup failed'
      },
      snapshot: controller.pageSession?.getCleanupSnapshot?.() ?? null,
      updatedAt: Date.now()
    }));

    const cleanupResult = await controller.stop(LIVE_CAPTION_CLEANUP_REASONS.STOP);

    expect(cleanupResult.status).toBe(LIVE_CAPTION_CLEANUP_RESULT_STATUSES.FAIL_CLOSED);
    expect(cleanupResult.error).toMatchObject({
      code: 'LIVE_CAPTION_SESSION_MANAGER_CLEANUP_FAILED',
      message: 'cleanup failed'
    });
    expect(store.runtimeStatus).toBe(LIVE_CAPTION_RUNTIME_STATES.ERROR);
  });

  it('does not invoke capture, STT, translation, or offscreen modules', async () => {
    const store = useLiveCaptionStore();
    store.acceptConsent();

    const controller = new LiveCaptionRuntimeController({
      store,
      documentRef: document,
      windowRef: window,
      platformSupport: createSupportedPlatformSupport()
    });

    await controller.start({ tabId: 11 });
    await controller.syncActiveVideo('scan');
    await controller.stop(LIVE_CAPTION_CLEANUP_REASONS.STOP);

    expect(mocks.offscreenBridge).not.toHaveBeenCalled();
    expect(mocks.sttFactory).not.toHaveBeenCalled();
    expect(mocks.translationAdapter).not.toHaveBeenCalled();
    expect(mocks.cacheFacade).not.toHaveBeenCalled();
  });
});
