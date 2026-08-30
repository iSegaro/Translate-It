import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendRegularMessage: vi.fn(),
  initializeCritical: vi.fn(),
  interactionInitialize: vi.fn(),
  isExtensionEnabled: vi.fn(),
  firstCoordinatorEnabled: undefined,
  runtimeEnabled: true,
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
    async loadFeature() {}
    startIntelligentLoading() {}
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
    error: vi.fn(),
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
    get: vi.fn((key, fallback) => key === 'WHOLE_PAGE_AUTO_TRANSLATE_RULES' ? [{ pattern: 'example.com' }] : fallback),
  },
}));

vi.mock('@/utils/ui/exclusion.js', () => ({
  matchesAutoTranslateRule: vi.fn(() => true),
}));

vi.mock('@/features/exclusion/core/ExclusionChecker.js', () => ({
  ExclusionChecker: {
    getInstance: () => ({
      initialize: vi.fn().mockResolvedValue(undefined),
      isFeatureAllowed: vi.fn().mockResolvedValue(true),
    }),
  },
}));

vi.mock('@/core/managers/content/FeatureManager.js', () => ({
  FeatureManager: {
    getInstance: () => ({
      getFeatureHandler: () => mocks.pageTranslationManager,
    }),
  },
}));

vi.mock('@/shared/messaging/core/UnifiedMessaging.js', () => ({
  sendRegularMessage: mocks.sendRegularMessage,
}));

describe('initial auto page command transport', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.sendRegularMessage.mockResolvedValue({ success: true });
    mocks.initializeCritical.mockResolvedValue(true);
    mocks.interactionInitialize.mockResolvedValue(undefined);
    mocks.isExtensionEnabled.mockImplementation(() => mocks.runtimeEnabled);
    mocks.firstCoordinatorEnabled = undefined;
    mocks.runtimeEnabled = true;
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
  });

  it('waits for core readiness before initializing the interaction coordinator', async () => {
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
    expect(mocks.firstCoordinatorEnabled).toBe(false);
  });
});
