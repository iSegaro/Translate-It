import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPersistedDefaultSettings } from '@/shared/config/settingsDefaults.js';

const { storageManagerMock } = vi.hoisted(() => ({
  storageManagerMock: {
    get: vi.fn().mockResolvedValue({}),
    set: vi.fn().mockResolvedValue(true),
    clear: vi.fn().mockResolvedValue(true),
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
import { useSettingsStore } from '@/features/settings/stores/settings.js';

function createStorageEventMock() {
  const listeners = new Set();
  const onChanged = {
    addListener: vi.fn(callback => {
      listeners.add(callback);
    }),
    removeListener: vi.fn(callback => {
      listeners.delete(callback);
    })
  };

  return {
    onChanged,
    dispatch: (changes, areaName) => {
      for (const listener of listeners) {
        listener(changes, areaName);
      }
    },
    getListener: () => listeners.values().next().value,
    getActiveListeners: () => [...listeners]
  };
}

function createSettingsStoreMock(overrides = {}) {
  return {
    settings: {
      EXTENSION_ENABLED: false,
      STORE_ONLY_SETTING: 'store-value'
    },
    loadSettings: vi.fn().mockResolvedValue(undefined),
    updateSettingAndPersist: vi.fn().mockResolvedValue(undefined),
    updateMultipleSettings: vi.fn().mockResolvedValue(undefined),
    resetSettings: vi.fn().mockResolvedValue(undefined),
    exportSettings: vi.fn().mockResolvedValue('exported-settings'),
    importSettings: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

let originalVue;
let originalStorageOnChanged;

beforeEach(async () => {
  if (settingsManager._initializationPromise) {
    await settingsManager._initializationPromise;
  }

  vi.clearAllMocks();
  settingsManager.destroy();
  useSettingsStore.mockReset().mockReturnValue(undefined);
  storageManagerMock.get.mockReset().mockResolvedValue({});
  storageManagerMock.set.mockReset().mockResolvedValue(true);
  originalVue = window.Vue;
  originalStorageOnChanged = browser.storage.onChanged;
  window.Vue = undefined;
  browser.storage.onChanged = undefined;
});

afterEach(() => {
  settingsManager.destroy();
  window.Vue = originalVue;
  browser.storage.onChanged = originalStorageOnChanged;
});

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
      'MOUSE_HOVER_TRIGGER',
      'TEXT_FIELD_SHORTCUT',
      'AI_CONTEXT_TRANSLATION_ENABLED'
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

  it('shares fallback initialization and registers one storage listener', async () => {
    const storageEvents = createStorageEventMock();
    browser.storage.onChanged = storageEvents.onChanged;

    let resolveStorage;
    storageManagerMock.get.mockReturnValue(new Promise(resolve => {
      resolveStorage = resolve;
    }));

    const firstInitialization = settingsManager.initialize();
    const secondInitialization = settingsManager.initialize();

    expect(firstInitialization).toBe(secondInitialization);
    expect(storageManagerMock.get).toHaveBeenCalledTimes(1);

    resolveStorage({ EXTENSION_ENABLED: false });
    await firstInitialization;

    expect(settingsManager.get('EXTENSION_ENABLED')).toBe(false);
    expect(storageEvents.onChanged.addListener).toHaveBeenCalledTimes(1);
    expect(storageEvents.getListener()).toEqual(expect.any(Function));
  });

  it('uses fallback initialization when Vue store is unavailable', async () => {
    const storageEvents = createStorageEventMock();
    browser.storage.onChanged = storageEvents.onChanged;
    window.Vue = {};

    await settingsManager.initialize();

    expect(settingsManager._fallbackMode).toBe(true);
    expect(storageEvents.onChanged.addListener).toHaveBeenCalledTimes(1);
  });

  it('uses fallback initialization when store loading fails', async () => {
    const storageEvents = createStorageEventMock();
    browser.storage.onChanged = storageEvents.onChanged;
    window.Vue = {};
    useSettingsStore.mockReturnValue({
      loadSettings: vi.fn().mockRejectedValue(new Error('store unavailable'))
    });

    await settingsManager.initialize();

    expect(settingsManager._fallbackMode).toBe(true);
    expect(storageEvents.onChanged.addListener).toHaveBeenCalledTimes(1);
  });

  it('returns fallback settings instead of retained failed-store settings', async () => {
    const failedStore = createSettingsStoreMock({
      settings: {
        EXTENSION_ENABLED: true,
        STORE_ONLY_SETTING: 'stale-store-value'
      },
      loadSettings: vi.fn().mockRejectedValue(new Error('store unavailable'))
    });
    window.Vue = {};
    useSettingsStore.mockReturnValue(failedStore);
    storageManagerMock.get.mockResolvedValue({
      EXTENSION_ENABLED: false,
      OPENAI_API_KEY: 'secret'
    });

    await settingsManager.initialize();

    expect(settingsManager._store).toBe(failedStore);
    expect(settingsManager._fallbackMode).toBe(true);
    expect(settingsManager.getSettings()).toBe(settingsManager._settings.value);
    expect(settingsManager.getSettings()).not.toBe(failedStore.settings);
    expect(settingsManager.get('EXTENSION_ENABLED')).toBe(false);
    expect(settingsManager.has('STORE_ONLY_SETTING')).toBe(false);
    expect(settingsManager.getAll()).not.toHaveProperty('STORE_ONLY_SETTING');
    expect(settingsManager.getSettings()).not.toHaveProperty('OPENAI_API_KEY');
  });

  it('uses own fallback state for has and getAll', async () => {
    const storageEvents = createStorageEventMock();
    browser.storage.onChanged = storageEvents.onChanged;
    storageManagerMock.get.mockResolvedValue({
      EXTENSION_ENABLED: false,
      OPENAI_API_KEY: 'secret',
      PROXY_PASSWORD: 'secret'
    });

    await settingsManager.initialize();

    expect(settingsManager.has('EXTENSION_ENABLED')).toBe(true);
    expect(settingsManager.has('NOT_EXPOSED')).toBe(false);
    expect(settingsManager.has('OPENAI_API_KEY')).toBe(false);
    expect(settingsManager.has('toString')).toBe(false);

    storageManagerMock.get.mockClear();
    const allSettings = settingsManager.getAll();

    expect(allSettings).not.toBe(settingsManager._settings.value);
    expect(allSettings).toEqual(settingsManager._settings.value);
    expect(allSettings.MODE_PROVIDERS).toBe(settingsManager._settings.value.MODE_PROVIDERS);
    expect(allSettings).not.toHaveProperty('OPENAI_API_KEY');
    expect(allSettings).not.toHaveProperty('GEMINI_API_KEY');
    expect(allSettings).not.toHaveProperty('PROXY_USERNAME');
    expect(allSettings).not.toHaveProperty('PROXY_PASSWORD');
    expect(storageManagerMock.get).not.toHaveBeenCalled();
  });

  it('sets multiple fallback values once and suppresses matching storage events', async () => {
    const storageEvents = createStorageEventMock();
    browser.storage.onChanged = storageEvents.onChanged;
    const failedStore = createSettingsStoreMock({
      loadSettings: vi.fn().mockRejectedValue(new Error('store unavailable'))
    });
    window.Vue = {};
    useSettingsStore.mockReturnValue(failedStore);
    storageManagerMock.get.mockResolvedValue({
      EXTENSION_ENABLED: false,
      TRANSLATE_ON_TEXT_FIELDS: false,
      TRANSLATE_ON_TEXT_SELECTION: false
    });
    await settingsManager.initialize();

    const extensionChange = vi.fn();
    const fieldChange = vi.fn();
    const selectionChange = vi.fn();
    settingsManager.onChange('EXTENSION_ENABLED', extensionChange);
    settingsManager.onChange('TRANSLATE_ON_TEXT_FIELDS', fieldChange);
    settingsManager.onChange('TRANSLATE_ON_TEXT_SELECTION', selectionChange);
    storageManagerMock.get.mockClear();
    const updates = {
      EXTENSION_ENABLED: true,
      TRANSLATE_ON_TEXT_FIELDS: false,
      TRANSLATE_ON_TEXT_SELECTION: true
    };
    storageManagerMock.set.mockImplementation(async () => {
      storageEvents.dispatch({
        EXTENSION_ENABLED: { oldValue: false, newValue: true },
        TRANSLATE_ON_TEXT_FIELDS: { oldValue: false, newValue: false },
        TRANSLATE_ON_TEXT_SELECTION: { oldValue: false, newValue: true }
      }, 'local');
    });

    await settingsManager.setMultiple(updates);

    expect(storageManagerMock.set).toHaveBeenCalledTimes(1);
    expect(storageManagerMock.set).toHaveBeenCalledWith(updates);
    expect(storageManagerMock.get).not.toHaveBeenCalled();
    expect(failedStore.updateMultipleSettings).not.toHaveBeenCalled();
    expect(settingsManager.get('EXTENSION_ENABLED')).toBe(true);
    expect(settingsManager.get('TRANSLATE_ON_TEXT_FIELDS')).toBe(false);
    expect(settingsManager.get('TRANSLATE_ON_TEXT_SELECTION')).toBe(true);
    expect(extensionChange).toHaveBeenCalledTimes(1);
    expect(extensionChange).toHaveBeenCalledWith(true, false, 'EXTENSION_ENABLED');
    expect(fieldChange).not.toHaveBeenCalled();
    expect(selectionChange).toHaveBeenCalledTimes(1);
    expect(selectionChange).toHaveBeenCalledWith(true, false, 'TRANSLATE_ON_TEXT_SELECTION');

    storageEvents.dispatch({
      EXTENSION_ENABLED: { oldValue: false, newValue: true }
    }, 'local');
    expect(extensionChange).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['THEME', 'dark'],
    ['OPENAI_API_KEY', 'secret'],
    ['PROXY_PASSWORD', 'secret'],
    ['UNKNOWN_SETTING', true]
  ])('rejects unsupported fallback set key %s without side effects', async (key, value) => {
    await settingsManager.initialize();
    const onChange = vi.fn();
    settingsManager.onChange(key, onChange);
    const before = { ...settingsManager._settings.value };
    storageManagerMock.set.mockClear();

    await expect(settingsManager.set(key, value)).rejects.toThrow(
      `SettingsManager fallback does not support setting key: ${key}`
    );

    expect(storageManagerMock.set).not.toHaveBeenCalled();
    expect(settingsManager._settings.value).toEqual(before);
    expect(settingsManager.has(key)).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
    expect(settingsManager._pendingUpdates.size).toBe(0);
  });

  it('rejects unsupported fallback writes instead of using a retained failed store', async () => {
    const failedStore = createSettingsStoreMock({
      loadSettings: vi.fn().mockRejectedValue(new Error('store unavailable'))
    });
    window.Vue = {};
    useSettingsStore.mockReturnValue(failedStore);

    await settingsManager.initialize();
    storageManagerMock.set.mockClear();

    await expect(settingsManager.set('THEME', 'dark')).rejects.toThrow(
      'SettingsManager fallback does not support setting key: THEME'
    );

    expect(failedStore.updateSettingAndPersist).not.toHaveBeenCalled();
    expect(storageManagerMock.set).not.toHaveBeenCalled();
  });

  it.each([
    [
      {
        EXTENSION_ENABLED: true,
        OPENAI_API_KEY: 'secret',
        THEME: 'dark'
      },
      'SettingsManager fallback does not support setting keys: OPENAI_API_KEY, THEME'
    ],
    [
      {
        OPENAI_API_KEY: 'secret',
        PROXY_PASSWORD: 'secret'
      },
      'SettingsManager fallback does not support setting keys: OPENAI_API_KEY, PROXY_PASSWORD'
    ]
  ])('rejects invalid fallback batches atomically', async (updates, message) => {
    storageManagerMock.get.mockResolvedValue({ EXTENSION_ENABLED: false });
    await settingsManager.initialize();
    const extensionChange = vi.fn();
    settingsManager.onChange('EXTENSION_ENABLED', extensionChange);
    const before = { ...settingsManager._settings.value };
    storageManagerMock.set.mockClear();

    await expect(settingsManager.setMultiple(updates)).rejects.toThrow(message);

    expect(storageManagerMock.set).not.toHaveBeenCalled();
    expect(settingsManager._settings.value).toEqual(before);
    expect(settingsManager.get('EXTENSION_ENABLED')).toBe(false);
    expect(extensionChange).not.toHaveBeenCalled();
    expect(settingsManager._pendingUpdates.size).toBe(0);
  });

  it('leaves fallback state and events unchanged when setMultiple fails', async () => {
    const storageEvents = createStorageEventMock();
    browser.storage.onChanged = storageEvents.onChanged;
    storageManagerMock.get.mockResolvedValue({
      EXTENSION_ENABLED: false,
      TRANSLATE_ON_TEXT_FIELDS: false
    });
    await settingsManager.initialize();

    const extensionChange = vi.fn();
    const fieldChange = vi.fn();
    settingsManager.onChange('EXTENSION_ENABLED', extensionChange);
    settingsManager.onChange('TRANSLATE_ON_TEXT_FIELDS', fieldChange);
    const error = new Error('storage unavailable');
    storageManagerMock.set.mockImplementation(async () => {
      storageEvents.dispatch({
        EXTENSION_ENABLED: { oldValue: false, newValue: true },
        TRANSLATE_ON_TEXT_FIELDS: { oldValue: false, newValue: true }
      }, 'local');
      throw error;
    });

    await expect(settingsManager.setMultiple({
      EXTENSION_ENABLED: true,
      TRANSLATE_ON_TEXT_FIELDS: true
    })).rejects.toBe(error);

    expect(storageManagerMock.set).toHaveBeenCalledTimes(1);
    expect(settingsManager.get('EXTENSION_ENABLED')).toBe(false);
    expect(settingsManager.get('TRANSLATE_ON_TEXT_FIELDS')).toBe(false);
    expect(extensionChange).not.toHaveBeenCalled();
    expect(fieldChange).not.toHaveBeenCalled();
  });

  it('rejects unsupported fallback operations without using retained store or storage', async () => {
    const failedStore = createSettingsStoreMock({
      loadSettings: vi.fn().mockRejectedValue(new Error('store unavailable'))
    });
    window.Vue = {};
    useSettingsStore.mockReturnValue(failedStore);
    storageManagerMock.get.mockResolvedValue({ EXTENSION_ENABLED: false });

    await settingsManager.initialize();
    storageManagerMock.get.mockClear();
    storageManagerMock.set.mockClear();
    storageManagerMock.clear.mockClear();

    await expect(settingsManager.reset()).rejects.toThrow(
      'SettingsManager reset is unavailable in fallback mode'
    );
    await expect(settingsManager.export()).rejects.toThrow(
      'SettingsManager export is unavailable in fallback mode'
    );
    await expect(settingsManager.import('settings-data')).rejects.toThrow(
      'SettingsManager import is unavailable in fallback mode'
    );

    expect(failedStore.resetSettings).not.toHaveBeenCalled();
    expect(failedStore.exportSettings).not.toHaveBeenCalled();
    expect(failedStore.importSettings).not.toHaveBeenCalled();
    expect(storageManagerMock.get).not.toHaveBeenCalled();
    expect(storageManagerMock.set).not.toHaveBeenCalled();
    expect(storageManagerMock.clear).not.toHaveBeenCalled();
  });

  it('preserves normal store delegation for the supported SettingsManager APIs', async () => {
    const store = createSettingsStoreMock({
      settings: {
        EXTENSION_ENABLED: false,
        STORE_ONLY_SETTING: 'store-value'
      }
    });
    window.Vue = {};
    useSettingsStore.mockReturnValue(store);

    await settingsManager.initialize();

    expect(settingsManager._fallbackMode).toBe(false);
    expect(settingsManager.getSettings()).toBe(store.settings);
    expect(settingsManager.has('STORE_ONLY_SETTING')).toBe(true);
    expect(settingsManager.has('toString')).toBe(false);
    expect(settingsManager.getAll()).toEqual(store.settings);
    expect(settingsManager.getAll()).not.toBe(store.settings);

    await settingsManager.set('STORE_ONLY_SETTING', 'updated');
    const updates = {
      EXTENSION_ENABLED: true,
      STORE_ONLY_BATCH_SETTING: 'batch-value'
    };
    await settingsManager.setMultiple(updates);
    await settingsManager.reset();
    await expect(settingsManager.export('password')).resolves.toBe('exported-settings');
    await settingsManager.import('settings-data', 'password');

    expect(store.updateSettingAndPersist).toHaveBeenCalledWith('STORE_ONLY_SETTING', 'updated');
    expect(store.updateMultipleSettings).toHaveBeenCalledWith(updates);
    expect(store.resetSettings).toHaveBeenCalledTimes(1);
    expect(store.exportSettings).toHaveBeenCalledWith('password');
    expect(store.importSettings).toHaveBeenCalledWith('settings-data', 'password');
  });

  it('uses fallback defaults for removed settings and ignores irrelevant changes', async () => {
    const storageEvents = createStorageEventMock();
    browser.storage.onChanged = storageEvents.onChanged;
    storageManagerMock.get.mockResolvedValue({ EXTENSION_ENABLED: false });

    await settingsManager.initialize();

    const onChange = vi.fn();
    settingsManager.onChange('EXTENSION_ENABLED', onChange);
    const defaultValue = settingsManager._defaults.EXTENSION_ENABLED;

    storageEvents.getListener()({
      EXTENSION_ENABLED: { oldValue: false, newValue: undefined },
      OPENAI_API_KEY: { oldValue: '', newValue: 'secret' }
    }, 'local');

    expect(settingsManager.get('EXTENSION_ENABLED')).toBe(defaultValue);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(defaultValue, false, 'EXTENSION_ENABLED');

    storageEvents.getListener()({
      EXTENSION_ENABLED: { oldValue: defaultValue, newValue: defaultValue }
    }, 'local');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('applies normal external fallback storage changes', async () => {
    const storageEvents = createStorageEventMock();
    browser.storage.onChanged = storageEvents.onChanged;
    storageManagerMock.get.mockResolvedValue({ EXTENSION_ENABLED: false });

    await settingsManager.initialize();

    const onChange = vi.fn();
    settingsManager.onChange('EXTENSION_ENABLED', onChange);

    storageEvents.dispatch({
      EXTENSION_ENABLED: { oldValue: false, newValue: true }
    }, 'local');

    expect(settingsManager.get('EXTENSION_ENABLED')).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true, false, 'EXTENSION_ENABLED');
  });

  it('emits one immediate event for a successful fallback write', async () => {
    const storageEvents = createStorageEventMock();
    browser.storage.onChanged = storageEvents.onChanged;
    storageManagerMock.get.mockResolvedValue({ EXTENSION_ENABLED: false });
    await settingsManager.initialize();

    const onChange = vi.fn();
    settingsManager.onChange('EXTENSION_ENABLED', onChange);
    storageManagerMock.set.mockImplementation(async () => {
      storageEvents.getListener()({
        EXTENSION_ENABLED: { oldValue: false, newValue: true }
      }, 'local');
    });

    await settingsManager.set('EXTENSION_ENABLED', true);

    expect(settingsManager.get('EXTENSION_ENABLED')).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true, false, 'EXTENSION_ENABLED');

    storageEvents.getListener()({
      EXTENSION_ENABLED: { oldValue: false, newValue: true }
    }, 'local');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('does not mutate fallback state or emit when a write fails', async () => {
    const storageEvents = createStorageEventMock();
    browser.storage.onChanged = storageEvents.onChanged;
    storageManagerMock.get.mockResolvedValue({ EXTENSION_ENABLED: false });
    await settingsManager.initialize();

    const onChange = vi.fn();
    settingsManager.onChange('EXTENSION_ENABLED', onChange);
    const error = new Error('storage unavailable');
    storageManagerMock.set.mockRejectedValue(error);

    await expect(settingsManager.set('EXTENSION_ENABLED', true)).rejects.toBe(error);

    expect(settingsManager.get('EXTENSION_ENABLED')).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('restores defaults when refresh finds removed fallback keys', async () => {
    const storageEvents = createStorageEventMock();
    browser.storage.onChanged = storageEvents.onChanged;
    storageManagerMock.get
      .mockResolvedValueOnce({ EXTENSION_ENABLED: false })
      .mockResolvedValueOnce({});
    await settingsManager.initialize();

    const onChange = vi.fn();
    settingsManager.onChange('EXTENSION_ENABLED', onChange);
    const defaultValue = settingsManager._defaults.EXTENSION_ENABLED;

    await settingsManager.refreshSettings();

    expect(settingsManager.get('EXTENSION_ENABLED')).toBe(defaultValue);
    expect(onChange).toHaveBeenCalledWith(defaultValue, false, 'EXTENSION_ENABLED');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('removes fallback storage listener during destroy', async () => {
    const storageEvents = createStorageEventMock();
    browser.storage.onChanged = storageEvents.onChanged;
    await settingsManager.initialize();
    const listener = storageEvents.getListener();

    settingsManager.destroy();

    expect(storageEvents.onChanged.removeListener).toHaveBeenCalledWith(listener);
    expect(settingsManager._storageListenerSetup).toBe(false);
    expect(settingsManager._storageListener).toBeNull();
  });

  it('removes old listener before reinitializing fallback mode', async () => {
    const storageEvents = createStorageEventMock();
    browser.storage.onChanged = storageEvents.onChanged;
    storageManagerMock.get.mockResolvedValue({ EXTENSION_ENABLED: false });

    await settingsManager.initialize();
    const firstListener = storageEvents.getListener();

    settingsManager.destroy();

    expect(storageEvents.onChanged.removeListener).toHaveBeenCalledWith(firstListener);
    expect(storageEvents.getActiveListeners()).not.toContain(firstListener);

    await settingsManager.initialize();
    const secondListener = storageEvents.getListener();

    expect(secondListener).toEqual(expect.any(Function));
    expect(secondListener).not.toBe(firstListener);
    expect(storageEvents.onChanged.addListener).toHaveBeenCalledTimes(2);
    expect(storageEvents.getActiveListeners()).toEqual([secondListener]);
    expect(settingsManager._storageListenerSetup).toBe(true);

    const onChange = vi.fn();
    settingsManager.onChange('EXTENSION_ENABLED', onChange);
    storageEvents.dispatch({
      EXTENSION_ENABLED: { oldValue: false, newValue: true }
    }, 'local');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(settingsManager.get('EXTENSION_ENABLED')).toBe(true);
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
