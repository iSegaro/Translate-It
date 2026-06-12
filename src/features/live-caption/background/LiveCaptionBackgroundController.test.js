import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { LiveCaptionBackgroundController } from "./LiveCaptionBackgroundController.js";
import {
  LIVE_CAPTION_RUNTIME_ACTIONS,
  LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES,
  LIVE_CAPTION_RUNTIME_SHELL_STATES,
  createLiveCaptionRuntimeShellResponse,
  createLiveCaptionRuntimeStartRequest,
  createLiveCaptionRuntimeStopRequest,
  createLiveCaptionRuntimeStatusRequest,
  createLiveCaptionRuntimePauseRequest,
  createLiveCaptionRuntimeResumeRequest,
  createLiveCaptionRuntimeVideoChangedRequest,
} from "./liveCaptionRuntimeContracts.js";
import { LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES } from "./liveCaptionOffscreenContracts.js";
import { LIVE_CAPTION_RUNTIME_STATES } from "../constants/liveCaptionRuntimeStates.js";
import { LIVE_CAPTION_CLEANUP_RESULT_STATUSES } from "../core/LiveCaptionCleanupCoordinator.js";
import { VideoCaptionSession } from "../core/VideoCaptionSession.js";
import { getLiveCaptionSttProviderAsync } from "@/shared/config/config.js";

vi.mock("@/shared/logging/logger.js", () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock("@/shared/config/config.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getLiveCaptionSttProviderAsync: vi.fn().mockResolvedValue("openai_whisper"),
  };
});

describe("live-caption background controller", () => {
  let activeControllers = [];

  beforeEach(() => {
    activeControllers = [];
    getLiveCaptionSttProviderAsync.mockResolvedValue("openai_whisper");
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async (request) => {
          const shellByAction = {
            [LIVE_CAPTION_RUNTIME_ACTIONS.START]:
              LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL,
            [LIVE_CAPTION_RUNTIME_ACTIONS.STATUS]:
              LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL,
            [LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE]:
              LIVE_CAPTION_RUNTIME_SHELL_STATES.PAUSED_SHELL,
            [LIVE_CAPTION_RUNTIME_ACTIONS.RESUME]:
              LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL,
            [LIVE_CAPTION_RUNTIME_ACTIONS.STOP]:
              LIVE_CAPTION_RUNTIME_SHELL_STATES.IDLE,
          };

          return createLiveCaptionRuntimeShellResponse(request.action, {
            sessionId: request.data?.sessionId ?? null,
            tabId: request.data?.tabId ?? null,
            videoFingerprint: request.data?.videoFingerprint ?? null,
            requestId: request.messageId ?? null,
            status:
              shellByAction[request.action] ??
              LIVE_CAPTION_RUNTIME_SHELL_STATES.IDLE,
            runtimeState:
              request.action === LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE
                ? "paused"
                : request.action === LIVE_CAPTION_RUNTIME_ACTIONS.STOP
                  ? "idle"
                  : "running",
            message: "Live-caption offscreen shell response",
          });
        }),
      },
      tabCapture: {
        capture: vi.fn(),
        getMediaStreamId: vi.fn((options, callback) =>
          callback("mock-stream-id"),
        ),
      },
    };
  });

  afterEach(() => {
    activeControllers.forEach(c => c.destroy());
    vi.useRealTimers();
    vi.clearAllTimers();
  });

  function createController(options) {
    const c = new LiveCaptionBackgroundController(options);
    activeControllers.push(c);
    return c;
  }

  it("registers runtime handlers and routes shell requests without media work", async () => {
    const messageHandler = {
      registerHandler: vi.fn(),
    };
    const controller = createController();

    controller.registerHandlers(messageHandler);

    expect(messageHandler.registerHandler).toHaveBeenCalledTimes(10);
    expect(messageHandler.registerHandler).toHaveBeenCalledWith(
      LIVE_CAPTION_RUNTIME_ACTIONS.VIDEO_CHANGED,
      expect.any(Function),
    );
    expect(messageHandler.registerHandler).toHaveBeenCalledWith(
      LIVE_CAPTION_RUNTIME_ACTIONS.START,
      expect.any(Function),
    );
    expect(messageHandler.registerHandler).toHaveBeenCalledWith(
      LIVE_CAPTION_RUNTIME_ACTIONS.STOP,
      expect.any(Function),
    );
    expect(messageHandler.registerHandler).toHaveBeenCalledWith(
      LIVE_CAPTION_RUNTIME_ACTIONS.STATUS,
      expect.any(Function),
    );
    expect(messageHandler.registerHandler).toHaveBeenCalledWith(
      LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE,
      expect.any(Function),
    );
    expect(messageHandler.registerHandler).toHaveBeenCalledWith(
      LIVE_CAPTION_RUNTIME_ACTIONS.RESUME,
      expect.any(Function),
    );
    expect(messageHandler.registerHandler).toHaveBeenCalledWith(
      "live-caption/offscreen/finalized-chunk",
      expect.any(Function),
    );
    expect(messageHandler.registerHandler).toHaveBeenCalledWith(
      "live-caption/offscreen/capture-error",
      expect.any(Function),
    );

    const startResponse = await controller.handleRuntimeStart(
      createLiveCaptionRuntimeStartRequest({
        tabId: 7,
        sessionId: "session-1",
        videoFingerprint: "video-a",
      }),
      { tab: { id: 7 } },
    );
    const statusResponse = await controller.handleRuntimeStatus(
      createLiveCaptionRuntimeStatusRequest({
        tabId: 7,
        sessionId: "session-1",
        videoFingerprint: "video-a",
      }),
      { tab: { id: 7 } },
    );
    const pauseResponse = await controller.handleRuntimePause(
      createLiveCaptionRuntimePauseRequest({
        tabId: 7,
        sessionId: "session-1",
        videoFingerprint: "video-a",
      }),
      { tab: { id: 7 } },
    );
    const resumeResponse = await controller.handleRuntimeResume(
      createLiveCaptionRuntimeResumeRequest({
        tabId: 7,
        sessionId: "session-1",
        videoFingerprint: "video-a",
      }),
      { tab: { id: 7 } },
    );
    const stopResponse = await controller.handleRuntimeStop(
      createLiveCaptionRuntimeStopRequest({
        tabId: 7,
        sessionId: "session-1",
        videoFingerprint: "video-a",
      }),
      { tab: { id: 7 } },
    );

    expect(startResponse.success).toBe(true);
    expect(startResponse.status).toBe(
      LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL,
    );
    expect(startResponse.runtimeState).toBe("running");
    expect(statusResponse.status).toBe(
      LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL,
    );
    expect(statusResponse.runtimeState).toBe("running");
    expect(pauseResponse.status).toBe(
      LIVE_CAPTION_RUNTIME_SHELL_STATES.PAUSED_SHELL,
    );
    expect(pauseResponse.runtimeState).toBe("paused");
    expect(resumeResponse.status).toBe(
      LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL,
    );
    expect(resumeResponse.runtimeState).toBe("running");
    expect(stopResponse.status).toBe(LIVE_CAPTION_RUNTIME_SHELL_STATES.IDLE);
    expect(stopResponse.runtimeState).toBe("idle");
    expect(controller.captureCoordinator.runtimeState).toBe("idle");
    expect(controller.sessionManager.getSession(7)).toBe(null);
    expect(globalThis.chrome.tabCapture.capture).not.toHaveBeenCalled();
  });

  it("supports cache dependency injection", () => {
    const mockCache = { id: "mock-cache" };
    const controller = createController({ cache: mockCache });
    expect(controller.cache).toBe(mockCache);
    expect(controller.sttCoordinator.cache).toBe(mockCache);
    expect(controller.translationCoordinator.cache).toBe(mockCache);
  });

  it("hydrates session from cache on start", async () => {
    const controller = createController();
    const mockTranscript = { segmentId: "t1", originalText: "Hello", segmentStartMs: 0, segmentEndMs: 1000 };
    const mockTranslation = { segmentId: "c1", translatedText: "سلام", segmentStartMs: 0, segmentEndMs: 1000 };

    controller.cache.getTranscriptSegments = vi.fn().mockResolvedValue([mockTranscript]);
    controller.cache.getTranslatedCaptionSegments = vi.fn().mockResolvedValue([mockTranslation]);

    const response = await controller.handleRuntimeStart(
      createLiveCaptionRuntimeStartRequest({
        tabId: 7,
        sessionId: "session-1",
        videoFingerprint: "video-a",
      }),
      { tab: { id: 7, incognito: false } },
    );

    expect(response.success).toBe(true);
    expect(controller.cache.getTranscriptSegments).toHaveBeenCalledWith(expect.objectContaining({
      tabId: 7,
      videoFingerprint: "video-a",
      isIncognito: false
    }));

    const session = controller.sessionManager.getSession(7);
    expect(session.activeVideoSession.transcriptSegments).toHaveLength(1);
    expect(session.activeVideoSession.translatedCaptionSegments).toHaveLength(1);
    expect(session.activeVideoSession.transcriptSegments[0].originalText).toBe("Hello");
    expect(session.activeVideoSession.translatedCaptionSegments[0].translatedText).toBe("سلام");
    
    expect(response.sessionSnapshot.activeVideoSession.translatedCaptionSegments).toHaveLength(1);
  });

  it("applies a longer chunkTimeslice only for local_whisper runtime start", async () => {
    getLiveCaptionSttProviderAsync.mockResolvedValueOnce("local_whisper");

    const controller = createController();

    await controller.handleRuntimeStart(
      createLiveCaptionRuntimeStartRequest({
        tabId: 7,
        sessionId: "session-1",
        videoFingerprint: "video-a",
      }),
      { tab: { id: 7 } },
    );

    const startRequest = globalThis.chrome.runtime.sendMessage.mock.calls.find(([request]) => request.action === LIVE_CAPTION_RUNTIME_ACTIONS.START)?.[0];
    expect(startRequest).toBeTruthy();
    expect(startRequest.data.metadata).toMatchObject({
      chunkTimeslice: 10000
    });
  });

  it("keeps default runtime start metadata unchanged for openai_whisper", async () => {
    getLiveCaptionSttProviderAsync.mockResolvedValueOnce("openai_whisper");

    const controller = createController();

    await controller.handleRuntimeStart(
      createLiveCaptionRuntimeStartRequest({
        tabId: 7,
        sessionId: "session-1",
        videoFingerprint: "video-a",
      }),
      { tab: { id: 7 } },
    );

    const startRequest = globalThis.chrome.runtime.sendMessage.mock.calls.find(([request]) => request.action === LIVE_CAPTION_RUNTIME_ACTIONS.START)?.[0];
    expect(startRequest).toBeTruthy();
    expect(startRequest.data.metadata?.chunkTimeslice).toBeUndefined();
  });

  it("handles incognito tabs by skipping persistent cache reads/writes", async () => {
    const controller = createController();
    controller.cache.getTranscriptSegments = vi.fn().mockResolvedValue([]);
    controller.cache.getTranslatedCaptionSegments = vi.fn().mockResolvedValue([]);

    const response = await controller.handleRuntimeStart(
      createLiveCaptionRuntimeStartRequest({
        tabId: 8,
        sessionId: "session-incognito",
        videoFingerprint: "video-incognito",
      }),
      { tab: { id: 8, incognito: true } },
    );

    expect(response.success).toBe(true);
    expect(controller.cache.getTranscriptSegments).toHaveBeenCalledWith(expect.objectContaining({
      isIncognito: true
    }));

    const session = controller.sessionManager.getSession(8);
    expect(session.isIncognito).toBe(true);
  });

  it("reconciles orphaned session when receiving a finalized chunk", async () => {
    const controller = createController();
    controller.sttCoordinator = { handleFinalizedChunk: vi.fn() };
    controller.captureCoordinator = { recordSnapshot: vi.fn(), setRuntimeState: vi.fn() };
    controller.offscreenBridge.requestRuntimeStatus = vi.fn().mockResolvedValue({
      ok: true,
      sessionSnapshot: { sessionId: "orphaned-session", tabId: 99 }
    });
    controller.offscreenBridge.browserApi = {
      tabs: { get: vi.fn().mockResolvedValue({ id: 99, incognito: false }) }
    };
    
    // Simulate empty session manager (SW restarted)
    expect(controller.sessionManager.getSession(99)).toBe(null);

    const chunkMessage = {
      action: LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.FINALIZED_CHUNK,
      target: "background",
      sessionId: "orphaned-session",
      tabId: 99,
      videoFingerprint: "orphaned-video",
      chunkStartMs: 0,
      chunkEndMs: 1000,
      mimeType: "audio/webm",
      chunkPayload: new Blob([""], { type: "audio/webm" })
    };

    const response = await controller.handleFinalizedChunk(chunkMessage);
    
    expect(response.success).toBe(true);
    const recoveredSession = controller.sessionManager.getSession(99);
    expect(recoveredSession).not.toBe(null);
    expect(recoveredSession.sessionId).toBe("orphaned-session");
    expect(controller.sttCoordinator.handleFinalizedChunk).toHaveBeenCalled();
  });

  it("fails closed when orphaned chunk reconciliation fails", async () => {
    const controller = createController();
    controller.sttCoordinator = { handleFinalizedChunk: vi.fn() };
    controller.offscreenBridge.requestRuntimeStop = vi.fn().mockResolvedValue();
    controller.offscreenBridge.requestRuntimeStatus = vi.fn().mockResolvedValue({
      ok: false // Offscreen dead or reports error
    });
    controller.offscreenBridge.browserApi = {
      tabs: { get: vi.fn().mockResolvedValue({ id: 99, incognito: false }), sendMessage: vi.fn().mockResolvedValue() }
    };
    
    expect(controller.sessionManager.getSession(99)).toBe(null);

    const chunkMessage = {
      action: LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.FINALIZED_CHUNK,
      target: "background",
      sessionId: "orphaned-session",
      tabId: 99,
      videoFingerprint: "orphaned-video",
      chunkStartMs: 0,
      chunkEndMs: 1000,
      mimeType: "audio/webm",
      chunkPayload: new Blob([""], { type: "audio/webm" })
    };

    const response = await controller.handleFinalizedChunk(chunkMessage);
    
    expect(response.success).toBe(false);
    expect(controller.sessionManager.getSession(99)).toBe(null);
    expect(controller.offscreenBridge.requestRuntimeStop).toHaveBeenCalled();
    expect(controller.sttCoordinator.handleFinalizedChunk).not.toHaveBeenCalled();
    expect(controller.offscreenBridge.browserApi.tabs.sendMessage).toHaveBeenCalledWith(
      99, 
      expect.objectContaining({ action: LIVE_CAPTION_RUNTIME_ACTIONS.STOP })
    );
  });

  it("fails closed when orphaned chunk reconciliation fails due to mismatched fingerprint", async () => {
    const controller = createController();
    controller.sttCoordinator = { handleFinalizedChunk: vi.fn() };
    controller.offscreenBridge.requestRuntimeStop = vi.fn().mockResolvedValue();
    controller.offscreenBridge.requestRuntimeStatus = vi.fn().mockResolvedValue({
      ok: true,
      sessionSnapshot: { sessionId: "orphaned-session", tabId: 99, activeVideoFingerprint: "other-video" }
    });
    controller.offscreenBridge.browserApi = {
      tabs: { get: vi.fn().mockResolvedValue({ id: 99, incognito: false }), sendMessage: vi.fn().mockResolvedValue() }
    };
    
    const chunkMessage = {
      action: LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.FINALIZED_CHUNK,
      target: "background",
      sessionId: "orphaned-session",
      tabId: 99,
      videoFingerprint: "orphaned-video",
      chunkStartMs: 0,
      chunkEndMs: 1000,
      mimeType: "audio/webm",
      chunkPayload: new Blob([""], { type: "audio/webm" })
    };

    const response = await controller.handleFinalizedChunk(chunkMessage);
    
    expect(response.success).toBe(false);
    expect(controller.sessionManager.getSession(99)).toBe(null);
  });

  it("fails closed for invalid runtime payloads", async () => {
    const controller = createController();
    const response = await controller.handleRuntimeStart(
      { action: LIVE_CAPTION_RUNTIME_ACTIONS.START, data: {} },
      {},
    );

    expect(response.success).toBe(false);
    expect(response.status).toBe(
      LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.FAIL_CLOSED,
    );
    expect(response.error.code).toBeDefined();
  });

  it("propagates fail-closed cleanup metadata into the runtime stop response", async () => {
    const controller = createController();
    controller.sessionManager.cleanupByTabId = vi.fn(() => null);
    controller.sessionManager.getSessionCleanupMetadata = vi.fn(() => ({
      tabId: 7,
      sessionId: "session-1",
      reason: "stop",
      status: LIVE_CAPTION_CLEANUP_RESULT_STATUSES.FAIL_CLOSED,
      error: {
        code: "LIVE_CAPTION_SESSION_MANAGER_CLEANUP_FAILED",
        message: "cleanup failed",
      },
      snapshot: {
        sessionId: "session-1",
        tabId: 7,
      },
      updatedAt: Date.now(),
    }));

    const response = await controller.handleRuntimeStop(
      createLiveCaptionRuntimeStopRequest({
        tabId: 7,
        sessionId: "session-1",
        videoFingerprint: "video-a",
      }),
      { tab: { id: 7 } },
    );

    expect(response.success).toBe(false);
    expect(response.status).toBe(
      LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.FAIL_CLOSED,
    );
    expect(response.error.code).toBe(
      "LIVE_CAPTION_SESSION_MANAGER_CLEANUP_FAILED",
    );
    expect(controller.captureCoordinator.runtimeState).toBe(
      LIVE_CAPTION_RUNTIME_STATES.ERROR,
    );
  });

  it("handles finalized chunk messages cleanly without raw stream or side effects", async () => {
    const controller = createController();
    const mockCallback = vi.fn();

    // Create session to avoid reconciliation branch
    const session = controller.sessionManager.getOrCreateSession(7);
    session.sessionId = "session-1";

    controller.captureCoordinator.recordSnapshot = vi.fn();

    const chunkMessage = {
      type: "live-caption/offscreen/finalized-chunk",
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-a",
      chunkStartMs: 0,
      chunkEndMs: 3000,
      mimeType: "audio/webm;codecs=opus",
      payloadKind: "blob",
      chunkPayload: { size: 100 },
    };

    const response = await controller.handleFinalizedChunk(
      chunkMessage,
      {},
      mockCallback,
    );

    expect(response.success).toBe(true);
    expect(mockCallback).toHaveBeenCalledWith({
      success: true,
      message: "Chunk received",
    });
    expect(controller.captureCoordinator.recordSnapshot).toHaveBeenCalled();
  });

  it("fails to handle finalized chunk with missing metadata", async () => {
    const controller = createController();
    const mockCallback = vi.fn();

    // Missing sessionId
    const chunkMessage = {
      type: "live-caption/offscreen/finalized-chunk",
      tabId: 7,
      videoFingerprint: "video-a",
      chunkStartMs: 0,
      chunkEndMs: 3000,
      mimeType: "audio/webm;codecs=opus",
    };

    const response = await controller.handleFinalizedChunk(
      chunkMessage,
      {},
      mockCallback,
    );

    expect(response.success).toBe(false);
    expect(response.error).toBeDefined();
    expect(mockCallback).toHaveBeenCalledWith({
      success: false,
      error: expect.any(String),
    });
  });

  it("handles capture error messages and sets coordinator to fail-closed", async () => {
    const controller = createController();
    const mockCallback = vi.fn();
    controller.captureCoordinator.failClosed = vi.fn();

    const errorMessage = {
      type: "live-caption/offscreen/capture-error",
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-a",
      error: {
        code: "capture_runtime_error",
        message: "Capture failed",
        reason: "error",
      },
    };

    const response = await controller.handleCaptureError(
      errorMessage,
      {},
      mockCallback,
    );

    expect(response.success).toBe(true);
    expect(mockCallback).toHaveBeenCalledWith({ success: true });
    expect(controller.captureCoordinator.failClosed).toHaveBeenCalledWith(
      "error",
      expect.any(Object),
    );
  });

  it("handles offscreen health success without disruption", async () => {
    const controller = createController();
    const session = controller.sessionManager.getOrCreateSession(1);
    session.sessionId = "session-1";
    session.lifecycleState = "active";
    
    controller.offscreenBridge.requestRuntimeStatus = vi.fn().mockResolvedValue({ ok: true, status: "OK" });

    await controller._performHealthCheck();

    expect(controller.offscreenBridge.requestRuntimeStatus).toHaveBeenCalled();
    expect(controller.sessionManager.getSession(1)).toBe(session);
    expect(session.lifecycleState).toBe("active");
  });

  it("handles offscreen health failure by failing closed", async () => {
    const controller = createController();
    const session = controller.sessionManager.getOrCreateSession(2);
    session.sessionId = "session-2";
    session.lifecycleState = "active";

    controller.offscreenBridge.requestRuntimeStatus = vi.fn().mockResolvedValue({ ok: false });
    controller.offscreenBridge.requestRuntimeStop = vi.fn().mockResolvedValue();
    controller.offscreenBridge.browserApi = { tabs: { sendMessage: vi.fn().mockResolvedValue() } };

    await controller._performHealthCheck();

    expect(controller.sessionManager.getSession(2)).toBe(null); // Failed closed and cleaned up
    expect(controller.offscreenBridge.requestRuntimeStop).toHaveBeenCalledWith(expect.objectContaining({ reason: "health_check_failure" }));
    expect(controller.offscreenBridge.browserApi.tabs.sendMessage).toHaveBeenCalledWith(
      2, 
      expect.objectContaining({ action: LIVE_CAPTION_RUNTIME_ACTIONS.STOP })
    );
  });

  it("fails closed when health check times out", async () => {
    vi.useFakeTimers();
    const controller = createController();
    const session = controller.sessionManager.getOrCreateSession(3);
    session.sessionId = "session-3";
    session.lifecycleState = "active";

    controller.offscreenBridge.requestRuntimeStatus = vi.fn().mockReturnValue(new Promise(() => {})); // Never resolves
    controller.offscreenBridge.requestRuntimeStop = vi.fn().mockResolvedValue();
    controller.offscreenBridge.browserApi = { tabs: { sendMessage: vi.fn().mockResolvedValue() } };

    const healthCheckPromise = controller._performHealthCheck();
    
    // Advance timers past the 5-second timeout
    await vi.advanceTimersByTimeAsync(5000);
    await healthCheckPromise;

    expect(controller.sessionManager.getSession(3)).toBe(null);
    expect(controller.offscreenBridge.requestRuntimeStop).toHaveBeenCalledWith(expect.objectContaining({ reason: "health_check_failure" }));
    
    vi.useRealTimers();
  });

  it("handles active-video handoff via handleVideoChanged without recreating page session", async () => {
    const controller = createController();
    const session = controller.sessionManager.getOrCreateSession(7);
    session.sessionId = "session-1";
    session.lifecycleState = "active";
    session.replaceVideoSession(new VideoCaptionSession({
      tabId: 7,
      videoFingerprint: "video-old",
    }));
    controller.captureCoordinator.setSessionContext({
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-old",
    });

    controller.offscreenBridge.requestVideoChanged = vi.fn().mockResolvedValue({ ok: true });

    const response = await controller.handleVideoChanged(
      createLiveCaptionRuntimeVideoChangedRequest({
        tabId: 7,
        sessionId: "session-1",
        videoFingerprint: "video-new"
      }),
      { tab: { id: 7 } }
    );

    expect(response.ok).toBe(true);
    expect(controller.sessionManager.getSession(7)).toBe(session); // session not recreated
    expect(session.activeVideoFingerprint).toBe("video-new"); // fingerprint updated
    expect(controller.captureCoordinator.videoFingerprint).toBe("video-new"); // capture coordinator updated
    expect(controller.offscreenBridge.requestVideoChanged).toHaveBeenCalledWith(expect.objectContaining({
      videoFingerprint: "video-new",
      sessionId: "session-1",
      tabId: 7
    }));
  });

  it("fails active-video handoff if neither tabId nor sessionId matches any active session", async () => {
    const controller = createController();
    controller.offscreenBridge.requestVideoChanged = vi.fn().mockResolvedValue({ ok: true });

    const response = await controller.handleVideoChanged(
      createLiveCaptionRuntimeVideoChangedRequest({
        tabId: 999,
        sessionId: "session-non-existent",
        videoFingerprint: "video-new-3"
      }),
      { tab: { id: 999 } }
    );

    expect(response.ok).toBe(false);
    expect(response.status).toBe("FAIL_CLOSED");
  });

  it("fails active-video handoff closed when offscreen retarget fails without mutating session state", async () => {
    const controller = createController();
    const session = controller.sessionManager.getOrCreateSession(7);
    session.sessionId = "session-1";
    session.lifecycleState = "active";
    session.replaceVideoSession(new VideoCaptionSession({
      tabId: 7,
      videoFingerprint: "video-old",
    }));
    controller.captureCoordinator.setSessionContext({
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-old",
    });

    controller.offscreenBridge.requestVideoChanged = vi.fn().mockResolvedValue({
      ok: false,
      status: LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.FAIL_CLOSED,
      message: "offscreen retarget failed"
    });

    const response = await controller.handleVideoChanged(
      createLiveCaptionRuntimeVideoChangedRequest({
        tabId: 7,
        sessionId: "session-1",
        videoFingerprint: "video-new"
      }),
      { tab: { id: 7 } }
    );

    expect(response.ok).toBe(false);
    expect(response.status).toBe(LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.FAIL_CLOSED);
    expect(session.activeVideoFingerprint).toBe("video-old");
    expect(controller.captureCoordinator.videoFingerprint).toBe("video-old");
    expect(controller.offscreenBridge.requestVideoChanged).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-new"
    }));
  });

  it("finalized chunks are attributed to the new videoFingerprint after retargeting", async () => {
    const controller = createController();
    const session = controller.sessionManager.getOrCreateSession(7);
    session.sessionId = "session-1";
    session.lifecycleState = "active";
    session.replaceVideoSession(new VideoCaptionSession({
      tabId: 7,
      videoFingerprint: "video-old",
    }));
    controller.captureCoordinator.setSessionContext({
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-old",
    });

    controller.offscreenBridge.requestVideoChanged = vi.fn().mockResolvedValue({ ok: true });

    await controller.handleVideoChanged(
      createLiveCaptionRuntimeVideoChangedRequest({
        tabId: 7,
        sessionId: "session-1",
        videoFingerprint: "video-new"
      }),
      { tab: { id: 7 } }
    );

    expect(controller.captureCoordinator.videoFingerprint).toBe("video-new");
  });
});
