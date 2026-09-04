import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeContentCore } from './contentStartup.js';

describe('contentStartup bounded retry', () => {
  beforeEach(() => {
    delete window.translateItContentScriptLoaded;
    delete window.translateItContentScriptInitializing;
    delete window._translateItBootstrapPromise;
  });

  it('retries main transient settings failure and allows downstream once', async () => {
    const core = { baseInitialized: false, initializeCritical: vi.fn() };
    core.initializeCritical.mockImplementationOnce(async () => { core.baseInitialized = true; return false; }).mockResolvedValueOnce(true);
    const sleep = vi.fn().mockResolvedValue();
    const ok = await initializeContentCore(core, { sleep, retryDelay: 100 });
    expect(ok).toBe(true);
    expect(core.initializeCritical).toHaveBeenCalledTimes(2);
    expect(core.initializeCritical.mock.calls[0][0]).toBeUndefined();
    expect(sleep).toHaveBeenCalledTimes(1);
    // same instance
    expect(core.baseInitialized).toBe(true);
  });

  it('retries iframe transient failure and allows frame-ready once', async () => {
    const core = { baseInitialized: false, initializeCritical: vi.fn() };
    core.initializeCritical.mockImplementationOnce(async () => { core.baseInitialized = false; return false; }).mockImplementationOnce(async () => { core.baseInitialized = true; return true; });
    const sleep = vi.fn().mockResolvedValue();
    const ok = await initializeContentCore(core, { sleep });
    expect(ok).toBe(true);
    expect(core.initializeCritical).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('duplicate owner does not retry', async () => {
    window.translateItContentScriptLoaded = true;
    const core = { baseInitialized: false, initializeCritical: vi.fn().mockResolvedValue(false) };
    const sleep = vi.fn().mockResolvedValue();
    const ok = await initializeContentCore(core, { sleep });
    expect(ok).toBe(false);
    expect(core.initializeCritical).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retry exhaustion does not run downstream', async () => {
    const core = { baseInitialized: false, initializeCritical: vi.fn().mockResolvedValue(false) };
    const sleep = vi.fn().mockResolvedValue();
    const ok = await initializeContentCore(core, { sleep });
    expect(ok).toBe(false);
    expect(core.initializeCritical).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('immediate success uses no sleep', async () => {
    const core = { baseInitialized: false, initializeCritical: vi.fn().mockResolvedValue(true) };
    const sleep = vi.fn().mockResolvedValue();
    const ok = await initializeContentCore(core, { sleep });
    expect(ok).toBe(true);
    expect(core.initializeCritical).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries settings failure even when document already loaded by this core', async () => {
    const core = { baseInitialized: false, initializeCritical: vi.fn() };
    core.initializeCritical.mockImplementationOnce(async () => { core.baseInitialized = true; window.translateItContentScriptLoaded = true; return false; }).mockResolvedValueOnce(true);
    const sleep = vi.fn().mockResolvedValue();
    const ok = await initializeContentCore(core, { sleep });
    expect(ok).toBe(true);
    expect(core.initializeCritical).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });
});
