import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  check: vi.fn().mockResolvedValue(false),
  aggregatorCtor: vi.fn(),
  coordinatorCtor: vi.fn(),
  loaderCtor: vi.fn(),
  loadFeature: vi.fn(),
  featureLoadCalls: [],
  startIntelligent: vi.fn(),
  interactionInit: vi.fn().mockResolvedValue(undefined),
  installRelay: vi.fn(),
  fmInit: vi.fn(async () => { mocks.fmInitialized = true; }),
  fmInitialized: false,
  policyCbs: new Set(),
  requestedFeatures: new Set(),
  sendRegularMessage: vi.fn().mockResolvedValue({ success: true }),
  loggerError: vi.fn(),
  loggerDebug: vi.fn(),
  matchesAutoTranslateRule: vi.fn().mockReturnValue(true),
  isFeatureAllowed: vi.fn().mockResolvedValue(true),
  settingsGet: vi.fn(),
  isExtensionEnabled: vi.fn().mockReturnValue(true),
  contentMessageHandler: { isActive: true },
  pageTranslationManager: { isActive: true, userRestoredOverride: false, autoStartCancelledUrls: new Set() },
  runtimeEnabled: true,
  wholePageEnabled: true,
  autoRules: [{ pattern: 'example.com' }],
}));

vi.mock('webextension-polyfill', () => ({
  default: { runtime: { getURL: (p) => `moz-extension://test/${p}` } },
}));
vi.mock('@/features/exclusion/utils/exclusion-utils.js', () => ({
  checkUrlExclusionAsync: mocks.check,
}));
vi.mock('@/core/tabPermissions.js', () => ({
  checkContentScriptAccess: () => ({ isAccessible: true }),
}));
vi.mock('@/shared/managers/SettingsManager.js', () => ({
  default: {
    initialize: vi.fn().mockResolvedValue(undefined),
    warmup: vi.fn(),
    get: mocks.settingsGet,
    isExtensionEnabled: mocks.isExtensionEnabled,
  },
}));
vi.mock('@/shared/logging/DebugModeBridge.js', () => ({
  debugModeBridge: { initialize: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: mocks.loggerDebug,
    info: vi.fn(),
    warn: vi.fn(),
    error: mocks.loggerError,
  }),
}));
vi.mock('@/shared/logging/logConstants.js', () => ({ LOG_COMPONENTS: { CONTENT: 'content' } }));
vi.mock('@/core/extensionContext.js', () => ({ default: { isValidSync: () => true } }));
vi.mock('@/shared/messaging/core/MessageHandler.js', () => ({
  createMessageHandler: () => ({ isListenerActive: false, listen: vi.fn(), registerHandler: vi.fn() }),
}));
vi.mock('@/shared/error-management/windowErrorHandlers.js', () => ({
  setupWindowErrorHandlers: vi.fn(),
}));
vi.mock('@/shared/messaging/core/ContentScriptIntegration.js', () => ({
  initializeContentScriptIntegration: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./main/MainFrameAggregator.js', () => ({
  MainFrameAggregator: class {
    constructor(...args) { mocks.aggregatorCtor(...args); this.getGlobalPageTranslationStatus = vi.fn(); }
  },
}));
vi.mock('./main/MainFrameCoordinator.js', () => ({
  MainFrameCoordinator: class { constructor(...args) { mocks.coordinatorCtor(...args); } },
}));
vi.mock('./main/MainFeatureLoader.js', () => ({
  MainFeatureLoader: class {
    constructor() {
      mocks.loaderCtor();
      this.featureLoadPromises = new Map();
    }
    loadFeature(featureName, category) {
      if (this.featureLoadPromises.has(featureName)) return this.featureLoadPromises.get(featureName);
      mocks.featureLoadCalls.push({ featureName, category });
      const p = Promise.resolve(mocks.loadFeature(featureName, category));
      this.featureLoadPromises.set(featureName, p);
      p.finally(() => {
        if (this.featureLoadPromises.get(featureName) === p) this.featureLoadPromises.delete(featureName);
      });
      return p;
    }
    startIntelligentLoading() { return mocks.startIntelligent(this); }
  },
}));
vi.mock('./InteractionCoordinator.js', () => ({
  interactionCoordinator: { initialize: mocks.interactionInit },
}));
vi.mock('@/features/windows/managers/crossframe/TextSelectionWindowRelay.js', () => ({
  installTextSelectionWindowRelay: mocks.installRelay,
}));
vi.mock('@/core/managers/content/FeatureManager.js', () => ({
  FeatureManager: {
    getInstance: () => ({
      get initialized() { return mocks.fmInitialized; },
      set initialized(v) { mocks.fmInitialized = v; },
      initialize: mocks.fmInit,
      onPolicyChanged: vi.fn((cb) => { mocks.policyCbs.add(cb); return () => mocks.policyCbs.delete(cb); }),
      requestedFeatures: mocks.requestedFeatures,
      getFeatureHandler: vi.fn((name) => {
        if (name === 'contentMessageHandler') return mocks.contentMessageHandler;
        if (name === 'pageTranslation') return mocks.pageTranslationManager;
        return null;
      }),
      isFeatureActive: vi.fn((name) => name === 'contentMessageHandler' && mocks.contentMessageHandler.isActive),
    }),
  },
}));
vi.mock('@/utils/ui/exclusion.js', () => ({
  matchesAutoTranslateRule: mocks.matchesAutoTranslateRule,
}));
vi.mock('@/features/exclusion/core/ExclusionChecker.js', () => ({
  ExclusionChecker: {
    getInstance: () => ({
      initialize: vi.fn().mockResolvedValue(undefined),
      isFeatureAllowed: mocks.isFeatureAllowed,
    }),
  },
}));
vi.mock('@/shared/messaging/core/UnifiedMessaging.js', () => ({
  sendRegularMessage: mocks.sendRegularMessage,
}));
vi.mock('@/shared/messaging/core/MessageActions.js', () => ({
  MessageActions: { PAGE_TRANSLATE: 'page-translate' },
}));

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};

describe('ContentScriptCore autoTranslation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.check.mockResolvedValue(false);
    mocks.requestedFeatures.clear();
    mocks.policyCbs.clear();
    mocks.fmInitialized = false;
    mocks.featureLoadCalls.length = 0;
    mocks.loadFeature.mockImplementation(async (name) => {
      if (name === 'contentMessageHandler') return mocks.contentMessageHandler;
      if (name === 'pageTranslation') return mocks.pageTranslationManager;
      return {};
    });
    mocks.startIntelligent.mockImplementation(() => undefined);
    mocks.interactionInit.mockResolvedValue(undefined);
    mocks.sendRegularMessage.mockResolvedValue({ success: true });
    mocks.loggerError.mockClear();
    mocks.loggerDebug.mockClear();
    mocks.matchesAutoTranslateRule.mockReturnValue(true);
    mocks.isFeatureAllowed.mockResolvedValue(true);
    mocks.isExtensionEnabled.mockImplementation(() => mocks.runtimeEnabled);
    mocks.settingsGet.mockImplementation((key, fallback) => {
      if (key === 'WHOLE_PAGE_TRANSLATION_ENABLED') return mocks.wholePageEnabled;
      if (key === 'WHOLE_PAGE_AUTO_TRANSLATE_RULES') return mocks.autoRules;
      return fallback;
    });
    mocks.contentMessageHandler.isActive = true;
    mocks.pageTranslationManager.isActive = true;
    if (Object.getOwnPropertyDescriptor(mocks.pageTranslationManager, 'userRestoredOverride')?.get) {
      delete mocks.pageTranslationManager.userRestoredOverride;
    }
    mocks.pageTranslationManager.userRestoredOverride = false;
    mocks.pageTranslationManager.autoStartCancelledUrls = new Set();
    mocks.runtimeEnabled = true;
    mocks.wholePageEnabled = true;
    mocks.autoRules = [{ pattern: 'example.com' }];
    mocks.fmInit.mockImplementation(async () => { mocks.fmInitialized = true; });
    delete window.getGlobalPageTranslationStatus;
    delete window.translateItContentScriptLoaded;
    delete window._translateItBootstrapPromise;
    window.translateItContentScriptInitializing = false;
    window.translateItContentCore = undefined;
    window.translateItContentScriptCore = undefined;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: 'https://example.com/page', protocol: 'https:', host: 'example.com' },
    });
    document.documentElement.classList.remove('translate-it-ui-frame');
    globalThis.browser = { runtime: { getURL: (p) => `moz-extension://test/${p}` } };
    window.browser = globalThis.browser;
  });

  it('A1 sends one auto command', async () => {
    const { ContentScriptCore } = await import('./ContentScriptCore.js');
    const core = new ContentScriptCore();
    await core.initializeBase();
    await core.ensureAllowedRuntime();
    await vi.waitFor(() => expect(mocks.sendRegularMessage).toHaveBeenCalledOnce());
    expect(mocks.sendRegularMessage).toHaveBeenCalledWith({ action: 'page-translate', data: { isAuto: true } }, { returnFailureResponse: true });
    expect(mocks.featureLoadCalls.filter(({ featureName }) => ['contentMessageHandler', 'pageTranslation'].includes(featureName)).map(({ featureName }) => featureName)).toEqual(['contentMessageHandler', 'pageTranslation']);
  });

  it('A2 waits for ContentMessageHandler readiness before sending', async () => {
    const handlerReady = deferred();
    const order = [];
    mocks.contentMessageHandler.isActive = false;
    mocks.loadFeature.mockImplementation(async (name) => {
      order.push(`load:${name}`);
      if (name === 'contentMessageHandler') {
        await handlerReady.promise;
        mocks.contentMessageHandler.isActive = true;
        return mocks.contentMessageHandler;
      }
      return mocks.pageTranslationManager;
    });
    mocks.sendRegularMessage.mockImplementation(async (msg) => {
      order.push(`send:${msg.action}`);
      return { success: true };
    });

    const { ContentScriptCore } = await import('./ContentScriptCore.js');
    const core = new ContentScriptCore();
    await core.initializeBase();
    await core.ensureAllowedRuntime();
    await vi.waitFor(() => expect(mocks.featureLoadCalls).toContainEqual({ featureName: 'contentMessageHandler', category: 'ESSENTIAL' }));
    expect(mocks.sendRegularMessage).not.toHaveBeenCalled();
    handlerReady.resolve();
    await vi.waitFor(() => expect(mocks.sendRegularMessage).toHaveBeenCalledOnce());
    expect(order.indexOf('load:contentMessageHandler')).toBeLessThan(order.indexOf('send:page-translate'));
    expect(order.indexOf('load:pageTranslation')).toBeLessThan(order.indexOf('send:page-translate'));
  });

  it('A3 deduplicates explicit auto load with delayed ESSENTIAL', async () => {
    vi.useFakeTimers();
    let resolveHandler;
    try {
      const handlerReady = deferred();
      resolveHandler = handlerReady.resolve;
      let logicalActivations = 0;
      mocks.contentMessageHandler.isActive = false;
      mocks.loadFeature.mockImplementation(async (name) => {
        if (name === 'contentMessageHandler') {
          logicalActivations++;
          await handlerReady.promise;
          mocks.contentMessageHandler.isActive = true;
          return mocks.contentMessageHandler;
        }
        return mocks.pageTranslationManager;
      });
      mocks.startIntelligent.mockImplementation((loader) => {
        setTimeout(() => loader.loadFeature('contentMessageHandler', 'ESSENTIAL'), 400);
      });

      const { ContentScriptCore } = await import('./ContentScriptCore.js');
      const core = new ContentScriptCore();
      await core.initializeBase();
      await core.ensureAllowedRuntime();
      await vi.waitFor(() => expect(mocks.featureLoadCalls.filter(({ featureName }) => featureName === 'contentMessageHandler')).toHaveLength(1), { interval: 1, timeout: 100 });
      expect(mocks.featureLoadCalls.filter(({ featureName }) => featureName === 'contentMessageHandler')).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(400);
      expect(mocks.featureLoadCalls.filter(({ featureName }) => featureName === 'contentMessageHandler')).toHaveLength(1);
      handlerReady.resolve();
      await vi.waitFor(() => expect(mocks.sendRegularMessage).toHaveBeenCalledOnce(), { interval: 1, timeout: 100 });
      expect(logicalActivations).toBe(1);
    } finally {
      resolveHandler?.();
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('does not send when ContentMessageHandler not ready logs error', async () => {
    mocks.contentMessageHandler.isActive = false;
    mocks.loadFeature.mockImplementation(async (name) => {
      if (name === 'contentMessageHandler') return null;
      if (name === 'pageTranslation') return mocks.pageTranslationManager;
      return {};
    });
    const { ContentScriptCore } = await import('./ContentScriptCore.js');
    const core = new ContentScriptCore();
    await core.initializeBase();
    await core.ensureAllowedRuntime();
    await vi.waitFor(() => expect(mocks.featureLoadCalls).toContainEqual({ featureName: 'contentMessageHandler', category: 'ESSENTIAL' }));
    await vi.waitFor(() => expect(mocks.loggerError).toHaveBeenCalledWith('Failed to run auto page translation check:', expect.objectContaining({ message: 'ContentMessageHandler not ready' })));
    expect(mocks.featureLoadCalls.some(({ featureName }) => featureName === 'pageTranslation')).toBe(false);
    expect(mocks.sendRegularMessage).not.toHaveBeenCalled();
  });

  it.each([
    ['no auto rules', () => { mocks.autoRules = []; }],
    ['non-matching rule', () => { mocks.matchesAutoTranslateRule.mockReturnValue(false); }],
    ['Whole Page disabled', () => { mocks.wholePageEnabled = false; }],
    ['extension disabled', () => { mocks.runtimeEnabled = false; }],
    ['page excluded', () => { mocks.isFeatureAllowed.mockResolvedValue(false); }],
  ])('A4 does not start when %s', async (_reason, configure) => {
    configure();
    const { ContentScriptCore } = await import('./ContentScriptCore.js');
    const core = new ContentScriptCore();
    await core.initializeBase();
    await core.ensureAllowedRuntime();
    if (_reason === 'extension disabled') {
      await vi.waitFor(() => expect(mocks.isExtensionEnabled).toHaveBeenCalled());
    } else if (_reason === 'Whole Page disabled') {
      await vi.waitFor(() => expect(mocks.settingsGet).toHaveBeenCalledWith('WHOLE_PAGE_TRANSLATION_ENABLED', true));
    } else if (_reason === 'no auto rules') {
      await vi.waitFor(() => expect(mocks.settingsGet).toHaveBeenCalledWith('WHOLE_PAGE_AUTO_TRANSLATE_RULES', expect.anything()));
    } else if (_reason === 'non-matching rule') {
      await vi.waitFor(() => expect(mocks.matchesAutoTranslateRule).toHaveBeenCalled());
    } else if (_reason === 'page excluded') {
      await vi.waitFor(() => expect(mocks.isFeatureAllowed).toHaveBeenCalled());
    }
    expect(mocks.sendRegularMessage).not.toHaveBeenCalled();
    expect(mocks.featureLoadCalls.some(({ featureName }) => featureName === 'contentMessageHandler')).toBe(false);
    expect(mocks.featureLoadCalls.some(({ featureName }) => featureName === 'pageTranslation')).toBe(false);
  });

  it.each([
    ['userRestoredOverride'],
    ['autoStartCancelledUrls'],
  ])('A5 does not send when %s blocks startup', async (_reason) => {
    const barrier = deferred();
    // Ensure clean plain properties before installing getters
    if (Object.getOwnPropertyDescriptor(mocks.pageTranslationManager, 'userRestoredOverride')?.get) {
      delete mocks.pageTranslationManager.userRestoredOverride;
    }
    mocks.pageTranslationManager.isActive = true;
    if (_reason === 'userRestoredOverride') {
      Object.defineProperty(mocks.pageTranslationManager, 'userRestoredOverride', {
        get() {
          barrier.resolve();
          return true;
        },
        configurable: true,
      });
      mocks.pageTranslationManager.autoStartCancelledUrls = new Set();
    } else {
      Object.defineProperty(mocks.pageTranslationManager, 'userRestoredOverride', {
        get() { return false; },
        configurable: true,
      });
      const currentUrl = window.location.href;
      mocks.pageTranslationManager.autoStartCancelledUrls = {
        has(u) {
          const isCancelled = u === currentUrl;
          if (isCancelled) barrier.resolve();
          return isCancelled;
        },
      };
    }
    mocks.loadFeature.mockImplementation(async (name) => {
      if (name === 'contentMessageHandler') return mocks.contentMessageHandler;
      if (name === 'pageTranslation') return mocks.pageTranslationManager;
      return {};
    });
    const { ContentScriptCore } = await import('./ContentScriptCore.js');
    const core = new ContentScriptCore();
    await core.initializeBase();
    await core.ensureAllowedRuntime();
    await vi.waitFor(() => expect(mocks.featureLoadCalls.filter(({ featureName }) => featureName === 'pageTranslation')).toHaveLength(1));
    await barrier.promise;
    expect(mocks.featureLoadCalls.filter(({ featureName }) => ['contentMessageHandler', 'pageTranslation'].includes(featureName)).map(({ featureName }) => featureName)).toEqual(['contentMessageHandler', 'pageTranslation']);
    expect(mocks.sendRegularMessage).not.toHaveBeenCalled();
    // Cleanup getters for next test
    if (Object.getOwnPropertyDescriptor(mocks.pageTranslationManager, 'userRestoredOverride')?.get) {
      delete mocks.pageTranslationManager.userRestoredOverride;
    }
    mocks.pageTranslationManager.userRestoredOverride = false;
    mocks.pageTranslationManager.autoStartCancelledUrls = new Set();
  });

  it('logs debug when PAGE_TRANSLATE rejected', async () => {
    mocks.sendRegularMessage.mockResolvedValue({ success: false, error: 'rejected' });
    const { ContentScriptCore } = await import('./ContentScriptCore.js');
    const core = new ContentScriptCore();
    await core.initializeBase();
    await core.ensureAllowedRuntime();
    await vi.waitFor(() => expect(mocks.sendRegularMessage).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(mocks.loggerDebug).toHaveBeenCalledWith('SPA auto page translation command rejected', expect.objectContaining({ success: false })));
  });
});
