import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state = {
    EXCLUDED_SITES: ['old.example']
  };
  const settingsListeners = [];
  const settingsManager = {
    initialize: vi.fn(),
    refreshSettings: vi.fn(),
    get: vi.fn((key, defaultValue) => (
      Object.prototype.hasOwnProperty.call(state, key) ? state[key] : defaultValue
    )),
    onChange: vi.fn((key, callback) => {
      settingsListeners.push({ key, callback });
      return vi.fn();
    })
  };
  const logger = {
    init: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };

  return {
    state,
    settingsListeners,
    settingsManager,
    logger,
    pageEventBus: { emit: vi.fn() },
    utilsFactory: {
      getUIUtils: vi.fn().mockResolvedValue({
        isUrlExcluded: (url, excludedSites = []) => (
          excludedSites.some(site => url.includes(site))
        ),
        isUrlExcluded_TEXT_FIELDS_ICON: (url, excludedSites = []) => (
          excludedSites.some(site => url.includes(site))
        )
      })
    }
  };
});

vi.mock('@/shared/managers/SettingsManager.js', () => ({
  settingsManager: mocks.settingsManager,
  default: mocks.settingsManager
}));

vi.mock('@/utils/UtilsFactory.js', () => ({
  utilsFactory: mocks.utilsFactory
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => mocks.logger)
}));

vi.mock('@/shared/logging/logConstants.js', () => ({
  LOG_COMPONENTS: { EXCLUSION: 'exclusion' }
}));

vi.mock('@/core/PageEventBus.js', () => ({
  pageEventBus: mocks.pageEventBus
}));

vi.mock('@/shared/error-management/ErrorHandler.js', () => ({
  ErrorHandler: {
    getInstance: vi.fn(() => ({ handle: vi.fn() }))
  }
}));

vi.mock('@/shared/error-management/ErrorTypes.js', () => ({
  ErrorTypes: { SERVICE: 'service' }
}));

vi.mock('@/core/managers/content/FeatureConfig.js', () => ({
  FEATURE_CONFIG: {
    testFeature: { alwaysEnabled: true }
  },
  RELEVANT_FEATURE_SETTINGS: ['EXCLUDED_SITES'],
  ALL_FEATURES: ['testFeature']
}));

vi.mock('../utils/exclusion-utils.js', () => ({
  checkUrlExclusionAsync: vi.fn().mockResolvedValue(false)
}));

import { ExclusionChecker } from './ExclusionChecker.js';

describe('ExclusionChecker.refreshSettings', () => {
  let checker;

  beforeEach(() => {
    ExclusionChecker.resetInstance();
    vi.clearAllMocks();
    mocks.state.EXCLUDED_SITES = ['old.example'];
    mocks.settingsListeners.length = 0;
    mocks.settingsManager.initialize.mockResolvedValue(mocks.settingsManager);
    mocks.settingsManager.refreshSettings.mockResolvedValue(undefined);
    checker = ExclusionChecker.getInstance();
  });

  afterEach(() => {
    ExclusionChecker.resetInstance();
    window.history.replaceState({}, '', '/');
  });

  it('delegates refresh to SettingsManager without using initialize', async () => {
    await checker.refreshSettings();

    expect(mocks.settingsManager.refreshSettings).toHaveBeenCalledTimes(1);
    expect(mocks.settingsManager.initialize).not.toHaveBeenCalled();
  });

  it('refreshes after the checker and manager are already initialized', async () => {
    await checker.initialize();
    mocks.settingsManager.initialize.mockClear();

    await checker.refreshSettings();

    expect(mocks.settingsManager.refreshSettings).toHaveBeenCalledTimes(1);
    expect(mocks.settingsManager.initialize).not.toHaveBeenCalled();
  });

  it('uses refreshed exclusion state for subsequent URL checks', async () => {
    window.history.replaceState({}, '', '/target.example/page');
    checker.updateUrl(window.location.href);
    await checker.initialize();
    expect(await checker.isUrlExcludedForFeature('testFeature')).toBe(false);

    mocks.settingsManager.refreshSettings.mockImplementation(async () => {
      mocks.state.EXCLUDED_SITES = ['target.example'];
    });

    await checker.refreshSettings();

    expect(await checker.isUrlExcludedForFeature('testFeature')).toBe(true);
  });

  it('propagates the original refresh failure', async () => {
    const error = new Error('refresh failed');
    mocks.settingsManager.refreshSettings.mockRejectedValue(error);

    await expect(checker.refreshSettings()).rejects.toBe(error);
    expect(mocks.logger.error).toHaveBeenCalledWith(
      'Error refreshing ExclusionChecker settings:',
      error
    );
  });

  it('does not register duplicate listeners or emit events during refresh', async () => {
    await checker.initialize();
    const listenerCount = mocks.settingsManager.onChange.mock.calls.length;
    const subscriptionCount = checker.settingsListeners.length;

    await checker.refreshSettings();
    await checker.refreshSettings();

    expect(mocks.settingsManager.onChange).toHaveBeenCalledTimes(listenerCount);
    expect(mocks.settingsListeners).toHaveLength(subscriptionCount);
    expect(mocks.pageEventBus.emit).not.toHaveBeenCalled();
  });
});
