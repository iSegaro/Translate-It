import { describe, expect, it } from 'vitest';
import { GeminiLiveProviderAdapter } from './GeminiLiveProviderAdapter.js';
import { LiveDubbingProviderRegistry } from './LiveDubbingProviderRegistry.js';

describe('LiveDubbingProviderRegistry', () => {
  it('creates the Gemini adapter for the canonical provider id', () => {
    const registry = new LiveDubbingProviderRegistry();

    expect(registry.create('gemini')).toBeInstanceOf(GeminiLiveProviderAdapter);
  });

  it('fails closed for unknown providers', () => {
    const registry = new LiveDubbingProviderRegistry();

    expect(registry.create('unknown-provider')).toBeNull();
  });
});
