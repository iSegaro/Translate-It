import { describe, it, expect, vi } from 'vitest';

vi.mock('@/shared/error-management/ErrorHandler.js', () => ({
  ErrorHandler: {
    getInstance: () => ({ handle: vi.fn() })
  }
}));

import { MainFeatureLoader } from './MainFeatureLoader.js';

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const createLoader = (loadFeature) => {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const contentScriptCore = { loadFeature };
  const loader = new MainFeatureLoader(contentScriptCore, async () => logger);
  return { loader, logger };
};

describe('MainFeatureLoader in-flight-only cache', () => {
  it('dedupes concurrent loads: shares one promise, delegates once', async () => {
    const activation = deferred();
    const loadFeature = vi.fn().mockReturnValue(activation.promise);
    const { loader } = createLoader(loadFeature);

    const first = loader.loadFeature('windowsManager', 'INTERACTIVE');
    const second = loader.loadFeature('windowsManager', 'INTERACTIVE');

    expect(loader.featureLoadPromises.has('windowsManager')).toBe(true);

    activation.resolve();
    expect(await first).toBe(await second);
    await flushPromises();

    expect(loadFeature).toHaveBeenCalledTimes(1);
    expect(loader.featureLoadPromises.has('windowsManager')).toBe(false);
  });

  it('removes the cache entry after a successful load', async () => {
    const { loader } = createLoader(vi.fn().mockResolvedValue({}));

    await loader.loadFeature('textSelection', 'CRITICAL');

    expect(loader.featureLoadPromises.has('textSelection')).toBe(false);
  });

  it('delegates again on a second call after success (no permanent cache)', async () => {
    const loadFeature = vi.fn().mockResolvedValue({});
    const { loader } = createLoader(loadFeature);

    await loader.loadFeature('mouseHover', 'CRITICAL');
    await loader.loadFeature('mouseHover', 'CRITICAL');

    expect(loadFeature).toHaveBeenCalledTimes(2);
  });

  it('preserves swallowed-error behavior and clears the entry on failure', async () => {
    const loadFeature = vi.fn().mockRejectedValue(new Error('boom'));
    const { loader, logger } = createLoader(loadFeature);

    const result = await loader.loadFeature('screenCapture', 'INTERACTIVE');

    expect(result).toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
    expect(loader.featureLoadPromises.has('screenCapture')).toBe(false);
  });

  it('retries after a failed attempt: second call delegates again', async () => {
    const loadFeature = vi.fn()
      .mockRejectedValueOnce(new Error('first attempt failed'))
      .mockResolvedValueOnce({});
    const { loader } = createLoader(loadFeature);

    await loader.loadFeature('screenCapture', 'INTERACTIVE');
    await loader.loadFeature('screenCapture', 'INTERACTIVE');

    expect(loadFeature).toHaveBeenCalledTimes(2);
    expect(loader.featureLoadPromises.has('screenCapture')).toBe(false);
  });

  it('clears the entry on a null/undefined result and retries on a later call', async () => {
    const loadFeature = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({});
    const { loader } = createLoader(loadFeature);

    await loader.loadFeature('selectElement', 'INTERACTIVE');
    expect(loader.featureLoadPromises.has('selectElement')).toBe(false);

    await loader.loadFeature('selectElement', 'INTERACTIVE');
    expect(loadFeature).toHaveBeenCalledTimes(2);
  });

  it('does not let a stale finalizer delete a newer in-flight entry', async () => {
    const oldActivation = deferred();
    const loadFeature = vi.fn().mockReturnValue(oldActivation.promise);
    const { loader } = createLoader(loadFeature);

    const oldPromise = loader.loadFeature('shortcut', 'CRITICAL');

    const newerActivation = deferred();
    const newerPromise = newerActivation.promise;
    loader.featureLoadPromises.set('shortcut', newerPromise);

    oldActivation.resolve();
    await flushPromises();

    expect(loader.featureLoadPromises.get('shortcut')).toBe(newerPromise);
    expect(newerPromise).not.toBe(oldPromise);
  });

  it('staged startup: overlapping loads for one feature share a single activation', async () => {
    const activation = deferred();
    const loadFeature = vi.fn().mockReturnValue(activation.promise);
    const { loader } = createLoader(loadFeature);

    // Mirrors bootstrap: explicit extensionContext load followed by the staged
    // CRITICAL batch touching the same feature while it is still in flight.
    const explicit = loader.loadFeature('extensionContext', 'CRITICAL');
    const staged = loader.loadFeature('extensionContext', 'CRITICAL');

    expect(loader.featureLoadPromises.has('extensionContext')).toBe(true);

    activation.resolve();
    expect(await staged).toBe(await explicit);
    await flushPromises();

    expect(loadFeature).toHaveBeenCalledTimes(1);
    expect(loader.featureLoadPromises.has('extensionContext')).toBe(false);
  });
});
