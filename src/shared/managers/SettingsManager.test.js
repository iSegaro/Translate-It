import { describe, expect, it, vi } from 'vitest';
import { getPersistedDefaultSettings } from '@/shared/config/settingsDefaults.js';

const { storageManagerMock } = vi.hoisted(() => ({
  storageManagerMock: {
    get: vi.fn().mockResolvedValue({}),
    set: vi.fn().mockResolvedValue(true),
    on: vi.fn(),
    off: vi.fn(),
    hasCached: vi.fn().mockReturnValue(false),
    getCached: vi.fn()
  }
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn()
  })
}));

vi.mock('@/shared/storage/core/StorageCore.js', () => ({
  storageManager: storageManagerMock
}));

vi.mock('@/features/settings/stores/settings.js', () => ({
  useSettingsStore: vi.fn()
}));

import { settingsManager } from './SettingsManager.js';

describe('SettingsManager defaults', () => {
  it('uses canonical persisted defaults for its fallback schema', () => {
    const canonicalDefaults = getPersistedDefaultSettings();
    const managerDefaults = settingsManager._defaults;

    expect(Object.keys(managerDefaults).every(key => (
      Object.prototype.hasOwnProperty.call(canonicalDefaults, key)
    ))).toBe(true);
    expect(Object.values(managerDefaults)).not.toContain(undefined);

    [
      'TARGET_LANGUAGE',
      'TRANSLATION_API',
      'MODE_PROVIDERS',
      'WHOLE_PAGE_EXCLUDED_SELECTORS',
      'MOUSE_HOVER_SCOPE',
      'MOUSE_HOVER_TRIGGER'
    ].forEach(key => {
      expect(managerDefaults[key]).toEqual(canonicalDefaults[key]);
    });

    [
      'DESKTOP_FAB_POSITION',
      'MOBILE_FAB_POSITION',
      'WHOLE_PAGE_MAX_CONCURRENT_REQUESTS'
    ].forEach(key => {
      expect(managerDefaults).not.toHaveProperty(key);
    });
  });

  it('excludes all credential-like canonical settings from fallback defaults', () => {
    const managerDefaults = settingsManager._defaults;
    const secretKeys = Object.keys(getPersistedDefaultSettings()).filter(key => (
      /(?:^|_)API_KEY$|(?:USERNAME|PASSWORD)$/.test(key)
    ));

    secretKeys.forEach(key => {
      expect(managerDefaults).not.toHaveProperty(key);
    });
  });

  it('keeps nested defaults independent from later canonical default builds', () => {
    const canonicalDefaults = getPersistedDefaultSettings();
    const untouchedDefaults = getPersistedDefaultSettings();
    const managerDefaults = settingsManager._defaults;

    expect(managerDefaults.MODE_PROVIDERS).not.toBe(canonicalDefaults.MODE_PROVIDERS);
    expect(managerDefaults.WHOLE_PAGE_EXCLUDED_SELECTORS)
      .not.toBe(canonicalDefaults.WHOLE_PAGE_EXCLUDED_SELECTORS);
    expect(managerDefaults.CONTEXT_MENU_VISIBILITY)
      .not.toBe(canonicalDefaults.CONTEXT_MENU_VISIBILITY);

    canonicalDefaults.MODE_PROVIDERS.__testOnly = 'changed';
    canonicalDefaults.WHOLE_PAGE_EXCLUDED_SELECTORS.push('.test-only');
    canonicalDefaults.CONTEXT_MENU_VISIBILITY.ACTION_CONTEXT_OPTIONS = false;

    expect(managerDefaults.MODE_PROVIDERS).not.toHaveProperty('__testOnly');
    expect(managerDefaults.WHOLE_PAGE_EXCLUDED_SELECTORS).not.toContain('.test-only');
    expect(managerDefaults.MODE_PROVIDERS).toEqual(untouchedDefaults.MODE_PROVIDERS);
    expect(managerDefaults.WHOLE_PAGE_EXCLUDED_SELECTORS)
      .toEqual(untouchedDefaults.WHOLE_PAGE_EXCLUDED_SELECTORS);
    expect(managerDefaults.CONTEXT_MENU_VISIBILITY)
      .toEqual(untouchedDefaults.CONTEXT_MENU_VISIBILITY);
  });

  it('loads only fallback keys during fallback initialization', async () => {
    const originalVue = window.Vue;
    settingsManager.destroy();
    settingsManager._fallbackMode = false;
    settingsManager._store = null;
    storageManagerMock.get.mockReset();
    storageManagerMock.get.mockResolvedValue({});
    window.Vue = undefined;

    try {
      await settingsManager.initialize();
    } finally {
      window.Vue = originalVue;
    }

    const requestedKeys = storageManagerMock.get.mock.calls.at(-1)[0];
    expect(requestedKeys).toEqual(Object.keys(settingsManager._defaults));
    expect(requestedKeys).not.toContain('OPENAI_API_KEY');
    expect(requestedKeys).not.toContain('PROXY_PASSWORD');
    expect(requestedKeys).not.toContain('DESKTOP_FAB_POSITION');
    expect(requestedKeys).not.toContain('MOBILE_FAB_POSITION');
    expect(requestedKeys).not.toContain('WHOLE_PAGE_MAX_CONCURRENT_REQUESTS');
  });

  it('rejects fallback keys missing from canonical persisted defaults', async () => {
    vi.resetModules();
    vi.doMock('@/shared/config/settingsDefaults.js', () => ({
      getPersistedDefaultSettings: () => ({})
    }));

    await expect(import('./SettingsManager.js')).rejects.toThrow(
      'Fallback settings missing canonical persisted defaults: APPLICATION_LOCALIZE'
    );
  });
});
