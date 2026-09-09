import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleTestCustomConnection, CUSTOM_CONNECTION_PROBE_DEADLINE_MS } from './handleTestCustomConnection.js';
import { probeCustomConnection } from '@/features/translation/providers/CustomConnectionProbe.js';
import { ApiKeyManager } from '@/features/translation/providers/ApiKeyManager.js';

vi.mock('@/features/translation/providers/CustomConnectionProbe.js', () => ({
  probeCustomConnection: vi.fn(),
}));

vi.mock('@/features/translation/providers/ApiKeyManager.js', () => ({
  ApiKeyManager: {
    testKeysDirect: vi.fn(),
  },
}));

const loggerSpies = vi.hoisted(() => ({
  debug: vi.fn(),
  debugLazy: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => loggerSpies,
}));

const semanticReport = (overrides = {}) => ({
  fallbackStructured: 'supported',
  responseFormat: 'supported',
  usable: true,
  state: 'success',
  messageKey: 'custom_api_connection_success',
  params: null,
  modelStatus: 'matched',
  requestedModel: 'm',
  effectiveModel: 'm',
  ...overrides,
});

describe('handleTestCustomConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes the exact caller-supplied values to the probe', async () => {
    vi.mocked(probeCustomConnection).mockResolvedValue(semanticReport());

    await handleTestCustomConnection({
      messageId: 'custom-probe-1',
      data: {
        config: {
          apiUrl: '  https://a.example/v1/chat/completions  ',
          apiModel: 'local-model',
          apiKey: 'k1',
        },
      },
    });

    // Verbatim passthrough: no trimming, no defaults, no storage reads.
    // The registry-owned AbortSignal travels alongside the probe inputs.
    expect(probeCustomConnection).toHaveBeenCalledWith({
      apiUrl: '  https://a.example/v1/chat/completions  ',
      apiModel: 'local-model',
      apiKey: 'k1',
      signal: expect.any(AbortSignal),
    });
    expect(probeCustomConnection).toHaveBeenCalledTimes(1);
    expect(probeCustomConnection.mock.calls[0][0].signal.aborted).toBe(false);
  });

  it('returns the probe report unchanged', async () => {
    const report = semanticReport({
      responseFormat: 'unsupported',
      messageKey: 'custom_api_connection_model_mismatch_fallback',
      params: { requestedModel: 'm', effectiveModel: 'other' },
      modelStatus: 'mismatch',
      requestedModel: 'm',
      effectiveModel: 'other',
    });
    vi.mocked(probeCustomConnection).mockResolvedValue(report);

    const response = await handleTestCustomConnection({
      data: { config: { apiUrl: 'https://a.example/x', apiModel: 'm', apiKey: '' } },
    });

    expect(response).toMatchObject({ success: true });
    expect(response.data.report).toBe(report);
    expect(response.data.report).toMatchObject({
      modelStatus: 'mismatch',
      requestedModel: 'm',
      effectiveModel: 'other',
    });
  });

  it('coerces missing or non-object config to empty probe inputs', async () => {
    vi.mocked(probeCustomConnection).mockResolvedValue(semanticReport());

    await handleTestCustomConnection({});
    expect(probeCustomConnection).toHaveBeenCalledWith({ apiUrl: '', apiModel: '', apiKey: '', signal: expect.any(AbortSignal) });

    await handleTestCustomConnection({ data: { config: { apiUrl: 42, apiModel: null, apiKey: ['k'] } } });
    expect(probeCustomConnection).toHaveBeenCalledWith({ apiUrl: '', apiModel: '', apiKey: '', signal: expect.any(AbortSignal) });
  });

  it('returns a failure envelope when the probe throws unexpectedly', async () => {
    vi.mocked(probeCustomConnection).mockRejectedValue(new Error('probe exploded'));

    const response = await handleTestCustomConnection({
      messageId: 'custom-probe-boom',
      data: { config: { apiUrl: 'https://a.example/x', apiModel: 'm', apiKey: 'k' } },
    });

    expect(response.success).toBe(false);
    expect(response.errorDetails).toMatchObject({ message: 'probe exploded' });
    expect(response.data).toMatchObject({ success: false });
  });

  it('logs a single bounded semantic summary with approved fields only', async () => {
    const apiKey = 'super-secret-key material';
    vi.mocked(probeCustomConnection).mockResolvedValue(semanticReport({
      state: 'success',
      usable: true,
      responseFormat: 'supported',
      fallbackStructured: 'supported',
      modelStatus: 'matched',
      requestedModel: 'm',
      effectiveModel: 'm',
    }));

    await handleTestCustomConnection({
      data: { config: { apiUrl: 'https://a.example/x', apiModel: 'm', apiKey } },
    });

    expect(loggerSpies.debug).toHaveBeenCalledTimes(1);
    expect(loggerSpies.warn).not.toHaveBeenCalled();
    expect(loggerSpies.info).not.toHaveBeenCalled();
    expect(loggerSpies.error).not.toHaveBeenCalled();
    const [message, summary] = loggerSpies.debug.mock.calls[0];
    expect(typeof message).toBe('string');
    expect(Object.keys(summary).sort()).toEqual(
      ['effectiveModel', 'fallbackStructured', 'modelStatus', 'requestedModel', 'responseFormat', 'state', 'usable'].sort(),
    );
    expect(summary).toMatchObject({
      state: 'success',
      usable: true,
      responseFormat: 'supported',
      fallbackStructured: 'supported',
      modelStatus: 'matched',
      requestedModel: 'm',
      effectiveModel: 'm',
    });
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain('super-secret-key');
    expect(serialized).not.toContain('choices');
    for (const value of Object.values(summary)) {
      if (typeof value === 'string') expect(value.length).toBeLessThanOrEqual(80);
    }
  });

  it('echoes the caller-supplied operation id and generates one when missing', async () => {
    vi.mocked(probeCustomConnection).mockResolvedValue(semanticReport());

    const explicit = await handleTestCustomConnection({
      data: { config: { apiUrl: 'https://a.example/x', apiModel: 'm', apiKey: 'k', operationId: 'op-1' } },
    }, {});
    expect(explicit.data.operationId).toBe('op-1');

    const generated = await handleTestCustomConnection({
      data: { config: { apiUrl: 'https://a.example/x', apiModel: 'm', apiKey: 'k' } },
    }, {});
    expect(typeof generated.data.operationId).toBe('string');
    expect(generated.data.operationId.length).toBeGreaterThan(0);
  });

  it('aborts the probe with reason timeout at the overall deadline', async () => {
    vi.useFakeTimers();
    try {
      let capturedSignal;
      vi.mocked(probeCustomConnection).mockImplementation(({ signal }) => {
        capturedSignal = signal;
        return new Promise((resolve) => {
          signal?.addEventListener('abort', () => resolve(semanticReport({
            state: 'timed_out',
            usable: false,
            messageKey: 'custom_api_connection_timed_out',
          })), { once: true });
        });
      });

      const pending = handleTestCustomConnection(
        { data: { config: { apiUrl: 'https://a.example/x', apiModel: 'm', apiKey: 'k' } } },
        { url: 'chrome-extension://abc/options.html' },
      );
      await vi.advanceTimersByTimeAsync(CUSTOM_CONNECTION_PROBE_DEADLINE_MS - 1);
      expect(capturedSignal.aborted).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      expect(capturedSignal.aborted).toBe(true);
      expect(capturedSignal.reason).toBe('timeout');

      const response = await pending;
      expect(response).toMatchObject({ success: true });
      expect(response.data.report).toMatchObject({
        state: 'timed_out',
        messageKey: 'custom_api_connection_timed_out',
        usable: false,
      });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears deadline timers on success and failure', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(probeCustomConnection).mockResolvedValue(semanticReport());
      await handleTestCustomConnection(
        { data: { config: { apiUrl: 'https://a.example/x', apiModel: 'm', apiKey: 'k' } } },
        { url: 'chrome-extension://abc/options.html' },
      );
      expect(vi.getTimerCount()).toBe(0);

      vi.mocked(probeCustomConnection).mockRejectedValue(new Error('boom'));
      await handleTestCustomConnection(
        { data: { config: { apiUrl: 'https://a.example/x', apiModel: 'm', apiKey: 'k' } } },
        { url: 'chrome-extension://abc/options.html' },
      );
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('aborts the older check when the same caller starts a newer one', async () => {
    const sender = { url: 'chrome-extension://abc/options.html' };
    let resolveFirst;
    let firstSignal;
    vi.mocked(probeCustomConnection)
      .mockImplementationOnce(({ signal }) => {
        firstSignal = signal;
        return new Promise((resolve) => { resolveFirst = resolve; });
      })
      .mockImplementationOnce(async () => semanticReport({ messageKey: 'custom_api_connection_success' }));

    const first = handleTestCustomConnection(
      { data: { config: { apiUrl: 'https://a.example/1', apiModel: 'm', apiKey: 'k', operationId: 'op-1' } } },
      sender,
    );
    await vi.waitFor(() => expect(probeCustomConnection).toHaveBeenCalledTimes(1));

    const second = await handleTestCustomConnection(
      { data: { config: { apiUrl: 'https://a.example/2', apiModel: 'm', apiKey: 'k', operationId: 'op-2' } } },
      sender,
    );

    expect(firstSignal.aborted).toBe(true);
    expect(firstSignal.reason).toBe('superseded');
    expect(second).toMatchObject({ success: true });
    expect(second.data.operationId).toBe('op-2');

    resolveFirst(semanticReport({ state: 'timed_out', usable: false, messageKey: 'custom_api_connection_timed_out' }));
    const stale = await first;
    expect(stale).toMatchObject({ success: true });
    expect(stale.data.report).toMatchObject({ state: 'timed_out' });
  });

  it('scopes supersede to the caller id, not the sender URL', async () => {
    const sender = { url: 'chrome-extension://abc/options.html' };
    let resolveFirst;
    let firstSignal;
    vi.mocked(probeCustomConnection)
      .mockImplementationOnce(({ signal }) => {
        firstSignal = signal;
        return new Promise((resolve) => { resolveFirst = resolve; });
      })
      .mockImplementationOnce(async () => semanticReport({ messageKey: 'custom_api_connection_success' }));

    const first = handleTestCustomConnection(
      { data: { config: { apiUrl: 'https://a.example/1', apiModel: 'm', apiKey: 'k', callerId: 'caller-A', operationId: 'op-1' } } },
      sender,
    );
    await vi.waitFor(() => expect(probeCustomConnection).toHaveBeenCalledTimes(1));

    const second = await handleTestCustomConnection(
      { data: { config: { apiUrl: 'https://a.example/2', apiModel: 'm', apiKey: 'k', callerId: 'caller-A', operationId: 'op-2' } } },
      sender,
    );

    expect(firstSignal.aborted).toBe(true);
    expect(firstSignal.reason).toBe('superseded');
    expect(second).toMatchObject({ success: true });
    expect(second.data.operationId).toBe('op-2');

    resolveFirst(semanticReport({ state: 'timed_out', usable: false, messageKey: 'custom_api_connection_timed_out' }));
    const stale = await first;
    expect(stale).toMatchObject({ success: true });
    expect(stale.data.report).toMatchObject({ state: 'timed_out' });
  });

  it('keeps different caller ids independent on an identical sender URL', async () => {
    const sender = { url: 'chrome-extension://abc/options.html' };
    const signals = [];
    const resolvers = [];
    vi.mocked(probeCustomConnection).mockImplementation(({ signal }) => {
      signals.push(signal);
      return new Promise((resolve) => { resolvers.push(resolve); });
    });

    const first = handleTestCustomConnection(
      { data: { config: { apiUrl: 'https://a.example/1', apiModel: 'm', apiKey: 'k', callerId: 'caller-A' } } },
      sender,
    );
    const second = handleTestCustomConnection(
      { data: { config: { apiUrl: 'https://a.example/2', apiModel: 'm', apiKey: 'k', callerId: 'caller-B' } } },
      sender,
    );
    await vi.waitFor(() => expect(probeCustomConnection).toHaveBeenCalledTimes(2));

    // Same sender URL, but neither check supersedes the other.
    expect(signals).toHaveLength(2);
    expect(signals[0].aborted).toBe(false);
    expect(signals[1].aborted).toBe(false);

    resolvers[0](semanticReport());
    resolvers[1](semanticReport());
    await expect(first).resolves.toMatchObject({ success: true });
    await expect(second).resolves.toMatchObject({ success: true });
  });

  it('cancels only the matching caller id', async () => {
    const sender = { url: 'chrome-extension://abc/options.html' };
    const signals = [];
    const resolvers = [];
    vi.mocked(probeCustomConnection).mockImplementation(({ signal }) => {
      signals.push(signal);
      return new Promise((resolve) => { resolvers.push(resolve); });
    });

    const first = handleTestCustomConnection(
      { data: { config: { apiUrl: 'https://a.example/1', apiModel: 'm', apiKey: 'k', callerId: 'caller-A' } } },
      sender,
    );
    const second = handleTestCustomConnection(
      { data: { config: { apiUrl: 'https://a.example/2', apiModel: 'm', apiKey: 'k', callerId: 'caller-B' } } },
      sender,
    );
    await vi.waitFor(() => expect(probeCustomConnection).toHaveBeenCalledTimes(2));

    const cancelled = await handleTestCustomConnection({ data: { config: { cancel: true, callerId: 'caller-A' } } }, sender);
    expect(cancelled).toMatchObject({ success: true, data: { cancelled: true } });
    expect(signals[0].aborted).toBe(true);
    expect(signals[0].reason).toBe('cancelled');
    expect(signals[1].aborted).toBe(false);

    resolvers[0](semanticReport({ state: 'timed_out', usable: false, messageKey: 'custom_api_connection_timed_out' }));
    resolvers[1](semanticReport());
    await first;
    await second;
  });

  it.each([
    ['missing', {}],
    ['non-string', { callerId: 42 }],
    ['blank', { callerId: '   ' }],
  ])('falls back to sender scoping for %s callerId', async (_label, extraConfig) => {
    const sender = { url: 'chrome-extension://abc/options.html' };
    let firstSignal;
    let resolveFirst;
    vi.mocked(probeCustomConnection)
      .mockImplementationOnce(({ signal }) => {
        firstSignal = signal;
        return new Promise((resolve) => { resolveFirst = resolve; });
      })
      .mockImplementationOnce(async () => semanticReport());

    const first = handleTestCustomConnection(
      { data: { config: { apiUrl: 'https://a.example/1', apiModel: 'm', apiKey: 'k', ...extraConfig } } },
      sender,
    );
    await vi.waitFor(() => expect(probeCustomConnection).toHaveBeenCalledTimes(1));
    await handleTestCustomConnection(
      { data: { config: { apiUrl: 'https://a.example/2', apiModel: 'm', apiKey: 'k', ...extraConfig } } },
      sender,
    );

    // Same sender with no usable callerId still supersedes via fallback.
    expect(firstSignal.aborted).toBe(true);
    expect(firstSignal.reason).toBe('superseded');
    resolveFirst(semanticReport());
    await first;
  });

  it('bounds over-long caller ids while keeping their scope', async () => {
    const sender = { url: 'chrome-extension://abc/options.html' };
    const longId = `caller-${'x'.repeat(200)}`;
    let firstSignal;
    let resolveFirst;
    vi.mocked(probeCustomConnection)
      .mockImplementationOnce(({ signal }) => {
        firstSignal = signal;
        return new Promise((resolve) => { resolveFirst = resolve; });
      })
      .mockImplementationOnce(async () => semanticReport());

    const first = handleTestCustomConnection(
      { data: { config: { apiUrl: 'https://a.example/1', apiModel: 'm', apiKey: 'k', callerId: longId } } },
      sender,
    );
    await vi.waitFor(() => expect(probeCustomConnection).toHaveBeenCalledTimes(1));
    await handleTestCustomConnection(
      { data: { config: { apiUrl: 'https://a.example/2', apiModel: 'm', apiKey: 'k', callerId: longId } } },
      sender,
    );

    expect(firstSignal.aborted).toBe(true);
    resolveFirst(semanticReport());
    await first;
  });

  it('keeps different callers independent', async () => {
    const signals = [];
    const resolvers = [];
    vi.mocked(probeCustomConnection).mockImplementation(({ signal }) => {
      signals.push(signal);
      return new Promise((resolve) => { resolvers.push(resolve); });
    });

    const first = handleTestCustomConnection(
      { data: { config: { apiUrl: 'https://a.example/1', apiModel: 'm', apiKey: 'k' } } },
      { url: 'chrome-extension://abc/options.html' },
    );
    const second = handleTestCustomConnection(
      { data: { config: { apiUrl: 'https://a.example/2', apiModel: 'm', apiKey: 'k' } } },
      { url: 'chrome-extension://abc/popup.html' },
    );
    await vi.waitFor(() => expect(probeCustomConnection).toHaveBeenCalledTimes(2));

    expect(signals).toHaveLength(2);
    expect(signals[0].aborted).toBe(false);
    expect(signals[1].aborted).toBe(false);

    resolvers[0](semanticReport());
    resolvers[1](semanticReport());
    await expect(first).resolves.toMatchObject({ success: true });
    await expect(second).resolves.toMatchObject({ success: true });
  });

  it('cancels the caller active check explicitly and is harmless when idle', async () => {
    const sender = { url: 'chrome-extension://abc/options.html' };
    let firstSignal;
    let resolveFirst;
    vi.mocked(probeCustomConnection).mockImplementationOnce(({ signal }) => {
      firstSignal = signal;
      return new Promise((resolve) => { resolveFirst = resolve; });
    });

    const first = handleTestCustomConnection(
      { data: { config: { apiUrl: 'https://a.example/1', apiModel: 'm', apiKey: 'k' } } },
      sender,
    );
    await vi.waitFor(() => expect(probeCustomConnection).toHaveBeenCalledTimes(1));

    const cancelled = await handleTestCustomConnection({ data: { config: { cancel: true } } }, sender);
    expect(cancelled).toMatchObject({ success: true, data: { cancelled: true } });
    expect(firstSignal.aborted).toBe(true);
    expect(firstSignal.reason).toBe('cancelled');
    expect(probeCustomConnection).toHaveBeenCalledTimes(1);

    resolveFirst(semanticReport({ state: 'timed_out', usable: false, messageKey: 'custom_api_connection_timed_out' }));
    await first;

    const idle = await handleTestCustomConnection({ data: { config: { cancel: true } } }, sender);
    expect(idle).toMatchObject({ success: true, data: { cancelled: false } });
    expect(probeCustomConnection).toHaveBeenCalledTimes(1);
  });

  it('keeps the messaging backstop safely above the probe deadline', async () => {
    expect(CUSTOM_CONNECTION_PROBE_DEADLINE_MS).toBe(90000);

    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../../../../shared/messaging/core/UnifiedMessaging.js'),
      'utf8',
    );
    const match = source.match(/'TEST_CUSTOM_CONNECTION':\s*(\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match[1])).toBeGreaterThan(CUSTOM_CONNECTION_PROBE_DEADLINE_MS);
  });

  it('never touches Test Key semantics or settings', async () => {
    vi.mocked(probeCustomConnection).mockResolvedValue(semanticReport());

    await handleTestCustomConnection({
      data: { config: { apiUrl: 'https://a.example/x', apiModel: 'm', apiKey: 'k' } },
    });

    expect(ApiKeyManager.testKeysDirect).not.toHaveBeenCalled();

    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), './handleTestCustomConnection.js'),
      'utf8',
    );
    const importLines = source.split('\n').filter((line) => line.trim().startsWith('import'));
    expect(importLines.join('\n')).not.toMatch(/ApiKeyManager|StorageCore|storageManager/);
    // Narrowly scoped to settings persistence: the caller-keyed registry Map
    // legitimately uses Map#set for in-flight check bookkeeping.
    expect(source).not.toMatch(/storageManager|StorageCore|\.persist|updateSetting/);
  });
});
