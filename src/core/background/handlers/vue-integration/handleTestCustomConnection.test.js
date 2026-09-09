import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleTestCustomConnection } from './handleTestCustomConnection.js';
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
    expect(probeCustomConnection).toHaveBeenCalledWith({
      apiUrl: '  https://a.example/v1/chat/completions  ',
      apiModel: 'local-model',
      apiKey: 'k1',
    });
    expect(probeCustomConnection).toHaveBeenCalledTimes(1);
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
    expect(probeCustomConnection).toHaveBeenCalledWith({ apiUrl: '', apiModel: '', apiKey: '' });

    await handleTestCustomConnection({ data: { config: { apiUrl: 42, apiModel: null, apiKey: ['k'] } } });
    expect(probeCustomConnection).toHaveBeenCalledWith({ apiUrl: '', apiModel: '', apiKey: '' });
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
    expect(source).not.toMatch(/\.set\(|\.persist|updateSetting/);
  });
});
