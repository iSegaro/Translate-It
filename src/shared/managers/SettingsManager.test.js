import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
