import { describe, expect, it, vi } from 'vitest';
import { LiveDubbingRuntimeGateway } from './LiveDubbingRuntimeGateway.js';

describe('LiveDubbingRuntimeGateway', () => {
  it('forwards runtime messages with the runtime receiver and propagates rejection', async () => {
    const runtime = {
      sendMessage: vi.fn(function sendMessage(message) {
        expect(this).toBe(runtime);
        return Promise.resolve(message);
      }),
    };
    const gateway = new LiveDubbingRuntimeGateway({ browserAPI: { runtime }, chromeAPI: {} });
    const message = { action: 'LIVE_DUBBING_STATUS' };

    await expect(gateway.sendMessage(message)).resolves.toBe(message);
    expect(runtime.sendMessage).toHaveBeenCalledWith(message);

    const failure = new Error('runtime unavailable');
    runtime.sendMessage.mockRejectedValueOnce(failure);
    await expect(gateway.sendMessage(message)).rejects.toBe(failure);
  });

  it('targets translated transcript relays at the top frame of the requested tab', async () => {
    const tabs = {
      sendMessage: vi.fn(function sendMessage(...args) {
        expect(this).toBe(tabs);
        return Promise.resolve(args);
      }),
    };
    const gateway = new LiveDubbingRuntimeGateway({ browserAPI: { tabs }, chromeAPI: {} });
    const message = { action: 'LIVE_DUBBING_TRANSLATED_TRANSCRIPT' };

    await expect(gateway.sendTabMessage(42, message)).resolves.toEqual([42, message, { frameId: 0 }]);
  });

  it('returns synchronous runtime message results without wrapping them', () => {
    const result = { success: true };
    const runtime = { sendMessage: vi.fn(() => result) };
    const gateway = new LiveDubbingRuntimeGateway({ browserAPI: { runtime }, chromeAPI: {} });

    expect(gateway.sendMessage({ action: 'LIVE_DUBBING_STATUS' })).toBe(result);
  });

  it('reports missing capture capability without inventing platform results', async () => {
    const gateway = new LiveDubbingRuntimeGateway({ browserAPI: {}, chromeAPI: {} });

    expect(gateway.supportsTabCapture()).toBe(false);
    await expect(gateway.sendMessage({})).rejects.toThrow('offscreen messaging unavailable');
    expect(await gateway.getMediaStreamId(42)).toBeUndefined();
    expect(await gateway.getTab(42)).toBeUndefined();
    expect(await gateway.getActiveTab()).toBeUndefined();
    expect(await gateway.getCapturedTabs()).toBeUndefined();
  });

  it('forwards capture and tab calls with native arguments and receivers', async () => {
    const tabCapture = {
      getMediaStreamId: vi.fn(function getMediaStreamId(options) {
        expect(this).toBe(tabCapture);
        expect(options).toEqual({ targetTabId: 42 });
        return Promise.resolve('stream-id');
      }),
      getCapturedTabs: vi.fn(function getCapturedTabs() {
        expect(this).toBe(tabCapture);
        return Promise.resolve([{ tabId: 42, status: 'active' }]);
      }),
    };
    const tabs = {
      get: vi.fn(function get(tabId) {
        expect(this).toBe(tabs);
        return Promise.resolve({ id: tabId });
      }),
      query: vi.fn(function query(queryInfo) {
        expect(this).toBe(tabs);
        expect(queryInfo).toEqual({ active: true, currentWindow: true });
        return Promise.resolve([{ id: 42 }, { id: 99 }]);
      }),
    };
    const gateway = new LiveDubbingRuntimeGateway({
      browserAPI: { tabs },
      chromeAPI: { tabCapture },
    });

    expect(gateway.supportsTabCapture()).toBe(true);
    await expect(gateway.getMediaStreamId(42)).resolves.toBe('stream-id');
    await expect(gateway.getTab(42)).resolves.toEqual({ id: 42 });
    await expect(gateway.getActiveTab()).resolves.toEqual({ id: 42 });
    const capturedTabs = await gateway.getCapturedTabs();
    expect(capturedTabs).toEqual([{ tabId: 42, status: 'active' }]);
  });

  it('returns raw captured-tab results and propagates capture rejection', async () => {
    const capturedTabs = [{ tabId: 42, status: 'pending' }];
    const failure = new Error('capture query failed');
    const getCapturedTabs = vi.fn()
      .mockResolvedValueOnce(capturedTabs)
      .mockRejectedValueOnce(failure);
    const gateway = new LiveDubbingRuntimeGateway({
      browserAPI: {},
      chromeAPI: { tabCapture: { getCapturedTabs } },
    });

    await expect(gateway.getCapturedTabs()).resolves.toBe(capturedTabs);
    await expect(gateway.getCapturedTabs()).rejects.toBe(failure);
  });

  it('normalizes tab presence to unavailable, absent, or present', async () => {
    const tabs = {
      get: vi.fn()
        .mockResolvedValueOnce({ id: 42 })
        .mockRejectedValueOnce(new Error('tab not found'))
        .mockResolvedValueOnce(undefined),
    };
    const gateway = new LiveDubbingRuntimeGateway({ browserAPI: { tabs }, chromeAPI: {} });

    await expect(gateway.probeTabPresence(42)).resolves.toBe(true);
    await expect(gateway.probeTabPresence(42)).resolves.toBe(false);
    await expect(gateway.probeTabPresence(42)).resolves.toBe(null);

    const unavailable = new LiveDubbingRuntimeGateway({ browserAPI: {}, chromeAPI: {} });
    await expect(unavailable.probeTabPresence(42)).resolves.toBe(null);
  });

  it('normalizes current capture state without interpreting malformed entries as active', async () => {
    const getCapturedTabs = vi.fn()
      .mockResolvedValueOnce([{ tabId: 42, status: 'active' }])
      .mockResolvedValueOnce([{ tabId: 42, status: 'pending' }])
      .mockResolvedValueOnce([{ tabId: 42, status: 'stopped' }])
      .mockResolvedValueOnce([{ tabId: 99, status: 'active' }])
      .mockResolvedValueOnce([{ tabId: 42 }])
      .mockResolvedValueOnce({ not: 'an array' })
      .mockRejectedValueOnce(new Error('capture query failed'));
    const gateway = new LiveDubbingRuntimeGateway({
      browserAPI: {},
      chromeAPI: { tabCapture: { getCapturedTabs } },
    });

    await expect(gateway.getCurrentCaptureState(42)).resolves.toBe(true);
    await expect(gateway.getCurrentCaptureState(42)).resolves.toBe(true);
    await expect(gateway.getCurrentCaptureState(42)).resolves.toBe(false);
    await expect(gateway.getCurrentCaptureState(42)).resolves.toBe(false);
    await expect(gateway.getCurrentCaptureState(42)).resolves.toBe(null);
    await expect(gateway.getCurrentCaptureState(42)).resolves.toBe(null);
    await expect(gateway.getCurrentCaptureState(42)).resolves.toBe(null);

    const unavailable = new LiveDubbingRuntimeGateway({ browserAPI: {}, chromeAPI: {} });
    await expect(unavailable.getCurrentCaptureState(42)).resolves.toBe(null);
  });

  it('detects extension senders and preserves sender-tab versus active-tab resolution', async () => {
    const activeTab = { id: 99, url: 'https://example.test' };
    const tabs = {
      get: vi.fn(async tabId => ({ id: tabId, url: 'https://sender.example' })),
      query: vi.fn(async () => [activeTab]),
    };
    const browserAPI = {
      runtime: { getURL: () => 'chrome-extension://extension-id/' },
      tabs,
    };
    const gateway = new LiveDubbingRuntimeGateway({ browserAPI, chromeAPI: {} });

    expect(gateway.isExtensionPageSender({ url: 'chrome-extension://extension-id/popup.html' })).toBe(true);
    expect(gateway.isExtensionPageSender({ url: 'https://example.test' })).toBe(false);
    await expect(gateway.resolveTabFromSender({ tab: { id: 42 }, url: 'https://example.test' }))
      .resolves.toEqual({ id: 42, url: 'https://sender.example' });
    await expect(gateway.resolveTabFromSender({ tab: { id: 42 }, url: 'chrome-extension://extension-id/popup.html' }))
      .resolves.toEqual(activeTab);

    const fallback = new LiveDubbingRuntimeGateway({
      browserAPI: { runtime: browserAPI.runtime, tabs: {} },
      chromeAPI: {},
    });
    await expect(fallback.resolveTabFromSender({ tab: { id: 42 }, url: 'https://example.test' }))
      .resolves.toEqual({ id: 42 });
    await expect(fallback.resolveTabFromSender({ url: 'chrome-extension://extension-id/popup.html' }))
      .resolves.toBe(null);
  });

  it('propagates extension URL lookup failures', () => {
    const failure = new Error('extension URL unavailable');
    const gateway = new LiveDubbingRuntimeGateway({
      browserAPI: { runtime: { getURL: () => { throw failure; } } },
      chromeAPI: {},
    });

    expect(() => gateway.isExtensionPageSender({ url: 'https://example.test' })).toThrow(failure);
  });
});
