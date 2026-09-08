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
    };
    const coordinator = {
      handleTabRemoved: vi.fn().mockResolvedValue(undefined),
      handleTopLevelNavigation: vi.fn().mockResolvedValue(undefined),
    };
    const unregister = registerLiveDubbingTabLifecycle({ browserAPI, coordinator });
    const removed = browserAPI.tabs.onRemoved.addListener.mock.calls[0][0];
    const committed = browserAPI.webNavigation.onCommitted.addListener.mock.calls[0][0];

    removed(7);
    committed({ tabId: 7, frameId: 1 });
    committed({ tabId: 7, frameId: 0 });
    await Promise.resolve();

    expect(coordinator.handleTabRemoved).toHaveBeenCalledWith(7);
    expect(coordinator.handleTopLevelNavigation).toHaveBeenCalledOnce();
    expect(coordinator.handleTopLevelNavigation).toHaveBeenCalledWith(7);

    unregister();
    expect(browserAPI.tabs.onRemoved.removeListener).toHaveBeenCalledWith(removed);
    expect(browserAPI.webNavigation.onCommitted.removeListener).toHaveBeenCalledWith(committed);
  });
});
