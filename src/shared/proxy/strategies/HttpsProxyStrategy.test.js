import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { HttpsProxyStrategy } from './HttpsProxyStrategy.js';

const config = {
  type: 'https',
  host: 'proxy.test',
  port: 443,
};

function createResponse(status) {
  return { ok: status >= 200 && status < 300, status };
}

describe('HttpsProxyStrategy response handling', () => {
  let strategy;

  beforeEach(() => {
    strategy = new HttpsProxyStrategy(config);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([400, 401, 403, 429, 500])('retains global throw behavior for HTTP %s responses by default', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createResponse(status)));

    await expect(strategy.execute('https://target.test/resource'))
      .rejects.toThrow(`HTTPS proxy returned error status: ${status}`);
  });

  it.each([401, 429])('fails closed for unmarked target-looking HTTP %s responses', async (status) => {
    const targetResponse = createResponse(status);
    const fetchMock = vi.fn().mockResolvedValue(targetResponse);
    vi.stubGlobal('fetch', fetchMock);

    await expect(strategy.execute(
      'https://api.openai.com/v1/realtime/translations/client_secrets',
      {},
      { allowTargetErrorStatuses: [401, 429] },
    )).rejects.toThrow(`HTTPS proxy returned error status: ${status}`);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe('https://proxy.test:443');
  });

  it.each([407, 502, 503, 504])('throws for proxy-originated HTTP %s responses even with target policy', async (status) => {
    const fetchMock = vi.fn().mockResolvedValue(createResponse(status));
    vi.stubGlobal('fetch', fetchMock);

    await expect(strategy.execute(
      'https://api.openai.com/v1/realtime/translations/client_secrets',
      {},
      { allowTargetErrorStatuses: [401, 429, 407, 502, 503, 504] },
    ))
      .rejects.toThrow(`HTTPS proxy connection failed: Failed to connect to HTTPS proxy at https://proxy.test:443: HTTPS proxy returned error status: ${status}`);
  });

  it.each(['fetch failed', 'ERR_SSL_PROTOCOL_ERROR'])(
    'still throws when the proxy fetch rejects with %s',
    async (message) => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError(message)));

      await expect(strategy.execute('https://api.openai.com/v1/realtime/translations/client_secrets'))
        .rejects.toThrow(`HTTPS proxy connection failed: Failed to connect to HTTPS proxy at https://proxy.test:443: ${message}`);
    },
  );
});
