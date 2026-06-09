import { describe, it, expect, vi } from 'vitest';
import { PROMPT_REGISTRY, getRequiredPlaceholders, isPromptEditable } from './PromptRegistry.js';

describe('PromptRegistry', () => {
  it('contains expected user prompts', () => {
    expect(PROMPT_REGISTRY.PROMPT_TEMPLATE).toBeDefined();
    expect(PROMPT_REGISTRY.PROMPT_TEMPLATE_AUTO).toBeDefined();
    expect(PROMPT_REGISTRY.PROMPT_TEMPLATE.editable).toBe(true);
    expect(PROMPT_REGISTRY.PROMPT_TEMPLATE_AUTO.editable).toBe(true);
  });

  it('contains expected system prompts and they are not editable', () => {
    expect(PROMPT_REGISTRY.PROMPT_BASE_AI_BATCH).toBeDefined();
    expect(PROMPT_REGISTRY.PROMPT_BASE_AI_BATCH.editable).toBe(false);
    expect(PROMPT_REGISTRY.PROMPT_BASE_AI_BATCH_AUTO).toBeDefined();
    expect(PROMPT_REGISTRY.PROMPT_BASE_SELECT).toBeDefined();
    expect(PROMPT_REGISTRY.PROMPT_BASE_SCREEN_CAPTURE).toBeDefined();
    expect(PROMPT_REGISTRY.PROMPT_BASE_POPUP_TRANSLATE).toBeDefined();
  });

  it('returns correct required placeholders', () => {
    const aiBatchPlaceholders = getRequiredPlaceholders('PROMPT_BASE_AI_BATCH');
    expect(aiBatchPlaceholders).toContain('$_{COUNT}');
    expect(aiBatchPlaceholders).toContain('$_{PROMPT_INSTRUCTIONS}');
    
    const autoPlaceholders = getRequiredPlaceholders('PROMPT_TEMPLATE_AUTO');
    expect(autoPlaceholders).not.toContain('$_{SOURCE}');
    expect(autoPlaceholders).toContain('$_{TARGET}');

    const screenCapturePlaceholders = getRequiredPlaceholders('PROMPT_BASE_SCREEN_CAPTURE');
    expect(screenCapturePlaceholders).toContain('$_{PROMPT_INSTRUCTIONS}');
  });

  it('correctly identifies editable prompts', () => {
    expect(isPromptEditable('PROMPT_TEMPLATE')).toBe(true);
    expect(isPromptEditable('PROMPT_BASE_AI_BATCH')).toBe(false);
    expect(isPromptEditable('NON_EXISTENT')).toBe(false);
  });
});
