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
    store.acceptConsent();

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
    expect(statusResponse.status).toBe(LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL);
    expect(controller.lastRuntimeResponse.status).toBe(LIVE_CAPTION_RUNTIME_SHELL_STATES.IDLE);
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

  it('handles LIVE_CAPTION_TRANSLATE_RESULT messages reactively and updates store captions', async () => {
    const store = useLiveCaptionStore();
    store.acceptConsent();

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

  it('updates canPause and canResume reactively in controlsState based on runtime status', async () => {
    const store = useLiveCaptionStore();
    store.acceptConsent();

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
    store.acceptConsent();
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

  it('hydrates store captions from transcripts only if translations are missing', async () => {
    const store = useLiveCaptionStore();
    store.acceptConsent();
    
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
    store.acceptConsent();
    
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
      store.acceptConsent();
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
  });
});
