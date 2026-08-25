import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';

const mocks = vi.hoisted(() => ({
  exclusionChecker: {
    updateUrl: vi.fn(),
    isFeatureAllowed: vi.fn(),
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
});
