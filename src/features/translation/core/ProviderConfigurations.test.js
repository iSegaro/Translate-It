import { describe, it, expect, vi } from 'vitest';

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

import { PROVIDER_CONFIGURATIONS, getProviderRateLimit } from './ProviderConfigurations.js';

describe('ProviderConfigurations optimization scaling', () => {
  it('should give base-2 providers a distinct Level 2 concurrency step', () => {
    const levels = [1, 2, 3, 4, 5];
    const expected = [1, 2, 2, 3, 4];

    for (const providerName of ['WebAI', 'OpenAI', 'DeepSeek', 'OpenRouter', 'Custom']) {
      const actual = levels.map(level => getProviderRateLimit(providerName, level).maxConcurrent);
      expect(actual).toEqual(expected);
    }
  });

  it('should keep base-1 providers on the conservative matrix', () => {
    const levels = [1, 2, 3, 4, 5];
    const expected = [1, 1, 1, 2, 2];
    const originalMaxConcurrent = PROVIDER_CONFIGURATIONS.Custom.rateLimit.maxConcurrent;

    try {
      PROVIDER_CONFIGURATIONS.Custom.rateLimit.maxConcurrent = 1;

      expect(levels.map(level => getProviderRateLimit('Custom', level).maxConcurrent))
        .toEqual(expected);
    } finally {
      PROVIDER_CONFIGURATIONS.Custom.rateLimit.maxConcurrent = originalMaxConcurrent;
    }
  });

  it('should keep higher-base providers on sensible growth curves', () => {
    expect([1, 2, 3, 4, 5].map(level => getProviderRateLimit('Gemini', level).maxConcurrent))
      .toEqual([1, 2, 3, 5, 6]);

    expect([1, 2, 3, 4, 5].map(level => getProviderRateLimit('GoogleTranslate', level).maxConcurrent))
      .toEqual([1, 2, 4, 6, 8]);

    expect([1, 2, 3, 4, 5].map(level => getProviderRateLimit('DeepLTranslate', level).maxConcurrent))
      .toEqual([2, 3, 5, 8, 10]);
  });

  it('should keep WebAI aligned with the desired base-2 curve', () => {
    expect(getProviderRateLimit('WebAI', 2).maxConcurrent).toBe(2);
    expect(getProviderRateLimit('WebAI', 5).maxConcurrent).toBe(4);
  });

  it('should scale select element mode overrides for base-2 providers', () => {
    const levels = [1, 2, 3, 4, 5];
    const expected = [1, 2, 2, 3, 4];

    expect(levels.map(level => getProviderRateLimit('WebAI', level).modeOverrides.select_element.maxConcurrent))
      .toEqual(expected);
  });
});
