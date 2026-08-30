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
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
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

  it('preserves existing storage-read failure behavior', async () => {
    mocks.storageManager.get.mockRejectedValue(new Error('storage unavailable'));

    await expect(manager.setupDefaultMenus()).resolves.toBeUndefined();

    expect(mocks.storageManager.get).toHaveBeenCalledWith(CONTEXT_MENU_SETTING_KEYS, false);
    expect(mocks.browser.contextMenus.create).not.toHaveBeenCalled();
  });
});
