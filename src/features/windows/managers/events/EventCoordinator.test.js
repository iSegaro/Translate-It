import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockGetPresentation, mockShowWindow, mockUpdateWindow } = vi.hoisted(
  () => ({
    mockGetPresentation: vi.fn(),
    mockShowWindow: vi.fn(),
    mockUpdateWindow: vi.fn(),
  }),
);

vi.mock("../display/SelectionWindowErrorPresenter.js", () => ({
  getSelectionWindowErrorPresentation: mockGetPresentation,
}));

vi.mock("@/shared/logging/logger.js", () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock("@/shared/config/config.js", () => ({
  state: {},
}));

vi.mock("@/core/PageEventBus.js", () => ({
  pageEventBus: { on: vi.fn(), off: vi.fn() },
  WindowsManagerEvents: {
    showWindow: mockShowWindow,
    updateWindow: mockUpdateWindow,
  },
  WINDOWS_MANAGER_EVENTS: {},
}));

vi.mock("@/features/text-selection/events/SelectionEvents.js", () => ({
  SELECTION_EVENTS: {},
}));

import { EventCoordinator } from "./EventCoordinator.js";
import { getTextSelectionWindowRelay } from "../crossframe/TextSelectionWindowRelay.js";

describe("EventCoordinator cross-frame coordinate adjustment", () => {
  let facade;
  let coordinator;

  beforeEach(() => {
    vi.clearAllMocks();
    facade = { show: vi.fn() };
    coordinator = new EventCoordinator(facade, {
      state: {},
      crossFrameManager: { isTopFrame: true, setEventHandlers: vi.fn() },
      translationHandler: {},
      errorHandler: {},
      clickManager: { setHandlers: vi.fn() },
      themeManager: {},
      positionCalculator: {},
    });
  });

  afterEach(() => {
    getTextSelectionWindowRelay().destroy();
    vi.restoreAllMocks();
  });

  const stubIframes = (frames) => {
    vi.spyOn(document, "querySelectorAll").mockImplementation((selector) => {
      if (selector === "iframe") return frames;
      return [];
    });
  };

  const sourceWindow = { frame: true };

  it("adds iframeRect.left/top exactly once for a matching iframe sourceWindow", async () => {
    stubIframes([
      {
        contentWindow: sourceWindow,
        getBoundingClientRect: () => ({ left: 150, top: 300 }),
      },
    ]);

    await coordinator._handleTextSelectionWindowRequest(
      { position: { x: 100, y: 200 }, selectedText: "hello", options: {} },
      sourceWindow,
    );

    expect(facade.show).toHaveBeenCalledTimes(1);
    const [, position] = facade.show.mock.calls[0];
    expect(position.x).toBe(250); // 100 + 150, added once
    expect(position.y).toBe(500); // 200 + 300, added once
  });

  it("marks the adjusted position as viewport-relative and non-absolute", async () => {
    stubIframes([
      {
        contentWindow: sourceWindow,
        getBoundingClientRect: () => ({ left: 150, top: 300 }),
      },
    ]);

    await coordinator._handleTextSelectionWindowRequest(
      { position: { x: 100, y: 200 }, selectedText: "hello", options: {} },
      sourceWindow,
    );

    const [, position] = facade.show.mock.calls[0];
    expect(position._isViewportRelative).toBe(true);
    expect(position._isAbsolute).toBe(false);
  });

  it("does NOT add top-page scroll separately (iframeRect is already viewport-relative)", async () => {
    vi.stubGlobal("scrollX", 40);
    vi.stubGlobal("scrollY", 50);
    stubIframes([
      {
        contentWindow: sourceWindow,
        getBoundingClientRect: () => ({ left: 150, top: 300 }),
      },
    ]);

    await coordinator._handleTextSelectionWindowRequest(
      { position: { x: 100, y: 200 }, selectedText: "hello", options: {} },
      sourceWindow,
    );

    const [, position] = facade.show.mock.calls[0];
    expect(position.x).toBe(250); // not 250 + 40
    expect(position.y).toBe(500); // not 500 + 50
    vi.unstubAllGlobals();
  });

  it("passes the raw position unchanged when sourceWindow does not match any iframe", async () => {
    stubIframes([
      {
        contentWindow: { other: true },
        getBoundingClientRect: () => ({ left: 150, top: 300 }),
      },
    ]);

    await coordinator._handleTextSelectionWindowRequest(
      { position: { x: 100, y: 200 }, selectedText: "hello", options: {} },
      sourceWindow,
    );

    // Document current behavior: no fallback, no adjustment.
    const [, position] = facade.show.mock.calls[0];
    expect(position).toEqual({ x: 100, y: 200 });
    expect(position._isViewportRelative).toBeUndefined();
  });

  it("ignores the request when not running in the top frame", async () => {
    coordinator.crossFrameManager.isTopFrame = false;

    await coordinator._handleTextSelectionWindowRequest(
      { position: { x: 100, y: 200 }, selectedText: "hello", options: {} },
      sourceWindow,
    );

    expect(facade.show).not.toHaveBeenCalled();
  });
});

describe("EventCoordinator relay sink ownership", () => {
  let facade;
  let coordinator;

  beforeEach(() => {
    vi.clearAllMocks();
    facade = { show: vi.fn() };
    coordinator = new EventCoordinator(facade, {
      state: {},
      crossFrameManager: { isTopFrame: true, setEventHandlers: vi.fn() },
      translationHandler: {},
      errorHandler: {},
      clickManager: { setHandlers: vi.fn() },
      themeManager: {},
      positionCalculator: {},
    });
  });

  afterEach(() => {
    getTextSelectionWindowRelay().destroy();
    vi.restoreAllMocks();
  });

  it("setup registers a sink and cleanup clears exactly it", () => {
    const relay = getTextSelectionWindowRelay();
    coordinator.setup();

    const registered = relay._sink;
    expect(registered).toBeTypeOf("function");

    coordinator.cleanup();
    expect(relay._sink).toBeNull();
  });

  it("cleanup never clears a replacement sink registered after setup", () => {
    const relay = getTextSelectionWindowRelay();
    coordinator.setup();

    const replacement = vi.fn();
    relay.setSink(replacement);

    coordinator.cleanup();
    expect(relay._sink).toBe(replacement);
  });
});

describe("EventCoordinator iframe window creation error boundary", () => {
  let facade;
  let coordinator;
  let errorHandler;
  let crossFrameManager;
  let state;

  beforeEach(() => {
    vi.clearAllMocks();
    errorHandler = { getErrorForUI: vi.fn() };
    state = {
      setOriginalText: vi.fn(),
      setTranslationCancelled: vi.fn(),
      setIconMode: vi.fn(),
      setVisible: vi.fn(),
    };
    crossFrameManager = {
      isTopFrame: true,
      notifyWindowCreated: vi.fn(),
    };
    facade = {
      _startTranslationProcess: vi.fn(),
    };
    mockGetPresentation.mockResolvedValue({
      displayError: new Error("safe iframe message"),
      errorInfo: {
        message: "safe iframe message",
        type: "HTTP_ERROR",
      },
      canonicalType: "HTTP_ERROR",
    });
    coordinator = new EventCoordinator(facade, {
      state,
      crossFrameManager,
      translationHandler: {},
      errorHandler,
      clickManager: { setHandlers: vi.fn() },
      themeManager: {},
      positionCalculator: {},
    });
  });

  it("uses safe presentation while preserving iframe error payload shape", async () => {
    const canonicalError = Object.assign(
      new Error("raw iframe provider detail"),
      {
        type: "HTTP_ERROR",
        statusCode: 502,
        providerName: "Private Provider",
        providerId: "private-provider",
      },
    );
    facade._startTranslationProcess.mockRejectedValue(canonicalError);

    await coordinator._handleWindowCreationRequest({
      selectedText: "selected text",
      position: { x: 10, y: 20 },
      frameId: "frame-1",
    });
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(facade._startTranslationProcess).toHaveBeenCalled();
    expect(mockShowWindow).toHaveBeenCalled();
    expect(mockGetPresentation).toHaveBeenCalledWith(
      canonicalError,
      "windows-translation",
      errorHandler,
    );
    expect(mockUpdateWindow).toHaveBeenCalledTimes(1);
    const [, payload] = mockUpdateWindow.mock.calls[0];
    expect(payload).toMatchObject({
      initialSize: "normal",
      isLoading: false,
      isStreaming: false,
      isError: true,
      errorType: "HTTP_ERROR",
      initialTranslatedText: expect.not.stringContaining("raw"),
    });
    expect(payload.initialTranslatedText).not.toContain("raw");
    expect(payload).not.toHaveProperty("canRetry");
    expect(payload).not.toHaveProperty("needsSettings");
    expect(payload).not.toHaveProperty("provider");
  });

  it("does not update iframe window when presenter excludes failure", async () => {
    facade._startTranslationProcess.mockRejectedValue(new Error("cancelled"));
    mockGetPresentation.mockResolvedValue(null);

    await coordinator._handleWindowCreationRequest({
      selectedText: "selected text",
      position: { x: 10, y: 20 },
      frameId: "frame-1",
    });
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(mockGetPresentation).toHaveBeenCalled();
    expect(mockUpdateWindow).not.toHaveBeenCalled();
  });
});
