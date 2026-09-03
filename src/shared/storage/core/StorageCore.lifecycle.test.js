import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StorageCore } from './StorageCore.js';

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), operation: vi.fn() }),
}));
vi.mock('@/core/memory/ResourceTracker.js', () => ({
  default: class {
    trackResource() {}
    trackCache() {}
    addEventListener(target, event, handler) {
      if (typeof target?.addListener === 'function') {
        target.addListener(handler);
      }
    }
    cleanup() {}
    destroy() {}
  },
}));
vi.mock('@/core/memory/SmartCache.js', () => ({
  default: class { constructor() { this.isDestroyed=false; } has() {return false} get(){} set(){} delete(){} clear(){} destroy(){this.isDestroyed=true} },
}));

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve=res; reject=rej; });
  return { promise, resolve, reject };
}

describe('StorageCore lifecycle behavioral', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (!globalThis.browser) globalThis.browser = { storage: { local: { get: vi.fn(), set: vi.fn(), remove: vi.fn(), clear: vi.fn() }, onChanged: { addListener: vi.fn(), removeListener: vi.fn() } } };
    if (!globalThis.browser.storage) globalThis.browser.storage = { local: { get: vi.fn(), set: vi.fn(), remove: vi.fn(), clear: vi.fn() }, onChanged: { addListener: vi.fn(), removeListener: vi.fn() } };
    if (!globalThis.browser.storage.local) globalThis.browser.storage.local = { get: vi.fn(), set: vi.fn(), remove: vi.fn(), clear: vi.fn() };
    if (!globalThis.browser.storage.onChanged) globalThis.browser.storage.onChanged = { addListener: vi.fn(), removeListener: vi.fn() };
    if (!globalThis.browser.storage.local.get) globalThis.browser.storage.local.get = vi.fn();
    if (!globalThis.browser.storage.onChanged.addListener) globalThis.browser.storage.onChanged.addListener = vi.fn();
    if (!globalThis.browser.storage.onChanged.removeListener) globalThis.browser.storage.onChanged.removeListener = vi.fn();
    globalThis.browser.storage.local.get.mockReset();
    globalThis.browser.storage.local.set.mockReset().mockResolvedValue();
    globalThis.browser.storage.local.remove.mockReset().mockResolvedValue();
    globalThis.browser.storage.local.clear.mockReset().mockResolvedValue();
    globalThis.browser.storage.onChanged.addListener.mockReset();
    globalThis.browser.storage.onChanged.removeListener.mockReset();
    global.browser = globalThis.browser;
  });

  it('shares probe, rejects both, releases promise, retries and installs listener once', async () => {
    const probeDeferred = deferred();
    const probeError = new Error('probe fail');
    globalThis.browser.storage.local.get.mockImplementationOnce(() => probeDeferred.promise);

    const storage = new StorageCore();
    // two concurrent callers while probe pending
    const caller1 = storage.get('a').catch(e=>e);
    const caller2 = storage.get('b').catch(e=>e);
    expect(globalThis.browser.storage.local.get).toHaveBeenCalled();
    // probe should be first call
    expect(globalThis.browser.storage.local.get.mock.calls[0][0]).toEqual(["__storage_test__"]);

    probeDeferred.reject(probeError);
    const r1 = await caller1;
    const r2 = await caller2;
    expect(r1).toBe(probeError);
    expect(r2).toBe(probeError);
    expect(storage._readyPromise).toBeNull();
    expect(storage._isReady).toBe(false);

    // backend recovers
    globalThis.browser.storage.local.get.mockResolvedValue({});
    globalThis.browser.storage.onChanged.addListener.mockClear();
    const result = await storage.get('a');
    expect(result).toBeDefined();
    expect(storage._isReady).toBe(true);
    expect(globalThis.browser.storage.onChanged.addListener).toHaveBeenCalledTimes(1);
    await storage.get('b');
    expect(globalThis.browser.storage.onChanged.addListener).toHaveBeenCalledTimes(1);
  });
});
