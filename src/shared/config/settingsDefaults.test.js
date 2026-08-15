import { describe, expect, it } from 'vitest';
import { CONFIG } from './config.js';
import { PROMPT_REGISTRY } from './PromptRegistry.js';
import { getPersistedDefaultSettings } from './settingsDefaults.js';

describe('getPersistedDefaultSettings', () => {
  it('returns fresh mutable defaults without CONFIG-owned nested references', () => {
    const first = getPersistedDefaultSettings();
    const second = getPersistedDefaultSettings();

    expect(first).not.toBe(second);
    first.MODE_PROVIDERS.example = 'changed';
    first.OPENAI_MODELS.push({ value: 'test-only' });

    expect(second.MODE_PROVIDERS.example).toBeUndefined();
    expect(second.OPENAI_MODELS).not.toContainEqual({ value: 'test-only' });
    expect(CONFIG.MODE_PROVIDERS.example).toBeUndefined();
    expect(CONFIG.OPENAI_MODELS).not.toContainEqual({ value: 'test-only' });
  });

  it('contains persisted settings and excludes runtime-only CONFIG keys', () => {
    const defaults = getPersistedDefaultSettings();

    expect(defaults.THEME).toBe(CONFIG.THEME);
    expect(defaults.TIMEOUT).toBe(CONFIG.TIMEOUT);
    expect(defaults.GEMINI_MODEL).toBe(CONFIG.GEMINI_MODEL);
    expect(defaults.GEMINI_API_URL).toBe(CONFIG.GEMINI_API_URL);
    expect(defaults.GEMINI_MODELS).toEqual(CONFIG.GEMINI_MODELS);
    expect(defaults.GEMINI_THINKING_MODE).toBe('default');
    expect(defaults.TEXT_FIELD_SHORTCUT).toBe(CONFIG.TEXT_FIELD_SHORTCUT);
    expect(defaults.translationHistory).toBeUndefined();
    expect(defaults.PROMPT_TEMPLATE).toBe(CONFIG.PROMPT_TEMPLATE);
    expect(defaults.APP_NAME).toBeUndefined();
    expect(defaults.CHANGELOG_URL).toBeUndefined();
    expect(defaults.GOOGLE_TRANSLATE_URL).toBeUndefined();
  });

  it('excludes every non-editable prompt wrapper', () => {
    const defaults = getPersistedDefaultSettings();

    Object.values(PROMPT_REGISTRY)
      .filter(prompt => !prompt.editable)
      .forEach(prompt => expect(defaults[prompt.key]).toBeUndefined());
  });
});
