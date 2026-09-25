import { describe, expect, it, vi } from 'vitest';
import { registerLiveDubbingTabLifecycle } from './tabLifecycle.js';

function event() {
  return { addListener: vi.fn(), removeListener: vi.fn() };
}

describe('live dubbing tab lifecycle', () => {
  it('stops only matching tabs and top-level navigations', async () => {
    const browserAPI = {
      tabs: { onRemoved: event() },
      webNavigation: { onCommitted: event() },
      tabCapture: { onStatusChanged: event() },
    };
    const coordinator = {
      handleTabRemoved: vi.fn().mockResolvedValue(undefined),
      handleTopLevelNavigation: vi.fn().mockResolvedValue(undefined),
      handleCaptureStatusChanged: vi.fn().mockResolvedValue(undefined),
    };
    const unregister = registerLiveDubbingTabLifecycle({ browserAPI, coordinator });
    const removed = browserAPI.tabs.onRemoved.addListener.mock.calls[0][0];
    const committed = browserAPI.webNavigation.onCommitted.addListener.mock.calls[0][0];
    const captureStatusChanged = browserAPI.tabCapture.onStatusChanged.addListener.mock.calls[0][0];

    removed(7);
    committed({ tabId: 7, frameId: 1 });
    committed({ tabId: 7, frameId: 0 });
    captureStatusChanged({ tabId: 7, status: 'stopped', extra: 'ignored' });
    await Promise.resolve();

    expect(coordinator.handleTabRemoved).toHaveBeenCalledWith(7);
    expect(coordinator.handleTopLevelNavigation).toHaveBeenCalledOnce();
    expect(coordinator.handleTopLevelNavigation).toHaveBeenCalledWith(7);
    expect(coordinator.handleCaptureStatusChanged).toHaveBeenCalledWith({ tabId: 7, status: 'stopped' });

    unregister();
    expect(browserAPI.tabs.onRemoved.removeListener).toHaveBeenCalledWith(removed);
    expect(browserAPI.webNavigation.onCommitted.removeListener).toHaveBeenCalledWith(committed);
    expect(browserAPI.tabCapture.onStatusChanged.removeListener).toHaveBeenCalledWith(captureStatusChanged);
  });

  it('delegates only valid terminal capture statuses', async () => {
    const browserAPI = { tabCapture: { onStatusChanged: event() } };
    const coordinator = { handleCaptureStatusChanged: vi.fn().mockResolvedValue(undefined) };
    registerLiveDubbingTabLifecycle({ browserAPI, coordinator });
    const listener = browserAPI.tabCapture.onStatusChanged.addListener.mock.calls[0][0];

    listener({ tabId: 0, status: 'active' });
    listener({ tabId: -1, status: 'stopped' });
    listener({ tabId: '7', status: 'error' });
    listener({ tabId: 7, status: 'STOPPED' });
    listener({ tabId: 7, status: 'error', reason: 'ignored' });
    await Promise.resolve();

    expect(coordinator.handleCaptureStatusChanged).toHaveBeenCalledOnce();
    expect(coordinator.handleCaptureStatusChanged).toHaveBeenCalledWith({ tabId: 7, status: 'error' });
  });

  it('is safe when tab capture status events are unavailable', () => {
    const browserAPI = { tabs: { onRemoved: event() } };
    const unregister = registerLiveDubbingTabLifecycle({ browserAPI, coordinator: {} });

    expect(() => unregister()).not.toThrow();
  });
});
