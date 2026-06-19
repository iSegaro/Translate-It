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
import {
  LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES,
  LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES,
  createLiveCaptionSourceClockSnapshotResponse
} from "./liveCaptionOffscreenContracts.js";
import { LIVE_CAPTION_RUNTIME_STATES } from "../constants/liveCaptionRuntimeStates.js";
import { LIVE_CAPTION_CLEANUP_RESULT_STATUSES } from "../core/LiveCaptionCleanupCoordinator.js";
import { LIVE_CAPTION_CLEANUP_REASONS } from "../core/contracts.js";
import { VideoCaptionSession } from "../core/VideoCaptionSession.js";
import {
  getLiveCaptionQualityProfileAsync,
  getLiveCaptionSttProviderAsync
} from "@/shared/config/config.js";
import { createMessageHandler } from "@/shared/messaging/core/MessageHandler.js";

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
    getLiveCaptionQualityProfileAsync: vi.fn().mockResolvedValue("balanced"),
  };
});

describe("live-caption background controller", () => {
  let activeControllers = [];

  beforeEach(() => {
    activeControllers = [];
    getLiveCaptionSttProviderAsync.mockResolvedValue("openai_whisper");
    getLiveCaptionQualityProfileAsync.mockResolvedValue("balanced");
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async (request) => {
          if (request.type === LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.SOURCE_CLOCK_SNAPSHOT_REQUEST) {
            return createLiveCaptionSourceClockSnapshotResponse({
              sessionId: request.sessionId,
              tabId: request.tabId,
              videoFingerprint: request.videoFingerprint,
              sourceClockSnapshot: {
                sourceMs: 0,
                sourceClockId: "clock-1",
                sourceResetId: 1,
                sourceTimelineType: "capture",
                sourceSequence: 0,
                captureState: "capturing",
                wallClockMs: 1000
              }
            });
          }

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

  function createTranscriptEventCoordinatorMock() {
    return {
      handleStreamingTranscriptEvent: vi.fn(),
      clearSession: vi.fn(),
      clearVideoSession: vi.fn(),
      destroy: vi.fn()
    };
  }

  it("registers runtime handlers and routes shell requests without media work", async () => {
    const messageHandler = {
      registerHandler: vi.fn(),
    };
    const controller = createController();

    controller.registerHandlers(messageHandler);

    expect(messageHandler.registerHandler).toHaveBeenCalledTimes(13);
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
    expect(messageHandler.registerHandler).toHaveBeenCalledWith(
      LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_TRANSCRIPT_EVENT,
      expect.any(Function),
    );
    expect(messageHandler.registerHandler).toHaveBeenCalledWith(
      LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_STATUS,
      expect.any(Function),
    );
    expect(messageHandler.registerHandler).toHaveBeenCalledWith(
      LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_ERROR,
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

  it("stores mediaAnchorMs when starting session", async () => {
    const controller = createController();
    await controller.handleRuntimeStart(
      createLiveCaptionRuntimeStartRequest({
        tabId: 7,
        sessionId: "session-1",
        videoFingerprint: "video-a",
        mediaAnchorMs: 3000,
        playbackRate: 1.5
      }),
      { tab: { id: 7 } },
    );
    const session = controller.sessionManager.getSession(7);
    expect(session).not.toBeNull();
    expect(session.activeVideoSession).not.toBeNull();
    expect(session.activeVideoSession.mediaAnchorMs).toBe(3000);
    expect(session.activeVideoSession.getTimelineAnchors()).toHaveLength(1);
    expect(session.activeVideoSession.getTimelineAnchors()[0]).toMatchObject({
      reason: "start",
      sourceMs: 0,
      mediaMs: 3000,
      playbackRate: 1.5,
      sessionId: "session-1",
      videoFingerprint: "video-a"
    });
  });

  it("restarts the start timeline anchor when the same video session is started again", async () => {
    const controller = createController();

    await controller.handleRuntimeStart(
      createLiveCaptionRuntimeStartRequest({
        tabId: 7,
        sessionId: "session-1",
        videoFingerprint: "video-a",
        mediaAnchorMs: 3000,
        playbackRate: 1
      }),
      { tab: { id: 7 } },
    );

    await controller.handleRuntimeStart(
      createLiveCaptionRuntimeStartRequest({
        tabId: 7,
        sessionId: "session-1",
        videoFingerprint: "video-a",
        mediaAnchorMs: 4000,
        playbackRate: 1.25
      }),
      { tab: { id: 7 } },
    );

    const session = controller.sessionManager.getSession(7);
    expect(session).not.toBeNull();
    expect(session.activeVideoSession).not.toBeNull();
    expect(session.activeVideoSession.getTimelineAnchors()).toHaveLength(1);
    expect(session.activeVideoSession.getTimelineAnchors()[0]).toMatchObject({
      reason: "start",
      sourceMs: 0,
      mediaMs: 4000,
      playbackRate: 1.25,
      sessionId: "session-1",
      videoFingerprint: "video-a"
    });
  });

  it("does not create a start timeline anchor when mediaAnchorMs is invalid", async () => {
    const controller = createController();
    await controller.handleRuntimeStart(
      createLiveCaptionRuntimeStartRequest({
        tabId: 7,
        sessionId: "session-1",
        videoFingerprint: "video-a",
        mediaAnchorMs: null,
        playbackRate: 1.5
      }),
      { tab: { id: 7 } },
    );
    const session = controller.sessionManager.getSession(7);
    expect(session).not.toBeNull();
    expect(session.activeVideoSession).not.toBeNull();
    expect(session.activeVideoSession.getTimelineAnchors()).toHaveLength(0);
  });

  it("requests a source clock snapshot through the background controller without emitting anchors", async () => {
    const controller = createController();
    controller.offscreenBridge.requestSourceClockSnapshot = vi.fn().mockResolvedValue({
      type: LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.SOURCE_CLOCK_SNAPSHOT_RESPONSE,
      ok: true,
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-a",
      sourceClockSnapshot: {
        sourceMs: 240,
        sourceClockId: "clock-1",
        sourceResetId: 1,
        sourceTimelineType: "capture",
        sourceSequence: 3,
        captureState: "capturing",
        wallClockMs: 1000
      }
    });

    await controller.handleRuntimeStart(
      createLiveCaptionRuntimeStartRequest({
        tabId: 7,
        sessionId: "session-1",
        videoFingerprint: "video-a",
        mediaAnchorMs: 3000,
        playbackRate: 1
      }),
      { tab: { id: 7 } },
    );

    const response = await controller.requestSourceClockSnapshot({
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-a"
    });
    const session = controller.sessionManager.getSession(7);

    expect(controller.offscreenBridge.requestSourceClockSnapshot).toHaveBeenCalledWith({
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-a",
      requestId: null
    });
    expect(response).toMatchObject({
      type: LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.SOURCE_CLOCK_SNAPSHOT_RESPONSE,
      ok: true,
      sourceClockSnapshot: {
        sourceMs: 240,
        sourceClockId: "clock-1",
        sourceResetId: 1,
        sourceTimelineType: "capture",
        sourceSequence: 3
      }
    });
    expect(session.activeVideoSession.getTimelineAnchors()).toHaveLength(1);
    expect(session.activeVideoSession.getSourceClockSnapshot()).toMatchObject({
      sourceMs: 240,
      sourceClockId: "clock-1",
      sourceResetId: 1,
      sourceTimelineType: "capture",
      sourceSequence: 3,
      captureState: "capturing",
      wallClockMs: 1000
    });
  });

  it("does not store a source clock snapshot for mismatched session or video fingerprint", async () => {
    const controller = createController();
    const sessionSnapshot = {
      sourceMs: 240,
      sourceClockId: "clock-1",
      sourceResetId: 1,
      sourceTimelineType: "capture",
      sourceSequence: 3,
      captureState: "capturing",
      wallClockMs: 1000
    };

    controller.offscreenBridge.requestSourceClockSnapshot = vi.fn().mockResolvedValue({
      type: LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.SOURCE_CLOCK_SNAPSHOT_RESPONSE,
      ok: true,
      sessionId: "different-session",
      tabId: 7,
      videoFingerprint: "video-b",
      sourceClockSnapshot: sessionSnapshot
    });

    await controller.handleRuntimeStart(
      createLiveCaptionRuntimeStartRequest({
        tabId: 7,
        sessionId: "session-1",
        videoFingerprint: "video-a",
        mediaAnchorMs: 3000,
        playbackRate: 1
      }),
      { tab: { id: 7 } },
    );

    await controller.requestSourceClockSnapshot({
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-a"
    });

    const session = controller.sessionManager.getSession(7);
    expect(session.activeVideoSession.getSourceClockSnapshot()).toBe(null);
  });

  it.each([
    ["playing", "resume"],
    ["seeked", "seeked"],
    ["ratechange", "ratechange"]
  ])("creates a timeline anchor for %s when the source snapshot is valid", async (eventType, expectedReason) => {
    const controller = createController();
    const requestVideoChangedSpy = vi.spyOn(controller.offscreenBridge, "requestVideoChanged");

    await controller.handleRuntimeStart(
      createLiveCaptionRuntimeStartRequest({
        tabId: 7,
        sessionId: "session-1",
        videoFingerprint: "video-a",
        mediaAnchorMs: 3000,
        playbackRate: 1
      }),
      { tab: { id: 7 } },
    );

    const response = await controller.handleVideoChanged(
      createLiveCaptionRuntimeVideoChangedRequest({
        tabId: 7,
        sessionId: "session-1",
        videoFingerprint: "video-a",
        eventType,
        mediaMs: 6100,
        playbackRate: 1.25,
        wallClockMs: 42
      }),
      { tab: { id: 7 } }
    );

    const session = controller.sessionManager.getSession(7);
    const anchors = session.activeVideoSession.getTimelineAnchors();

    expect(response.ok).toBe(true);
    expect(requestVideoChangedSpy).not.toHaveBeenCalled();
    expect(anchors).toHaveLength(2);
    expect(anchors[1]).toMatchObject({
      reason: expectedReason,
      sourceMs: 0,
      mediaMs: 6100,
      playbackRate: 1.25,
      sessionId: "session-1",
      videoFingerprint: "video-a",
      sourceTimelineType: "capture",
      sourceClockId: "clock-1",
      sourceResetId: 1,
      wallClockMs: 42
    });
  });

  it("does not create a timeline anchor when the snapshot is invalid", async () => {
    const controller = createController();
    controller.offscreenBridge.requestSourceClockSnapshot = vi.fn().mockResolvedValue({
      type: LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.SOURCE_CLOCK_SNAPSHOT_RESPONSE,
      ok: false,
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-a",
      error: {
        code: "invalid_response",
        reason: "source_clock_snapshot_unavailable",
        message: "Live-caption source clock snapshot unavailable"
      }
    });

    await controller.handleRuntimeStart(
      createLiveCaptionRuntimeStartRequest({
        tabId: 7,
        sessionId: "session-1",
        videoFingerprint: "video-a",
        mediaAnchorMs: 3000,
        playbackRate: 1
      }),
      { tab: { id: 7 } },
    );

    await controller.handleVideoChanged(
      createLiveCaptionRuntimeVideoChangedRequest({
        tabId: 7,
        sessionId: "session-1",
        videoFingerprint: "video-a",
        eventType: "playing",
        mediaMs: 6100,
        playbackRate: 1.25,
        wallClockMs: 42
      }),
      { tab: { id: 7 } }
    );

    const session = controller.sessionManager.getSession(7);
    expect(session.activeVideoSession.getTimelineAnchors()).toHaveLength(1);
    expect(session.activeVideoSession.getSourceClockSnapshot()).toBe(null);
  });

  it("does not create a timeline anchor for mismatched session or video fingerprint", async () => {
    const controller = createController();

    await controller.handleRuntimeStart(
      createLiveCaptionRuntimeStartRequest({
        tabId: 7,
        sessionId: "session-1",
        videoFingerprint: "video-a",
        mediaAnchorMs: 3000,
        playbackRate: 1
      }),
      { tab: { id: 7 } },
    );

    await controller.handleVideoChanged(
      createLiveCaptionRuntimeVideoChangedRequest({
        tabId: 7,
        sessionId: "session-1",
        videoFingerprint: "video-b",
        eventType: "playing",
        mediaMs: 6100,
        playbackRate: 1.25,
        wallClockMs: 42
      }),
      { tab: { id: 7 } }
    );

    const session = controller.sessionManager.getSession(7);
    expect(session.activeVideoSession.getTimelineAnchors()).toHaveLength(1);
  });

  it("does not add duplicate timeline anchors for the same discontinuity", async () => {
    const controller = createController();

    await controller.handleRuntimeStart(
      createLiveCaptionRuntimeStartRequest({
        tabId: 7,
        sessionId: "session-1",
        videoFingerprint: "video-a",
        mediaAnchorMs: 3000,
        playbackRate: 1
      }),
      { tab: { id: 7 } },
    );

    await controller.handleVideoChanged(
      createLiveCaptionRuntimeVideoChangedRequest({
        tabId: 7,
        sessionId: "session-1",
        videoFingerprint: "video-a",
        eventType: "playing",
        mediaMs: 6100,
        playbackRate: 1.25,
        wallClockMs: 42
      }),
      { tab: { id: 7 } }
    );
    await controller.handleVideoChanged(
      createLiveCaptionRuntimeVideoChangedRequest({
        tabId: 7,
        sessionId: "session-1",
        videoFingerprint: "video-a",
        eventType: "playing",
        mediaMs: 6100,
        playbackRate: 1.25,
        wallClockMs: 42
      }),
      { tab: { id: 7 } }
    );

    const session = controller.sessionManager.getSession(7);
    expect(session.activeVideoSession.getTimelineAnchors()).toHaveLength(2);
    expect(session.activeVideoSession.getTimelineAnchors()[1]).toMatchObject({
      reason: "resume",
      sourceMs: 0,
      mediaMs: 6100,
      sourceClockId: "clock-1",
      sourceResetId: 1
    });
  });

  it.each(["pause", "seeking"])("ignores unsupported timeline event %s without creating anchors", async (eventType) => {
    const controller = createController();

    await controller.handleRuntimeStart(
      createLiveCaptionRuntimeStartRequest({
        tabId: 7,
        sessionId: "session-1",
        videoFingerprint: "video-a",
        mediaAnchorMs: 3000,
        playbackRate: 1
      }),
      { tab: { id: 7 } },
    );

    await controller.handleVideoChanged(
      createLiveCaptionRuntimeVideoChangedRequest({
        tabId: 7,
        sessionId: "session-1",
        videoFingerprint: "video-a",
        eventType,
        mediaMs: 6100,
        playbackRate: 1.25,
        wallClockMs: 42
      }),
      { tab: { id: 7 } }
    );

    const session = controller.sessionManager.getSession(7);
    expect(session.activeVideoSession.getTimelineAnchors()).toHaveLength(1);
  });

  it("clears a stored source clock snapshot when the latest snapshot request fails for the active session", async () => {
    const controller = createController();

    controller.offscreenBridge.requestSourceClockSnapshot = vi.fn().mockResolvedValue({
      type: LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.SOURCE_CLOCK_SNAPSHOT_RESPONSE,
      ok: false,
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-a",
      error: {
        code: "invalid_response",
        reason: "source_clock_snapshot_unavailable",
        message: "Live-caption source clock snapshot unavailable"
      }
    });

    await controller.handleRuntimeStart(
      createLiveCaptionRuntimeStartRequest({
        tabId: 7,
        sessionId: "session-1",
        videoFingerprint: "video-a",
        mediaAnchorMs: 3000,
        playbackRate: 1
      }),
      { tab: { id: 7 } },
    );

    const session = controller.sessionManager.getSession(7);
    session.activeVideoSession.setSourceClockSnapshot({
      sourceMs: 240,
      sourceClockId: "clock-1",
      sourceResetId: 1,
      sourceTimelineType: "capture",
      sourceSequence: 3,
      captureState: "capturing",
      wallClockMs: 1000
    });

    await controller.requestSourceClockSnapshot({
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-a"
    });

    expect(session.activeVideoSession.getSourceClockSnapshot()).toBe(null);
    expect(session.activeVideoSession.getTimelineAnchors()).toHaveLength(1);
  });

  it("clears stale anchors when a restart start request has an invalid media anchor", async () => {
    const controller = createController();

    await controller.handleRuntimeStart(
      createLiveCaptionRuntimeStartRequest({
        tabId: 7,
        sessionId: "session-1",
        videoFingerprint: "video-a",
        mediaAnchorMs: 3000,
        playbackRate: 1
      }),
      { tab: { id: 7 } },
    );

    await controller.handleRuntimeStart(
      createLiveCaptionRuntimeStartRequest({
        tabId: 7,
        sessionId: "session-1",
        videoFingerprint: "video-a",
        mediaAnchorMs: null,
        playbackRate: 1
      }),
      { tab: { id: 7 } },
    );

    const session = controller.sessionManager.getSession(7);
    expect(session).not.toBeNull();
    expect(session.activeVideoSession).not.toBeNull();
    expect(session.activeVideoSession.getTimelineAnchors()).toHaveLength(0);
  });

  it("routes finalized chunks through the normal message-handler path", async () => {
    const controller = createController();
    controller.captureCoordinator.recordSnapshot = vi.fn();
    controller.sttCoordinator.handleFinalizedChunk = vi.fn().mockResolvedValue();
    const messageHandler = createMessageHandler();
    controller.registerHandlers(messageHandler);

    const session = controller.sessionManager.getOrCreateSession(7);
    session.sessionId = "session-1";
    session.replaceVideoSession(new VideoCaptionSession({
      tabId: 7,
      videoFingerprint: "video-a"
    }));

    const sendResponse = vi.fn();
    const response = await messageHandler._handleMessage(
      {
        action: LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.FINALIZED_CHUNK,
        type: LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.FINALIZED_CHUNK,
        target: "background",
        sessionId: "session-1",
        tabId: 7,
        videoFingerprint: "video-a",
        chunkStartMs: 0,
        chunkEndMs: 1000,
        mimeType: "audio/webm",
        chunkPayload: new Blob([new Uint8Array(2048).fill(1)], { type: "audio/webm" })
      },
      { tab: { id: 7 } },
      sendResponse,
    );

    expect(controller.captureCoordinator.recordSnapshot).toHaveBeenCalled();
    expect(controller.sttCoordinator.handleFinalizedChunk).toHaveBeenCalledTimes(1);
    expect(response.success).toBe(true);
    expect(sendResponse).toHaveBeenCalledTimes(1);
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
    const mockTranscript = {
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-a",
      segmentId: "t1",
      originalText: "Hello",
      segmentStartMs: 0,
      segmentEndMs: 1000,
      revision: 1
    };
    const mockTranslation = {
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-a",
      segmentId: "c1",
      translatedText: "سلام",
      originalText: "Hello",
      segmentStartMs: 0,
      segmentEndMs: 1000,
      revision: 1
    };

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
    expect(session.activeVideoSession.getTranscriptSegmentByIdentity({
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-a",
      segmentId: "t1"
    })).toMatchObject({
      originalText: "Hello",
      revision: 1
    });
    expect(session.activeVideoSession.getTranslatedCaptionSegmentByIdentity({
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-a",
      segmentId: "c1"
    })).toMatchObject({
      translatedText: "سلام",
      revision: 1
    });
    
    expect(response.sessionSnapshot.activeVideoSession.translatedCaptionSegments).toHaveLength(1);
  });

  it("applies provider-aware chunkTimeslice presets only for local_whisper runtime start", async () => {
    getLiveCaptionSttProviderAsync.mockResolvedValueOnce("local_whisper");
    getLiveCaptionQualityProfileAsync.mockResolvedValueOnce("fast");
    let controller = createController();
    await controller.handleRuntimeStart(
      createLiveCaptionRuntimeStartRequest({
        tabId: 7,
        sessionId: "session-fast",
        videoFingerprint: "video-a",
      }),
      { tab: { id: 7 } },
    );

    let startRequest = globalThis.chrome.runtime.sendMessage.mock.calls.find(([request]) => request.data?.sessionId === "session-fast")?.[0];
    expect(startRequest.data.metadata).toMatchObject({
      chunkTimeslice: 4000
    });
    controller.destroy();

    getLiveCaptionSttProviderAsync.mockResolvedValueOnce("local_whisper");
    getLiveCaptionQualityProfileAsync.mockResolvedValueOnce("balanced");
    controller = createController();
    await controller.handleRuntimeStart(
      createLiveCaptionRuntimeStartRequest({
        tabId: 7,
        sessionId: "session-balanced",
        videoFingerprint: "video-b",
      }),
      { tab: { id: 7 } },
    );

    startRequest = globalThis.chrome.runtime.sendMessage.mock.calls.find(([request]) => request.data?.sessionId === "session-balanced")?.[0];
    expect(startRequest.data.metadata).toMatchObject({
      chunkTimeslice: 6000
    });
    controller.destroy();

    getLiveCaptionSttProviderAsync.mockResolvedValueOnce("local_whisper");
    getLiveCaptionQualityProfileAsync.mockResolvedValueOnce("quality");
    controller = createController();
    await controller.handleRuntimeStart(
      createLiveCaptionRuntimeStartRequest({
        tabId: 7,
        sessionId: "session-quality",
        videoFingerprint: "video-c",
      }),
      { tab: { id: 7 } },
    );

    startRequest = globalThis.chrome.runtime.sendMessage.mock.calls.find(([request]) => request.data?.sessionId === "session-quality")?.[0];
    expect(startRequest.data.metadata).toMatchObject({
      chunkTimeslice: 10000
    });
    controller.destroy();

    getLiveCaptionSttProviderAsync.mockResolvedValueOnce("local_whisper");
    getLiveCaptionQualityProfileAsync.mockResolvedValueOnce("unknown-profile");
    controller = createController();
    await controller.handleRuntimeStart(
      createLiveCaptionRuntimeStartRequest({
        tabId: 7,
        sessionId: "session-fallback",
        videoFingerprint: "video-d",
      }),
      { tab: { id: 7 } },
    );

    startRequest = globalThis.chrome.runtime.sendMessage.mock.calls.find(([request]) => request.data?.sessionId === "session-fallback")?.[0];
    expect(startRequest.data.metadata).toMatchObject({
      chunkTimeslice: 6000
    });
    controller.destroy();
  });

  it("keeps openai_whisper runtime start metadata free of chunkTimeslice", async () => {
    getLiveCaptionSttProviderAsync.mockResolvedValueOnce("openai_whisper");

    const controller = createController();

    await controller.handleRuntimeStart(
      createLiveCaptionRuntimeStartRequest({
        tabId: 7,
        sessionId: "session-openai",
        videoFingerprint: "video-openai",
      }),
      { tab: { id: 7 } },
    );

    const startRequest = globalThis.chrome.runtime.sendMessage.mock.calls.find(([request]) => request.data?.sessionId === "session-openai")?.[0];
    expect(startRequest).toBeTruthy();
    expect(startRequest.data.metadata?.chunkTimeslice).toBeUndefined();
    controller.destroy();
  });

  it("starts the streaming offscreen provider when faster_whisper_streaming is selected", async () => {
    getLiveCaptionSttProviderAsync.mockResolvedValueOnce("faster_whisper_streaming");

    const controller = createController();
    const startStreamingSpy = vi.spyOn(controller.offscreenBridge, "startStreamingSttSession");

    const response = await controller.handleRuntimeStart(
      createLiveCaptionRuntimeStartRequest({
        tabId: 7,
        sessionId: "session-streaming",
        videoFingerprint: "video-streaming",
      }),
      { tab: { id: 7 } },
    );

    expect(response.success).toBe(true);
    expect(startStreamingSpy).toHaveBeenCalledTimes(1);
    expect(startStreamingSpy).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "session-streaming",
      tabId: 7,
      videoFingerprint: "video-streaming",
      providerId: "faster_whisper_streaming",
      providerMode: "streaming",
      executionLocation: "offscreen",
      metadata: expect.objectContaining({
        streamingProvider: expect.objectContaining({
          id: "faster_whisper_streaming",
          mode: "streaming",
          executionLocation: "offscreen",
          preferredAudioInputFormat: "pcm16-mono-16khz",
          fallbackAudioInputFormat: "webm-opus"
        })
      })
    }));
    expect(controller.activeStreamingSession).toMatchObject({
      sessionId: "session-streaming",
      tabId: 7,
      videoFingerprint: "video-streaming",
      providerId: "faster_whisper_streaming",
      providerMode: "streaming",
      executionLocation: "offscreen",
      state: "active"
    });
    controller.destroy();
  });

  it("clears capture coordinator runtime state when streaming startup fails after capture begins", async () => {
    getLiveCaptionSttProviderAsync.mockResolvedValueOnce("faster_whisper_streaming");

    const controller = createController();
    controller.offscreenBridge.startStreamingSttSession = vi.fn().mockResolvedValue({
      success: false,
      ok: false,
      error: {
        code: "streaming_provider_start_failed",
        message: "ready timeout"
      }
    });

    const response = await controller.handleRuntimeStart(
      createLiveCaptionRuntimeStartRequest({
        tabId: 7,
        sessionId: "session-streaming-fail",
        videoFingerprint: "video-streaming-fail",
      }),
      { tab: { id: 7 } },
    );

    expect(response.success).toBe(false);
    expect(response.status).toBe(LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.FAIL_CLOSED);
    expect(controller.captureCoordinator.runtimeState).toBe(LIVE_CAPTION_RUNTIME_STATES.IDLE);
    expect(controller.activeStreamingSession).toBe(null);
    expect(controller.sessionManager.getSession(7)).toBe(null);
    controller.destroy();
  });

  it("clears capture coordinator runtime state on streaming provider fail-close", async () => {
    getLiveCaptionSttProviderAsync.mockResolvedValueOnce("faster_whisper_streaming");

    const controller = createController();
    controller.offscreenBridge.startStreamingSttSession = vi.fn().mockResolvedValue({
      success: true,
      ok: true,
      status: LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.OK,
      runtimeState: LIVE_CAPTION_RUNTIME_STATES.RUNNING,
      message: "streaming_stt_active"
    });
    controller.offscreenBridge.stopStreamingSttSession = vi.fn().mockResolvedValue({
      success: true,
      ok: true,
      status: LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.OK,
      runtimeState: LIVE_CAPTION_RUNTIME_STATES.IDLE,
      message: "streaming_stt_closed"
    });

    await controller.handleRuntimeStart(
      createLiveCaptionRuntimeStartRequest({
        tabId: 7,
        sessionId: "session-streaming-error",
        videoFingerprint: "video-streaming-error",
      }),
      { tab: { id: 7 } },
    );

    controller.handleCoordinatorError(new Error("provider failed"), {
      sessionId: "session-streaming-error",
      tabId: 7,
      videoFingerprint: "video-streaming-error"
    });

    expect(controller.captureCoordinator.runtimeState).toBe(LIVE_CAPTION_RUNTIME_STATES.IDLE);
    expect(controller.activeStreamingSession).toBe(null);
    expect(controller.offscreenBridge.stopStreamingSttSession).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "session-streaming-error",
      tabId: 7,
      videoFingerprint: "video-streaming-error",
      reason: LIVE_CAPTION_CLEANUP_REASONS.PROVIDER_ERROR
    }));
    controller.destroy();
  });

  it("allows restarting streaming after a fail-close without stale capture state", async () => {
    getLiveCaptionSttProviderAsync.mockResolvedValue("faster_whisper_streaming");

    const controller = createController();
    const startStreamingMock = vi.fn();
    startStreamingMock
      .mockResolvedValueOnce({
        success: false,
        ok: false,
        error: {
          code: "streaming_provider_start_failed",
          message: "ready timeout"
        }
      })
      .mockResolvedValueOnce({
        success: true,
        ok: true,
        status: LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.OK,
        runtimeState: LIVE_CAPTION_RUNTIME_STATES.RUNNING,
        message: "streaming_stt_active"
      });
    controller.offscreenBridge.startStreamingSttSession = startStreamingMock;

    const firstResponse = await controller.handleRuntimeStart(
      createLiveCaptionRuntimeStartRequest({
        tabId: 7,
        sessionId: "session-restart",
        videoFingerprint: "video-restart",
      }),
      { tab: { id: 7 } },
    );

    expect(firstResponse.success).toBe(false);
    expect(controller.captureCoordinator.runtimeState).toBe(LIVE_CAPTION_RUNTIME_STATES.IDLE);
    expect(controller.activeStreamingSession).toBe(null);

    const secondResponse = await controller.handleRuntimeStart(
      createLiveCaptionRuntimeStartRequest({
        tabId: 7,
        sessionId: "session-restart-2",
        videoFingerprint: "video-restart-2",
      }),
      { tab: { id: 7 } },
    );

    expect(secondResponse.success).toBe(true);
    expect(controller.captureCoordinator.runtimeState).toBe(LIVE_CAPTION_RUNTIME_STATES.RUNNING);
    expect(controller.activeStreamingSession).toMatchObject({
      sessionId: "session-restart-2",
      tabId: 7,
      videoFingerprint: "video-restart-2",
      state: "active"
    });
    expect(startStreamingMock).toHaveBeenCalledTimes(2);
    controller.destroy();
  });

  it("does not start the streaming provider for batch runtime providers", async () => {
    getLiveCaptionSttProviderAsync.mockResolvedValueOnce("openai_whisper");

    const controller = createController();
    const startStreamingSpy = vi.spyOn(controller.offscreenBridge, "startStreamingSttSession");

    const response = await controller.handleRuntimeStart(
      createLiveCaptionRuntimeStartRequest({
        tabId: 7,
        sessionId: "session-batch",
        videoFingerprint: "video-batch",
      }),
      { tab: { id: 7 } },
    );

    expect(response.success).toBe(true);
    expect(startStreamingSpy).not.toHaveBeenCalled();
    expect(controller.activeStreamingSession).toBe(null);
    controller.destroy();
  });

  it("stops the active streaming provider when stopping a streaming runtime", async () => {
    getLiveCaptionSttProviderAsync.mockResolvedValueOnce("faster_whisper_streaming");

    const controller = createController();
    const stopStreamingSpy = vi.spyOn(controller.offscreenBridge, "stopStreamingSttSession");

    await controller.handleRuntimeStart(
      createLiveCaptionRuntimeStartRequest({
        tabId: 7,
        sessionId: "session-streaming-stop",
        videoFingerprint: "video-streaming-stop",
      }),
      { tab: { id: 7 } },
    );

    const response = await controller.handleRuntimeStop(
      createLiveCaptionRuntimeStopRequest({
        tabId: 7,
        sessionId: "session-streaming-stop",
        videoFingerprint: "video-streaming-stop",
      }),
      { tab: { id: 7 } },
    );

    expect(response.success).toBe(true);
    expect(stopStreamingSpy).toHaveBeenCalledTimes(1);
    expect(stopStreamingSpy).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "session-streaming-stop",
      tabId: 7,
      videoFingerprint: "video-streaming-stop",
      providerId: "faster_whisper_streaming",
      reason: LIVE_CAPTION_CLEANUP_REASONS.STOP
    }));
    expect(controller.activeStreamingSession).toBe(null);
    controller.destroy();
  });

  it("normalizes local_whisper quality profile values before resolving chunkTimeslice", async () => {
    getLiveCaptionSttProviderAsync.mockResolvedValueOnce("local_whisper");
    getLiveCaptionQualityProfileAsync.mockResolvedValueOnce(" Fast ");

    const controller = createController();

    await controller.handleRuntimeStart(
      createLiveCaptionRuntimeStartRequest({
        tabId: 7,
        sessionId: "session-normalized",
        videoFingerprint: "video-normalized",
      }),
      { tab: { id: 7 } },
    );

    const startRequest = globalThis.chrome.runtime.sendMessage.mock.calls.find(([request]) => request.data?.sessionId === "session-normalized")?.[0];
    expect(startRequest).toBeTruthy();
    expect(startRequest.data.metadata).toMatchObject({
      chunkTimeslice: 4000
    });
    controller.destroy();
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

  it("clears transcript revision state on runtime stop", async () => {
    const transcriptEventCoordinator = createTranscriptEventCoordinatorMock();
    const sttCoordinator = {
      stopSession: vi.fn().mockResolvedValue(undefined)
    };
    const translationCoordinator = {
      stopSession: vi.fn(),
      activeAbortControllers: new Map(),
      sessionQueues: new Map()
    };
    const cache = {
      clearVideo: vi.fn().mockResolvedValue(undefined)
    };
    const controller = createController({
      transcriptEventCoordinator,
      sttCoordinator,
      translationCoordinator,
      cache
    });
    const session = controller.sessionManager.getOrCreateSession(7);
    session.sessionId = "session-1";
    session.replaceVideoSession(new VideoCaptionSession({
      tabId: 7,
      videoFingerprint: "video-a"
    }));

    const response = await controller.handleRuntimeStop(
      createLiveCaptionRuntimeStopRequest({
        tabId: 7,
        sessionId: "session-1",
        videoFingerprint: "video-a",
      }),
      { tab: { id: 7 } },
    );

    expect(response.success).toBe(true);
    expect(transcriptEventCoordinator.clearSession).toHaveBeenCalledWith("session-1");
    expect(transcriptEventCoordinator.clearVideoSession).not.toHaveBeenCalled();
  });

  it("clears transcript revision state on fail-close cleanup", async () => {
    const transcriptEventCoordinator = createTranscriptEventCoordinatorMock();
    const controller = createController({ transcriptEventCoordinator });
    controller.offscreenBridge.browserApi = {
      tabs: {
        sendMessage: vi.fn().mockResolvedValue(undefined)
      }
    };
    controller.offscreenBridge.requestRuntimeStop = vi.fn().mockResolvedValue(undefined);

    const session = controller.sessionManager.getOrCreateSession(7);
    session.sessionId = "session-1";
    session.replaceVideoSession(new VideoCaptionSession({
      tabId: 7,
      videoFingerprint: "video-a"
    }));

    controller.handleCoordinatorError(new Error("provider failed"), {
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-a"
    });

    expect(transcriptEventCoordinator.clearVideoSession).toHaveBeenCalledWith({
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-a"
    });
    expect(transcriptEventCoordinator.clearSession).not.toHaveBeenCalled();
  });

  it("clears all transcript revision state when the controller is destroyed", () => {
    const transcriptEventCoordinator = createTranscriptEventCoordinatorMock();
    const controller = createController({ transcriptEventCoordinator });

    controller.destroy();

    expect(transcriptEventCoordinator.destroy).toHaveBeenCalledTimes(1);
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

  it("routes canonical streaming final transcript events into translation", async () => {
    const transcriptEventCoordinator = {
      handleStreamingTranscriptEvent: vi.fn().mockResolvedValue({
        status: "canonical_final",
        canonicalEvent: {
          eventId: "event-1",
          eventType: "final",
          providerId: "faster_whisper_streaming",
          providerMode: "streaming",
          sessionId: "session-1",
          tabId: 7,
          videoFingerprint: "video-a",
          segmentId: "segment-1",
          revision: 1,
          segmentStartMs: 0,
          segmentEndMs: 1000,
          sourceTimelineType: "provider",
          sourceStartMs: 0,
          sourceEndMs: 1000,
          sourceClockId: "session-1",
          sourceSequence: 1,
          text: "hello world",
          sourceLanguage: "en",
          targetLanguage: "fa",
          confidence: 0.9,
          createdAt: 1234,
          isFinal: true
        }
      })
    };
    const translationCoordinator = {
      handleTranscriptSegment: vi.fn().mockResolvedValue(undefined),
      activeAbortControllers: new Map(),
      sessionQueues: new Map()
    };
    const cache = {
      appendTranscriptSegment: vi.fn().mockResolvedValue(undefined),
      upsertTranscriptSegmentByIdentity: vi.fn().mockResolvedValue(undefined)
    };
    const controller = createController({ transcriptEventCoordinator, translationCoordinator, cache });
    const sttCoordinatorSpy = vi.spyOn(controller.sttCoordinator, "handleFinalizedChunk");
    const messageHandler = createMessageHandler();
    controller.registerHandlers(messageHandler);
    const session = controller.sessionManager.getOrCreateSession(7);
    session.sessionId = "session-1";
    session.replaceVideoSession(new VideoCaptionSession({
      tabId: 7,
      videoFingerprint: "video-a"
    }));

    const sendResponse = vi.fn();
    const response = await messageHandler._handleMessage(
      {
        action: LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_TRANSCRIPT_EVENT,
        type: LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_TRANSCRIPT_EVENT,
        sessionId: "session-1",
        tabId: 7,
        videoFingerprint: "video-a",
        event: {
          eventId: "event-1",
          eventType: "final",
          providerId: "faster_whisper_streaming",
          providerMode: "streaming",
          sessionId: "session-1",
          tabId: 7,
          videoFingerprint: "video-a",
          segmentId: "segment-1",
          revision: 1,
          segmentStartMs: 0,
          segmentEndMs: 1000,
          sourceTimelineType: "provider",
          sourceStartMs: 0,
          sourceEndMs: 1000,
          sourceClockId: "session-1",
          sourceSequence: 1,
          text: "hello world",
          sourceLanguage: "en",
          targetLanguage: "fa",
          confidence: 0.9,
          createdAt: 1234,
          metadata: {}
        }
      },
      { tab: { id: 7 } },
      sendResponse,
    );

    expect(transcriptEventCoordinator.handleStreamingTranscriptEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "final",
        sessionId: "session-1",
        videoFingerprint: "video-a"
      })
    );
    await Promise.resolve();
    expect(session.activeVideoSession.transcriptSegments).toHaveLength(1);
    expect(session.activeVideoSession.transcriptSegments[0]).toMatchObject({
      segmentId: "segment-1",
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-a",
      startMs: 0,
      endMs: 1000,
      text: "hello world",
      providerId: "faster_whisper_streaming",
      revision: 1,
      sourceTimelineType: "provider",
      sourceStartMs: 0,
      sourceEndMs: 1000,
      sourceClockId: "session-1",
      sourceSequence: 1,
      projectedMediaStartMs: null,
      projectedMediaEndMs: null,
      timelineProjectionStatus: "unmapped",
      timelineProjectionAnchorId: null,
      timelineProjectionReason: "no_compatible_anchor"
    });
    expect(session.activeVideoSession.getTranscriptSegmentByIdentity({
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-a",
      segmentId: "segment-1"
    })).toMatchObject({
      revision: 1,
      text: "hello world",
      projectedMediaStartMs: null,
      projectedMediaEndMs: null,
      timelineProjectionStatus: "unmapped",
      timelineProjectionAnchorId: null,
      timelineProjectionReason: "no_compatible_anchor"
    });
    expect(cache.upsertTranscriptSegmentByIdentity).toHaveBeenCalledWith(expect.objectContaining({
      segmentId: "segment-1",
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-a",
      segmentStartMs: 0,
      segmentEndMs: 1000,
      originalText: "hello world",
      sourceTimelineType: "provider",
      sourceStartMs: 0,
      sourceEndMs: 1000,
      sourceClockId: "session-1",
      sourceSequence: 1,
      projectedMediaStartMs: null,
      projectedMediaEndMs: null,
      timelineProjectionStatus: "unmapped",
      timelineProjectionAnchorId: null,
      timelineProjectionReason: "no_compatible_anchor",
      revision: 1,
      isIncognito: false
    }));
    expect(cache.appendTranscriptSegment).not.toHaveBeenCalled();
    expect(translationCoordinator.handleTranscriptSegment).toHaveBeenCalledWith(
      expect.objectContaining({
        segmentId: "segment-1",
        sessionId: "session-1",
        tabId: 7,
        videoFingerprint: "video-a",
        startMs: 0,
        endMs: 1000,
        text: "hello world",
        providerId: "faster_whisper_streaming",
        revision: 1,
        sourceTimelineType: "provider",
        sourceStartMs: 0,
        sourceEndMs: 1000,
        sourceClockId: "session-1",
        sourceSequence: 1,
        projectedMediaStartMs: null,
        projectedMediaEndMs: null,
        timelineProjectionStatus: "unmapped",
        timelineProjectionAnchorId: null,
        timelineProjectionReason: "no_compatible_anchor",
        createdAt: 1234,
        isFinal: true
      }),
      { tabId: 7 }
    );
    expect(sttCoordinatorSpy).not.toHaveBeenCalled();
    expect(response.success).toBe(true);
    expect(response.message).toBe("streaming_transcript_event_received");
    expect(sendResponse).toHaveBeenCalledTimes(1);
  });

  it("keeps streaming partial events out of translation", async () => {
    const transcriptEventCoordinator = {
      handleStreamingTranscriptEvent: vi.fn().mockResolvedValue({
        status: "ignored",
        canonicalEvent: null
      })
    };
    const translationCoordinator = {
      handleTranscriptSegment: vi.fn().mockResolvedValue(undefined),
      activeAbortControllers: new Map(),
      sessionQueues: new Map()
    };
    const cache = {
      appendTranscriptSegment: vi.fn().mockResolvedValue(undefined)
    };
    const controller = createController({ transcriptEventCoordinator, translationCoordinator, cache });
    const sttCoordinatorSpy = vi.spyOn(controller.sttCoordinator, "handleFinalizedChunk");
    const messageHandler = createMessageHandler();
    controller.registerHandlers(messageHandler);
    const session = controller.sessionManager.getOrCreateSession(7);
    session.sessionId = "session-1";
    session.replaceVideoSession(new VideoCaptionSession({
      tabId: 7,
      videoFingerprint: "video-a"
    }));

    const sendResponse = vi.fn();
    const response = await messageHandler._handleMessage(
      {
        action: LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_TRANSCRIPT_EVENT,
        type: LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_TRANSCRIPT_EVENT,
        sessionId: "session-1",
        tabId: 7,
        videoFingerprint: "video-a",
        event: {
          eventId: "event-partial",
          eventType: "partial",
          providerId: "faster_whisper_streaming",
          providerMode: "streaming",
          sessionId: "session-1",
          tabId: 7,
          videoFingerprint: "video-a",
          segmentId: "segment-1",
          revision: 1,
          text: "hello",
          createdAt: 1234,
          metadata: {}
        }
      },
      { tab: { id: 7 } },
      sendResponse,
    );

    expect(transcriptEventCoordinator.handleStreamingTranscriptEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "partial",
        sessionId: "session-1",
        videoFingerprint: "video-a"
      })
    );
    await Promise.resolve();
    expect(translationCoordinator.handleTranscriptSegment).not.toHaveBeenCalled();
    expect(cache.appendTranscriptSegment).not.toHaveBeenCalled();
    expect(session.activeVideoSession.transcriptSegments).toHaveLength(0);
    expect(sttCoordinatorSpy).not.toHaveBeenCalled();
    expect(response.success).toBe(true);
    expect(response.message).toBe("streaming_transcript_event_received");
    expect(sendResponse).toHaveBeenCalledTimes(1);
  });

  it("routes canonical streaming correction events into translation and updates canonical transcript state", async () => {
    const transcriptEventCoordinator = {
      handleStreamingTranscriptEvent: vi.fn().mockResolvedValue({
        status: "canonical_correction",
        canonicalEvent: {
          eventId: "event-2",
          eventType: "correction",
          providerId: "faster_whisper_streaming",
          providerMode: "streaming",
          sessionId: "session-1",
          tabId: 7,
          videoFingerprint: "video-a",
          segmentId: "segment-1",
          revision: 2,
          segmentStartMs: 0,
          segmentEndMs: 1000,
          supersedesEventId: "event-1",
          supersedesSegmentId: "segment-1",
          sourceTimelineType: "provider",
          sourceStartMs: 0,
          sourceEndMs: 1000,
          sourceClockId: "session-1",
          sourceSequence: 2,
          text: "hello world corrected",
          createdAt: 1250,
          isFinal: true
        }
      })
    };
    const translationCoordinator = {
      handleTranscriptSegment: vi.fn().mockResolvedValue(undefined),
      activeAbortControllers: new Map(),
      sessionQueues: new Map()
    };
    const cache = {
      appendTranscriptSegment: vi.fn().mockResolvedValue(undefined),
      upsertTranscriptSegmentByIdentity: vi.fn().mockResolvedValue(undefined)
    };
    const controller = createController({ transcriptEventCoordinator, translationCoordinator, cache });
    const sttCoordinatorSpy = vi.spyOn(controller.sttCoordinator, "handleFinalizedChunk");
    const messageHandler = createMessageHandler();
    controller.registerHandlers(messageHandler);
    const session = controller.sessionManager.getOrCreateSession(7);
    session.sessionId = "session-1";
    session.replaceVideoSession(new VideoCaptionSession({
      tabId: 7,
      videoFingerprint: "video-a"
    }));

    const sendResponse = vi.fn();
    const response = await messageHandler._handleMessage(
      {
        action: LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_TRANSCRIPT_EVENT,
        type: LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_TRANSCRIPT_EVENT,
        sessionId: "session-1",
        tabId: 7,
        videoFingerprint: "video-a",
        event: {
          eventId: "event-2",
          eventType: "correction",
          providerId: "faster_whisper_streaming",
          providerMode: "streaming",
          sessionId: "session-1",
          tabId: 7,
          videoFingerprint: "video-a",
          segmentId: "segment-1",
          revision: 2,
          segmentStartMs: 0,
          segmentEndMs: 1000,
          supersedesEventId: "event-1",
          supersedesSegmentId: "segment-1",
          sourceTimelineType: "provider",
          sourceStartMs: 0,
          sourceEndMs: 1000,
          sourceClockId: "session-1",
          sourceSequence: 2,
          text: "hello world corrected",
          createdAt: 1250,
          metadata: {}
        }
      },
      { tab: { id: 7 } },
      sendResponse,
    );

    expect(transcriptEventCoordinator.handleStreamingTranscriptEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "correction",
        sessionId: "session-1",
        videoFingerprint: "video-a"
      })
    );
    await Promise.resolve();
    expect(session.activeVideoSession.transcriptSegments).toHaveLength(1);
    expect(session.activeVideoSession.transcriptSegments[0]).toMatchObject({
      segmentId: "segment-1",
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-a",
      startMs: 0,
      endMs: 1000,
      text: "hello world corrected",
      providerId: "faster_whisper_streaming",
      revision: 2,
      sourceTimelineType: "provider",
      sourceStartMs: 0,
      sourceEndMs: 1000,
      sourceClockId: "session-1",
      sourceSequence: 2,
      projectedMediaStartMs: null,
      projectedMediaEndMs: null,
      timelineProjectionStatus: "unmapped",
      timelineProjectionAnchorId: null,
      timelineProjectionReason: "no_compatible_anchor"
    });
    expect(session.activeVideoSession.getTranscriptSegmentByIdentity({
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-a",
      segmentId: "segment-1"
    })).toMatchObject({
      revision: 2,
      text: "hello world corrected"
    });
    expect(cache.upsertTranscriptSegmentByIdentity).toHaveBeenCalledWith(expect.objectContaining({
      segmentId: "segment-1",
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-a",
      segmentStartMs: 0,
      segmentEndMs: 1000,
      originalText: "hello world corrected",
      sourceTimelineType: "provider",
      sourceStartMs: 0,
      sourceEndMs: 1000,
      sourceClockId: "session-1",
      sourceSequence: 2,
      projectedMediaStartMs: null,
      projectedMediaEndMs: null,
      timelineProjectionStatus: "unmapped",
      timelineProjectionAnchorId: null,
      timelineProjectionReason: "no_compatible_anchor",
      revision: 2,
      isIncognito: false
    }));
    expect(cache.appendTranscriptSegment).not.toHaveBeenCalled();
    expect(translationCoordinator.handleTranscriptSegment).toHaveBeenCalledWith(
      expect.objectContaining({
        segmentId: "segment-1",
        sessionId: "session-1",
        tabId: 7,
        videoFingerprint: "video-a",
        startMs: 0,
        endMs: 1000,
        text: "hello world corrected",
        providerId: "faster_whisper_streaming",
        revision: 2,
        sourceTimelineType: "provider",
        sourceStartMs: 0,
        sourceEndMs: 1000,
        sourceClockId: "session-1",
        sourceSequence: 2,
        projectedMediaStartMs: null,
        projectedMediaEndMs: null,
        timelineProjectionStatus: "unmapped",
        timelineProjectionAnchorId: null,
        timelineProjectionReason: "no_compatible_anchor",
        createdAt: 1250,
        isFinal: true
      }),
      { tabId: 7 }
    );
    expect(sttCoordinatorSpy).not.toHaveBeenCalled();
    expect(response.success).toBe(true);
    expect(response.message).toBe("streaming_transcript_event_received");
    expect(sendResponse).toHaveBeenCalledTimes(1);
  });

  it("ignores stale canonical streaming correction events", async () => {
    const transcriptEventCoordinator = {
      handleStreamingTranscriptEvent: vi.fn().mockResolvedValue({
        status: "stale_correction",
        canonicalEvent: null
      })
    };
    const translationCoordinator = {
      handleTranscriptSegment: vi.fn().mockResolvedValue(undefined),
      activeAbortControllers: new Map(),
      sessionQueues: new Map()
    };
    const cache = {
      appendTranscriptSegment: vi.fn().mockResolvedValue(undefined),
      upsertTranscriptSegmentByIdentity: vi.fn().mockResolvedValue(undefined)
    };
    const controller = createController({ transcriptEventCoordinator, translationCoordinator, cache });
    const sttCoordinatorSpy = vi.spyOn(controller.sttCoordinator, "handleFinalizedChunk");
    const messageHandler = createMessageHandler();
    controller.registerHandlers(messageHandler);
    const session = controller.sessionManager.getOrCreateSession(7);
    session.sessionId = "session-1";
    session.replaceVideoSession(new VideoCaptionSession({
      tabId: 7,
      videoFingerprint: "video-a"
    }));

    const sendResponse = vi.fn();
    const response = await messageHandler._handleMessage(
      {
        action: LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_TRANSCRIPT_EVENT,
        type: LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_TRANSCRIPT_EVENT,
        sessionId: "session-1",
        tabId: 7,
        videoFingerprint: "video-a",
        event: {
          eventId: "event-2",
          eventType: "correction",
          providerId: "faster_whisper_streaming",
          providerMode: "streaming",
          sessionId: "session-1",
          tabId: 7,
          videoFingerprint: "video-a",
          segmentId: "segment-1",
          revision: 1,
          segmentStartMs: 0,
          segmentEndMs: 1000,
          supersedesEventId: "event-1",
          supersedesSegmentId: "segment-1",
          text: "hello world corrected",
          createdAt: 1250,
          metadata: {}
        }
      },
      { tab: { id: 7 } },
      sendResponse,
    );

    expect(transcriptEventCoordinator.handleStreamingTranscriptEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "correction",
        sessionId: "session-1",
        videoFingerprint: "video-a"
      })
    );
    await Promise.resolve();
    expect(translationCoordinator.handleTranscriptSegment).not.toHaveBeenCalled();
    expect(cache.upsertTranscriptSegmentByIdentity).not.toHaveBeenCalled();
    expect(cache.appendTranscriptSegment).not.toHaveBeenCalled();
    expect(session.activeVideoSession.transcriptSegments).toHaveLength(0);
    expect(sttCoordinatorSpy).not.toHaveBeenCalled();
    expect(response.success).toBe(true);
    expect(response.message).toBe("streaming_transcript_event_received");
    expect(sendResponse).toHaveBeenCalledTimes(1);
  });

  it("keeps streaming status events out of transcript processing", async () => {
    const transcriptEventCoordinator = {
      handleStreamingTranscriptEvent: vi.fn()
    };
    const translationCoordinator = {
      handleTranscriptSegment: vi.fn(),
      activeAbortControllers: new Map(),
      sessionQueues: new Map()
    };
    const cache = {
      appendTranscriptSegment: vi.fn().mockResolvedValue(undefined)
    };
    const controller = createController({ transcriptEventCoordinator, translationCoordinator, cache });
    const messageHandler = createMessageHandler();
    controller.registerHandlers(messageHandler);
    const session = controller.sessionManager.getOrCreateSession(7);
    session.sessionId = "session-1";
    session.replaceVideoSession(new VideoCaptionSession({
      tabId: 7,
      videoFingerprint: "video-a"
    }));

    const sendResponse = vi.fn();
    const response = await messageHandler._handleMessage(
      {
        action: LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_STATUS,
        type: LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_STATUS,
        sessionId: "session-1",
        tabId: 7,
        videoFingerprint: "video-a",
        status: "ready",
        providerId: "faster_whisper_streaming"
      },
      { tab: { id: 7 } },
      sendResponse,
    );

    expect(transcriptEventCoordinator.handleStreamingTranscriptEvent).not.toHaveBeenCalled();
    expect(translationCoordinator.handleTranscriptSegment).not.toHaveBeenCalled();
    expect(cache.appendTranscriptSegment).not.toHaveBeenCalled();
    expect(session.activeVideoSession.transcriptSegments).toHaveLength(0);
    expect(response.success).toBe(true);
    expect(response.message).toBe("streaming_status_received");
    expect(sendResponse).toHaveBeenCalledTimes(1);
  });

  it("keeps streaming error events out of transcript processing and routes fail-close", async () => {
    const transcriptEventCoordinator = {
      handleStreamingTranscriptEvent: vi.fn()
    };
    const translationCoordinator = {
      handleTranscriptSegment: vi.fn(),
      activeAbortControllers: new Map(),
      sessionQueues: new Map()
    };
    const cache = {
      appendTranscriptSegment: vi.fn().mockResolvedValue(undefined)
    };
    const controller = createController({ transcriptEventCoordinator, translationCoordinator, cache });
    const messageHandler = createMessageHandler();
    controller.registerHandlers(messageHandler);
    const session = controller.sessionManager.getOrCreateSession(7);
    session.sessionId = "session-1";
    session.replaceVideoSession(new VideoCaptionSession({
      tabId: 7,
      videoFingerprint: "video-a"
    }));
    controller.handleCoordinatorError = vi.fn();

    const sendResponse = vi.fn();
    const response = await messageHandler._handleMessage(
      {
        action: LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_ERROR,
        type: LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_ERROR,
        sessionId: "session-1",
        tabId: 7,
        videoFingerprint: "video-a",
        providerId: "faster_whisper_streaming",
        error: {
          code: "streaming_error",
          message: "socket closed"
        }
      },
      { tab: { id: 7 } },
      sendResponse,
    );

    expect(transcriptEventCoordinator.handleStreamingTranscriptEvent).not.toHaveBeenCalled();
    expect(translationCoordinator.handleTranscriptSegment).not.toHaveBeenCalled();
    expect(cache.appendTranscriptSegment).not.toHaveBeenCalled();
    expect(session.activeVideoSession.transcriptSegments).toHaveLength(0);
    expect(controller.handleCoordinatorError).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "streaming_error",
        message: "socket closed"
      }),
      expect.objectContaining({
        sessionId: "session-1",
        tabId: 7,
        videoFingerprint: "video-a"
      })
    );
    expect(response.success).toBe(true);
    expect(response.message).toBe("streaming_error_handled");
    expect(sendResponse).toHaveBeenCalledTimes(1);
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
    const transcriptEventCoordinator = createTranscriptEventCoordinatorMock();
    const cache = {
      getTranscriptSegments: vi.fn().mockResolvedValue([]),
      getTranslatedCaptionSegments: vi.fn().mockResolvedValue([])
    };
    const controller = createController({ transcriptEventCoordinator, cache });
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
    expect(transcriptEventCoordinator.clearVideoSession).toHaveBeenCalledWith({
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-old"
    });
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
