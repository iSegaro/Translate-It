import { describe, expect, it, vi } from 'vitest';
import { FirefoxLiveDubbingContentHost } from '@/features/live-dubbing/firefox/FirefoxContentRuntimeHost.js';
import { bootstrapContentRuntimeInfrastructure } from './contentRuntimeBootstrap.js';

function createRuntime() {
  const listeners = new Set();
  return {
    id: 'extension-id',
    getURL: (path = '') => `chrome-extension://extension-id/${path}`,
    onMessage: {
      addListener: vi.fn(listener => listeners.add(listener)),
      removeListener: vi.fn(listener => listeners.delete(listener)),
      listeners,
    },
  };
}

function createActiveLifecycle() {
  return {
    requestActivation: async () => ({ activated: true }),
    deactivateFeature: async () => true,
    prepareRuntime: async () => true,
    isFeatureActive: () => true,
  };
}

describe('content runtime infrastructure bootstrap', () => {
  it('registers the Firefox host with its lifecycle exactly once', () => {
    const runtime = createRuntime();
    const browserAPI = { runtime };
    const lifecycle = createActiveLifecycle();

    const record = bootstrapContentRuntimeInfrastructure({
      browserName: 'firefox',
      browserAPI,
      featureLifecycle: lifecycle,
    });
    try {
      expect(record).not.toBeNull();
      expect(record.browserName).toBe('firefox');
      expect(record.host).toBeInstanceOf(FirefoxLiveDubbingContentHost);
      expect(runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
    } finally {
      record.unregister();
    }
    expect(runtime.onMessage.removeListener).toHaveBeenCalledTimes(1);
  });

  it('is idempotent for repeated default-composition calls', () => {
    const runtime = createRuntime();
    const browserAPI = { runtime };

    const first = bootstrapContentRuntimeInfrastructure({ browserName: 'firefox', browserAPI });
    const second = bootstrapContentRuntimeInfrastructure({ browserName: 'firefox', browserAPI });
    try {
      expect(second).toBe(first);
      expect(runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
    } finally {
      first.unregister();
    }

    // After unregister the next call registers fresh.
    const third = bootstrapContentRuntimeInfrastructure({ browserName: 'firefox', browserAPI });
    try {
      expect(third).not.toBe(first);
      expect(runtime.onMessage.addListener).toHaveBeenCalledTimes(2);
    } finally {
      third.unregister();
    }
  });

  it('keeps explicit host overrides isolated from the shared registration', () => {
    const runtime = createRuntime();
    const browserAPI = { runtime };
    const host = new FirefoxLiveDubbingContentHost({ browserAPI, featureLifecycle: createActiveLifecycle() });

    const record = bootstrapContentRuntimeInfrastructure({ browserName: 'firefox', browserAPI, host });
    try {
      expect(record.host).toBe(host);
      // A later default-composition call still creates the shared record.
      const shared = bootstrapContentRuntimeInfrastructure({ browserName: 'firefox', browserAPI });
      try {
        expect(shared.host).not.toBe(host);
        expect(shared.host).toBeInstanceOf(FirefoxLiveDubbingContentHost);
      } finally {
        shared.unregister();
      }
    } finally {
      record.unregister();
    }
  });

  it.each(['chrome', 'safari', '', undefined])(
    'fails closed for non-Firefox browser %s without registering',
    browserName => {
      const runtime = createRuntime();
      const record = bootstrapContentRuntimeInfrastructure({
        browserName,
        browserAPI: { runtime },
      });
      expect(record).toBeNull();
      expect(runtime.onMessage.addListener).not.toHaveBeenCalled();
    },
  );

  it('fails closed when the build browser is unknown', () => {
    const runtime = createRuntime();
    // No injected browserName and no build define in this environment:
    // unknown targets must never register.
    const record = bootstrapContentRuntimeInfrastructure({ browserAPI: { runtime } });
    expect(record).toBeNull();
    expect(runtime.onMessage.addListener).not.toHaveBeenCalled();
  });
});
