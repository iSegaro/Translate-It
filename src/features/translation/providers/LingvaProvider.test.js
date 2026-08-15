import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LingvaProvider } from './LingvaProvider.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

vi.mock('webextension-polyfill', () => ({ default: { storage: { local: { get: vi.fn(), set: vi.fn() } } } }));
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({ init: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));
vi.mock('@/shared/config/config.js', () => ({ getLingvaApiUrlAsync: vi.fn().mockResolvedValue('https://lingva.test') }));

describe('LingvaProvider response contract', () => {
  let provider;
  beforeEach(() => { provider = new LingvaProvider(); });

  const translate = async (response, texts = ['source']) => {
    vi.spyOn(provider, '_executeRequest').mockImplementation(async (options) => options.extractResponse(response));
    return provider._translateChunk(texts, 'en', 'fa', 'selection');
  };

  it('accepts valid source-equal output', async () => {
    await expect(translate({ translation: 'URL' }, ['URL'])).resolves.toBe('URL');
  });

  it.each([undefined, {}, { translation: '' }, { translation: '   ' }])('rejects invalid response %p', async (response) => {
    await expect(translate(response)).rejects.toMatchObject({ type: ErrorTypes.API_RESPONSE_INVALID });
  });

  it('preserves output longer than source', async () => {
    await expect(translate({ translation: 'یک ترجمه بسیار طولانی' }, ['Hi'])).resolves.toBe('یک ترجمه بسیار طولانی');
  });

  it('rejects oversized request instead of clipping or source-filling', async () => {
    await expect(provider._translateChunk(['x'.repeat(1201)], 'en', 'fa', 'selection')).rejects.toMatchObject({ type: ErrorTypes.API_RESPONSE_INVALID });
  });
});
