import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LiveCaptionOffscreenRuntimeShell, {
  LIVE_CAPTION_RUNTIME_ACTIONS,
  LIVE_CAPTION_RUNTIME_SHELL_STATES,
} from "./liveCaptionOffscreenRuntimeShell.js";
import { LIVE_CAPTION_RUNTIME_STATES } from "@/features/live-caption/constants/liveCaptionRuntimeStates.js";

vi.mock("@/shared/logging/logger.js", () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe("live-caption offscreen runtime shell", () => {
  // Mock MediaRecorder class
  class MockMediaRecorder {
    constructor(stream, options) {
      this.stream = stream;
      this.options = options;
      this.state = "inactive";
      this.ondataavailable = null;
      this.onstop = null;
      this.onerror = null;
      this.mimeType = options?.mimeType || "audio/webm";
      this.stopCount = 0;
      this.startCount = 0;
      MockMediaRecorder.instances.push(this);
    }

    start(timeslice) {
      this.state = "recording";
      this.timeslice = timeslice;
      this.startCount += 1;
    }

    stop() {
      this.state = "inactive";
      this.stopCount += 1;
      if (typeof this.onstop === "function") {
        this.onstop({ target: this });
      }
    }

    pause() {
      this.state = "paused";
    }

    resume() {
      this.state = "recording";
    }

    static isTypeSupported() {
      return true;
    }
  }

  // Pre-defined spy methods for MockAudioContext
  let mockClose;
  let mockDisconnect;
  let mockConnect;
  let mockTrackObj;
  let mockStreamObj;

  class MockAudioContext {
    constructor() {
      this.destination = {};
      this.close = mockClose;
    }
    createMediaStreamSource() {
      return {
        connect: mockConnect,
        disconnect: mockDisconnect,
      };
    }
  }

  class MockFileReader {
    constructor() {
      this.result = null;
      this.onloadend = null;
      this.onerror = null;
    }

    readAsDataURL(blob) {
      const mimeType = blob?.type || "audio/webm";
      this.result = `data:${mimeType};base64,${Buffer.from("mock-finalized-segment").toString("base64")}`;
      if (typeof this.onloadend === "function") {
        this.onloadend({ target: this });
      }
    }
  }

  beforeEach(() => {
    MockMediaRecorder.instances = [];
    globalThis.MediaRecorder = MockMediaRecorder;
    globalThis.FileReader = MockFileReader;

    mockClose = vi.fn().mockResolvedValue(undefined);
    mockDisconnect = vi.fn();
    mockConnect = vi.fn();
    mockTrackObj = { stop: vi.fn() };
    mockStreamObj = {
      getTracks: () => [mockTrackObj],
    };

    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn().mockResolvedValue({ success: true }),
      },
      tabCapture: {
        capture: vi.fn(),
      },
    };

    if (!globalThis.navigator.mediaDevices) {
      globalThis.navigator.mediaDevices = {};
    }

    globalThis.navigator.mediaDevices.getUserMedia = vi
      .fn()
      .mockResolvedValue(mockStreamObj);

    globalThis.AudioContext = MockAudioContext;
    if (typeof window !== "undefined") {
      window.AudioContext = MockAudioContext;
      window.webkitAudioContext = MockAudioContext;
    }
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts, pauses, resumes, statuses, and stops without media capture if streamId is not specified but behaves correctly when streamId is passed", async () => {
    const shell = new LiveCaptionOffscreenRuntimeShell();

    // Starting without streamId should fail
    const invalidStart = await shell.handleMessage(
      {
        target: "offscreen",
        action: LIVE_CAPTION_RUNTIME_ACTIONS.START,
        messageId: "message-1",
        data: {
          sessionId: "session-1",
          tabId: 7,
          videoFingerprint: "video-a",
        },
      },
      {},
    );
    expect(invalidStart.success).toBe(false);

    // Starting with streamId should succeed
    const startResponse = await shell.handleMessage(
      {
        target: "offscreen",
        action: LIVE_CAPTION_RUNTIME_ACTIONS.START,
        messageId: "message-1",
        data: {
          sessionId: "session-1",
          tabId: 7,
          videoFingerprint: "video-a",
          streamId: "mock-stream-id",
        },
      },
      {},
    );

    expect(startResponse.success).toBe(true);
    expect(startResponse.status).toBe(
      LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL,
    );

    const statusResponse = await shell.handleMessage(
      {
        target: "offscreen",
        action: LIVE_CAPTION_RUNTIME_ACTIONS.STATUS,
        data: {
          sessionId: "session-1",
          tabId: 7,
          videoFingerprint: "video-a",
        },
      },
      {},
    );
    expect(statusResponse.status).toBe(
      LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL,
    );

    const pauseResponse = await shell.handleMessage(
      {
        target: "offscreen",
        action: LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE,
        data: {
          sessionId: "session-1",
          tabId: 7,
          videoFingerprint: "video-a",
        },
      },
      {},
    );
    expect(pauseResponse.status).toBe(
      LIVE_CAPTION_RUNTIME_SHELL_STATES.PAUSED_SHELL,
    );
    expect(shell.captureState).toBe("paused");

    const resumeResponse = await shell.handleMessage(
      {
        target: "offscreen",
        action: LIVE_CAPTION_RUNTIME_ACTIONS.RESUME,
        data: {
          sessionId: "session-1",
          tabId: 7,
          videoFingerprint: "video-a",
        },
      },
      {},
    );
    expect(resumeResponse.status).toBe(
      LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL,
    );
    expect(shell.captureState).toBe("capturing");

    const stopResponse = await shell.handleMessage(
      {
        target: "offscreen",
        action: LIVE_CAPTION_RUNTIME_ACTIONS.STOP,
        data: {
          sessionId: "session-1",
          tabId: 7,
          videoFingerprint: "video-a",
        },
      },
      {},
    );
    expect(stopResponse.status).toBe(LIVE_CAPTION_RUNTIME_SHELL_STATES.IDLE);
    expect(shell.getSnapshot().status).toBe(
      LIVE_CAPTION_RUNTIME_SHELL_STATES.IDLE,
    );
  });

  it("fails closed for invalid, unknown, and inconsistent payloads", async () => {
    const shell = new LiveCaptionOffscreenRuntimeShell();

    const invalid = await shell.handleMessage(
      { target: "offscreen", action: LIVE_CAPTION_RUNTIME_ACTIONS.START },
      {},
    );
    const unknown = await shell.handleMessage(
      { target: "offscreen", action: "unknown", data: {} },
      {},
    );

    shell._setSessionContext({
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-a",
    });
    shell.status = LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL;
    shell.runtimeState = LIVE_CAPTION_RUNTIME_STATES.RUNNING;

    const inconsistent = await shell.handleMessage(
      {
        target: "offscreen",
        action: LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE,
        data: {
          sessionId: "session-2",
          tabId: 7,
          videoFingerprint: "video-b",
        },
      },
      {},
    );

    expect(invalid.success).toBe(false);
    expect(invalid.status).toBe(LIVE_CAPTION_RUNTIME_SHELL_STATES.ERROR);
    expect(unknown.success).toBe(false);
    expect(unknown.error.code).toBeDefined();
    expect(inconsistent.success).toBe(false);
    expect(inconsistent.error.reason).toBe("inconsistent_session");
    expect(inconsistent.error.code).toBe("inconsistent_session");
  });

  it("buffers recorder data and emits a finalized chunk blob only after recorder stop", async () => {
    const shell = new LiveCaptionOffscreenRuntimeShell();
    const mockSendMessage = vi.spyOn(globalThis.chrome.runtime, "sendMessage");
    vi.useFakeTimers();

    const startResponse = await shell.handleMessage(
      {
        target: "offscreen",
        action: LIVE_CAPTION_RUNTIME_ACTIONS.START,
        messageId: "msg-start",
        data: {
          sessionId: "session-1",
          tabId: 7,
          videoFingerprint: "video-a",
          streamId: "mock-stream-id",
          metadata: { chunkTimeslice: 10000 },
        },
      },
      {},
    );

    expect(startResponse.success).toBe(true);
    expect(shell.captureState).toBe("capturing");
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();

    expect(MockMediaRecorder.instances.length).toBe(1);
    const recorderInstance = MockMediaRecorder.instances[0];
    expect(recorderInstance.state).toBe("recording");
    expect(recorderInstance.timeslice).toBeUndefined();

    const bufferedBlob = new Blob([new Uint8Array(2048).fill(1)], { type: "audio/webm" });
    recorderInstance.ondataavailable({ data: bufferedBlob });
    expect(mockSendMessage).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10000);
    await Promise.resolve();

    expect(recorderInstance.stopCount).toBe(1);
    expect(MockMediaRecorder.instances.length).toBe(2);
    expect(MockMediaRecorder.instances[0].state).toBe("inactive");
    expect(MockMediaRecorder.instances[1].state).toBe("recording");

    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "live-caption/offscreen/finalized-chunk",
        sessionId: "session-1",
        tabId: 7,
        videoFingerprint: "video-a",
        chunkStartMs: 0,
        chunkEndMs: 10000,
        mimeType: "audio/webm;codecs=opus",
        sizeBytes: expect.any(Number),
        chunkPayload: expect.stringMatching(/^data:audio\/webm(;codecs=opus)?;base64,/),
        payloadKind: "base64",
      }),
    );

    const emittedMessage = mockSendMessage.mock.calls[0][0];
    expect(typeof emittedMessage.chunkPayload).toBe("string");
    expect(emittedMessage.chunkPayload.startsWith("data:audio/webm")).toBe(true);
    expect(emittedMessage.sizeBytes).toBeGreaterThanOrEqual(bufferedBlob.size);
    expect(shell.chunkStartMs).toBe(10000);
  });

  it("skips zero and tiny finalized segments before forwarding", async () => {
    const shell = new LiveCaptionOffscreenRuntimeShell();
    const mockSendMessage = vi.spyOn(globalThis.chrome.runtime, "sendMessage");
    vi.useFakeTimers();

    await shell.handleMessage(
      {
        target: "offscreen",
        action: LIVE_CAPTION_RUNTIME_ACTIONS.START,
        data: {
          sessionId: "session-1",
          tabId: 7,
          videoFingerprint: "video-a",
          streamId: "mock-stream-id",
        },
      },
      {},
    );

    const recorderInstance = MockMediaRecorder.instances[0];
    mockSendMessage.mockClear();

    recorderInstance.ondataavailable({ data: { size: 0 } });
    recorderInstance.ondataavailable({ data: new Blob([new Uint8Array(16).fill(1)], { type: "audio/webm" }) });

    await vi.advanceTimersByTimeAsync(10000);
    await Promise.resolve();

    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("cleans up all media tracks, recorder, and AudioContext on stop", async () => {
    const shell = new LiveCaptionOffscreenRuntimeShell();
    const mockSendMessage = vi.spyOn(globalThis.chrome.runtime, "sendMessage");
    await shell.handleMessage(
      {
        target: "offscreen",
        action: LIVE_CAPTION_RUNTIME_ACTIONS.START,
        data: {
          sessionId: "session-1",
          tabId: 7,
          videoFingerprint: "video-a",
          streamId: "mock-stream-id",
        },
      },
      {},
    );

    const stopResponse = await shell.handleMessage(
      {
        target: "offscreen",
        action: LIVE_CAPTION_RUNTIME_ACTIONS.STOP,
        data: {
          sessionId: "session-1",
          tabId: 7,
          videoFingerprint: "video-a",
        },
      },
      {},
    );

    expect(stopResponse.success).toBe(true);
    expect(shell.captureState).toBe("idle");
    expect(shell.mediaStream).toBeNull();
    expect(shell.mediaRecorder).toBeNull();
    expect(shell.audioCtx).toBeNull();
    expect(shell.audioSource).toBeNull();
    expect(mockSendMessage).not.toHaveBeenCalled();

    expect(mockTrackObj.stop).toHaveBeenCalled();
    expect(mockClose).toHaveBeenCalled();
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it("ensures stop is idempotent and handles inactive recorder safely", async () => {
    const shell = new LiveCaptionOffscreenRuntimeShell();

    const stopResponse = await shell.handleMessage(
      {
        target: "offscreen",
        action: LIVE_CAPTION_RUNTIME_ACTIONS.STOP,
        data: {
          sessionId: "session-1",
          tabId: 7,
          videoFingerprint: "video-a",
        },
      },
      {},
    );

    expect(stopResponse.success).toBe(true);
    expect(shell.captureState).toBe("idle");
  });

  it("fails closed and cleans up on getUserMedia failure", async () => {
    navigator.mediaDevices.getUserMedia.mockRejectedValueOnce(
      new Error("Permission denied"),
    );
    const shell = new LiveCaptionOffscreenRuntimeShell();

    const startResponse = await shell.handleMessage(
      {
        target: "offscreen",
        action: LIVE_CAPTION_RUNTIME_ACTIONS.START,
        data: {
          sessionId: "session-1",
          tabId: 7,
          videoFingerprint: "video-a",
          streamId: "mock-stream-id",
        },
      },
      {},
    );

    expect(startResponse.success).toBe(false);
    expect(startResponse.status).toBe(LIVE_CAPTION_RUNTIME_SHELL_STATES.ERROR);
    expect(shell.captureState).toBe("idle");
  });

  it("fails closed on MediaRecorder runtime error and sends error message to background", async () => {
    const shell = new LiveCaptionOffscreenRuntimeShell();
    const mockSendMessage = vi.spyOn(globalThis.chrome.runtime, "sendMessage");

    await shell.handleMessage(
      {
        target: "offscreen",
        action: LIVE_CAPTION_RUNTIME_ACTIONS.START,
        data: {
          sessionId: "session-1",
          tabId: 7,
          videoFingerprint: "video-a",
          streamId: "mock-stream-id",
        },
      },
      {},
    );

    const recorderInstance = MockMediaRecorder.instances[0];

    // Simulate error
    recorderInstance.onerror({ error: new Error("Recorder crashed") });

    expect(shell.captureState).toBe("error");
    expect(shell.runtimeState).toBe(LIVE_CAPTION_RUNTIME_STATES.ERROR);
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "live-caption/offscreen/capture-error",
        sessionId: "session-1",
        tabId: 7,
        videoFingerprint: "video-a",
        error: expect.objectContaining({
          code: "capture_runtime_error",
          message: "Recorder crashed",
        }),
      }),
    );
  });
});
