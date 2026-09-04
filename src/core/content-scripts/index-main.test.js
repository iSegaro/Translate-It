import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  coreCtor: vi.fn(),
  initContentCore: vi.fn().mockResolvedValue(true),
  setupTrusted: vi.fn(),
  getURL: vi.fn((p) => `moz-extension://test/${p}`),
}));

vi.mock('webextension-polyfill', () => ({
  default: { runtime: { getURL: mocks.getURL } },
}));
vi.mock('@/shared/vue/vue-utils.js', () => ({
  setupTrustedTypesCompatibility: mocks.setupTrusted,
}));
vi.mock('./ContentScriptCore.js', () => ({
  ContentScriptCore: class {
    constructor() { mocks.coreCtor(); this.initialized = false; }
  },
}));
vi.mock('./contentStartup.js', () => ({
  initializeContentCore: mocks.initContentCore,
}));
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/shared/logging/logConstants.js', () => ({ LOG_COMPONENTS: { CONTENT: 'content' } }));

describe('index-main entry', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.coreCtor.mockClear();
    mocks.initContentCore.mockResolvedValue(true);
    mocks.getURL.mockImplementation((p) => `moz-extension://test/${p}`);
    delete window.translateItContentCore;
    delete window.translateItContentScriptCore;
    delete window.translateItContentScriptLoaded;
    delete window._translateItBootstrapPromise;
    window.translateItContentScriptInitializing = false;
    Object.defineProperty(window, 'top', { configurable: true, value: window });
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: 'https://example.com/', protocol: 'https:', host: 'example.com' },
    });
    document.documentElement.classList.remove('translate-it-ui-frame');
    // ensure window is top
    Object.defineProperty(window, 'top', { configurable: true, value: window });
  });

  it('does not run when window !== top', async () => {
    Object.defineProperty(window, 'top', { configurable: true, value: {} });
    await import('./index-main.js');
    expect(mocks.coreCtor).not.toHaveBeenCalled();
    expect(mocks.initContentCore).not.toHaveBeenCalled();
  });

  it('does not run when isExtensionFrame via protocol', async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: 'moz-extension://abc/page.html', protocol: 'moz-extension:', host: 'abc' },
    });
    await import('./index-main.js');
    await new Promise((r) => setTimeout(r, 10));
    expect(mocks.coreCtor).not.toHaveBeenCalled();
  });

  it('does not run when isExtensionFrame via href', async () => {
    mocks.getURL.mockReturnValue('https://example.com/');
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: 'https://example.com/page.html', protocol: 'https:', host: 'example.com' },
    });
    await import('./index-main.js');
    await new Promise((r) => setTimeout(r, 10));
    expect(mocks.coreCtor).not.toHaveBeenCalled();
  });

  it('does not run when isExtensionFrame via class', async () => {
    document.documentElement.classList.add('translate-it-ui-frame');
    await import('./index-main.js');
    await new Promise((r) => setTimeout(r, 10));
    expect(mocks.coreCtor).not.toHaveBeenCalled();
    document.documentElement.classList.remove('translate-it-ui-frame');
  });

  it('creates core and routes to initializeContentCore when allowed', async () => {
    await import('./index-main.js');
    await vi.waitFor(() => expect(mocks.coreCtor).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(mocks.initContentCore).toHaveBeenCalledOnce());
    const coreArg = mocks.initContentCore.mock.calls[0][0];
    expect(coreArg).toBeTruthy();
    expect(window.translateItContentCore).toBe(coreArg);
    expect(window.translateItContentScriptCore).toBe(coreArg);
  });
});
