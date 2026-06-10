import { describe, it, expect, vi } from 'vitest';
import { runSettingsMigrations, HISTORICAL_PROMPT_DEFAULTS } from './settingsMigrations.js';
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

  // --- Safe Prompt Migration Tests ---

  it('should add current default when prompt key is missing', async () => {
    const currentSettings = {
      THEME: 'light'
    };
    // Ensure PROMPT_TEMPLATE is missing in currentSettings
    delete currentSettings.PROMPT_TEMPLATE;

    const { updates, logs } = await runSettingsMigrations(currentSettings);
    expect(updates.PROMPT_TEMPLATE).toBe(CONFIG.PROMPT_TEMPLATE);
    expect(logs).toContain('Added missing prompt setting: PROMPT_TEMPLATE');
  });

  it('should restore current default when prompt template is empty', async () => {
    const currentSettings = {
      PROMPT_TEMPLATE: '   '
    };

    const { updates, logs } = await runSettingsMigrations(currentSettings);
    expect(updates.PROMPT_TEMPLATE).toBe(CONFIG.PROMPT_TEMPLATE);
    expect(logs.some(l => l.includes('Restored empty/missing prompt PROMPT_TEMPLATE to default'))).toBe(true);
  });

  it('should leave prompt unchanged when it exactly matches current default', async () => {
    const currentSettings = {
      PROMPT_TEMPLATE: CONFIG.PROMPT_TEMPLATE
    };

    const { updates } = await runSettingsMigrations(currentSettings);
    expect(updates.PROMPT_TEMPLATE).toBeUndefined();
  });

  it('should migrate historical legacy defaults to current default', async () => {
    // Add a temporary mock historical default to test matching
    const testOldDefault = 'legacy old default template _{SOURCE} _{TARGET} _{TEXT}';
    if (!HISTORICAL_PROMPT_DEFAULTS.PROMPT_TEMPLATE) {
      HISTORICAL_PROMPT_DEFAULTS.PROMPT_TEMPLATE = [];
    }
    HISTORICAL_PROMPT_DEFAULTS.PROMPT_TEMPLATE.push(testOldDefault);

    try {
      const currentSettings = {
        PROMPT_TEMPLATE: testOldDefault
      };

      const { updates, logs } = await runSettingsMigrations(currentSettings);
      expect(updates.PROMPT_TEMPLATE).toBe(CONFIG.PROMPT_TEMPLATE);
      expect(logs.some(l => l.includes('Upgraded legacy default prompt PROMPT_TEMPLATE to latest version'))).toBe(true);
    } finally {
      // Clean up to ensure test isolation
      const index = HISTORICAL_PROMPT_DEFAULTS.PROMPT_TEMPLATE.indexOf(testOldDefault);
      if (index > -1) {
        HISTORICAL_PROMPT_DEFAULTS.PROMPT_TEMPLATE.splice(index, 1);
      }
    }
  });

  it('should preserve customized prompt even if prompts version increases', async () => {
    const customPrompt = 'My custom customized prompt $_{SOURCE} $_{TARGET} $_{TEXT}';
    const currentSettings = {
      PROMPT_TEMPLATE: customPrompt,
      PROMPTS_VERSION: (CONFIG.PROMPTS_VERSION || 1) - 1
    };

    const { updates } = await runSettingsMigrations(currentSettings);
    // Custom template must be preserved (not overwritten/reverted)
    expect(updates.PROMPT_TEMPLATE).toBeUndefined();
    // But metadata version should still be updated
    expect(updates.PROMPTS_VERSION).toBe(CONFIG.PROMPTS_VERSION);
  });
});
