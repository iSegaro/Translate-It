import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runSettingsMigrations, mergeMissingNestedMembers } from './settingsMigrations.js';
import { HISTORICAL_PROMPT_DEFAULTS } from './promptHistoricalDefaults.js';
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should add missing settings from CONFIG', async () => {
    const currentSettings = { THEME: 'dark' }; // Missing most things
    const { updates, logs } = await runSettingsMigrations(currentSettings);
    
    expect(updates.APP_NAME).toBe(CONFIG.APP_NAME);
    expect(logs).toContain('Added missing setting: APP_NAME');
  });

  it('should not re-add non-editable prompt wrappers via missing-setting fill', async () => {
    const currentSettings = { THEME: 'dark' }; // Missing most things
    const { updates } = await runSettingsMigrations(currentSettings);

    // Genuinely persisted settings are still filled
    expect(updates.APP_NAME).toBe(CONFIG.APP_NAME);
    // Non-editable wrappers are CONFIG-owned and must not be written to storage
    expect(updates.PROMPT_BASE_AI_BATCH).toBeUndefined();
    expect(updates.PROMPT_BASE_AI_BATCH_AUTO).toBeUndefined();
    expect(updates.PROMPT_BASE_SELECT).toBeUndefined();
    expect(updates.PROMPT_BASE_BATCH).toBeUndefined();
    expect(updates.PROMPT_BASE_SCREEN_CAPTURE).toBeUndefined();
    expect(updates.PROMPT_SUBTITLE_BASE).toBeUndefined();
    expect(updates.PROMPT_SUBTITLE_BATCH).toBeUndefined();
  });

  it('should report legacy stored non-editable prompt wrappers for cleanup while keeping editable prompts', async () => {
    const currentSettings = {
      THEME: 'dark',
      PROMPT_BASE_AI_BATCH: 'old wrapper',
      PROMPT_SUBTITLE_BASE: 'old subtitle wrapper',
      PROMPT_TEMPLATE: 'custom user edit $_{TEXT}'
    };
    const { updates, logs, removals } = await runSettingsMigrations(currentSettings);

    // Leftover wrappers are reported for removal by the persistence owner
    expect(removals).toEqual(
      expect.arrayContaining(['PROMPT_BASE_AI_BATCH', 'PROMPT_SUBTITLE_BASE'])
    );
    // Editable customized prompt is preserved (neither removed nor overwritten)
    expect(removals).not.toContain('PROMPT_TEMPLATE');
    expect(updates.PROMPT_TEMPLATE).toBeUndefined();
    expect(logs.some(l => l.includes('Removing obsolete stored prompt wrapper: PROMPT_BASE_AI_BATCH'))).toBe(true);
  });

  it('should report empty removals when no legacy wrappers are present', async () => {
    const currentSettings = { THEME: 'dark', PROMPT_TEMPLATE: CONFIG.PROMPT_TEMPLATE };
    const { removals } = await runSettingsMigrations(currentSettings);

    expect(removals).toEqual([]);
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

  it('should migrate historical legacy defaults (string format) to current default', async () => {
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

  it('should migrate historical legacy defaults (object format) to current default', async () => {
    // Add a temporary mock historical default in object format to test matching
    const testOldDefaultObj = {
      version: 'v1.17.0',
      reason: 'Legacy default to migrate',
      value: 'legacy old default template in object format _{SOURCE} _{TARGET} _{TEXT}'
    };
    if (!HISTORICAL_PROMPT_DEFAULTS.PROMPT_TEMPLATE) {
      HISTORICAL_PROMPT_DEFAULTS.PROMPT_TEMPLATE = [];
    }
    HISTORICAL_PROMPT_DEFAULTS.PROMPT_TEMPLATE.push(testOldDefaultObj);

    try {
      const currentSettings = {
        PROMPT_TEMPLATE: testOldDefaultObj.value
      };

      const { updates, logs } = await runSettingsMigrations(currentSettings);
      expect(updates.PROMPT_TEMPLATE).toBe(CONFIG.PROMPT_TEMPLATE);
      expect(logs.some(l => l.includes('Upgraded legacy default prompt PROMPT_TEMPLATE to latest version'))).toBe(true);
    } finally {
      // Clean up to ensure test isolation
      const index = HISTORICAL_PROMPT_DEFAULTS.PROMPT_TEMPLATE.indexOf(testOldDefaultObj);
      if (index > -1) {
        HISTORICAL_PROMPT_DEFAULTS.PROMPT_TEMPLATE.splice(index, 1);
      }
    }
  });

  it('should preserve customized prompt during migration', async () => {
    const customPrompt = 'My custom customized prompt $_{SOURCE} $_{TARGET} $_{TEXT}';
    const currentSettings = {
      PROMPT_TEMPLATE: customPrompt
    };

    const { updates } = await runSettingsMigrations(currentSettings);
    // Custom template must be preserved (not overwritten/reverted)
    expect(updates.PROMPT_TEMPLATE).toBeUndefined();
  });

  // --- Nested Object Migration Tests ---

  it('should add a missing top-level nested object with its complete default', async () => {
    const currentSettings = { THEME: 'dark' }; // CONTEXT_MENU_VISIBILITY absent
    const { updates, logs } = await runSettingsMigrations(currentSettings);

    expect(updates.CONTEXT_MENU_VISIBILITY).toEqual(CONFIG.CONTEXT_MENU_VISIBILITY);
    expect(logs).toContain('Added missing setting: CONTEXT_MENU_VISIBILITY');
  });

  it('should backfill a missing nested member while preserving existing members', async () => {
    const currentSettings = {
      CONTEXT_MENU_VISIBILITY: {
        PAGE_CONTEXT_SELECT_ELEMENT: false
      }
    };

    const { updates } = await runSettingsMigrations(currentSettings);

    expect(updates.CONTEXT_MENU_VISIBILITY).toEqual({
      ...CONFIG.CONTEXT_MENU_VISIBILITY,
      PAGE_CONTEXT_SELECT_ELEMENT: false
    });
    expect(updates.CONTEXT_MENU_VISIBILITY.PAGE_CONTEXT_SELECT_ELEMENT).toBe(false);
    expect(updates.CONTEXT_MENU_VISIBILITY.PAGE_CONTEXT_SCREEN_CAPTURE).toBe(true);
  });

  it('should not emit an update when all nested members are already present', async () => {
    const currentSettings = {
      CONTEXT_MENU_VISIBILITY: { ...CONFIG.CONTEXT_MENU_VISIBILITY }
    };

    const { updates } = await runSettingsMigrations(currentSettings);
    expect(updates.CONTEXT_MENU_VISIBILITY).toBeUndefined();
  });

  it('should backfill a newly added nested flag into an older persisted object', async () => {
    const currentSettings = {
      CONTEXT_MENU_VISIBILITY: {
        PAGE_CONTEXT_SELECT_ELEMENT: true,
        PAGE_CONTEXT_SCREEN_CAPTURE: true,
        PAGE_CONTEXT_PDF_TRANSLATOR: true,
        ACTION_CONTEXT_SELECT_ELEMENT: true,
        ACTION_CONTEXT_SCREEN_CAPTURE: true,
        ACTION_CONTEXT_OPTIONS: true,
        ACTION_CONTEXT_SHORTCUTS: true,
        ACTION_CONTEXT_HELP: true
      }
    };

    const { updates } = await runSettingsMigrations(currentSettings);

    expect(updates.CONTEXT_MENU_VISIBILITY.PAGE_CONTEXT_PDF_TRANSLATOR).toBe(true);
    expect(updates.CONTEXT_MENU_VISIBILITY.PAGE_CONTEXT_SELECT_ELEMENT).toBe(true);
    expect(updates.CONTEXT_MENU_VISIBILITY.ACTION_CONTEXT_PDF_TRANSLATOR).toBe(true);
    expect(updates.CONTEXT_MENU_VISIBILITY.ACTION_CONTEXT_SUBTITLE_TRANSLATOR).toBe(true);
  });

  it('should preserve existing nested user values and backfill missing MODE_PROVIDERS members', async () => {
    const currentSettings = {
      MODE_PROVIDERS: {
        [TranslationMode.Select_Element]: 'google'
      }
    };

    const { updates } = await runSettingsMigrations(currentSettings);

    expect(updates.MODE_PROVIDERS[TranslationMode.Select_Element]).toBe('google');
    expect(updates.MODE_PROVIDERS[TranslationMode.Popup_Translate]).toBe(null);
    expect(updates.MODE_PROVIDERS[TranslationMode.Page]).toBe(null);
  });

  it('should not clobber a remap result from an earlier migration pass', async () => {
    const currentSettings = {
      MODE_PROVIDERS: {
        'select_element': 'google'
      }
    };

    const { updates } = await runSettingsMigrations(currentSettings);

    // Remap renamed the legacy key BEFORE nested backfill; the legacy key must not return
    expect(updates.MODE_PROVIDERS[TranslationMode.Select_Element]).toBe('google');
    expect(updates.MODE_PROVIDERS['select_element']).toBeUndefined();
  });

  it('should preserve an existing empty-string nested member', async () => {
    const stored = { text: '' };
    const defaults = { text: 'default', extra: 'added' };
    expect(mergeMissingNestedMembers(stored, defaults)).toEqual({ text: '', extra: 'added' });
  });

  it('should preserve existing false and zero nested members', async () => {
    const stored = { enabled: false, level: 0 };
    const defaults = { enabled: true, level: 1, extra: true };
    expect(mergeMissingNestedMembers(stored, defaults)).toEqual({
      enabled: false,
      level: 0,
      extra: true
    });
  });

  it('should recursively backfill deeply missing nested members', async () => {
    const stored = { a: { b: {} } };
    const defaults = { a: { b: { c: 1 }, d: 2 }, e: 3 };
    expect(mergeMissingNestedMembers(stored, defaults)).toEqual({
      a: { b: { c: 1 }, d: 2 },
      e: 3
    });
  });

  it('should not overwrite a cross-type stored primitive (default is object)', async () => {
    const stored = { edge: 'legacy-voice-id' };
    const defaults = { edge: null, google: null };
    expect(mergeMissingNestedMembers(stored, defaults)).toEqual({
      edge: 'legacy-voice-id',
      google: null
    });
  });

  it('should not recurse into a cross-type stored object (default is primitive)', async () => {
    const stored = { x: { a: 1 } };
    const defaults = { x: 1 };
    expect(mergeMissingNestedMembers(stored, defaults)).toBeNull();
  });

  it('should treat arrays as leaves and never element-merge', async () => {
    const stored = { models: [{ value: 'old', thinking: { enabled: true } }] };
    const defaults = { models: [{ value: 'new', thinking: { enabled: false } }], extra: 1 };
    expect(mergeMissingNestedMembers(stored, defaults)).toEqual({
      models: [{ value: 'old', thinking: { enabled: true } }],
      extra: 1
    });
  });

  it('should add a missing array member as a complete leaf', async () => {
    expect(mergeMissingNestedMembers({}, { models: [1, 2] })).toEqual({ models: [1, 2] });
  });

  it('should not recursively process RegExp values', async () => {
    const regex = /[a-z]/;
    expect(mergeMissingNestedMembers({}, { re: regex })).toEqual({ re: regex });
    expect(mergeMissingNestedMembers({ re: /[0-9]/ }, { re: regex })).toBeNull();
  });

  it('should be a no-op for empty dictionary defaults', async () => {
    expect(mergeMissingNestedMembers({}, {})).toBeNull();
    expect(mergeMissingNestedMembers({ custom: 'value' }, {})).toBeNull();
  });

  it('should not mutate either input object', async () => {
    const stored = { a: { keep: 'v' } };
    const defaults = { a: { keep: 'v', add: 2 }, top: 3 };
    const storedSnapshot = JSON.stringify(stored);
    const defaultsSnapshot = JSON.stringify(defaults);

    mergeMissingNestedMembers(stored, defaults);

    expect(JSON.stringify(stored)).toBe(storedSnapshot);
    expect(JSON.stringify(defaults)).toBe(defaultsSnapshot);
  });

  it('should skip DO_NOT_MIGRATE settings entirely', async () => {
    const currentSettings = {
      EXCLUDED_SITES: ['example.com'],
      OPENAI_API_KEY: 'secret'
    };

    const { updates } = await runSettingsMigrations(currentSettings);
    expect(updates.EXCLUDED_SITES).toBeUndefined();
    expect(updates.OPENAI_API_KEY).toBeUndefined();
  });
});
