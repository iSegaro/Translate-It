import { describe, it, expect, beforeEach } from 'vitest';
import { OptionsValidator } from './validation.js';

describe('OptionsValidator - PromptRegistry Integration', () => {
  let validator;

  beforeEach(() => {
    validator = new OptionsValidator();
  });

  it('validates standard templates without promptKey (backward compatibility)', async () => {
    const template = 'Translate from $_{SOURCE} to $_{TARGET}: $_{TEXT}';
    const isValid = await validator.validatePromptTemplate(template);
    expect(isValid).toBe(true);
    expect(validator.hasErrors()).toBe(false);
  });

  it('fails standard template when placeholders are missing (backward compatibility)', async () => {
    const template = 'Missing placeholders';
    const isValid = await validator.validatePromptTemplate(template);
    expect(isValid).toBe(false);
    expect(validator.getFieldErrors('promptTemplate').length).toBeGreaterThan(0);
  });

  it('uses registry-specific placeholders when promptKey is provided', async () => {
    // PROMPT_TEMPLATE_AUTO in registry does NOT require $_{SOURCE}
    const autoTemplate = 'Translate to $_{TARGET}: $_{TEXT}';
    const isValid = await validator.validatePromptTemplate(autoTemplate, 'PROMPT_TEMPLATE_AUTO');
    expect(isValid).toBe(true);
    expect(validator.hasErrors()).toBe(false);
  });

  it('fails when registry-specific placeholders are missing', async () => {
    // PROMPT_BASE_AI_BATCH requires $_{COUNT} and $_{PROMPT_INSTRUCTIONS}
    const aiBatchTemplate = 'Translate $_{SOURCE} to $_{TARGET}: $_{TEXT}';
    const isValid = await validator.validatePromptTemplate(aiBatchTemplate, 'PROMPT_BASE_AI_BATCH');
    expect(isValid).toBe(false);
    const errors = validator.getFieldErrors('promptTemplate');
    // Error object with params containing missing placeholders
    expect(errors[0].params.placeholders).toContain('$_{COUNT}');
    expect(errors[0].params.placeholders).toContain('$_{PROMPT_INSTRUCTIONS}');
  });

  it('validates newly editable PROMPT_BASE_FIELD correctly', async () => {
    // Requires: SOURCE, TARGET, PROMPT_INSTRUCTIONS, TEXT
    const template = 'Translate from $_{SOURCE} to $_{TARGET}: $_{PROMPT_INSTRUCTIONS} \n\n $_{TEXT}';
    const isValid = await validator.validatePromptTemplate(template, 'PROMPT_BASE_FIELD');
    expect(isValid).toBe(true);
    expect(validator.hasErrors()).toBe(false);
  });

  it('validates PROMPT_SUBTITLE_USER with minimal placeholders', async () => {
    // Requires only: SOURCE, TARGET (No TEXT required)
    const template = 'Rules for $_{SOURCE} to $_{TARGET} translation.';
    const isValid = await validator.validatePromptTemplate(template, 'PROMPT_SUBTITLE_USER');
    expect(isValid).toBe(true);
    expect(validator.hasErrors()).toBe(false);
  });

  it('fails PROMPT_SUBTITLE_USER when SOURCE or TARGET are missing', async () => {
    const template = 'Missing target for $_{SOURCE}';
    const isValid = await validator.validatePromptTemplate(template, 'PROMPT_SUBTITLE_USER');
    expect(isValid).toBe(false);
    expect(validator.getFieldErrors('promptTemplate')[0].params.placeholders).toContain('$_{TARGET}');
  });
});
