import { afterEach, describe, expect, it, vi } from 'vitest';

const { storageGet, storageOn, setEnabled, setGlobalDebugOverride, setErrorDebugMode } = vi.hoisted(() => ({
  storageGet: vi.fn(), storageOn: vi.fn(), setEnabled: vi.fn(),
  setGlobalDebugOverride: vi.fn(), setErrorDebugMode: vi.fn(),
}));

vi.mock('./SafeConsole.js', () => ({ safeConsole: { setEnabled } }));
vi.mock('./logger.js', () => ({ getScopedLogger: () => ({
  info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(),
}) }));
vi.mock('./GlobalDebugState.js', () => ({ setGlobalDebugOverride }));
vi.mock('@/shared/error-management/ErrorHandler.js', () => ({
  ErrorHandler: { getInstance: () => ({ setDebugMode: setErrorDebugMode }) },
}));

vi.mock('@/shared/storage/core/StorageCore.js', () => ({
  storageManager: { get: storageGet, on: storageOn },
}));

describe('DebugModeBridge offscreen settings handoff', () => {
  afterEach(() => {
    delete globalThis.chrome;
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('only serves sanitized logging preferences to the exact offscreen document', async () => {
    globalThis.chrome = {
      runtime: {
        id: 'extension-id',
        getURL: (path) => `chrome-extension://extension-id/${path}`,
      },
    };
    storageGet.mockResolvedValue({
      DEBUG_MODE: true,
      COMPONENT_LOG_LEVELS: { LiveDubbing: 3, Unknown: 2, Core: 99 },
      API_KEY: 'private',
    });
    const { DebugModeBridge } = await import('./DebugModeBridge.js');
    const handler = new DebugModeBridge().getHandlerMappings().OFFSCREEN_LOGGING_SETTINGS_GET;
    const maliciousSender = { id: 'extension-id', url: 'chrome-extension://extension-id/src/html/popup.html' };

    await expect(handler({}, maliciousSender)).resolves.toEqual({ success: false, error: 'OFFSCREEN_UNAUTHORIZED' });
    expect(storageGet).not.toHaveBeenCalled();

    await expect(handler({}, {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
    })).resolves.toEqual({
      DEBUG_MODE: true,
      COMPONENT_LOG_LEVELS: { LiveDubbing: 3 },
    });
    expect(storageGet).toHaveBeenCalledOnce();
    expect(storageGet).toHaveBeenCalledWith({ DEBUG_MODE: false, COMPONENT_LOG_LEVELS: {} });
  });

  it('sends logging changes as targeted offscreen updates', async () => {
    const sendMessage = vi.fn(() => Promise.resolve());
    globalThis.chrome = { runtime: { id: 'extension-id', sendMessage } };
    const { DebugModeBridge } = await import('./DebugModeBridge.js');
    const bridge = new DebugModeBridge();
    bridge.context = 'background';

    bridge.handleDebugModeChange(true);
    bridge.handleComponentLogLevelsChange({ LiveDubbing: 2, Unknown: 3 });

    expect(sendMessage).toHaveBeenCalledWith({
      target: 'offscreen',
      action: 'OFFSCREEN_LOGGING_SETTINGS_UPDATED',
      data: { DEBUG_MODE: true },
    });
    expect(sendMessage).toHaveBeenCalledWith({
      target: 'offscreen',
      action: 'OFFSCREEN_LOGGING_SETTINGS_UPDATED',
      data: { COMPONENT_LOG_LEVELS: { LiveDubbing: 2 } },
    });
  });

  it('keeps storage listeners in popup contexts but not offscreen', async () => {
    storageGet.mockImplementation(async (defaults) => defaults);
    globalThis.chrome = { runtime: { sendMessage: vi.fn(async () => ({})) } };
    const { DebugModeBridge } = await import('./DebugModeBridge.js');

    const popupBridge = new DebugModeBridge();
    popupBridge.context = 'popup';
    await popupBridge.initialize();
    await vi.waitFor(() => expect(storageOn).toHaveBeenCalledWith('change', expect.any(Function)));

    storageOn.mockClear();
    const offscreenBridge = new DebugModeBridge();
    offscreenBridge.context = 'offscreen';
    await offscreenBridge.initialize();
    expect(storageOn).not.toHaveBeenCalled();
  });

  it.each([
    ['GlobalDebugState import', 'global'],
    ['ErrorHandler import', 'error'],
  ])('does not let an old application resume after the %s', async (_boundary, boundary) => {
    let releaseImport;
    let markImportEntered;
    const importEntered = new Promise((resolve) => { markImportEntered = resolve; });
    const importGate = new Promise((resolve) => { releaseImport = resolve; });
    vi.resetModules();
    vi.doMock('./GlobalDebugState.js', async () => {
      if (boundary === 'global') {
        markImportEntered();
        await importGate;
      }
      return { setGlobalDebugOverride };
    });
    vi.doMock('@/shared/error-management/ErrorHandler.js', async () => {
      if (boundary === 'error') await importGate;
      return { ErrorHandler: { getInstance: () => ({ setDebugMode: setErrorDebugMode }) } };
    });

    const { DebugModeBridge } = await import('./DebugModeBridge.js');
    const bridge = new DebugModeBridge();
    bridge.context = 'offscreen';
    const oldApplication = bridge.applyDebugMode(true);

    if (boundary === 'global') {
      await importEntered;
    } else {
      await vi.waitFor(() => expect(setGlobalDebugOverride).toHaveBeenCalledWith(true));
    }

    bridge.handleDebugModeChange(false);
    releaseImport();
    await oldApplication;
    await vi.waitFor(() => expect(setErrorDebugMode).toHaveBeenCalledWith(false));

    expect(bridge.currentDebugMode).toBe(false);
    expect(setEnabled).toHaveBeenLastCalledWith(false);
    expect(setGlobalDebugOverride).toHaveBeenLastCalledWith(false);
    expect(setErrorDebugMode).toHaveBeenLastCalledWith(false);
    if (boundary === 'global') expect(setGlobalDebugOverride).not.toHaveBeenCalledWith(true);
    expect(setErrorDebugMode).not.toHaveBeenCalledWith(true);
  });
});
