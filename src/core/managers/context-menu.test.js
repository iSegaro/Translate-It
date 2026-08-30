import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const browser = {
    contextMenus: {
      removeAll: vi.fn().mockResolvedValue(undefined),
      getAll: vi.fn().mockResolvedValue([]),
      create: vi.fn((menu, callback) => {
        callback?.();
        return menu.id;
      })
    },
    commands: {
      getAll: vi.fn().mockResolvedValue([])
    },
    runtime: {
      sendMessage: vi.fn(),
      getURL: vi.fn((path) => path)
    },
    storage: {
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn()
      }
    },
    tabs: {
      query: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue(undefined),
      sendMessage: vi.fn().mockResolvedValue(undefined)
    }
  };

  return {
    browser,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    },
    storageManager: {
      get: vi.fn(),
      set: vi.fn().mockResolvedValue(true)
    },
    providerRegistry: {
      getAllAvailable: vi.fn()
    },
    getEffectiveProviderAsync: vi.fn().mockResolvedValue('googlev2'),
    getDebugModeAsync: vi.fn().mockResolvedValue(false),
    getTranslationString: vi.fn((key) => key),
    utilsFactory: {
      getI18nUtils: vi.fn()
    }
  };
});

vi.mock('webextension-polyfill', () => ({
  default: mocks.browser
}));

vi.mock('@/shared/storage/core/StorageCore.js', () => ({
  storageManager: mocks.storageManager
}));

vi.mock('@/shared/config/config.js', () => ({
  CONFIG: {
    TRANSLATION_API: 'googlev2',
    CONTEXT_MENU_VISIBILITY: {
      PAGE_CONTEXT_SELECT_ELEMENT: true,
      PAGE_CONTEXT_PDF_TRANSLATOR: true,
      ACTION_CONTEXT_SELECT_ELEMENT: true,
      PAGE_CONTEXT_SCREEN_CAPTURE: true,
      ACTION_CONTEXT_SCREEN_CAPTURE: true,
      ACTION_CONTEXT_PDF_TRANSLATOR: true,
      ACTION_CONTEXT_SUBTITLE_TRANSLATOR: true,
      ACTION_CONTEXT_OPTIONS: true,
      ACTION_CONTEXT_SHORTCUTS: true,
      ACTION_CONTEXT_HELP: true
    }
  },
  TranslationMode: { Select_Element: 'select-element' },
  getDebugModeAsync: mocks.getDebugModeAsync,
  getTargetLanguageAsync: vi.fn().mockResolvedValue('en'),
  getEffectiveProviderAsync: mocks.getEffectiveProviderAsync
}));

vi.mock('@/features/translation/providers/ProviderRegistry.js', () => ({
  providerRegistry: mocks.providerRegistry
}));

vi.mock('@/utils/UtilsFactory.js', () => ({
  utilsFactory: mocks.utilsFactory
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => mocks.logger
}));

vi.mock('@/core/memory/ResourceTracker.js', () => ({
  default: class ResourceTracker {
    cleanup() {}
  }
}));

vi.mock('@/core/extensionContext.js', () => ({
  default: {
    isContextError: vi.fn().mockReturnValue(false),
    handleContextError: vi.fn()
  }
}));

vi.mock('@/core/tabPermissions.js', () => ({
  tabPermissionChecker: {
    checkTabAccess: vi.fn().mockResolvedValue({ isAccessible: true })
  }
}));

vi.mock('@/core/ExtensionAppLauncher.js', () => ({
  openExtensionApp: vi.fn()
}));

vi.mock('@/core/background/handlers/lazy/handleElementSelectionLazy.js', () => ({
  handleActivateSelectElementModeLazy: vi.fn()
}));

import { ContextMenuManager } from './context-menu.js';

const CONTEXT_MENU_SETTING_KEYS = [
  'EXTENSION_ENABLED',
  'TRANSLATE_WITH_SELECT_ELEMENT',
  'ENABLE_SCREEN_CAPTURE',
  'CONTEXT_MENU_VISIBILITY',
  'TRANSLATION_API',
  'DEBUG_MODE',
  'HIDDEN_PROVIDERS',
  'DEEPL_API_KEY',
  'LINGVA_API_URL',
  'GEMINI_API_KEY',
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
  'DEEPSEEK_API_KEY',
  'CUSTOM_API_URL',
  'CUSTOM_API_MODEL',
  'WEBAI_API_URL',
  'WEBAI_API_MODEL'
];

const CONTEXT_MENU_VISIBILITY = {
  PAGE_CONTEXT_SELECT_ELEMENT: true,
  PAGE_CONTEXT_PDF_TRANSLATOR: true,
  ACTION_CONTEXT_SELECT_ELEMENT: true,
  PAGE_CONTEXT_SCREEN_CAPTURE: true,
  ACTION_CONTEXT_SCREEN_CAPTURE: true,
  ACTION_CONTEXT_PDF_TRANSLATOR: true,
  ACTION_CONTEXT_SUBTITLE_TRANSLATOR: true,
  ACTION_CONTEXT_OPTIONS: true,
  ACTION_CONTEXT_SHORTCUTS: true,
  ACTION_CONTEXT_HELP: true
};

const createSettings = (overrides = {}) => ({
  EXTENSION_ENABLED: true,
  TRANSLATE_WITH_SELECT_ELEMENT: true,
  ENABLE_SCREEN_CAPTURE: true,
  CONTEXT_MENU_VISIBILITY: { ...CONTEXT_MENU_VISIBILITY },
  TRANSLATION_API: 'googlev2',
  DEBUG_MODE: false,
  HIDDEN_PROVIDERS: [],
  OPENAI_API_KEY: 'configured-key',
  ...overrides
});

const getCreatedMenuIds = () => mocks.browser.contextMenus.create.mock.calls
  .map(([menu]) => menu.id);

describe('ContextMenuManager keyed storage reads', () => {
  let manager;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTranslationString.mockImplementation((key) => key);
    mocks.utilsFactory.getI18nUtils.mockResolvedValue({
      getTranslationString: mocks.getTranslationString
    });
    mocks.providerRegistry.getAllAvailable.mockReturnValue([
      { id: 'googlev2', name: 'Google Translate', isLazy: true, category: 'free' },
      { id: 'openai', name: 'OpenAI', isLazy: true, category: 'ai' },
      { id: 'gemini', name: 'Google Gemini', isLazy: true, category: 'ai' }
    ]);
    mocks.getEffectiveProviderAsync.mockResolvedValue('googlev2');
    mocks.storageManager.get.mockResolvedValue(createSettings());

    manager = new ContextMenuManager();
    manager.browser = mocks.browser;
  });

  it('requests exact context-menu settings with a fresh read', async () => {
    await manager._setupMenusInternal();

    expect(mocks.storageManager.get).toHaveBeenCalledOnce();
    expect(mocks.storageManager.get).toHaveBeenCalledWith(CONTEXT_MENU_SETTING_KEYS, false);
    expect(mocks.storageManager.get).not.toHaveBeenCalledWith(null, false);
  });

  it('excludes unrelated sensitive and storage keys from the request', async () => {
    await manager._setupMenusInternal();

    const requestedKeys = mocks.storageManager.get.mock.calls[0][0];

    expect(requestedKeys).not.toContain('PROXY_USERNAME');
    expect(requestedKeys).not.toContain('PROXY_PASSWORD');
    expect(requestedKeys).not.toContain('translationHistory');
    expect(requestedKeys).toEqual(CONTEXT_MENU_SETTING_KEYS);
  });

  it('preserves disabled-extension and provider filtering behavior', async () => {
    mocks.storageManager.get.mockResolvedValue(createSettings({
      EXTENSION_ENABLED: false,
      HIDDEN_PROVIDERS: ['openai']
    }));

    await manager._setupMenusInternal();

    const menuIds = getCreatedMenuIds();
    expect(menuIds).not.toContain('translate-with-select-element');
    expect(menuIds).not.toContain('screen-capture-page');
    expect(menuIds).toContain('api-provider-googlev2');
    expect(menuIds).not.toContain('api-provider-openai');
    expect(menuIds).not.toContain('api-provider-gemini');
  });

  it('preserves context-menu visibility settings', async () => {
    mocks.storageManager.get.mockResolvedValue(createSettings({
      CONTEXT_MENU_VISIBILITY: {
        ...CONTEXT_MENU_VISIBILITY,
        PAGE_CONTEXT_SELECT_ELEMENT: false,
        ACTION_CONTEXT_SELECT_ELEMENT: false,
        PAGE_CONTEXT_SCREEN_CAPTURE: false,
        ACTION_CONTEXT_SCREEN_CAPTURE: false
      }
    }));

    await manager._setupMenusInternal();

    const menuIds = getCreatedMenuIds();
    expect(menuIds).not.toContain('translate-with-select-element');
    expect(menuIds).not.toContain('action-translate-element');
    expect(menuIds).not.toContain('screen-capture-page');
    expect(menuIds).not.toContain('screen-capture-action');
  });

  it('preserves defaults when requested settings are absent', async () => {
    mocks.storageManager.get.mockResolvedValue({
      TRANSLATION_API: 'googlev2',
      OPENAI_API_KEY: 'configured-key'
    });

    await manager._setupMenusInternal();

    const menuIds = getCreatedMenuIds();
    expect(menuIds).toContain('translate-with-select-element');
    expect(menuIds).toContain('screen-capture-page');
    expect(menuIds).toContain('screen-capture-action');
  });

  it('rejects initial setup when preflight storage read fails', async () => {
    mocks.storageManager.get.mockRejectedValue(new Error('storage unavailable'));

    await expect(manager.initialize()).rejects.toThrow('storage unavailable');

    expect(mocks.storageManager.get).toHaveBeenCalledWith(CONTEXT_MENU_SETTING_KEYS, false);
    expect(mocks.browser.contextMenus.removeAll).not.toHaveBeenCalled();
    expect(mocks.browser.contextMenus.create).not.toHaveBeenCalled();
    expect(manager.initialized).toBe(false);
  });

  it('preserves existing menus when preflight fails', async () => {
    manager.initialized = true;
    manager.createdMenus.add('existing-menu');
    mocks.storageManager.get.mockRejectedValue(new Error('storage unavailable'));

    await expect(manager.setupDefaultMenus()).rejects.toThrow('storage unavailable');

    expect(mocks.browser.contextMenus.removeAll).not.toHaveBeenCalled();
    expect(manager.getCreatedMenus()).toEqual(['existing-menu']);
    expect(manager.initialized).toBe(false);
  });

  it('allows initialization retry after transient preflight failure', async () => {
    mocks.storageManager.get
      .mockRejectedValueOnce(new Error('temporary storage failure'))
      .mockResolvedValueOnce(createSettings());

    await expect(manager.initialize()).rejects.toThrow('temporary storage failure');
    expect(manager.initialized).toBe(false);

    await expect(manager.initialize()).resolves.toBeUndefined();
    expect(manager.initialized).toBe(true);
    expect(mocks.browser.storage.onChanged.addListener).toHaveBeenCalledOnce();
  });

  it('does not register a duplicate listener after failed forced rebuild retry', async () => {
    await manager.initialize();
    expect(mocks.browser.storage.onChanged.addListener).toHaveBeenCalledOnce();

    mocks.browser.contextMenus.create.mockImplementation((menu, callback) => {
      if (menu.id === 'open-pdf-with-link') {
        throw new Error('menu creation failed');
      }
      callback?.();
      return menu.id;
    });

    await expect(manager.initialize(true)).rejects.toThrow('menu creation failed');
    expect(manager.initialized).toBe(false);

    mocks.browser.contextMenus.create.mockImplementation((menu, callback) => {
      callback?.();
      return menu.id;
    });

    await expect(manager.initialize()).resolves.toBeUndefined();
    expect(mocks.browser.storage.onChanged.addListener).toHaveBeenCalledOnce();
  });

  it('restores initialized state after successful runtime rebuild recovery', async () => {
    await manager.initialize();
    expect(manager.initialized).toBe(true);

    mocks.browser.contextMenus.create.mockImplementation((menu, callback) => {
      if (menu.id === 'open-pdf-with-link') {
        throw new Error('menu creation failed');
      }
      callback?.();
      return menu.id;
    });

    await expect(manager.setupDefaultMenus()).rejects.toThrow('menu creation failed');
    expect(manager.initialized).toBe(false);

    mocks.browser.contextMenus.create.mockImplementation((menu, callback) => {
      callback?.();
      return menu.id;
    });

    await expect(manager.setupDefaultMenus()).resolves.toBeUndefined();
    expect(manager.initialized).toBe(true);
    expect(mocks.browser.storage.onChanged.addListener).toHaveBeenCalledOnce();
  });

  it('does not claim listener registration when addListener fails', async () => {
    mocks.browser.storage.onChanged.addListener.mockImplementationOnce(() => {
      throw new Error('listener registration failed');
    });

    await expect(manager.initialize()).rejects.toThrow('listener registration failed');
    expect(manager.initialized).toBe(false);
    expect(manager.storageListener).toBeNull();

    await expect(manager.initialize()).resolves.toBeUndefined();
    expect(manager.initialized).toBe(true);
    expect(manager.storageListener).toEqual(expect.any(Function));
    expect(mocks.browser.storage.onChanged.addListener).toHaveBeenCalledTimes(2);
  });

  it('invalidates initialization after fatal post-removal failure and permits retry', async () => {
    mocks.browser.contextMenus.create.mockImplementation((menu, callback) => {
      if (menu.id === 'open-pdf-with-link') {
        throw new Error('menu creation failed');
      }
      callback?.();
      return menu.id;
    });

    await expect(manager.initialize()).rejects.toThrow('menu creation failed');
    expect(mocks.browser.contextMenus.removeAll).toHaveBeenCalledOnce();
    expect(manager.initialized).toBe(false);

    mocks.browser.contextMenus.create.mockImplementation((menu, callback) => {
      callback?.();
      return menu.id;
    });

    await expect(manager.initialize()).resolves.toBeUndefined();
    expect(manager.initialized).toBe(true);
  });

  it('handles storage-triggered rebuild rejection', async () => {
    await manager.initialize();
    const storageListener = mocks.browser.storage.onChanged.addListener.mock.calls[0][0];
    vi.spyOn(manager, 'setupDefaultMenus').mockRejectedValue(new Error('rebuild failed'));

    await expect(storageListener({ TRANSLATION_API: { newValue: 'gemini' } }, 'local'))
      .resolves.toBeUndefined();

    expect(mocks.logger.error).toHaveBeenCalledWith(
      'Failed to rebuild context menus after storage change:',
      expect.any(Error)
    );
  });

  it('keeps Select Element title failure local to its menu paths', async () => {
    mocks.getTranslationString.mockImplementation((key) => {
      if (key === 'context_menu_translate_with_selection') {
        throw new Error('selection title unavailable');
      }
      return key;
    });

    await expect(manager.initialize()).resolves.toBeUndefined();

    expect(manager.initialized).toBe(true);
    expect(getCreatedMenuIds()).toContain('open-pdf-with-link');
    expect(getCreatedMenuIds()).toContain('api-provider-parent');
    expect(getCreatedMenuIds()).not.toContain('translate-with-select-element');
    expect(getCreatedMenuIds()).not.toContain('action-translate-element');
  });
});
