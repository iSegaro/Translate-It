import { describe, it, expect } from 'vitest';
import { SubtitleProviderLimitsResolver } from './SubtitleProviderLimitsResolver.js';
import { PROVIDER_CONFIGURATIONS } from '@/features/translation/core/ProviderConfigurations.js';

describe('SubtitleProviderLimitsResolver', () => {
  it('resolves registry aliases from their canonical provider configurations', () => {
    for (const [providerId, canonicalName] of [
      ['deepl', 'DeepLTranslate'],
      ['googlev2', 'GoogleTranslateV2'],
      ['edge', 'MicrosoftEdge'],
      ['bing', 'BingTranslate'],
      ['gemini', 'Gemini'],
    ]) {
      const config = PROVIDER_CONFIGURATIONS[canonicalName];
      const limits = SubtitleProviderLimitsResolver.resolve(providerId);

      expect(limits).toMatchObject({
        characterLimit: config.batching.characterLimit,
        maxChunks: config.batching.optimalSize,
        strategy: config.batching.strategy,
        reliableJsonMode: config.features?.reliableJsonMode || false,
      });
    }
  });

  it('keeps canonical and registry identifiers equivalent', () => {
    expect(SubtitleProviderLimitsResolver.resolve('deepl'))
      .toEqual(SubtitleProviderLimitsResolver.resolve('DeepLTranslate'));
  });

  it('uses safe defaults for unknown providers', () => {
    expect(SubtitleProviderLimitsResolver.resolve('unknown-provider'))
      .toEqual(SubtitleProviderLimitsResolver.getSafeDefaults());
    expect(SubtitleProviderLimitsResolver.resolve(null))
      .toEqual(SubtitleProviderLimitsResolver.getSafeDefaults());
  });
});
