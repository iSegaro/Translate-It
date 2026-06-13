import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LiveCaptionOffscreenRuntimeShell, {
  LIVE_CAPTION_RUNTIME_ACTIONS,
  LIVE_CAPTION_RUNTIME_SHELL_STATES,
} from "./liveCaptionOffscreenRuntimeShell.js";
import { LIVE_CAPTION_RUNTIME_STATES } from "@/features/live-caption/constants/liveCaptionRuntimeStates.js";
import { LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES } from "@/features/live-caption/background/liveCaptionOffscreenContracts.js";
import {
  FASTER_WHISPER_STREAMING_PROVIDER_ID
} from "@/features/live-caption/stt/providers/FasterWhisperStreamingProvider.js";

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

  function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });

    return { promise, resolve, reject };
  }

  function createStreamingProviderFactory({
    startSessionImpl,
    stopSessionImpl,
    destroyImpl
  } = {}) {
    const provider = {
      providerId: FASTER_WHISPER_STREAMING_PROVIDER_ID,
      eventSink: null,
      logger: null,
      state: "idle",
      session: null,
      handleAudioChunk: vi.fn(),
      startSession: vi.fn(startSessionImpl ?? (async (sessionConfig) => {
        provider.state = "active";
        provider.session = { ...sessionConfig };
        return {
          handled: true,
          status: "ready",
          providerId: provider.providerId,
          sessionId: sessionConfig.sessionId,
          tabId: sessionConfig.tabId,
          videoFingerprint: sessionConfig.videoFingerprint,
          readyPayload: {
            type: "ready",
            sessionId: sessionConfig.sessionId
          }
        };
      })),
      stopSession: vi.fn(stopSessionImpl ?? (async () => {
        provider.state = "closed";
        return {
          handled: true,
          status: "closed",
          providerId: provider.providerId,
          sessionId: provider.session?.sessionId ?? null,
          tabId: provider.session?.tabId ?? null,
          videoFingerprint: provider.session?.videoFingerprint ?? null
        };
      })),
      destroy: vi.fn(destroyImpl ?? (async () => {
        provider.state = "destroyed";
        return {
          handled: true,
          status: "destroyed",
          providerId: provider.providerId,
          sessionId: provider.session?.sessionId ?? null,
          tabId: provider.session?.tabId ?? null,
          videoFingerprint: provider.session?.videoFingerprint ?? null
        };
      }))
    };

    return {
      provider,
      factory: vi.fn(({ providerId, eventSink, logger }) => {
        provider.providerId = providerId ?? provider.providerId;
        provider.eventSink = eventSink ?? null;
        provider.logger = logger ?? null;
        return provider;
      })
    };
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

  it("hosts a streaming provider, waits for ready, and keeps MediaRecorder untouched", async () => {
    const { provider, factory } = createStreamingProviderFactory();
    const shell = new LiveCaptionOffscreenRuntimeShell({
      streamingProviderFactory: factory
    });

    const startDeferred = createDeferred();
    provider.startSession.mockImplementation(() => startDeferred.promise);

    const startPromise = shell.handleMessage(
      {
        target: "offscreen",
        type: LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.START_STREAMING_STT_SESSION,
        sessionId: "session-1",
        tabId: 7,
        videoFingerprint: "video-a",
        providerId: FASTER_WHISPER_STREAMING_PROVIDER_ID,
        providerMode: "streaming",
        executionLocation: "offscreen",
        sourceLanguage: "en",
        targetLanguage: "fa",
        providerOptions: {
          model: "base"
        },
        metadata: {
          origin: "shell-test"
        }
      },
      {},
    );

    await Promise.resolve();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(provider.startSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        tabId: 7,
        videoFingerprint: "video-a",
        sourceLanguage: "en",
        targetLanguage: "fa",
        providerOptions: {
          model: "base"
        },
        metadata: {
          origin: "shell-test"
        }
      }),
      expect.objectContaining({
        providerOptions: {
          model: "base"
        },
        metadata: {
          origin: "shell-test"
        }
      })
    );
    expect(MockMediaRecorder.instances.length).toBe(0);

    let settled = false;
    startPromise.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    startDeferred.resolve({
      handled: true,
      status: "ready",
      providerId: FASTER_WHISPER_STREAMING_PROVIDER_ID,
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-a",
      readyPayload: {
        type: "ready",
        sessionId: "session-1",
        serverReady: true
      }
    });

    const startResponse = await startPromise;
    expect(startResponse.success).toBe(true);
    expect(startResponse.status).toBe("OK");
    expect(startResponse.message).toBe("streaming_stt_active");
    expect(shell.streamingProvider).toBe(provider);
    expect(shell.streamingSessionContext).toMatchObject({
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-a",
      providerId: FASTER_WHISPER_STREAMING_PROVIDER_ID,
      state: "active"
    });
  });

  it("forwards streaming provider events to background, clears ownership on error, and ignores stale sessions", async () => {
    const { provider, factory } = createStreamingProviderFactory();
    const shell = new LiveCaptionOffscreenRuntimeShell({
      streamingProviderFactory: factory
    });

    provider.startSession.mockResolvedValue({
      handled: true,
      status: "ready",
      providerId: FASTER_WHISPER_STREAMING_PROVIDER_ID,
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-a",
      readyPayload: { type: "ready", sessionId: "session-1" }
    });

    await shell.handleMessage(
      {
        target: "offscreen",
        type: LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.START_STREAMING_STT_SESSION,
        sessionId: "session-1",
        tabId: 7,
        videoFingerprint: "video-a",
        providerId: FASTER_WHISPER_STREAMING_PROVIDER_ID,
        providerMode: "streaming",
        executionLocation: "offscreen"
      },
      {},
    );

    globalThis.chrome.runtime.sendMessage.mockClear();

    provider.eventSink.emit({
      type: "status",
      providerId: FASTER_WHISPER_STREAMING_PROVIDER_ID,
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-a",
      state: "ready",
      details: {
        ready: true
      }
    });

    provider.eventSink.emit({
      type: "transcript",
      providerId: FASTER_WHISPER_STREAMING_PROVIDER_ID,
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-a",
      event: {
        eventType: "final",
        providerId: FASTER_WHISPER_STREAMING_PROVIDER_ID,
        providerMode: "streaming",
        sessionId: "session-1",
        tabId: 7,
        videoFingerprint: "video-a",
        segmentId: "segment-1",
        revision: 1,
        segmentStartMs: 100,
        segmentEndMs: 420,
        text: "hello world",
        sourceLanguage: "en",
        confidence: 0.93,
        createdAt: 1234,
        metadata: {
          providerProtocol: "faster_whisper_streaming_ws"
        }
      }
    });

    provider.eventSink.emit({
      type: "error",
      providerId: FASTER_WHISPER_STREAMING_PROVIDER_ID,
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-a",
      error: {
        code: "streaming_error",
        message: "socket closed"
      }
    });

    provider.eventSink.emit({
      type: "error",
      providerId: FASTER_WHISPER_STREAMING_PROVIDER_ID,
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-a",
      error: {
        code: "streaming_error",
        message: "socket closed"
      }
    });

    expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      action: LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_STATUS,
      type: LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_STATUS,
      source: "offscreen",
      target: "background",
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-a",
      providerId: FASTER_WHISPER_STREAMING_PROVIDER_ID,
      status: "ready"
    }));
    expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      action: LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_TRANSCRIPT_EVENT,
      type: LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_TRANSCRIPT_EVENT,
      source: "offscreen",
      target: "background",
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-a"
    }));
    expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      action: LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_ERROR,
      type: LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_ERROR,
      source: "offscreen",
      target: "background",
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-a",
      providerId: FASTER_WHISPER_STREAMING_PROVIDER_ID
    }));
    expect(shell.streamingProvider).toBeNull();
    expect(shell.streamingSessionContext).toBeNull();

    globalThis.chrome.runtime.sendMessage.mockClear();
    provider.eventSink.emit({
      type: "status",
      providerId: FASTER_WHISPER_STREAMING_PROVIDER_ID,
      sessionId: "stale-session",
      tabId: 7,
      videoFingerprint: "video-a",
      state: "ready"
    });

    expect(globalThis.chrome.runtime.sendMessage).not.toHaveBeenCalled();
    expect(MockMediaRecorder.instances.length).toBe(0);

    const staleTranscriptResponse = await shell.handleMessage(
      {
        target: "offscreen",
        type: LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_TRANSCRIPT_EVENT,
        sessionId: "stale-session",
        tabId: 7,
        videoFingerprint: "video-a",
        event: {
          eventType: "final",
          providerId: FASTER_WHISPER_STREAMING_PROVIDER_ID,
          providerMode: "streaming",
          sessionId: "stale-session",
          tabId: 7,
          videoFingerprint: "video-a",
          segmentId: "segment-stale",
          revision: 1,
          segmentStartMs: 0,
          segmentEndMs: 10,
          text: "ignored",
          sourceLanguage: "en",
          confidence: 1,
          createdAt: 1,
          metadata: {}
        }
      },
      {},
    );

    expect(staleTranscriptResponse.success).toBe(true);
    expect(staleTranscriptResponse.message).toBe("streaming_stale_session");
    expect(globalThis.chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it("routes finalized blobs to the active streaming provider without base64 serialization", async () => {
    const { provider, factory } = createStreamingProviderFactory();
    const shell = new LiveCaptionOffscreenRuntimeShell({
      streamingProviderFactory: factory
    });

    provider.startSession.mockResolvedValue({
      handled: true,
      status: "ready",
      providerId: FASTER_WHISPER_STREAMING_PROVIDER_ID,
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-a",
      readyPayload: { type: "ready", sessionId: "session-1" }
    });

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

    await shell.handleMessage(
      {
        target: "offscreen",
        type: LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.START_STREAMING_STT_SESSION,
        sessionId: "session-1",
        tabId: 7,
        videoFingerprint: "video-a",
        providerId: FASTER_WHISPER_STREAMING_PROVIDER_ID,
        providerMode: "streaming",
        executionLocation: "offscreen"
      },
      {},
    );

    globalThis.chrome.runtime.sendMessage.mockClear();
    provider.handleAudioChunk.mockClear();

    const recorderInstance = MockMediaRecorder.instances[0];
    const finalizedBlob = new Blob([new Uint8Array(16).fill(1)], { type: "audio/webm" });
    recorderInstance.ondataavailable({ data: finalizedBlob });
    shell.segmentRotationPending = true;
    recorderInstance.stop();

    await Promise.resolve();
    await Promise.resolve();

    expect(provider.handleAudioChunk).toHaveBeenCalledTimes(1);
    expect(provider.handleAudioChunk).toHaveBeenCalledWith(
      expect.any(Blob),
      expect.objectContaining({
        sessionId: "session-1",
        tabId: 7,
        videoFingerprint: "video-a"
      })
    );
    expect(provider.handleAudioChunk.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(provider.handleAudioChunk.mock.calls[0][0].size).toBe(finalizedBlob.size);
    expect(globalThis.chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        action: "live-caption/offscreen/finalized-chunk"
      })
    );
  });

  it("routes small finalized blobs to the active streaming provider and ignores base64 serialization", async () => {
    const { provider, factory } = createStreamingProviderFactory();
    const shell = new LiveCaptionOffscreenRuntimeShell({
      streamingProviderFactory: factory
    });

    provider.startSession.mockResolvedValue({
      handled: true,
      status: "ready",
      providerId: FASTER_WHISPER_STREAMING_PROVIDER_ID,
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-a",
      readyPayload: { type: "ready", sessionId: "session-1" }
    });

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

    await shell.handleMessage(
      {
        target: "offscreen",
        type: LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.START_STREAMING_STT_SESSION,
        sessionId: "session-1",
        tabId: 7,
        videoFingerprint: "video-a",
        providerId: FASTER_WHISPER_STREAMING_PROVIDER_ID,
        providerMode: "streaming",
        executionLocation: "offscreen"
      },
      {},
    );

    globalThis.chrome.runtime.sendMessage.mockClear();
    provider.handleAudioChunk.mockClear();

    const recorderInstance = MockMediaRecorder.instances[0];
    const smallBlob = new Blob([new Uint8Array(16).fill(1)], { type: "audio/webm" });
    recorderInstance.ondataavailable({ data: smallBlob });
    shell.segmentRotationPending = true;
    recorderInstance.stop();

    await Promise.resolve();
    await Promise.resolve();

    expect(provider.handleAudioChunk).toHaveBeenCalledTimes(1);
    expect(provider.handleAudioChunk.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(provider.handleAudioChunk.mock.calls[0][0].size).toBe(smallBlob.size);
    expect(globalThis.chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        action: "live-caption/offscreen/finalized-chunk"
      })
    );
  });

  it("emits provider error behavior when streaming finalized chunk handling fails", async () => {
    const providerError = new Error("chunk failure");
    const { provider, factory } = createStreamingProviderFactory({
      startSessionImpl: vi.fn(async (sessionConfig) => {
        provider.state = "active";
        provider.session = { ...sessionConfig };
        return {
          handled: true,
          status: "ready",
          providerId: provider.providerId,
          sessionId: sessionConfig.sessionId,
          tabId: sessionConfig.tabId,
          videoFingerprint: sessionConfig.videoFingerprint,
          readyPayload: { type: "ready", sessionId: sessionConfig.sessionId }
        };
      })
    });
    provider.handleAudioChunk.mockRejectedValue(providerError);
    const shell = new LiveCaptionOffscreenRuntimeShell({
      streamingProviderFactory: factory
    });

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

    await shell.handleMessage(
      {
        target: "offscreen",
        type: LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.START_STREAMING_STT_SESSION,
        sessionId: "session-1",
        tabId: 7,
        videoFingerprint: "video-a",
        providerId: FASTER_WHISPER_STREAMING_PROVIDER_ID,
        providerMode: "streaming",
        executionLocation: "offscreen"
      },
      {},
    );

    globalThis.chrome.runtime.sendMessage.mockClear();

    const recorderInstance = MockMediaRecorder.instances[0];
    recorderInstance.ondataavailable({ data: new Blob([new Uint8Array(2048).fill(1)], { type: "audio/webm" }) });
    shell.segmentRotationPending = true;
    recorderInstance.stop();

    await Promise.resolve();
    await Promise.resolve();

    expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_ERROR,
        source: "offscreen",
        target: "background",
        sessionId: "session-1",
        tabId: 7,
        videoFingerprint: "video-a",
        providerId: FASTER_WHISPER_STREAMING_PROVIDER_ID,
        error: expect.objectContaining({
          code: "streaming_chunk_error"
        })
      })
    );
    expect(shell.streamingProvider).toBeNull();
    expect(shell.streamingSessionContext).toBeNull();
  });

  it("forwards closed events and clears streaming ownership", async () => {
    const { provider, factory } = createStreamingProviderFactory();
    const shell = new LiveCaptionOffscreenRuntimeShell({
      streamingProviderFactory: factory
    });

    provider.startSession.mockResolvedValue({
      handled: true,
      status: "ready",
      providerId: FASTER_WHISPER_STREAMING_PROVIDER_ID,
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-a",
      readyPayload: { type: "ready", sessionId: "session-1" }
    });

    await shell.handleMessage(
      {
        target: "offscreen",
        type: LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.START_STREAMING_STT_SESSION,
        sessionId: "session-1",
        tabId: 7,
        videoFingerprint: "video-a",
        providerId: FASTER_WHISPER_STREAMING_PROVIDER_ID,
        providerMode: "streaming",
        executionLocation: "offscreen"
      },
      {},
    );

    globalThis.chrome.runtime.sendMessage.mockClear();
    provider.eventSink.emit({
      type: "closed",
      providerId: FASTER_WHISPER_STREAMING_PROVIDER_ID,
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-a",
      reason: "stop"
    });

    expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_STATUS,
      source: "offscreen",
      target: "background",
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-a",
      providerId: FASTER_WHISPER_STREAMING_PROVIDER_ID,
      status: "closed"
    }));
    expect(shell.streamingProvider).toBeNull();
    expect(shell.streamingSessionContext).toBeNull();
  });

  it("stops the streaming provider idempotently and clears shell state", async () => {
    const { provider, factory } = createStreamingProviderFactory();
    const shell = new LiveCaptionOffscreenRuntimeShell({
      streamingProviderFactory: factory
    });

    provider.startSession.mockResolvedValue({
      handled: true,
      status: "ready",
      providerId: FASTER_WHISPER_STREAMING_PROVIDER_ID,
      sessionId: "session-1",
      tabId: 7,
      videoFingerprint: "video-a",
      readyPayload: { type: "ready", sessionId: "session-1" }
    });

    await shell.handleMessage(
      {
        target: "offscreen",
        type: LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.START_STREAMING_STT_SESSION,
        sessionId: "session-1",
        tabId: 7,
        videoFingerprint: "video-a",
        providerId: FASTER_WHISPER_STREAMING_PROVIDER_ID,
        providerMode: "streaming",
        executionLocation: "offscreen"
      },
      {},
    );

    const stopResponse = await shell.handleMessage(
      {
        target: "offscreen",
        type: LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STOP_STREAMING_STT_SESSION,
        sessionId: "session-1",
        tabId: 7,
        videoFingerprint: "video-a",
        providerId: FASTER_WHISPER_STREAMING_PROVIDER_ID
      },
      {},
    );

    const secondStop = await shell.handleMessage(
      {
        target: "offscreen",
        type: LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STOP_STREAMING_STT_SESSION,
        sessionId: "session-1",
        tabId: 7,
        videoFingerprint: "video-a",
        providerId: FASTER_WHISPER_STREAMING_PROVIDER_ID
      },
      {},
    );

    expect(provider.stopSession).toHaveBeenCalledTimes(1);
    expect(stopResponse.success).toBe(true);
    expect(stopResponse.message).toBe("streaming_stt_closed");
    expect(secondStop.success).toBe(true);
    expect(shell.streamingProvider).toBeNull();
    expect(shell.streamingSessionContext).toBeNull();
  });

  it("returns no-op success when stop is called without an active streaming provider", async () => {
    const shell = new LiveCaptionOffscreenRuntimeShell();

    const stopResponse = await shell.handleMessage(
      {
        target: "offscreen",
        type: LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STOP_STREAMING_STT_SESSION,
        sessionId: "session-1",
        tabId: 7,
        videoFingerprint: "video-a"
      },
      {},
    );

    expect(stopResponse.success).toBe(true);
    expect(stopResponse.status).toBe("OK");
    expect(stopResponse.message).toBe("streaming_stt_no_op");
  });

  it("returns deterministic error responses when streaming provider startup fails", async () => {
    const providerError = new Error("boom");
    providerError.code = "ready_timeout";
    const { factory } = createStreamingProviderFactory({
      startSessionImpl: vi.fn().mockRejectedValue(providerError)
    });
    const shell = new LiveCaptionOffscreenRuntimeShell({
      streamingProviderFactory: factory
    });

    const startResponse = await shell.handleMessage(
      {
        target: "offscreen",
        type: LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.START_STREAMING_STT_SESSION,
        sessionId: "session-1",
        tabId: 7,
        videoFingerprint: "video-a",
        providerId: FASTER_WHISPER_STREAMING_PROVIDER_ID,
        providerMode: "streaming",
        executionLocation: "offscreen"
      },
      {},
    );

    expect(startResponse.success).toBe(false);
    expect(startResponse.status).toBe("FAIL_CLOSED");
    expect(startResponse.error.code).toBe("ready_timeout");
    expect(startResponse.error.reason).toBe("provider_error");
    expect(shell.streamingProvider).toBeNull();
    expect(shell.streamingSessionContext).toBeNull();
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
