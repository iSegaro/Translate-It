import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vue', () => ({
  createApp: vi.fn(() => ({ use: vi.fn(), mount: vi.fn() }))
}));

vi.mock('pinia', () => ({
  createPinia: vi.fn(() => ({}))
}));

vi.mock('@/apps/content/ContentApp.vue', () => ({ default: {} }));

vi.mock('@/shared/vue/vue-utils.js', () => ({
  setupTrustedTypesCompatibility: vi.fn()
}));

vi.mock('@/utils/UtilsFactory.js', () => ({
  utilsFactory: {
    getI18nUtils: vi.fn().mockResolvedValue({ i18nPlugin: {} })
  }
}));

vi.mock('@/assets/styles/content-app-global.scss?inline', () => ({ default: '' }));

vi.mock('./lazy-styles.js', () => ({ sharedStyles: {} }));

vi.mock('@/core/extensionContext.js', () => ({
  default: { isValidSync: vi.fn().mockReturnValue(true) }
}));

const HOST_ID = 'translate-it-host-main';

const makeCore = () => ({ vueLoaded: false, dispatchEvent: vi.fn() });

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  document.getElementById(HOST_ID)?.remove();
});

describe('loadVueApp idempotence', () => {
  it('loads and mounts once; second call is a no-op', async () => {
    const { createApp } = await import('vue');
    const { loadVueApp } = await import('./lazy-vue-app.js');
    const core = makeCore();

    await loadVueApp(core);
    expect(createApp).toHaveBeenCalledTimes(1);
    expect(core.vueLoaded).toBe(true);
    expect(core.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'vue-loaded' }));

    await loadVueApp(core);
    expect(createApp).toHaveBeenCalledTimes(1);
    expect(core.dispatchEvent).toHaveBeenCalledTimes(1);
  });
});

describe('loadVueApp failure / retry contract', () => {
  it('a thrown failure leaves vueLoaded false and does not poison a later attempt', async () => {
    const { createApp } = await import('vue');
    createApp.mockImplementationOnce(() => { throw new Error('boom'); });
    const { loadVueApp } = await import('./lazy-vue-app.js');
    const core = makeCore();

    await expect(loadVueApp(core)).rejects.toThrow('boom');
    expect(core.vueLoaded).toBe(false);

    await loadVueApp(core);
    expect(createApp).toHaveBeenCalledTimes(2);
    expect(core.vueLoaded).toBe(true);
  });

  it('an invalid context early-returns without mounting; a later valid attempt succeeds', async () => {
    const { default: ExtensionContextManager } = await import('@/core/extensionContext.js');
    const { loadVueApp } = await import('./lazy-vue-app.js');
    const core = makeCore();

    ExtensionContextManager.isValidSync.mockReturnValueOnce(false);
    await loadVueApp(core);
    expect(core.vueLoaded).toBe(false);

    ExtensionContextManager.isValidSync.mockReturnValue(true);
    await loadVueApp(core);
    expect(core.vueLoaded).toBe(true);
  });
});
