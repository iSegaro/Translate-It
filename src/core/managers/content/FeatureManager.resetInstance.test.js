import { describe, it, expect, vi, beforeEach } from 'vitest';

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

vi.mock('@/handlers/content/ContentMessageHandler.js', () => ({
  default: {
    resetInstance: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock('@/features/windows/managers/WindowsManager.js', () => ({
  WindowsManager: {
    resetInstance: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock('@/features/exclusion/core/ExclusionChecker.js', () => ({
  ExclusionChecker: {
    getInstance: () => ({ initialize: vi.fn().mockResolvedValue(undefined) }),
    resetInstance: vi.fn(),
  },
}));

vi.mock('@/shared/storage/core/StorageCore.js', () => ({
  storageManager: { on: vi.fn(), off: vi.fn() },
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), init: vi.fn() }),
}));

import { FeatureManager } from './FeatureManager.js';

describe('FeatureManager.resetInstance async lifecycle', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await FeatureManager.resetInstance();
  });

  it('resetInstance does not resolve until secondary singleton resets have settled', async () => {
    const fm = FeatureManager.getInstance();
    fm.initialized = true;

    // Create fresh deferreds for this test
    const chDeferred = deferred();
    const wmDeferred = deferred();
    const { default: ContentHandler } = await import('@/handlers/content/ContentMessageHandler.js');
    const { WindowsManager } = await import('@/features/windows/managers/WindowsManager.js');
    ContentHandler.resetInstance.mockReturnValueOnce(chDeferred.promise);
    WindowsManager.resetInstance.mockReturnValueOnce(wmDeferred.promise);

    const resetPromise = FeatureManager.resetInstance();

    let settled = false;
    resetPromise.then(() => { settled = true; }).catch(() => { settled = true; });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    chDeferred.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    wmDeferred.resolve();
    await resetPromise;
    expect(settled).toBe(true);
  });

  it('resetInstance tolerates secondary reset failure and still completes', async () => {
    const { default: ContentHandler } = await import('@/handlers/content/ContentMessageHandler.js');
    ContentHandler.resetInstance.mockRejectedValueOnce(new Error('secondary fail'));

    await expect(FeatureManager.resetInstance()).resolves.toBeUndefined();
  });
});
