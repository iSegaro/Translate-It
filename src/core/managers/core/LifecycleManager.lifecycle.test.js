import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  TranslationEngine: vi.fn(),
  featureLoader: { preloadEssentialFeatures: vi.fn().mockResolvedValue({}), loadContextMenuManager: vi.fn().mockResolvedValue({ initialized: true, initialize: vi.fn() }) },
  createMessageHandler: vi.fn(() => ({ registerHandler: vi.fn(), listen: vi.fn(), isListenerActive: false })),
  initializeSettingsListener: vi.fn().mockResolvedValue(),
  getBrowserUtils: vi.fn().mockResolvedValue({ getActionbarIconManager: vi.fn().mockResolvedValue({}) }),
  handlers: {},
}));

vi.mock('@/features/translation/core/translation-engine.js', () => ({ TranslationEngine: mocks.TranslationEngine }));
vi.mock('@/core/background/feature-loader.js', () => ({ featureLoader: mocks.featureLoader }));
vi.mock('@/shared/messaging/core/MessageHandler.js', () => ({ createMessageHandler: mocks.createMessageHandler }));
vi.mock('@/shared/config/config.js', async (importOriginal) => {
  const orig = await importOriginal();
  return { ...orig, initializeSettingsListener: mocks.initializeSettingsListener };
});
vi.mock('@/utils/UtilsFactory.js', () => ({ utilsFactory: { getBrowserUtils: mocks.getBrowserUtils } }));
vi.mock('@/shared/logging/logger.js', () => ({ getScopedLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));
vi.mock('@/core/browserHandlers.js', () => ({ addBrowserSpecificHandlers: vi.fn() }));
vi.mock('@/features/tts/services/TTSVoiceService.js', () => ({ ttsVoiceService: { getVoices: vi.fn() } }));

import { LifecycleManager } from './LifecycleManager.js';

describe('LifecycleManager behavioral', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.TranslationEngine.mockImplementation(function() { this.initialize = vi.fn().mockResolvedValue(); });
  });

  it('concurrent initialize shares one effective startup', async () => {
    let resolveEngine;
    const engineDeferred = new Promise(r => { resolveEngine = r; });
    mocks.TranslationEngine.mockImplementation(function() {
      this.initialize = vi.fn(() => engineDeferred);
    });
    const lm = new LifecycleManager();
    const a = lm.initialize();
    const b = lm.initialize();
    expect(a).toBe(b);
    resolveEngine();
    await a;
    expect(mocks.TranslationEngine).toHaveBeenCalledTimes(1);
  });

  it('partial retry retains successful TranslationEngine', async () => {
    const lm = new LifecycleManager();
    mocks.TranslationEngine.mockImplementation(function() { this.initialize = vi.fn().mockResolvedValue(); this._id = Math.random(); });
    lm.refreshContextMenus = vi.fn().mockRejectedValueOnce(new Error('later stage fail')).mockResolvedValue();

    await expect(lm.initialize()).rejects.toThrow('later stage fail');
    const firstEngine = lm.translationEngine;
    expect(firstEngine).not.toBeNull();
    expect(mocks.TranslationEngine).toHaveBeenCalledTimes(1);

    await expect(lm.initialize()).resolves.toBeUndefined();
    expect(lm.translationEngine).toBe(firstEngine);
    expect(mocks.TranslationEngine).toHaveBeenCalledTimes(1);
    expect(lm.initialized).toBe(true);
  });
});
