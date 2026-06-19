import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import useLiveCaptionStore from '../stores/liveCaption.js';
import { LiveCaptionRuntimeController } from './LiveCaptionRuntimeController.js';
import { LIVE_CAPTION_ACTIONS } from '../constants/liveCaptionActions.js';
import { LIVE_CAPTION_RUNTIME_STATES } from '../constants/liveCaptionRuntimeStates.js';
import { LIVE_CAPTION_CLEANUP_REASONS } from '../core/contracts.js';
import { createVideoFingerprint } from '../core/VideoFingerprint.js';
import { LIVE_CAPTION_CLEANUP_RESULT_STATUSES } from '../core/LiveCaptionCleanupCoordinator.js';
import { LIVE_CAPTION_RUNTIME_SHELL_STATES } from '../background/liveCaptionRuntimeContracts.js';

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
  let shellStatus = LIVE_CAPTION_RUNTIME_SHELL_STATES.IDLE;
  let runtimeState = 'idle';
  const sendMessage = vi.fn(async (request) => {
    if (request.action === LIVE_CAPTION_ACTIONS.RUNTIME_START) {
      shellStatus = LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL;
      runtimeState = 'running';
    } else if (request.action === LIVE_CAPTION_ACTIONS.RUNTIME_PAUSE) {
      shellStatus = LIVE_CAPTION_RUNTIME_SHELL_STATES.PAUSED_SHELL;
      runtimeState = 'paused';
    } else if (request.action === LIVE_CAPTION_ACTIONS.RUNTIME_RESUME) {
      shellStatus = LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL;
      runtimeState = 'running';
    } else if (request.action === LIVE_CAPTION_ACTIONS.RUNTIME_STOP) {
      shellStatus = LIVE_CAPTION_RUNTIME_SHELL_STATES.IDLE;
      runtimeState = 'idle';
    }

    return {
      success: true,
      ok: true,
      action: request.action,
      status: shellStatus,
      runtimeState,
      sessionId: request.data?.sessionId ?? null,
      tabId: request.data?.tabId ?? null,
      videoFingerprint: request.data?.videoFingerprint ?? null,
      requestId: request.messageId ?? null,
      sessionSnapshot: request.action === LIVE_CAPTION_ACTIONS.RUNTIME_START ? {
        sessionId: request.data?.sessionId ?? null,
        tabId: request.data?.tabId ?? null,
        activeVideoFingerprint: request.data?.videoFingerprint ?? null,
        activeVideoSession: {
          videoFingerprint: request.data?.videoFingerprint ?? null,
          transcriptSegments: [
            { segmentId: 'transcript-1', originalText: 'Hello', segmentStartMs: 0, segmentEndMs: 1000 }
          ],
          translatedCaptionSegments: [
            { segmentId: 'hydrated-1', translatedText: 'سلام', originalText: 'Hello', segmentStartMs: 0, segmentEndMs: 1000 }
          ]
        }
      } : null
    };
  });

  return {
    runtime: {
      sendMessage
    }
  };
}

function createRuntimeBrowserApiWithMessageListener(startSnapshot = null) {
  let messageListener = null;

  const sendMessage = vi.fn(async (request) => {
    if (request.action === LIVE_CAPTION_ACTIONS.RUNTIME_START) {
      return createRuntimeResponse(request.action, request.data, {
        sessionSnapshot: startSnapshot ?? {
          sessionId: request.data?.sessionId ?? null,
          tabId: request.data?.tabId ?? null,
          activeVideoFingerprint: request.data?.videoFingerprint ?? null,
          activeVideoSession: {
            videoFingerprint: request.data?.videoFingerprint ?? null,
            transcriptSegments: [],
            translatedCaptionSegments: []
          }
        }
      });
    }

    return createRuntimeResponse(request.action, request.data);
  });

  return {
    browserApi: {
      runtime: {
        sendMessage,
        onMessage: {
          addListener: vi.fn((listener) => {
            messageListener = listener;
          }),
          removeListener: vi.fn()
        }
      }
    },
    getMessageListener: () => messageListener,
    sendMessage
  };
}

function createCanonicalTranslatedSegment({
  sessionId = 'session-1',
  tabId = 11,
  videoFingerprint = 'video-fingerprint-1',
  segmentId = 'segment-1',
  revision = 1,
  segmentStartMs = 1000,
  segmentEndMs = 3000,
  originalText = 'Hello',
  translatedText = 'سلام'
} = {}) {
  return {
    sessionId,
    tabId,
    videoFingerprint,
    segmentId,
    revision,
    segmentStartMs,
    segmentEndMs,
    originalText,
    translatedText,
    isFinal: true
  };
}

function createRuntimeResponse(action, data = {}, overrides = {}) {
  const runtimeStateByAction = {
    [LIVE_CAPTION_ACTIONS.RUNTIME_START]: 'running',
    [LIVE_CAPTION_ACTIONS.RUNTIME_STOP]: 'idle',
    [LIVE_CAPTION_ACTIONS.RUNTIME_PAUSE]: 'paused',
    [LIVE_CAPTION_ACTIONS.RUNTIME_RESUME]: 'running',
    [LIVE_CAPTION_ACTIONS.VIDEO_CHANGED]: overrides.runtimeState ?? 'running'
  };

  const statusByAction = {
    [LIVE_CAPTION_ACTIONS.RUNTIME_START]: LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL,
    [LIVE_CAPTION_ACTIONS.RUNTIME_STOP]: LIVE_CAPTION_RUNTIME_SHELL_STATES.IDLE,
    [LIVE_CAPTION_ACTIONS.RUNTIME_PAUSE]: LIVE_CAPTION_RUNTIME_SHELL_STATES.PAUSED_SHELL,
    [LIVE_CAPTION_ACTIONS.RUNTIME_RESUME]: LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL,
    [LIVE_CAPTION_ACTIONS.VIDEO_CHANGED]: LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL
  };

  const sessionSnapshot = action === LIVE_CAPTION_ACTIONS.RUNTIME_START
    ? {
        sessionId: data.sessionId ?? null,
        tabId: data.tabId ?? null,
        activeVideoFingerprint: data.videoFingerprint ?? null,
        activeVideoSession: {
          videoFingerprint: data.videoFingerprint ?? null,
          transcriptSegments: [
            { segmentId: 'transcript-1', originalText: 'Hello', segmentStartMs: 0, segmentEndMs: 1000 }
          ],
          translatedCaptionSegments: [
            { segmentId: 'caption-1', translatedText: 'سلام', originalText: 'Hello', segmentStartMs: 0, segmentEndMs: 1000 }
          ]
        }
      }
    : overrides.sessionSnapshot ?? null;

  return {
    success: overrides.success ?? true,
    ok: overrides.ok ?? true,
    action,
    status: overrides.status ?? statusByAction[action] ?? LIVE_CAPTION_RUNTIME_SHELL_STATES.IDLE,
    runtimeState: overrides.runtimeState ?? runtimeStateByAction[action] ?? 'running',
    sessionId: data.sessionId ?? null,
    tabId: data.tabId ?? null,
    videoFingerprint: data.videoFingerprint ?? null,
    requestId: data.requestId ?? null,
    message: overrides.message ?? null,
    sessionSnapshot,
    error: overrides.error ?? null
  };
}

function createVideo({
  src,
  paused = false,
  muted = false,
  volume = 1,
  playbackRate = 1,
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
  Object.defineProperty(video, 'playbackRate', {
    configurable: true,
    writable: true,
    value: playbackRate
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

    const controller = new LiveCaptionRuntimeController({
      store,
      documentRef: document,
      windowRef: window,
      browserApi: createRuntimeBrowserApi(),
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

    const controller = new LiveCaptionRuntimeController({
      store,
      documentRef: document,
      windowRef: window,
      browserApi: createRuntimeBrowserApi(),
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
    expect(statusResponse.status).toBe(LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL);
    expect(controller.lastRuntimeResponse.status).toBe(LIVE_CAPTION_RUNTIME_SHELL_STATES.IDLE);
  });

  it('detects the active video and replaces the active session when the winner changes', async () => {
    const store = useLiveCaptionStore();

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
      browserApi: createRuntimeBrowserApi(),
      platformSupport: createSupportedPlatformSupport()
    });

    const sendRequestSpy = vi.spyOn(controller, '_sendRuntimeRequest').mockImplementation(async (action, data) => {
      return createRuntimeResponse(action, data);
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

    expect(sendRequestSpy).toHaveBeenCalledWith(LIVE_CAPTION_ACTIONS.RUNTIME_START, expect.any(Object));
    sendRequestSpy.mockClear();

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

    expect(sendRequestSpy).toHaveBeenCalledWith(LIVE_CAPTION_ACTIONS.VIDEO_CHANGED, expect.objectContaining({
      tabId: 11,
      videoFingerprint: secondFingerprint
    }));
  });

  it('pauses, resumes, and destroys cleanup-safe runtime state', async () => {
    const store = useLiveCaptionStore();

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

  it('handles LIVE_CAPTION_TRANSLATE_RESULT messages reactively and updates store captions', async () => {
    const store = useLiveCaptionStore();

    let messageListener;
    const browserApi = {
      runtime: {
        sendMessage: vi.fn(),
        onMessage: {
          addListener: vi.fn((listener) => {
            messageListener = listener;
          }),
          removeListener: vi.fn()
        }
      }
    };

    const controller = new LiveCaptionRuntimeController({
      store,
      documentRef: document,
      windowRef: window,
      browserApi,
      platformSupport: createSupportedPlatformSupport()
    });

    await controller.start({ tabId: 11 });

    const video = createVideo({ src: 'http://example.com/stream.mp4' });
    document.body.appendChild(video);
    await controller.syncActiveVideo('test');

    const activeVideoSession = controller.pageSession.activeVideoSession;
    expect(activeVideoSession).not.toBeNull();
    const sessionId = controller.pageSession.sessionId;
    const videoFingerprint = activeVideoSession.videoFingerprint;

    const segment = {
      sessionId,
      videoFingerprint,
      segmentStartMs: 1000,
      segmentEndMs: 3000,
      originalText: 'Hello',
      translatedText: 'سلام',
      isFinal: true
    };

    messageListener({
      action: 'LIVE_CAPTION_TRANSLATE_RESULT',
      payload: {
        sessionId,
        videoFingerprint,
        segment
      }
    });

    expect(activeVideoSession.translatedCaptionSegments).toHaveLength(1);
    expect(activeVideoSession.translatedCaptionSegments[0]).toMatchObject({
      originalText: 'Hello',
      translatedText: 'سلام'
    });
    expect(store.captionLines).toHaveLength(1);
    expect(store.captionLines[0]).toMatchObject({
      originalText: 'Hello',
      translatedText: 'سلام'
    });
  });

  it('upserts canonical translated results without duplicating visible captions', async () => {
    const store = useLiveCaptionStore();
    const { browserApi, getMessageListener } = createRuntimeBrowserApiWithMessageListener();

    const controller = new LiveCaptionRuntimeController({
      store,
      documentRef: document,
      windowRef: window,
      browserApi,
      platformSupport: createSupportedPlatformSupport()
    });

    await controller.start({ tabId: 11 });

    const video = createVideo({ src: 'http://example.com/canonical.mp4' });
    document.body.appendChild(video);
    await controller.syncActiveVideo('test');

    const messageListener = getMessageListener();
    const activeVideoSession = controller.pageSession.activeVideoSession;
    const sessionId = controller.pageSession.sessionId;
    const videoFingerprint = activeVideoSession.videoFingerprint;

    const revisionOne = createCanonicalTranslatedSegment({
      sessionId,
      tabId: 11,
      videoFingerprint,
      segmentId: 'canonical-1',
      revision: 1,
      translatedText: 'سلام 1'
    });

    messageListener({
      action: 'LIVE_CAPTION_TRANSLATE_RESULT',
      payload: {
        sessionId,
        videoFingerprint,
        segment: revisionOne
      }
    });

    expect(activeVideoSession.translatedCaptionSegments).toHaveLength(1);
    expect(activeVideoSession.getTranslatedCaptionSegmentByIdentity(revisionOne)).toMatchObject({
      revision: 1,
      translatedText: 'سلام 1'
    });
    expect(store.captionLines).toHaveLength(1);
    expect(store.captionLines[0]).toMatchObject({
      segmentId: 'canonical-1',
      translatedText: 'سلام 1'
    });

    const revisionTwo = createCanonicalTranslatedSegment({
      sessionId,
      tabId: 11,
      videoFingerprint,
      segmentId: 'canonical-1',
      revision: 2,
      translatedText: 'سلام 2'
    });

    messageListener({
      action: 'LIVE_CAPTION_TRANSLATE_RESULT',
      payload: {
        sessionId,
        videoFingerprint,
        segment: revisionTwo
      }
    });

    expect(activeVideoSession.translatedCaptionSegments).toHaveLength(1);
    expect(activeVideoSession.getTranslatedCaptionSegmentByIdentity(revisionTwo)).toMatchObject({
      revision: 2,
      translatedText: 'سلام 2'
    });
    expect(store.captionLines).toHaveLength(1);
    expect(store.captionLines[0]).toMatchObject({
      segmentId: 'canonical-1',
      translatedText: 'سلام 2'
    });

    messageListener({
      action: 'LIVE_CAPTION_TRANSLATE_RESULT',
      payload: {
        sessionId,
        videoFingerprint,
        segment: revisionTwo
      }
    });

    expect(activeVideoSession.translatedCaptionSegments).toHaveLength(1);
    expect(store.captionLines).toHaveLength(1);
    expect(store.captionLines[0]).toMatchObject({
      segmentId: 'canonical-1',
      translatedText: 'سلام 2'
    });
  });

  it('keeps non-canonical translated results append-only', async () => {
    const store = useLiveCaptionStore();
    const { browserApi, getMessageListener } = createRuntimeBrowserApiWithMessageListener();

    const controller = new LiveCaptionRuntimeController({
      store,
      documentRef: document,
      windowRef: window,
      browserApi,
      platformSupport: createSupportedPlatformSupport()
    });

    await controller.start({ tabId: 11 });

    const video = createVideo({ src: 'http://example.com/non-canonical.mp4' });
    document.body.appendChild(video);
    await controller.syncActiveVideo('test');

    const messageListener = getMessageListener();
    const activeVideoSession = controller.pageSession.activeVideoSession;
    const sessionId = controller.pageSession.sessionId;
    const videoFingerprint = activeVideoSession.videoFingerprint;

    const firstSegment = {
      segmentStartMs: 1000,
      segmentEndMs: 2000,
      originalText: 'First',
      translatedText: 'اول'
    };

    const secondSegment = {
      segmentStartMs: 2000,
      segmentEndMs: 3000,
      originalText: 'Second',
      translatedText: 'دوم'
    };

    messageListener({
      action: 'LIVE_CAPTION_TRANSLATE_RESULT',
      payload: {
        sessionId,
        videoFingerprint,
        segment: firstSegment
      }
    });

    messageListener({
      action: 'LIVE_CAPTION_TRANSLATE_RESULT',
      payload: {
        sessionId,
        videoFingerprint,
        segment: secondSegment
      }
    });

    expect(activeVideoSession.translatedCaptionSegments).toHaveLength(2);
    expect(store.captionLines).toHaveLength(2);
    expect(store.captionLines[0].translatedText).toBe('اول');
    expect(store.captionLines[1].translatedText).toBe('دوم');
  });

  it('updates canPause and canResume reactively in controlsState based on runtime status', async () => {
    const store = useLiveCaptionStore();

    const controller = new LiveCaptionRuntimeController({
      store,
      documentRef: document,
      windowRef: window,
      browserApi: createRuntimeBrowserApi(),
      platformSupport: createSupportedPlatformSupport()
    });

    expect(store.controlsState.canPause).toBe(false);
    expect(store.controlsState.canResume).toBe(false);

    await controller.start({ tabId: 11 });

    expect(store.controlsState.canPause).toBe(true);
    expect(store.controlsState.canResume).toBe(false);

    await controller.pause();

    expect(store.controlsState.canPause).toBe(false);
    expect(store.controlsState.canResume).toBe(true);

    await controller.resume();

    expect(store.controlsState.canPause).toBe(true);
    expect(store.controlsState.canResume).toBe(false);

    await controller.stop();

    expect(store.controlsState.canPause).toBe(false);
    expect(store.controlsState.canResume).toBe(false);
  });

  it('hydrates store captions and local video session from background response', async () => {
    const store = useLiveCaptionStore();
    const browserApi = createRuntimeBrowserApi();

    const controller = new LiveCaptionRuntimeController({
      store,
      documentRef: document,
      windowRef: window,
      browserApi,
      platformSupport: createSupportedPlatformSupport()
    });

    const video = createVideo({ src: 'http://example.com/cached.mp4' });
    document.body.appendChild(video);

    await controller.start({ tabId: 11 });

    expect(store.captionLines).toHaveLength(1);
    expect(store.captionLines[0].translatedText).toBe('سلام');
    expect(controller.pageSession.activeVideoSession.translatedCaptionSegments).toHaveLength(1);
    expect(controller.pageSession.activeVideoSession.translatedCaptionSegments[0].translatedText).toBe('سلام');
    expect(controller.pageSession.activeVideoSession.transcriptSegments).toHaveLength(1);
    expect(controller.pageSession.activeVideoSession.transcriptSegments[0].originalText).toBe('Hello');
  });

  it('hydrates canonical duplicates once and keeps the latest revision', async () => {
    const store = useLiveCaptionStore();
    const canonicalSegmentV1 = createCanonicalTranslatedSegment({
      sessionId: 'session-1',
      tabId: 11,
      videoFingerprint: 'http://example.com/canonical-hydration.mp4',
      segmentId: 'canonical-hydration-1',
      revision: 1,
      translatedText: 'Old canonical'
    });
    const canonicalSegmentV2 = createCanonicalTranslatedSegment({
      sessionId: 'session-1',
      tabId: 11,
      videoFingerprint: 'http://example.com/canonical-hydration.mp4',
      segmentId: 'canonical-hydration-1',
      revision: 2,
      translatedText: 'Latest canonical'
    });

    const sendMessage = vi.fn(async (request) => ({
      success: true,
      ok: true,
      action: request.action,
      status: LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL,
      runtimeState: 'running',
      sessionId: request.data?.sessionId ?? null,
      tabId: request.data?.tabId ?? null,
      videoFingerprint: request.data?.videoFingerprint ?? null,
      sessionSnapshot: {
        sessionId: request.data?.sessionId ?? null,
        tabId: request.data?.tabId ?? null,
        activeVideoFingerprint: request.data?.videoFingerprint ?? null,
        activeVideoSession: {
          videoFingerprint: request.data?.videoFingerprint ?? null,
          transcriptSegments: [
            { ...canonicalSegmentV1, originalText: 'Canonical original' },
            { ...canonicalSegmentV2, originalText: 'Canonical original' }
          ],
          translatedCaptionSegments: [
            canonicalSegmentV1,
            canonicalSegmentV2
          ]
        }
      }
    }));

    const browserApi = { runtime: { sendMessage } };

    const controller = new LiveCaptionRuntimeController({
      store,
      documentRef: document,
      windowRef: window,
      browserApi,
      platformSupport: createSupportedPlatformSupport()
    });

    const video = createVideo({ src: 'http://example.com/canonical-hydration.mp4' });
    document.body.appendChild(video);

    await controller.start({ tabId: 11 });

    const activeVideoSession = controller.pageSession.activeVideoSession;
    expect(activeVideoSession.translatedCaptionSegments).toHaveLength(1);
    expect(activeVideoSession.transcriptSegments).toHaveLength(1);
    expect(activeVideoSession.getTranslatedCaptionSegmentByIdentity(canonicalSegmentV1)).toMatchObject({
      revision: 2,
      translatedText: 'Latest canonical'
    });
    expect(activeVideoSession.getTranscriptSegmentByIdentity(canonicalSegmentV1)).toMatchObject({
      revision: 2
    });
    expect(store.captionLines).toHaveLength(1);
    expect(store.captionLines[0]).toMatchObject({
      segmentId: 'canonical-hydration-1',
      translatedText: 'Latest canonical'
    });
  });

  it('hydrates store captions from transcripts only if translations are missing', async () => {
    const store = useLiveCaptionStore();
    
    const sendMessage = vi.fn(async (request) => ({
      success: true,
      ok: true,
      action: request.action,
      status: LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL,
      runtimeState: 'running',
      sessionId: request.data?.sessionId ?? null,
      tabId: request.data?.tabId ?? null,
      videoFingerprint: request.data?.videoFingerprint ?? null,
      sessionSnapshot: {
        sessionId: request.data?.sessionId ?? null,
        tabId: request.data?.tabId ?? null,
        activeVideoFingerprint: request.data?.videoFingerprint ?? null,
        activeVideoSession: {
          videoFingerprint: request.data?.videoFingerprint ?? null,
          transcriptSegments: [
            { segmentId: 'transcript-only-1', originalText: 'Only Transcript', segmentStartMs: 0, segmentEndMs: 1000 }
          ],
          translatedCaptionSegments: []
        }
      }
    }));

    const browserApi = { runtime: { sendMessage } };

    const controller = new LiveCaptionRuntimeController({
      store,
      documentRef: document,
      windowRef: window,
      browserApi,
      platformSupport: createSupportedPlatformSupport()
    });

    const video = createVideo({ src: 'http://example.com/transcripts-only.mp4' });
    document.body.appendChild(video);

    await controller.start({ tabId: 11 });

    expect(store.captionLines).toHaveLength(1);
    expect(store.captionLines[0].originalText).toBe('Only Transcript');
    expect(controller.pageSession.activeVideoSession.transcriptSegments).toHaveLength(1);
    expect(controller.pageSession.activeVideoSession.translatedCaptionSegments).toHaveLength(0);
  });

  it('merges translated and transcript segments safely during hydration', async () => {
    const store = useLiveCaptionStore();
    
    const sendMessage = vi.fn(async (request) => ({
      success: true,
      ok: true,
      action: request.action,
      status: LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL,
      runtimeState: 'running',
      sessionId: request.data?.sessionId ?? null,
      tabId: request.data?.tabId ?? null,
      videoFingerprint: request.data?.videoFingerprint ?? null,
      sessionSnapshot: {
        sessionId: request.data?.sessionId ?? null,
        tabId: request.data?.tabId ?? null,
        activeVideoFingerprint: request.data?.videoFingerprint ?? null,
        activeVideoSession: {
          videoFingerprint: request.data?.videoFingerprint ?? null,
          transcriptSegments: [
            { segmentId: 't1', originalText: 'Translated text original', segmentStartMs: 0, segmentEndMs: 1000 },
            { segmentId: 't2', originalText: 'Untranslated transcript', segmentStartMs: 1000, segmentEndMs: 2000 }
          ],
          translatedCaptionSegments: [
            { segmentId: 'c1', translatedText: 'Translated', originalText: 'Translated text original', segmentStartMs: 0, segmentEndMs: 1000 }
          ]
        }
      }
    }));

    const browserApi = { runtime: { sendMessage } };

    const controller = new LiveCaptionRuntimeController({
      store,
      documentRef: document,
      windowRef: window,
      browserApi,
      platformSupport: createSupportedPlatformSupport()
    });

    const video = createVideo({ src: 'http://example.com/merged.mp4' });
    document.body.appendChild(video);

    await controller.start({ tabId: 11 });

    expect(store.captionLines).toHaveLength(2);
    expect(store.captionLines[0].translatedText).toBe('Translated');
    expect(store.captionLines[0].originalText).toBe('Translated text original');
    expect(store.captionLines[1].translatedText).toBeUndefined();
    expect(store.captionLines[1].originalText).toBe('Untranslated transcript');
  });

  describe('playback synchronization', () => {
    let store;
    let browserApi;
    let controller;
    let activeVideo;
    let nonActiveVideo;

    beforeEach(async () => {
      store = useLiveCaptionStore();
      browserApi = createRuntimeBrowserApi();
      
      controller = new LiveCaptionRuntimeController({
        store,
        documentRef: document,
        windowRef: window,
        browserApi,
        platformSupport: createSupportedPlatformSupport()
      });

      activeVideo = createVideo({ src: 'http://example.com/active.mp4', paused: false });
      nonActiveVideo = createVideo({ src: 'http://example.com/non-active.mp4', paused: false });
      
      document.body.appendChild(activeVideo);
      document.body.appendChild(nonActiveVideo);

      // Rank candidates so activeVideo is ranked 1st
      Object.defineProperty(activeVideo, 'paused', { value: false, configurable: true });
      Object.defineProperty(nonActiveVideo, 'paused', { value: true, configurable: true });

      await controller.start({ tabId: 11 });
      
      // Spy on pause and resume
      vi.spyOn(controller, 'pause');
      vi.spyOn(controller, 'resume');
    });

    afterEach(() => {
      activeVideo.remove();
      nonActiveVideo.remove();
    });

    it('pauses runtime when active video pauses', async () => {
      expect(controller.runtimeStatus).toBe(LIVE_CAPTION_RUNTIME_STATES.RUNNING);
      
      // Simulate pause event on active video
      const pauseEvent = new Event('pause', { bubbles: true });
      Object.defineProperty(pauseEvent, 'target', { value: activeVideo, configurable: true });
      document.dispatchEvent(pauseEvent);
      
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(controller.pause).toHaveBeenCalledWith('video_pause');
      expect(controller.runtimeStatus).toBe(LIVE_CAPTION_RUNTIME_STATES.PAUSED);
    });

    it('pauses runtime when active video ends', async () => {
      expect(controller.runtimeStatus).toBe(LIVE_CAPTION_RUNTIME_STATES.RUNNING);
      
      // Simulate ended event on active video
      const endedEvent = new Event('ended', { bubbles: true });
      Object.defineProperty(endedEvent, 'target', { value: activeVideo, configurable: true });
      document.dispatchEvent(endedEvent);
      
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(controller.pause).toHaveBeenCalledWith('video_ended');
      expect(controller.runtimeStatus).toBe(LIVE_CAPTION_RUNTIME_STATES.PAUSED);
    });

    it('resumes runtime when active video plays/resumes only if paused due to video_pause', async () => {
      // First pause due to video_pause
      const pauseEvent = new Event('pause', { bubbles: true });
      Object.defineProperty(pauseEvent, 'target', { value: activeVideo, configurable: true });
      document.dispatchEvent(pauseEvent);
      
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(controller.runtimeStatus).toBe(LIVE_CAPTION_RUNTIME_STATES.PAUSED);
      expect(controller.lastPauseReason).toBe('video_pause');
      
      // Simulate play event on active video
      const playEvent = new Event('play', { bubbles: true });
      Object.defineProperty(playEvent, 'target', { value: activeVideo, configurable: true });
      document.dispatchEvent(playEvent);
      
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(controller.resume).toHaveBeenCalled();
      expect(controller.runtimeStatus).toBe(LIVE_CAPTION_RUNTIME_STATES.RUNNING);
    });

    it('does not resume on active video play if manually paused', async () => {
      // Manually pause
      await controller.pause('manual_pause');
      expect(controller.runtimeStatus).toBe(LIVE_CAPTION_RUNTIME_STATES.PAUSED);
      expect(controller.lastPauseReason).toBe('manual_pause');
      
      // Simulate play event on active video
      const playEvent = new Event('play', { bubbles: true });
      Object.defineProperty(playEvent, 'target', { value: activeVideo, configurable: true });
      document.dispatchEvent(playEvent);
      
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(controller.resume).not.toHaveBeenCalled();
      expect(controller.runtimeStatus).toBe(LIVE_CAPTION_RUNTIME_STATES.PAUSED);
    });

    it('does not resume on active video play if paused due to video_ended', async () => {
      // Simulate ended event on active video
      const endedEvent = new Event('ended', { bubbles: true });
      Object.defineProperty(endedEvent, 'target', { value: activeVideo, configurable: true });
      document.dispatchEvent(endedEvent);
      
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(controller.runtimeStatus).toBe(LIVE_CAPTION_RUNTIME_STATES.PAUSED);
      expect(controller.lastPauseReason).toBe('video_ended');
      
      // Simulate play event on active video
      const playEvent = new Event('play', { bubbles: true });
      Object.defineProperty(playEvent, 'target', { value: activeVideo, configurable: true });
      document.dispatchEvent(playEvent);
      
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(controller.resume).not.toHaveBeenCalled();
      expect(controller.runtimeStatus).toBe(LIVE_CAPTION_RUNTIME_STATES.PAUSED);
    });

    it('resume button/method still resumes when manually paused', async () => {
      await controller.pause('manual_pause');
      expect(controller.runtimeStatus).toBe(LIVE_CAPTION_RUNTIME_STATES.PAUSED);
      
      await controller.resume();
      expect(controller.runtimeStatus).toBe(LIVE_CAPTION_RUNTIME_STATES.RUNNING);
      expect(controller.lastPauseReason).toBeNull();
    });

    it('ignores playback events from non-active videos', async () => {
      expect(controller.runtimeStatus).toBe(LIVE_CAPTION_RUNTIME_STATES.RUNNING);
      
      // Simulate pause event on non-active video
      const pauseEvent = new Event('pause', { bubbles: true });
      Object.defineProperty(pauseEvent, 'target', { value: nonActiveVideo, configurable: true });
      document.dispatchEvent(pauseEvent);
      
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(controller.pause).not.toHaveBeenCalled();
      expect(controller.runtimeStatus).toBe(LIVE_CAPTION_RUNTIME_STATES.RUNNING);
    });

    it('does not duplicate resume if already running', async () => {
      expect(controller.runtimeStatus).toBe(LIVE_CAPTION_RUNTIME_STATES.RUNNING);
      
      const playEvent = new Event('play', { bubbles: true });
      Object.defineProperty(playEvent, 'target', { value: activeVideo, configurable: true });
      document.dispatchEvent(playEvent);
      
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(controller.resume).not.toHaveBeenCalled();
    });

    it('triggers handoff and resumes when a different video plays while paused due to video_pause', async () => {
      const pauseEvent = new Event('pause', { bubbles: true });
      Object.defineProperty(pauseEvent, 'target', { value: activeVideo, configurable: true });
      document.dispatchEvent(pauseEvent);
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(controller.runtimeStatus).toBe(LIVE_CAPTION_RUNTIME_STATES.PAUSED);

      Object.defineProperty(activeVideo, 'paused', { value: true, configurable: true });
      Object.defineProperty(nonActiveVideo, 'paused', { value: false, configurable: true });

      await controller.syncActiveVideo('play');

      expect(controller.currentVideoElement).toBe(nonActiveVideo);
      expect(controller.resume).toHaveBeenCalled();
      expect(controller.runtimeStatus).toBe(LIVE_CAPTION_RUNTIME_STATES.RUNNING);
    });

    it('triggers handoff but remains paused when a different video plays while manually paused', async () => {
      await controller.pause('manual_pause');
      expect(controller.runtimeStatus).toBe(LIVE_CAPTION_RUNTIME_STATES.PAUSED);

      controller.resume.mockClear();

      Object.defineProperty(activeVideo, 'paused', { value: true, configurable: true });
      Object.defineProperty(nonActiveVideo, 'paused', { value: false, configurable: true });

      await controller.syncActiveVideo('play');

      expect(controller.currentVideoElement).toBe(nonActiveVideo);
      expect(controller.resume).not.toHaveBeenCalled();
      expect(controller.runtimeStatus).toBe(LIVE_CAPTION_RUNTIME_STATES.PAUSED);
    });
  });

  describe('active video handoff and VIDEO_CHANGED propagation', () => {
    it('VIDEO_CHANGED success clears captions if new session has no captions', async () => {
      const store = useLiveCaptionStore();
      store.setCaptions([{ segmentId: 'old-1', translatedText: 'Old text' }]);
      
      const firstVideo = createVideo({ src: 'https://example.com/first.mp4', paused: false });
      document.body.append(firstVideo);

      const controller = new LiveCaptionRuntimeController({
        store,
        documentRef: document,
        windowRef: window,
        browserApi: createRuntimeBrowserApi(),
        platformSupport: createSupportedPlatformSupport()
      });

      vi.spyOn(controller, '_sendRuntimeRequest').mockImplementation(async (action, data) => {
        return createRuntimeResponse(action, data, {
          sessionSnapshot: {
            activeVideoFingerprint: 'new-video',
            activeVideoSession: {
              translatedCaptionSegments: [],
              transcriptSegments: []
            }
          }
        });
      });

      await controller.start({ tabId: 11 });
      
      const newVideo = createVideo({ src: 'https://example.com/new.mp4', paused: false });
      document.body.append(newVideo);
      
      // Make first video paused so newVideo is the ranked candidate
      Object.defineProperty(firstVideo, 'paused', { value: true, configurable: true });
      await controller.syncActiveVideo('video-change');
      
      expect(store.captionLines).toEqual([]);
    });

    it('VIDEO_CHANGED failure does not clear captions and sets store error', async () => {
      const store = useLiveCaptionStore();
      const initialCaptions = [{ segmentId: 'old-1', translatedText: 'Old text' }];
      store.setCaptions(initialCaptions);
      
      const firstVideo = createVideo({ src: 'https://example.com/first.mp4', paused: false });
      document.body.append(firstVideo);

      const controller = new LiveCaptionRuntimeController({
        store,
        documentRef: document,
        windowRef: window,
        browserApi: createRuntimeBrowserApi(),
        platformSupport: createSupportedPlatformSupport()
      });

      vi.spyOn(controller, '_sendRuntimeRequest').mockImplementation(async (action, data) => {
        if (action === LIVE_CAPTION_ACTIONS.VIDEO_CHANGED) {
          return {
            success: false,
            ok: false,
            action,
            status: 'FAIL_CLOSED',
            runtimeState: 'error',
            sessionId: data.sessionId ?? null,
            tabId: data.tabId ?? null,
            videoFingerprint: data.videoFingerprint ?? null,
            message: 'VIDEO_CHANGED failed',
            error: new Error('VIDEO_CHANGED failed')
          };
        }

        return createRuntimeResponse(action, data);
      });

      await controller.start({ tabId: 11 });
      expect(controller.runtimeStartCompleted).toBe(true);
      
      const newVideo = createVideo({ src: 'https://example.com/new.mp4', paused: false });
      document.body.append(newVideo);
      
      Object.defineProperty(firstVideo, 'paused', { value: true, configurable: true });
      await controller.syncActiveVideo('video-change');
      
      expect(controller._sendRuntimeRequest).toHaveBeenCalledWith(
        LIVE_CAPTION_ACTIONS.VIDEO_CHANGED,
        expect.objectContaining({
          tabId: 11,
          sessionId: expect.any(String),
          videoFingerprint: expect.any(String)
        })
      );
      expect(store.captionLines).toEqual(initialCaptions);
      expect(store.lastError).not.toBeNull();
    });

    it('no_op does not send VIDEO_CHANGED', async () => {
      const store = useLiveCaptionStore();
      const controller = new LiveCaptionRuntimeController({
        store,
        documentRef: document,
        windowRef: window,
        browserApi: createRuntimeBrowserApi(),
        platformSupport: createSupportedPlatformSupport()
      });

      await controller.start({ tabId: 11 });
      const sendRequestSpy = vi.spyOn(controller, '_sendRuntimeRequest');

      await controller.syncActiveVideo('scan');

      expect(sendRequestSpy).not.toHaveBeenCalledWith(LIVE_CAPTION_ACTIONS.VIDEO_CHANGED, expect.any(Object));
    });

    it('initial start/create_new_video_session does not send VIDEO_CHANGED', async () => {
      const store = useLiveCaptionStore();
      const firstVideo = createVideo({ src: 'https://example.com/first.mp4', paused: false });
      document.body.append(firstVideo);

      const controller = new LiveCaptionRuntimeController({
        store,
        documentRef: document,
        windowRef: window,
        browserApi: createRuntimeBrowserApi(),
        platformSupport: createSupportedPlatformSupport()
      });

      const sendRequestSpy = vi.spyOn(controller, '_sendRuntimeRequest').mockImplementation(async (action, data) => {
        return createRuntimeResponse(action, data);
      });

      await controller.start({ tabId: 11 });

      // RUNTIME_START should be called, but VIDEO_CHANGED should NOT be called during start sequence
      expect(sendRequestSpy).toHaveBeenCalledWith(LIVE_CAPTION_ACTIONS.RUNTIME_START, expect.any(Object));
      expect(sendRequestSpy).not.toHaveBeenCalledWith(LIVE_CAPTION_ACTIONS.VIDEO_CHANGED, expect.any(Object));
    });

    it('VIDEO_CHANGED is not sent before background session exists (while status is STARTING)', async () => {
      const store = useLiveCaptionStore();
      const firstVideo = createVideo({ src: 'https://example.com/first.mp4', paused: false });
      document.body.append(firstVideo);

      const controller = new LiveCaptionRuntimeController({
        store,
        documentRef: document,
        windowRef: window,
        browserApi: createRuntimeBrowserApi(),
        platformSupport: createSupportedPlatformSupport()
      });

      const sendRequestSpy = vi.spyOn(controller, '_sendRuntimeRequest').mockImplementation(async (action, data) => {
        return createRuntimeResponse(action, data);
      });

      // We simulate STARTING state by manually setting runtimeStatus, without starting properly
      controller.started = true;
      controller.runtimeStatus = LIVE_CAPTION_RUNTIME_STATES.STARTING;
      controller.runtimeStartCompleted = false;

      const newVideo = createVideo({ src: 'https://example.com/new.mp4', paused: false });
      document.body.append(newVideo);
      Object.defineProperty(firstVideo, 'paused', { value: true, configurable: true });

      await controller.syncActiveVideo('video-change');

      // Should not send request since runtimeStartCompleted is false
      expect(sendRequestSpy).not.toHaveBeenCalledWith(LIVE_CAPTION_ACTIONS.VIDEO_CHANGED, expect.any(Object));
    });

    it('failed RUNTIME_START leaves runtimeStartCompleted false and prevents VIDEO_CHANGED handoff', async () => {
      const store = useLiveCaptionStore();
      const firstVideo = createVideo({ src: 'https://example.com/first.mp4', paused: false });
      document.body.append(firstVideo);

      const controller = new LiveCaptionRuntimeController({
        store,
        documentRef: document,
        windowRef: window,
        browserApi: createRuntimeBrowserApi(),
        platformSupport: createSupportedPlatformSupport()
      });

      const sendRequestSpy = vi.spyOn(controller, '_sendRuntimeRequest').mockImplementation(async (action, data) => {
        if (action === LIVE_CAPTION_ACTIONS.RUNTIME_START) {
          return {
            success: false,
            ok: false,
            action,
            status: 'FAIL_CLOSED',
            runtimeState: 'error',
            sessionId: data.sessionId ?? null,
            tabId: data.tabId ?? null,
            videoFingerprint: data.videoFingerprint ?? null,
            message: 'background start failed',
            error: new Error('background start failed')
          };
        }

        return createRuntimeResponse(action, data);
      });

      await controller.start({ tabId: 11 });

      expect(controller.runtimeStartCompleted).toBe(false);

      const newVideo = createVideo({ src: 'https://example.com/new.mp4', paused: false });
      document.body.append(newVideo);
      Object.defineProperty(firstVideo, 'paused', { value: true, configurable: true });

      await controller.syncActiveVideo('video-change');

      expect(sendRequestSpy).not.toHaveBeenCalledWith(LIVE_CAPTION_ACTIONS.VIDEO_CHANGED, expect.any(Object));
    });

    it('paused handoff after start still sends VIDEO_CHANGED', async () => {
      const store = useLiveCaptionStore();
      const firstVideo = createVideo({ src: 'https://example.com/first.mp4', paused: false });
      document.body.append(firstVideo);

      const controller = new LiveCaptionRuntimeController({
        store,
        documentRef: document,
        windowRef: window,
        browserApi: createRuntimeBrowserApi(),
        platformSupport: createSupportedPlatformSupport()
      });

      const sendRequestSpy = vi.spyOn(controller, '_sendRuntimeRequest').mockImplementation(async (action, data) => {
        return createRuntimeResponse(action, data);
      });

      await controller.start({ tabId: 11 });
      await controller.pause('video_pause');

      expect(controller.runtimeStatus).toBe(LIVE_CAPTION_RUNTIME_STATES.PAUSED);
      sendRequestSpy.mockClear();

      const newVideo = createVideo({ src: 'https://example.com/new.mp4', paused: false });
      document.body.append(newVideo);
      Object.defineProperty(firstVideo, 'paused', { value: true, configurable: true });

      await controller.syncActiveVideo('video-change');

      // When paused, handoff to a playing video should still send VIDEO_CHANGED
      expect(sendRequestSpy).toHaveBeenCalledWith(LIVE_CAPTION_ACTIONS.VIDEO_CHANGED, expect.any(Object));
    });
  });

  describe('Phase 3: mediaTimelineMappingStatus validity transitions', () => {
    it('sets mediaTimelineMappingStatus to valid if mediaAnchorMs is present on start', async () => {
      const store = useLiveCaptionStore();
      const video = createVideo({ src: 'https://example.com/a.mp4', playbackRate: 1.5 });
      video.currentTime = 5.5;
      document.body.append(video);

      const controller = new LiveCaptionRuntimeController({
        store,
        documentRef: document,
        windowRef: window,
        browserApi: createRuntimeBrowserApi(),
        platformSupport: createSupportedPlatformSupport()
      });

      await controller.start({ tabId: 11 });
      expect(store.mediaTimelineMappingStatus).toBe('valid');
      expect(controller.pageSession.activeVideoSession.getTimelineAnchors()).toHaveLength(0);
    });

    it('sets mediaTimelineMappingStatus to invalid on seeked, seeking, ratechange, and pause events', async () => {
      const store = useLiveCaptionStore();
      const video = createVideo({ src: 'https://example.com/a.mp4' });
      document.body.append(video);

      const controller = new LiveCaptionRuntimeController({
        store,
        documentRef: document,
        windowRef: window,
        browserApi: createRuntimeBrowserApi(),
        platformSupport: createSupportedPlatformSupport()
      });

      await controller.start({ tabId: 11 });
      expect(store.mediaTimelineMappingStatus).toBe('valid');

      const eventsToTest = ['seeking', 'seeked', 'ratechange', 'pause'];

      for (const eventType of eventsToTest) {
        // Reset state to valid before firing the event
        store.setMediaTimelineMappingStatus('valid');
        expect(store.mediaTimelineMappingStatus).toBe('valid');

        // fire target event on the video
        const event = new Event(eventType, { bubbles: true });
        Object.defineProperty(event, 'target', { value: video, configurable: true });
        document.dispatchEvent(event);
        
        expect(store.mediaTimelineMappingStatus).toBe('invalid');
      }
    });
  });

  describe('timeline discontinuity forwarding', () => {
    function dispatchVideoEvent(video, documentRef, eventType) {
      const event = new Event(eventType, { bubbles: true });
      Object.defineProperty(event, 'target', { value: video, configurable: true });
      documentRef.dispatchEvent(event);
    }

    function createDeferred() {
      let resolve;
      let reject;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });

      return { promise, resolve, reject };
    }

    it.each([
      ['playing', 12.5, 1.25],
      ['seeked', 8.5, 1],
      ['ratechange', 4.75, 1.5]
    ])('forwards %s discontinuity metadata to background', async (eventType, currentTime, playbackRate) => {
      const store = useLiveCaptionStore();
      const video = createVideo({ src: 'https://example.com/a.mp4', playbackRate });
      video.currentTime = currentTime;
      document.body.append(video);

      const controller = new LiveCaptionRuntimeController({
        store,
        documentRef: document,
        windowRef: window,
        browserApi: createRuntimeBrowserApi(),
        platformSupport: createSupportedPlatformSupport()
      });

      const sendRequestSpy = vi.spyOn(controller, '_sendRuntimeRequest').mockImplementation(async (action, data) => {
        return createRuntimeResponse(action, data);
      });

      await controller.start({ tabId: 11 });
      sendRequestSpy.mockClear();

      dispatchVideoEvent(video, document, eventType);

      expect(sendRequestSpy).toHaveBeenCalledWith(
        LIVE_CAPTION_ACTIONS.VIDEO_CHANGED,
        expect.objectContaining({
          eventType,
          sessionId: controller.pageSession.sessionId,
          tabId: 11,
          videoFingerprint: controller.currentVideoFingerprint,
          mediaMs: currentTime * 1000,
          playbackRate,
          wallClockMs: expect.any(Number)
        })
      );
    });

    it.each(['pause', 'seeking', 'timeupdate'])('does not forward %s as a timeline discontinuity', async (eventType) => {
      const store = useLiveCaptionStore();
      const video = createVideo({ src: 'https://example.com/a.mp4' });
      document.body.append(video);

      const controller = new LiveCaptionRuntimeController({
        store,
        documentRef: document,
        windowRef: window,
        browserApi: createRuntimeBrowserApi(),
        platformSupport: createSupportedPlatformSupport()
      });

      const sendRequestSpy = vi.spyOn(controller, '_sendRuntimeRequest').mockImplementation(async (action, data) => {
        return createRuntimeResponse(action, data);
      });

      await controller.start({ tabId: 11 });
      sendRequestSpy.mockClear();

      dispatchVideoEvent(video, document, eventType);

      expect(sendRequestSpy).not.toHaveBeenCalledWith(
        LIVE_CAPTION_ACTIONS.VIDEO_CHANGED,
        expect.objectContaining({
          eventType
        })
      );
    });

    it('dedupes repeated playing requests while the first request is in flight', async () => {
      const store = useLiveCaptionStore();
      const video = createVideo({ src: 'https://example.com/a.mp4', playbackRate: 1.25 });
      video.currentTime = 12.5;
      document.body.append(video);

      const controller = new LiveCaptionRuntimeController({
        store,
        documentRef: document,
        windowRef: window,
        browserApi: createRuntimeBrowserApi(),
        platformSupport: createSupportedPlatformSupport()
      });

      const deferred = createDeferred();
      const sendRequestSpy = vi.spyOn(controller, '_sendRuntimeRequest').mockImplementation((action, data) => {
        if (action === LIVE_CAPTION_ACTIONS.VIDEO_CHANGED) {
          return deferred.promise;
        }

        return createRuntimeResponse(action, data);
      });

      await controller.start({ tabId: 11 });
      sendRequestSpy.mockClear();

      const first = controller._requestTimelineDiscontinuityAnchor('playing');
      const second = controller._requestTimelineDiscontinuityAnchor('playing');

      await expect(second).resolves.toBeNull();
      expect(sendRequestSpy).toHaveBeenCalledTimes(1);
      expect(controller.pendingTimelineDiscontinuityAnchorEvents.has('playing')).toBe(true);

      deferred.resolve(createRuntimeResponse(LIVE_CAPTION_ACTIONS.VIDEO_CHANGED, {
        eventType: 'playing',
        sessionId: controller.pageSession.sessionId,
        tabId: 11,
        videoFingerprint: controller.currentVideoFingerprint,
        mediaMs: 12500,
        playbackRate: 1.25,
        wallClockMs: Date.now()
      }));

      await first;
      expect(controller.pendingTimelineDiscontinuityAnchorEvents.has('playing')).toBe(false);

      sendRequestSpy.mockImplementation(async (action, data) => {
        return createRuntimeResponse(action, data);
      });
      sendRequestSpy.mockClear();
      await controller._requestTimelineDiscontinuityAnchor('playing');
      expect(sendRequestSpy).toHaveBeenCalledTimes(1);
    });

    it('clears pending playing requests after rejection', async () => {
      const store = useLiveCaptionStore();
      const video = createVideo({ src: 'https://example.com/a.mp4', playbackRate: 1.25 });
      video.currentTime = 12.5;
      document.body.append(video);

      const controller = new LiveCaptionRuntimeController({
        store,
        documentRef: document,
        windowRef: window,
        browserApi: createRuntimeBrowserApi(),
        platformSupport: createSupportedPlatformSupport()
      });

      const deferred = createDeferred();
      const sendRequestSpy = vi.spyOn(controller, '_sendRuntimeRequest').mockImplementation((action, data) => {
        if (action === LIVE_CAPTION_ACTIONS.VIDEO_CHANGED) {
          return deferred.promise;
        }

        return createRuntimeResponse(action, data);
      });

      await controller.start({ tabId: 11 });
      sendRequestSpy.mockClear();

      const first = controller._requestTimelineDiscontinuityAnchor('playing');
      deferred.reject(new Error('failed'));

      await expect(first).rejects.toThrow('failed');
      expect(controller.pendingTimelineDiscontinuityAnchorEvents.has('playing')).toBe(false);

      sendRequestSpy.mockImplementation(async (action, data) => {
        return createRuntimeResponse(action, data);
      });
      sendRequestSpy.mockClear();
      await controller._requestTimelineDiscontinuityAnchor('playing');
      expect(sendRequestSpy).toHaveBeenCalledTimes(1);
    });
  });
});
