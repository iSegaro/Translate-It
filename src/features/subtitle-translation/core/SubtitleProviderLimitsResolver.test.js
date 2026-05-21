import { describe, it, expect } from 'vitest';
import { SubtitleProviderLimitsResolver } from './SubtitleProviderLimitsResolver.js';

describe('SubtitleProviderLimitsResolver', () => {
  it('should resolve provider limits correctly', () => {
    const geminiLimits = SubtitleProviderLimitsResolver.resolve('Gemini');
    expect(geminiLimits).toBeDefined();
    expect(geminiLimits.characterLimit).toBeGreaterThan(0);
    expect(geminiLimits.maxChunks).toBeGreaterThan(0);
  });
});
