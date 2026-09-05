import { describe, it, expect, vi, beforeEach } from 'vitest';
const getActionbarIconManagerMock = vi.fn();
vi.mock('webextension-polyfill', () => ({ default: {} }));
vi.mock('@/core/background/feature-loader.js', () => ({ featureLoader:{ preloadEssentialFeatures: vi.fn(()=>Promise.resolve({})), loadContextMenuManager: vi.fn(()=>Promise.resolve({ initialized:true, initialize:vi.fn() })) } }));
vi.mock('@/features/translation/core/translation-engine.js', () => ({ TranslationEngine: class { initialize(){return Promise.resolve();} } }));
vi.mock('@/shared/messaging/core/MessageHandler.js', () => ({ createMessageHandler: ()=>({ registerHandler:vi.fn(), isListenerActive:false, listen:vi.fn() }) }));
vi.mock('@/core/background/handlers/index.js', () => ({}));
vi.mock('@/shared/logging/logger.js', () => ({ getScopedLogger:()=>({debug:vi.fn(),info:vi.fn(),warn:vi.fn(),error:vi.fn()}) }));
vi.mock('@/core/browserHandlers.js', () => ({ addBrowserSpecificHandlers:vi.fn() }));
vi.mock('@/utils/UtilsFactory.js', () => ({ utilsFactory:{ getBrowserUtils: vi.fn(()=>Promise.resolve({ getActionbarIconManager: getActionbarIconManagerMock })) } }));
vi.mock('@/shared/config/config.js', () => ({ initializeSettingsListener: vi.fn(()=>Promise.resolve()) }));
vi.mock('@/features/translation/providers/ProviderConstants.js', () => ({ ProviderRegistryIds:{}}));

import { LifecycleManager } from './LifecycleManager.js';

describe('LifecycleManager dynamic icon A5-10',()=>{
  beforeEach(()=>{ vi.clearAllMocks(); });
  it('stage failure then recovery', async()=>{
    const mgr = new LifecycleManager();
    // prevent other stages from interfering: stub them to success
    mgr.initializebrowserAPI = vi.fn(()=>Promise.resolve());
    mgr.initializeTranslationEngine = vi.fn(()=>Promise.resolve());
    mgr.initializeErrorHandlers = vi.fn(()=>Promise.resolve());
    mgr.preloadFeatures = vi.fn(()=>Promise.resolve());
    mgr.refreshContextMenus = vi.fn(()=>Promise.resolve());
    mgr.initializeTTSVoiceCache = vi.fn();
    const err = new Error('icon fail');
    getActionbarIconManagerMock.mockRejectedValueOnce(err).mockResolvedValueOnce({ isInitialized:true });
    await expect(mgr.initializeDynamicIconManager()).rejects.toBe(err);
    expect(mgr._dynamicIconInitialized).toBe(false);
    expect(mgr.dynamicIconManager).toBeFalsy();
    await mgr.initializeDynamicIconManager();
    expect(mgr._dynamicIconInitialized).toBe(true);
    expect(mgr.dynamicIconManager.isInitialized).toBe(true);
    expect(getActionbarIconManagerMock).toHaveBeenCalledTimes(2);
  });
  it('second success does not re-register', async()=>{
    const mgr = new LifecycleManager();
    mgr.initializebrowserAPI = vi.fn(()=>Promise.resolve());
    const icon = { isInitialized:true };
    getActionbarIconManagerMock.mockResolvedValue(icon);
    await mgr.initializeDynamicIconManager();
    expect(mgr._dynamicIconInitialized).toBe(true);
    getActionbarIconManagerMock.mockClear();
    await mgr.initializeDynamicIconManager();
    expect(getActionbarIconManagerMock).not.toHaveBeenCalled();
  });
});
