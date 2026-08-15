import { describe, it, expect, vi } from 'vitest';

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

import {
  PROVIDER_CONFIGURATIONS,
  getProviderBatching,
  getProviderRateLimit,
} from './ProviderConfigurations.js';

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
    expect(getProviderRateLimit('WebAI', 3).delayBetweenRequests).toBe(0);
    expect(getProviderRateLimit('WebAI', 5).maxConcurrent).toBe(4);
    expect(getProviderRateLimit('WebAI', 5).delayBetweenRequests).toBe(0);
  });

  it('should scale select element mode overrides for base-2 providers', () => {
    const levels = [1, 2, 3, 4, 5];
    const expected = [1, 2, 2, 3, 4];

    expect(levels.map(level => getProviderRateLimit('WebAI', level).modeOverrides.select_element.maxConcurrent))
      .toEqual(expected);
  });

  it('keeps the AI Select Element character ceiling stable across levels', () => {
    const levels = [1, 2, 3, 4, 5];
    const batching = levels.map(level => getProviderBatching('WebAI', 'select_element', level));

    expect(batching.map(config => config.optimalSize)).toEqual([25, 25, 25, 25, 25]);
    expect(batching.map(config => config.characterLimit)).toEqual([3500, 3500, 3500, 3500, 3500]);
    expect(batching[4]).toMatchObject({
      maxComplexity: 150,
      singleBatchThreshold: 6,
    });
    expect(getProviderRateLimit('WebAI', 3).maxConcurrent).toBe(2);
    expect(getProviderRateLimit('WebAI', 5).maxConcurrent).toBe(4);
  });

  it('keeps generic AI batching scaling for non-Select Element modes', () => {
    expect([1, 2, 3, 4, 5].map(level => getProviderBatching('WebAI', null, level).optimalSize))
      .toEqual([50, 30, 20, 12, 6]);
  });

  it('keeps batching mode-aware while treating rate mode overrides as declarative', () => {
    const batching = getProviderBatching('OpenRouter', 'select_element', 3);
    const rateLimit = getProviderRateLimit('OpenRouter', 3);

    expect(batching).toMatchObject({ optimalSize: 25, characterLimit: 3500 });
    expect(rateLimit.maxConcurrent).toBe(2);
    expect(rateLimit.delayBetweenRequests).toBe(0);
    expect(rateLimit.modeOverrides.select_element.maxConcurrent).toBe(3);
  });

  it('keeps traditional provider character scaling unchanged', () => {
    expect(getProviderBatching('GoogleTranslate', null, 5).characterLimit).toBe(3000);
    expect(getProviderBatching('BingTranslate', null, 5).characterLimit).toBe(2400);
    expect(getProviderRateLimit('GoogleTranslate', 5).delayBetweenRequests).toBe(0);
  });
});
