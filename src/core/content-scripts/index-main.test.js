import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendRegularMessage: vi.fn(),
  initializeCritical: vi.fn(),
  interactionInitialize: vi.fn(),
  loadFeature: vi.fn(),
  startIntelligentLoading: vi.fn(),
  featureLoadCalls: [],
  loggerError: vi.fn(),
  matchesAutoTranslateRule: vi.fn(),
  isFeatureAllowed: vi.fn(),
  settingsGet: vi.fn(),
  featureManager: {
    getFeatureHandler: vi.fn(),
    isFeatureActive: vi.fn(),
  },
  contentMessageHandler: {
    isActive: true,
  },
  isExtensionEnabled: vi.fn(),
  firstCoordinatorEnabled: undefined,
  runtimeEnabled: true,
  wholePageEnabled: true,
  autoRules: [{ pattern: 'example.com' }],
  pageTranslationManager: {
    isActive: true,
    userRestoredOverride: false,
    autoStartCancelledUrls: new Set(),
  },
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: { getURL: (path) => `moz-extension://test/${path}` },
  },
}));

vi.mock('@/shared/vue/vue-utils.js', () => ({
  setupTrustedTypesCompatibility: vi.fn(),
}));

vi.mock('@/features/exclusion/utils/exclusion-utils.js', () => ({
  checkUrlExclusionAsync: vi.fn().mockResolvedValue(false),
}));

vi.mock('./ContentScriptCore.js', () => ({
  ContentScriptCore: class {
    constructor() {
      this.vueLoaded = true;
    }

    async initializeCritical() {
      return mocks.initializeCritical();
    }

    async loadVueApp() {}
  },
}));

vi.mock('./main/MainFrameAggregator.js', () => ({
  MainFrameAggregator: class {},
}));

vi.mock('./main/MainFrameCoordinator.js', () => ({
  MainFrameCoordinator: class {},
}));

vi.mock('./main/MainFeatureLoader.js', () => ({
  MainFeatureLoader: class {
    constructor() {
      this.featureLoadPromises = new Map();
    }

    loadFeature(featureName, category) {
      if (this.featureLoadPromises.has(featureName)) {
        return this.featureLoadPromises.get(featureName);
      }

      mocks.featureLoadCalls.push({ featureName, category });
      const loadPromise = Promise.resolve(mocks.loadFeature(featureName, category));
      this.featureLoadPromises.set(featureName, loadPromise);
      loadPromise.finally(() => {
        if (this.featureLoadPromises.get(featureName) === loadPromise) {
          this.featureLoadPromises.delete(featureName);
        }
      });
      return loadPromise;
    }

    startIntelligentLoading() {
      return mocks.startIntelligentLoading(this);
    }
  },
}));

vi.mock('@/shared/messaging/core/MessageActions.js', () => ({
  MessageActions: {
    PAGE_TRANSLATE: 'page-translate',
  },
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: mocks.loggerError,
  }),
}));

vi.mock('./InteractionCoordinator.js', () => ({
  interactionCoordinator: {
    initialize: mocks.interactionInitialize,
  },
}));

vi.mock('@/features/windows/managers/crossframe/TextSelectionWindowRelay.js', () => ({
  installTextSelectionWindowRelay: vi.fn(),
}));

vi.mock('@/shared/managers/SettingsManager.js', () => ({
  default: {
    initialize: vi.fn().mockResolvedValue(undefined),
    isExtensionEnabled: mocks.isExtensionEnabled,
    get: mocks.settingsGet,
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

vi.mock('@/core/managers/content/FeatureManager.js', () => ({
  FeatureManager: {
    getInstance: () => mocks.featureManager,
  },
}));

vi.mock('@/shared/messaging/core/UnifiedMessaging.js', () => ({
  sendRegularMessage: mocks.sendRegularMessage,
}));

const deferred = () => {
  let resolve;
  const promise = new Promise((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
};

const flushMicrotasks = async () => {
  for (let index = 0; index < 16; index++) await Promise.resolve();
};

describe('initial auto page command transport', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.sendRegularMessage.mockResolvedValue({ success: true });
    mocks.initializeCritical.mockResolvedValue(true);
    mocks.interactionInitialize.mockResolvedValue(undefined);
    mocks.isExtensionEnabled.mockImplementation(() => mocks.runtimeEnabled);
    mocks.settingsGet.mockImplementation((key, fallback) => {
      if (key === 'WHOLE_PAGE_TRANSLATION_ENABLED') return mocks.wholePageEnabled;
      if (key === 'WHOLE_PAGE_AUTO_TRANSLATE_RULES') return mocks.autoRules;
      return fallback;
    });
    mocks.matchesAutoTranslateRule.mockReturnValue(true);
    mocks.isFeatureAllowed.mockResolvedValue(true);
    mocks.contentMessageHandler.isActive = true;
    mocks.pageTranslationManager.isActive = true;
    mocks.pageTranslationManager.userRestoredOverride = false;
    mocks.pageTranslationManager.autoStartCancelledUrls = new Set();
    mocks.featureManager.getFeatureHandler.mockImplementation((featureName) => {
      if (featureName === 'contentMessageHandler') return mocks.contentMessageHandler;
      if (featureName === 'pageTranslation') return mocks.pageTranslationManager;
      return null;
    });
    mocks.featureManager.isFeatureActive.mockImplementation((featureName) => (
      featureName === 'contentMessageHandler' && mocks.contentMessageHandler.isActive
    ));
    mocks.loadFeature.mockImplementation(async (featureName) => {
      if (featureName === 'contentMessageHandler') return mocks.contentMessageHandler;
      if (featureName === 'pageTranslation') return mocks.pageTranslationManager;
      return {};
    });
    mocks.startIntelligentLoading.mockImplementation(() => undefined);
    mocks.featureLoadCalls.length = 0;
    mocks.loggerError.mockClear();
    mocks.firstCoordinatorEnabled = undefined;
    mocks.runtimeEnabled = true;
    mocks.wholePageEnabled = true;
    mocks.autoRules = [{ pattern: 'example.com' }];
    window.translateItContentCore = undefined;
    window.translateItContentScriptCore = undefined;
  });

  it('sends one auto command through runtime without PageEventBus emission', async () => {
    await import('./index-main.js');

    await vi.waitFor(() => expect(mocks.sendRegularMessage).toHaveBeenCalledOnce());

    expect(mocks.sendRegularMessage).toHaveBeenCalledWith({
      action: 'page-translate',
      data: { isAuto: true },
    }, { returnFailureResponse: true });
    expect(mocks.featureLoadCalls
      .filter(({ featureName }) => ['contentMessageHandler', 'pageTranslation'].includes(featureName))
      .map(({ featureName }) => featureName)).toEqual([
      'contentMessageHandler',
      'pageTranslation',
    ]);
  });

  it('waits for core readiness before initializing the interaction coordinator', async () => {
    mocks.autoRules = [];
    let resolveCore;
    mocks.initializeCritical.mockImplementation(() => new Promise((resolve) => {
      resolveCore = resolve;
    }));
    mocks.interactionInitialize.mockImplementation(() => {
      mocks.firstCoordinatorEnabled = mocks.isExtensionEnabled();
      return Promise.resolve();
    });

    await import('./index-main.js');

    await vi.waitFor(() => expect(mocks.initializeCritical).toHaveBeenCalledOnce());
    expect(mocks.interactionInitialize).not.toHaveBeenCalled();
    expect(mocks.firstCoordinatorEnabled).toBeUndefined();

    mocks.runtimeEnabled = false;
    resolveCore(true);

    await vi.waitFor(() => expect(mocks.interactionInitialize).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(mocks.isExtensionEnabled).toHaveBeenCalledTimes(2));
    expect(mocks.firstCoordinatorEnabled).toBe(false);
  });

  it('waits for ContentMessageHandler readiness before sending auto command', async () => {
    const handlerReady = deferred();
    const order = [];
    mocks.contentMessageHandler.isActive = false;
    mocks.loadFeature.mockImplementation(async (featureName) => {
      order.push(`load:${featureName}`);
      if (featureName === 'contentMessageHandler') {
        await handlerReady.promise;
        mocks.contentMessageHandler.isActive = true;
        return mocks.contentMessageHandler;
      }
      return mocks.pageTranslationManager;
    });
    mocks.sendRegularMessage.mockImplementation(async (message) => {
      order.push(`send:${message.action}`);
      return { success: true };
    });

    await import('./index-main.js');
    await vi.waitFor(() => expect(mocks.featureLoadCalls).toContainEqual({
      featureName: 'contentMessageHandler',
      category: 'ESSENTIAL',
    }));
    expect(mocks.sendRegularMessage).not.toHaveBeenCalled();

    handlerReady.resolve();
    await vi.waitFor(() => expect(mocks.sendRegularMessage).toHaveBeenCalledOnce());

    expect(order.indexOf('load:contentMessageHandler')).toBeLessThan(order.indexOf('send:page-translate'));
    expect(order.indexOf('load:pageTranslation')).toBeLessThan(order.indexOf('send:page-translate'));
  });

  it('deduplicates explicit auto load with delayed ESSENTIAL startup load', async () => {
    vi.useFakeTimers();
    let resolveHandler;
    try {
      const handlerReady = deferred();
      resolveHandler = handlerReady.resolve;
      let logicalActivations = 0;
      mocks.contentMessageHandler.isActive = false;
      mocks.loadFeature.mockImplementation(async (featureName) => {
        if (featureName === 'contentMessageHandler') {
          logicalActivations++;
          await handlerReady.promise;
          mocks.contentMessageHandler.isActive = true;
          return mocks.contentMessageHandler;
        }
        return mocks.pageTranslationManager;
      });
      mocks.startIntelligentLoading.mockImplementation((loader) => {
        setTimeout(() => loader.loadFeature('contentMessageHandler', 'ESSENTIAL'), 400);
      });

      await import('./index-main.js');
      await vi.waitFor(() => expect(mocks.featureLoadCalls
        .filter(({ featureName }) => featureName === 'contentMessageHandler'))
        .toHaveLength(1), { interval: 1, timeout: 100 });
      expect(mocks.featureLoadCalls.filter(({ featureName }) => featureName === 'contentMessageHandler')).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(400);
      expect(mocks.featureLoadCalls.filter(({ featureName }) => featureName === 'contentMessageHandler')).toHaveLength(1);

      handlerReady.resolve();
      await vi.waitFor(() => expect(mocks.sendRegularMessage).toHaveBeenCalledOnce(), {
        interval: 1,
        timeout: 100,
      });

      expect(logicalActivations).toBe(1);
    } finally {
      resolveHandler?.();
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('does not send auto command when ContentMessageHandler activation is not ready', async () => {
    mocks.contentMessageHandler.isActive = false;
    mocks.loadFeature.mockResolvedValue(null);

    await import('./index-main.js');
    await vi.waitFor(() => expect(mocks.featureLoadCalls).toContainEqual({
      featureName: 'contentMessageHandler',
      category: 'ESSENTIAL',
    }));
    await vi.waitFor(() => expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to run auto page translation check:',
      expect.objectContaining({ message: 'ContentMessageHandler not ready for auto page translation' })
    ));

    expect(mocks.featureLoadCalls.some(({ featureName }) => featureName === 'pageTranslation')).toBe(false);
    expect(mocks.sendRegularMessage).not.toHaveBeenCalled();
  });

  it.each([
    ['no auto rules', () => { mocks.autoRules = []; }],
    ['non-matching rule', () => { mocks.matchesAutoTranslateRule.mockReturnValue(false); }],
    ['Whole Page disabled', () => { mocks.wholePageEnabled = false; }],
    ['extension disabled', () => { mocks.runtimeEnabled = false; }],
    ['page excluded', () => { mocks.isFeatureAllowed.mockResolvedValue(false); }],
  ])('does not start auto translation when %s', async (_reason, configure) => {
    configure();

    await import('./index-main.js');
    await vi.waitFor(() => expect(mocks.isExtensionEnabled).toHaveBeenCalled());
    if (mocks.runtimeEnabled) {
      await vi.waitFor(() => expect(mocks.settingsGet).toHaveBeenCalledWith('WHOLE_PAGE_TRANSLATION_ENABLED', true));
    }
    await flushMicrotasks();

    expect(mocks.sendRegularMessage).not.toHaveBeenCalled();
    expect(mocks.featureLoadCalls.some(({ featureName }) => featureName === 'contentMessageHandler')).toBe(false);
    expect(mocks.featureLoadCalls.some(({ featureName }) => featureName === 'pageTranslation')).toBe(false);
  });

  it.each([
    ['userRestoredOverride', () => { mocks.pageTranslationManager.userRestoredOverride = true; }],
    ['autoStartCancelledUrls', () => { mocks.pageTranslationManager.autoStartCancelledUrls.add(window.location.href); }],
  ])('does not send auto command when %s blocks startup', async (_reason, configure) => {
    configure();

    await import('./index-main.js');
    await vi.waitFor(() => expect(mocks.featureLoadCalls
      .filter(({ featureName }) => featureName === 'pageTranslation'))
      .toHaveLength(1));
    await flushMicrotasks();

    expect(mocks.featureLoadCalls
      .filter(({ featureName }) => ['contentMessageHandler', 'pageTranslation'].includes(featureName))
      .map(({ featureName }) => featureName)).toEqual([
      'contentMessageHandler',
      'pageTranslation',
    ]);
    expect(mocks.sendRegularMessage).not.toHaveBeenCalled();
  });
});
