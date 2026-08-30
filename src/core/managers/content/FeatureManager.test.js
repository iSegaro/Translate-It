import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';

const mocks = vi.hoisted(() => ({
  exclusionChecker: {
    updateUrl: vi.fn(),
    isFeatureAllowed: vi.fn(),
    refreshSettings: vi.fn(),
  },
  settingsManager: {
    get: vi.fn(),
    isExtensionEnabled: vi.fn(),
  },
  matchesAutoTranslateRule: vi.fn(),
  loadFeature: vi.fn(),
  sendRegularMessage: vi.fn(),
}));

vi.mock('@/features/exclusion/core/ExclusionChecker.js', () => ({
  ExclusionChecker: {
    getInstance: () => mocks.exclusionChecker,
    resetInstance: vi.fn(),
  },
}));

vi.mock('@/shared/storage/core/StorageCore.js', () => ({
  storageManager: {
    on: vi.fn(),
    off: vi.fn(),
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

vi.mock('@/shared/managers/SettingsManager.js', () => ({
  default: mocks.settingsManager,
}));

vi.mock('@/utils/ui/exclusion.js', () => ({
  matchesAutoTranslateRule: mocks.matchesAutoTranslateRule,
}));

vi.mock('@/core/content-scripts/chunks/lazy-features.js', () => ({
  loadFeature: mocks.loadFeature,
}));

vi.mock('@/shared/messaging/core/UnifiedMessaging.js', () => ({
  sendRegularMessage: mocks.sendRegularMessage,
}));

vi.mock('@/shared/error-management/ErrorHandler.js', () => ({
  ErrorHandler: { getInstance: () => ({ handle: vi.fn() }) },
}));

vi.mock('@/shared/error-management/ErrorTypes.js', () => ({
  ErrorTypes: {},
}));

import { FeatureManager } from './FeatureManager.js';

describe('FeatureManager SPA auto page command transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.settingsManager.get.mockImplementation((key, fallback) => {
      if (key === 'WHOLE_PAGE_TRANSLATION_ENABLED') return true;
      if (key === 'WHOLE_PAGE_AUTO_TRANSLATE_RULES') return [{ pattern: 'example.com' }];
      return fallback;
    });
    mocks.settingsManager.isExtensionEnabled.mockReturnValue(true);
    mocks.matchesAutoTranslateRule.mockReturnValue(true);
    mocks.exclusionChecker.isFeatureAllowed.mockResolvedValue(true);
    mocks.sendRegularMessage.mockResolvedValue({ success: true });
  });

  it('sends one auto command through runtime after matching SPA rule', async () => {
    const manager = new FeatureManager();
    const pageTranslationManager = {
      currentUrl: 'https://old.example/',
      userRestoredOverride: true,
      autoStartCancelledUrls: new Set(),
      isActive: false,
      activate: vi.fn().mockResolvedValue(true),
    };

    manager.reevaluateFeatures = vi.fn().mockResolvedValue(undefined);
    mocks.loadFeature.mockResolvedValue(pageTranslationManager);

    await manager.handleUrlChange('https://old.example/', 'https://new.example/');

    expect(pageTranslationManager.activate).toHaveBeenCalledOnce();
    expect(pageTranslationManager.userRestoredOverride).toBe(false);
    expect(mocks.sendRegularMessage).toHaveBeenCalledOnce();
    expect(mocks.sendRegularMessage).toHaveBeenCalledWith({
      action: MessageActions.PAGE_TRANSLATE,
      data: { isAuto: true },
    }, { returnFailureResponse: true });
  });

  it('deduplicates URL signals with a synchronous shared snapshot', async () => {
    const manager = FeatureManager.getInstance();
    const oldUrl = window.location.href;
    const newUrl = new URL('/silent-spa-route', oldUrl).href;
    manager._lastDetectedUrl = oldUrl;
    const handleUrlChange = vi.spyOn(manager, 'handleUrlChange').mockResolvedValue(undefined);

    window.history.replaceState({}, '', newUrl);

    const firstChange = manager.checkForUrlChange();
    expect(manager._lastDetectedUrl).toBe(newUrl);
    expect(handleUrlChange).toHaveBeenCalledOnce();
    expect(handleUrlChange).toHaveBeenCalledWith(oldUrl, newUrl);

    manager.checkForUrlChange();
    expect(handleUrlChange).toHaveBeenCalledOnce();
    await firstChange;
  });

  it('preserves rapid consecutive URL transitions', async () => {
    const manager = FeatureManager.getInstance();
    const urlA = window.location.href;
    const urlB = new URL('/route-b', urlA).href;
    const urlC = new URL('/route-c', urlA).href;
    manager._lastDetectedUrl = urlA;
    const handleUrlChange = vi.spyOn(manager, 'handleUrlChange').mockResolvedValue(undefined);

    window.history.replaceState({}, '', urlB);
    const firstChange = manager.checkForUrlChange();
    window.history.replaceState({}, '', urlC);
    const secondChange = manager.checkForUrlChange();

    expect(handleUrlChange).toHaveBeenNthCalledWith(1, urlA, urlB);
    expect(handleUrlChange).toHaveBeenNthCalledWith(2, urlB, urlC);
    expect(manager._lastDetectedUrl).toBe(urlC);
    await Promise.all([firstChange, secondChange]);
  });
});

describe('FeatureManager conflict resolution', () => {
  let manager;

  beforeEach(() => {
    manager = FeatureManager.getInstance();
    manager.featureHandlers.clear();
    manager.activeFeatures.clear();
    manager.requestedFeatures.clear();
  });

  it('silently deactivates active Select Element for Whole Page', async () => {
    const deactivate = vi.fn().mockResolvedValue(undefined);
    manager.featureHandlers.set('selectElement', { isActive: true, deactivate });
    manager.requestFeatureActivation = vi.fn();
    manager.activateFeature = vi.fn();

    await expect(manager.resolveFeatureConflict('pageTranslation')).resolves.toBe(true);

    expect(deactivate).toHaveBeenCalledOnce();
    expect(deactivate).toHaveBeenCalledWith({ silent: true, reason: 'conflict' });
    expect(manager.requestFeatureActivation).not.toHaveBeenCalled();
    expect(manager.activateFeature).not.toHaveBeenCalled();
  });

  it('leaves inactive Select Element untouched', async () => {
    const deactivate = vi.fn();
    manager.featureHandlers.set('selectElement', { isActive: false, deactivate });

    await expect(manager.resolveFeatureConflict('pageTranslation')).resolves.toBe(false);

    expect(deactivate).not.toHaveBeenCalled();
  });

  it.each([
    ['translating', { isTranslating: true, isTranslated: false }],
    ['translated', { isTranslating: false, isTranslated: true }],
  ])('restores %s Whole Page for Select Element', async (_state, state) => {
    const restorePage = vi.fn().mockResolvedValue(undefined);
    manager.featureHandlers.set('pageTranslation', { ...state, restorePage });

    await expect(manager.resolveFeatureConflict('selectElement')).resolves.toBe(true);

    expect(restorePage).toHaveBeenCalledOnce();
    expect(restorePage).toHaveBeenCalledWith();
  });

  it('leaves idle Whole Page untouched', async () => {
    const restorePage = vi.fn();
    manager.featureHandlers.set('pageTranslation', {
      isTranslating: false,
      isTranslated: false,
      restorePage,
    });

    await expect(manager.resolveFeatureConflict('selectElement')).resolves.toBe(false);

    expect(restorePage).not.toHaveBeenCalled();
  });

  it('propagates trusted Whole Page restore failures', async () => {
    const error = new Error('restore failed');
    manager.featureHandlers.set('pageTranslation', {
      isTranslating: true,
      isTranslated: false,
      restorePage: vi.fn().mockRejectedValue(error),
    });

    await expect(manager.resolveFeatureConflict('selectElement')).rejects.toBe(error);
  });

  it('ignores unsupported conflict requesters', async () => {
    await expect(manager.resolveFeatureConflict('unknown')).resolves.toBe(false);
  });
});

describe('FeatureManager settings refresh boundary', () => {
  let manager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = FeatureManager.getInstance();
    manager.reevaluateFeatures = vi.fn().mockResolvedValue(undefined);
    mocks.exclusionChecker.refreshSettings.mockReset();
  });

  it('contains exclusion refresh failures before reevaluation', async () => {
    const error = new Error('refresh failed');
    mocks.exclusionChecker.refreshSettings.mockRejectedValue(error);

    await expect(manager.handleSettingsChange('EXCLUDED_SITES', ['new.example']))
      .resolves.toBeUndefined();

    expect(mocks.exclusionChecker.refreshSettings).toHaveBeenCalledTimes(1);
    expect(manager.reevaluateFeatures).not.toHaveBeenCalled();
  });
});
