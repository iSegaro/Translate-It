import { describe, it, expect } from 'vitest';
import { getFirstMissingSetting } from './providerValidator.js';
import { findProviderById } from '@/features/translation/providers/ProviderManifest.js';

describe('providerValidator', () => {
  it('does not require an API key for the OpenAI Compatible provider', () => {
    const provider = findProviderById('custom');

    expect(provider?.requiredSettings).toEqual(['CUSTOM_API_URL', 'CUSTOM_API_MODEL']);
    expect(
      getFirstMissingSetting('custom', {
        CUSTOM_API_URL: 'https://example.com/v1/chat/completions',
        CUSTOM_API_MODEL: 'gpt-4o-mini',
        CUSTOM_API_KEY: ''
      })
    ).toBeNull();
  });

  it('still requires the custom endpoint URL and model', () => {
    expect(
      getFirstMissingSetting('custom', {
        CUSTOM_API_URL: '',
        CUSTOM_API_MODEL: 'gpt-4o-mini'
      })
    ).toBe('CUSTOM_API_URL');

    expect(
      getFirstMissingSetting('custom', {
        CUSTOM_API_URL: 'https://example.com/v1/chat/completions',
        CUSTOM_API_MODEL: ''
      })
    ).toBe('CUSTOM_API_MODEL');
  });
});
