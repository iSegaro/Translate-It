import { describe, it, expect } from 'vitest';
import secureStorage from './SecureStorage.js';

describe('SecureStorage export filtering', () => {
  it('should omit non-editable prompt wrappers from export', async () => {
    const settings = {
      THEME: 'dark',
      PROMPT_TEMPLATE: 'custom editable $_{TEXT}',
      PROMPT_SUBTITLE_USER: 'subtitle $_{SOURCE} $_{TARGET}',
      PROMPT_BASE_AI_BATCH: 'old wrapper',
      PROMPT_BASE_AI_BATCH_AUTO: 'old wrapper auto',
      PROMPT_BASE_SELECT: 'select wrapper',
      PROMPT_BASE_BATCH: 'batch wrapper',
      PROMPT_BASE_AI_FOLLOWUP: 'followup wrapper',
      PROMPT_BASE_AI_FOLLOWUP_AUTO: 'followup auto wrapper',
      PROMPT_BASE_SCREEN_CAPTURE: 'capture wrapper',
      PROMPT_SUBTITLE_BASE: 'subtitle base wrapper',
      PROMPT_SUBTITLE_BATCH: 'subtitle batch wrapper'
    };

    const result = await secureStorage.prepareForExport(settings);

    // Non-editable wrappers omitted
    expect(result).not.toHaveProperty('PROMPT_BASE_AI_BATCH');
    expect(result).not.toHaveProperty('PROMPT_BASE_AI_BATCH_AUTO');
    expect(result).not.toHaveProperty('PROMPT_BASE_SELECT');
    expect(result).not.toHaveProperty('PROMPT_BASE_BATCH');
    expect(result).not.toHaveProperty('PROMPT_BASE_AI_FOLLOWUP');
    expect(result).not.toHaveProperty('PROMPT_BASE_AI_FOLLOWUP_AUTO');
    expect(result).not.toHaveProperty('PROMPT_BASE_SCREEN_CAPTURE');
    expect(result).not.toHaveProperty('PROMPT_SUBTITLE_BASE');
    expect(result).not.toHaveProperty('PROMPT_SUBTITLE_BATCH');

    // Editable prompts still exported
    expect(result.PROMPT_TEMPLATE).toBe('custom editable $_{TEXT}');
    expect(result.PROMPT_SUBTITLE_USER).toBe('subtitle $_{SOURCE} $_{TARGET}');
    // Unrelated settings unaffected
    expect(result.THEME).toBe('dark');
  });
});
