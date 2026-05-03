import { describe, it, expect, vi } from 'vitest';
import { runSettingsMigrations } from './settingsMigrations.js';
import { CONFIG, TranslationMode } from './config.js';

// Mock logger
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

describe('Settings Migrations', () => {
  it('should add missing settings from CONFIG', async () => {
    const currentSettings = { THEME: 'dark' }; // Missing most things
    const { updates, logs } = await runSettingsMigrations(currentSettings);
    
    expect(updates.APP_NAME).toBe(CONFIG.APP_NAME);
    expect(logs).toContain('Added missing setting: APP_NAME');
  });

  it('should migrate legacy MODE_PROVIDERS keys', async () => {
    const currentSettings = {
      MODE_PROVIDERS: {
        'select_element': 'google',
        'popup_translate': 'openai'
      }
    };
    
    const { updates } = await runSettingsMigrations(currentSettings);
    
    expect(updates.MODE_PROVIDERS[TranslationMode.Select_Element]).toBe('google');
    expect(updates.MODE_PROVIDERS[TranslationMode.Popup_Translate]).toBe('openai');
    expect(updates.MODE_PROVIDERS['select_element']).toBeUndefined();
  });

  it('should update model lists and reset selection if current model is gone', async () => {
    const currentSettings = {
      GEMINI_MODELS: [{ value: 'old-model', label: 'Old' }],
      GEMINI_MODEL: 'old-model'
    };
    
    // CONFIG has different models
    const { updates, logs } = await runSettingsMigrations(currentSettings);
    
    expect(updates.GEMINI_MODELS).toEqual(CONFIG.GEMINI_MODELS);
    expect(updates.GEMINI_MODEL).toBe(CONFIG.GEMINI_MODEL); // Reset to default
    expect(logs.some(l => l.includes('Reset GEMINI_MODEL'))).toBe(true);
  });

  it('should NOT update prompt templates if version is same', async () => {
    const customPrompt = 'My custom prompt $_{TEXT}';
    const currentSettings = {
      PROMPT_TEMPLATE: customPrompt,
      PROMPTS_VERSION: CONFIG.PROMPTS_VERSION
    };
    
    const { updates } = await runSettingsMigrations(currentSettings);
    expect(updates.PROMPT_TEMPLATE).toBeUndefined();
  });

  it('should FORCE update prompt templates if version increases', async () => {
    const customPrompt = 'My custom prompt $_{TEXT}';
    const currentSettings = {
      PROMPT_TEMPLATE: customPrompt,
      PROMPTS_VERSION: (CONFIG.PROMPTS_VERSION || 1) - 1
    };
    
    const { updates, logs } = await runSettingsMigrations(currentSettings);
    expect(updates.PROMPT_TEMPLATE).toBe(CONFIG.PROMPT_TEMPLATE);
    expect(logs.some(l => l.includes('Updated prompt template'))).toBe(true);
  });

  it('should migrate API_KEY to GEMINI_API_KEY', async () => {
    const currentSettings = {
      API_KEY: 'my-old-key',
      GEMINI_API_KEY: ''
    };
    
    const { updates, logs } = await runSettingsMigrations(currentSettings);
    expect(updates.GEMINI_API_KEY).toBe('my-old-key');
    expect(updates.API_KEY).toBe('');
    expect(logs).toContain('Migrated API_KEY to GEMINI_API_KEY (multi-key support)');
  });

  it('should preserve user sensitive data like translationHistory', async () => {
    const history = [{ text: 'a', translated: 'b' }];
    const currentSettings = {
      translationHistory: history
    };
    
    const { updates } = await runSettingsMigrations(currentSettings);
    expect(updates.translationHistory).toBeUndefined(); // Should not be in updates (no change)
  });
});
