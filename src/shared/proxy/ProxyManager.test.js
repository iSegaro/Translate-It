import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@/shared/error-management/ErrorHandler.js', () => ({
  ErrorHandler: {
    getInstance: () => ({
      handle: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

vi.mock('@/core/extensionContext.js', () => ({
  default: {
    isValidSync: vi.fn(() => true),
  },
}));

import { ProxyManager } from './ProxyManager.js';

const createDeferred = () => {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const createConfig = (overrides = {}) => ({
  enabled: true,
  type: 'http',
  host: 'proxy.test',
  port: 8080,
  auth: { username: 'user', password: 'password' },
  ...overrides,
});

const createManager = () => {
  const manager = Object.create(ProxyManager.prototype);
  manager.config = null;
  manager.strategies = new Map();
  manager.logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  manager.errorHandler = {
    handle: vi.fn().mockResolvedValue(undefined),
  };
  return manager;
};

describe('ProxyManager request-local configuration', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('isolates concurrent requests from caller and global mutation', async () => {
    const manager = createManager();
    const firstRequestGate = createDeferred();
    const executions = [];

    class RecordingStrategy {
      constructor(config) {
        this.config = config;
      }

      async execute(url) {
        executions.push({ url, config: this.config });
        if (url.endsWith('/first')) await firstRequestGate.promise;
        return { ok: true, status: 200 };
      }
    }

    manager.strategies.set('http', RecordingStrategy);
    const firstConfig = createConfig({ host: 'proxy-first' });
    const secondConfig = createConfig({ host: 'proxy-second' });

    const firstRequest = manager.fetch('https://target.test/first', {}, firstConfig);
    firstConfig.auth.password = 'caller-mutated';
    manager.setConfig(secondConfig);
    await manager.fetch('https://target.test/second', {}, secondConfig);
    firstRequestGate.resolve();
    await firstRequest;

    expect(executions[0].config).toEqual(createConfig({ host: 'proxy-first' }));
    expect(executions[0].config).not.toBe(firstConfig);
    expect(executions[0].config.auth).not.toBe(firstConfig.auth);
    expect(executions[1].config.host).toBe('proxy-second');

    const firstDetails = manager.logger.debug.mock.calls.find(([, payload]) => (
      payload?.url === 'https://target.test/first' && payload.proxyHost === 'proxy-first'
    ));
    expect(firstDetails).toBeDefined();
  });

  it('uses request config for strategy selection after async loading', async () => {
    const manager = createManager();
    const strategyLoad = createDeferred();
    let selectedConfig;

    manager.strategies.clear();
    manager._initializeStrategies = vi.fn(async () => {
      await strategyLoad.promise;
      manager.strategies.set('socks', class {
        constructor(config) {
          selectedConfig = config;
        }

        async execute() {
          return { ok: true, status: 200 };
        }
      });
    });

    const requestConfig = createConfig({ type: 'socks', host: 'proxy-request' });
    const globalConfig = createConfig({ type: 'http', host: 'proxy-global' });
    const request = manager.fetch('https://target.test/resource', {}, requestConfig);
    manager.setConfig(globalConfig);
    strategyLoad.resolve();

    await request;

    expect(selectedConfig).toEqual(requestConfig);
    expect(selectedConfig).not.toBe(requestConfig);
    expect(manager.logger.debug).toHaveBeenCalledWith('Proxy request details', expect.objectContaining({
      proxyType: 'socks',
      proxyHost: 'proxy-request',
    }));
  });

  it('uses request config in failure metadata after global replacement', async () => {
    const manager = createManager();
    const requestError = new Error('proxy failed');

    manager.strategies.set('http', class {
      async execute() {
        throw requestError;
      }
    });

    const requestConfig = createConfig({ host: 'proxy-request' });
    manager.setConfig(createConfig({ host: 'proxy-global' }));

    await expect(manager.fetch('https://target.test/failure', {}, requestConfig))
      .rejects.toBe(requestError);

    expect(manager.errorHandler.handle).toHaveBeenCalledWith(requestError, expect.objectContaining({
      metadata: expect.objectContaining({
        proxyConfig: {
          type: 'http',
          host: 'proxy-request',
          port: 8080,
          hasAuth: true,
        },
      }),
    }));
    expect(manager.logger.debug).toHaveBeenCalledWith('Proxy failure details', expect.objectContaining({
      proxyType: 'http',
      proxyHost: 'proxy-request',
    }));
  });

  it('keeps fetch callers without request config on global policy', async () => {
    const manager = createManager();
    let strategyConfig;

    manager.strategies.set('http', class {
      constructor(config) {
        strategyConfig = config;
      }

      async execute() {
        return { ok: true, status: 200 };
      }
    });
    manager.setConfig(createConfig({ host: 'proxy-global' }));

    await manager.fetch('https://target.test/legacy');

    expect(strategyConfig.host).toBe('proxy-global');
    expect(manager.logger.debug).toHaveBeenCalledWith('Proxy request details', expect.objectContaining({
      proxyHost: 'proxy-global',
    }));
  });

  it('uses request disabled state even when global proxy is enabled', async () => {
    const manager = createManager();
    const directFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', directFetch);
    manager.setConfig(createConfig({ host: 'proxy-global' }));

    await manager.fetch('https://target.test/direct', { method: 'GET' }, createConfig({ enabled: false }));

    expect(directFetch).toHaveBeenCalledWith('https://target.test/direct', { method: 'GET' });
  });
});
