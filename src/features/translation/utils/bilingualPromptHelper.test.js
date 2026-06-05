import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/shared/config/config.js', () => ({
  getBilingualTranslationEnabledAsync: vi.fn(),
  getBilingualTranslationModesAsync: vi.fn(),
  TranslationMode: {
    Field: 'content',
  }
}));

import { isBilingualAutoPromptEnabledAsync, shouldUseAutoPromptAsync } from './bilingualPromptHelper.js';

describe('bilingualPromptHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('disables auto prompts when bilingual is globally off', async () => {
    const { getBilingualTranslationEnabledAsync, getBilingualTranslationModesAsync } = await import('@/shared/config/config.js');
    getBilingualTranslationEnabledAsync.mockResolvedValue(false);
    getBilingualTranslationModesAsync.mockResolvedValue({ content: true });

    await expect(isBilingualAutoPromptEnabledAsync('content')).resolves.toBe(false);
    await expect(shouldUseAutoPromptAsync('auto', 'content')).resolves.toBe(false);
  });

  it('respects per-mode bilingual settings', async () => {
    const { getBilingualTranslationEnabledAsync, getBilingualTranslationModesAsync } = await import('@/shared/config/config.js');
    getBilingualTranslationEnabledAsync.mockResolvedValue(true);
    getBilingualTranslationModesAsync.mockResolvedValue({ content: false, field: true });

    await expect(isBilingualAutoPromptEnabledAsync('content')).resolves.toBe(true);
    await expect(shouldUseAutoPromptAsync('auto', 'content')).resolves.toBe(true);
  });
});
