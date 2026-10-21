import { afterEach, describe, expect, it, vi } from 'vitest';

const { browser } = vi.hoisted(() => ({ browser: {
  scripting: { executeScript: vi.fn() },
  webNavigation: { getAllFrames: vi.fn() },
  tabs: { executeScript: vi.fn() },
} }));

vi.mock('webextension-polyfill', () => ({ default: browser }));
vi.mock('@/shared/logging/logger.js', () => ({ getScopedLogger: () => ({ debug: vi.fn() }) }));
vi.mock('@/shared/logging/logConstants.js', () => ({ LOG_COMPONENTS: { BACKGROUND: 'background' } }));

const { injectMediaObserverForTab } = await import('./contentScriptInjector.js');

describe('injectMediaObserverForTab', () => {
  afterEach(() => {
    vi.clearAllMocks();
    browser.webNavigation.getAllFrames = vi.fn();
    browser.scripting.executeScript.mockResolvedValue(undefined);
  });

  it('injects the observer into all injectable frames', async () => {
    browser.webNavigation.getAllFrames.mockResolvedValue([
      { frameId: 0, url: 'https://example.test/' },
      { frameId: 2, url: 'https://example.test/frame' },
      { frameId: 3, url: 'chrome://settings' },
    ]);

    expect(await injectMediaObserverForTab(7)).toEqual({ success: true, injectedFrameCount: 2 });
    expect(browser.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 7, frameIds: [0, 2] },
      files: ['src/features/live-dubbing/content/index-media-observer.js'],
    });
  });

  it('includes origin-fallback about:blank child frames', async () => {
    browser.webNavigation.getAllFrames.mockResolvedValue([
      { frameId: 0, url: 'https://example.test/' },
      { frameId: 1, parentFrameId: 0, url: 'about:blank' },
    ]);

    expect(await injectMediaObserverForTab(7)).toEqual({ success: true, injectedFrameCount: 2 });
    expect(browser.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 7, frameIds: [0, 1] },
      files: ['src/features/live-dubbing/content/index-media-observer.js'],
    });
  });

  it('returns explicit failure when frame enumeration is unavailable', async () => {
    browser.webNavigation.getAllFrames = undefined;
    expect(await injectMediaObserverForTab(7)).toEqual({ success: false, injectedFrameCount: 0 });
  });

  it('returns explicit failure when script injection fails', async () => {
    browser.webNavigation.getAllFrames.mockResolvedValue([{ frameId: 0, url: 'https://example.test/' }]);
    browser.scripting.executeScript.mockRejectedValue(new Error('denied'));
    expect(await injectMediaObserverForTab(7)).toEqual({ success: false, injectedFrameCount: 0 });
  });
});
