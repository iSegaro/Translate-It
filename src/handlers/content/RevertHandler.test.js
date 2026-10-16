import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  revertSelectElementTranslation: vi.fn(),
  getActivePinia: vi.fn(),
  useMobileStore: vi.fn(),
  show: vi.fn(),
  getI18nUtils: vi.fn(),
  on: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: mocks.warn }),
}));
vi.mock('@/core/PageEventBus.js', () => ({ pageEventBus: { on: mocks.on } }));
vi.mock('@/core/memory/ResourceTracker.js', () => ({ default: class ResourceTracker {} }));
vi.mock('@/shared/constants/ui.js', () => ({ NOTIFICATION_TIME: { REVERT: 1 } }));
vi.mock('@/store/modules/mobile.js', () => ({ useMobileStore: mocks.useMobileStore }));
vi.mock('@/core/managers/core/NotificationManager.js', () => ({
  default: class NotificationManager { show = mocks.show; },
}));
vi.mock('@/features/element-selection/core/DomTranslatorAdapter.js', () => ({
  revertSelectElementTranslation: mocks.revertSelectElementTranslation,
}));
vi.mock('pinia', () => ({ getActivePinia: mocks.getActivePinia }));
vi.mock('@/utils/UtilsFactory.js', () => ({ utilsFactory: { getI18nUtils: mocks.getI18nUtils } }));
vi.mock('@/shared/config/config.js', () => ({ state: {} }));

import { RevertHandler } from './RevertHandler.js';

describe('RevertHandler result and count', () => {
  let handler;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.revertSelectElementTranslation.mockResolvedValue(0);
    mocks.getActivePinia.mockReturnValue(null);
    mocks.getI18nUtils.mockResolvedValue({ getTranslationString: vi.fn().mockResolvedValue('items reverted') });
    handler = new RevertHandler();
    handler.getSelectElementManager = vi.fn().mockResolvedValue(null);
    handler.revertLegacyTranslations = vi.fn().mockResolvedValue(0);
  });

  it('returns the actual global Vue restoration count', async () => {
    mocks.revertSelectElementTranslation.mockResolvedValue(3);
    expect(await handler.revertVueTranslations()).toBe(3);
  });

  it('falls back to SelectElementManager when the global Vue count is zero', async () => {
    const revertTranslations = vi.fn().mockResolvedValue(2);
    handler.getSelectElementManager.mockResolvedValue({ revertTranslations });
    expect(await handler.revertVueTranslations()).toBe(2);
    expect(revertTranslations).toHaveBeenCalledOnce();
  });

  it.each([
    ['Vue and legacy succeed', 2, 4, { success: true, partial: false, revertedCount: 6 }],
    ['Vue fails and legacy succeeds', new Error('Vue broke'), 4, { success: true, partial: true, revertedCount: 4 }],
    ['Vue succeeds and legacy fails', 2, new Error('Legacy broke'), { success: true, partial: true, revertedCount: 2 }],
    ['both systems fail', new Error('Vue broke'), new Error('Legacy broke'), { success: false, partial: false, revertedCount: 0 }],
  ])('%s', async (_name, vueOutcome, legacyOutcome, expected) => {
    handler.revertVueTranslations = vi.fn(() => vueOutcome instanceof Error ? Promise.reject(vueOutcome) : Promise.resolve(vueOutcome));
    handler.revertLegacyTranslations = vi.fn(() => legacyOutcome instanceof Error ? Promise.reject(legacyOutcome) : Promise.resolve(legacyOutcome));

    const result = await handler.executeRevert();
    expect(result).toMatchObject(expected);
    if (result.partial) {
      expect(result.errors).toHaveLength(1);
      expect(mocks.show).not.toHaveBeenCalled();
    }
    if (!result.success) {
      expect(result.error).toBe('vue: Vue broke; legacy: Legacy broke');
      expect(result.errors).toHaveLength(2);
      expect(mocks.show).not.toHaveBeenCalled();
    }
  });

  it('reports a legitimate zero-count success without a notification', async () => {
    const result = await handler.executeRevert();
    expect(result).toMatchObject({ success: true, partial: false, revertedCount: 0 });
    expect(mocks.show).not.toHaveBeenCalled();
  });

  it('returns partial success when a system restores some nodes and reports a node failure', async () => {
    handler.revertVueTranslations = vi.fn(async onRestoreFailure => {
      onRestoreFailure({ phase: 'Text restoration', error: new Error('one node failed') });
      return 2;
    });

    const result = await handler.executeRevert();

    expect(result).toMatchObject({
      success: true,
      partial: true,
      revertedCount: 2,
      errors: [{ system: 'vue', error: 'Text restoration: one node failed' }],
    });
    expect(result.error).toBeUndefined();
    expect(handler.revertLegacyTranslations).toHaveBeenCalledOnce();
    expect(mocks.show).not.toHaveBeenCalled();
  });

  it('returns total failure when a restore callback reports an error and restores nothing', async () => {
    handler.revertVueTranslations = vi.fn(async onRestoreFailure => {
      onRestoreFailure({ phase: 'Metadata restoration', error: new Error('metadata failed') });
      return 0;
    });

    const result = await handler.executeRevert();

    expect(result).toMatchObject({
      success: false,
      partial: false,
      revertedCount: 0,
      error: 'vue: Metadata restoration: metadata failed',
      errors: [{ system: 'vue', error: 'Metadata restoration: metadata failed' }],
    });
    expect(handler.revertLegacyTranslations).toHaveBeenCalledOnce();
    expect(mocks.show).not.toHaveBeenCalled();
  });

  it('collects callback-reported failures from both systems without discarding restored counts', async () => {
    handler.revertVueTranslations = vi.fn(async onRestoreFailure => {
      onRestoreFailure({ phase: 'Text restoration', error: new Error('Vue node failed') });
      return 1;
    });
    handler.revertLegacyTranslations = vi.fn(async onRestoreFailure => {
      onRestoreFailure({ phase: 'legacy-container', error: new Error('legacy node failed') });
      return 2;
    });

    const result = await handler.executeRevert();

    expect(result).toMatchObject({
      success: true,
      partial: true,
      revertedCount: 3,
      system: 'vue,legacy',
      errors: [
        { system: 'vue', error: 'Text restoration: Vue node failed' },
        { system: 'legacy', error: 'legacy-container: legacy node failed' },
      ],
    });
    expect(mocks.show).not.toHaveBeenCalled();
  });

  it.each(['i18n lookup', 'notification display'])('preserves restored counts when %s fails', async failurePoint => {
    mocks.revertSelectElementTranslation.mockResolvedValue(3);
    if (failurePoint === 'i18n lookup') {
      mocks.getI18nUtils.mockRejectedValue(new Error('i18n unavailable'));
    } else {
      mocks.show.mockImplementation(() => { throw new Error('notification unavailable'); });
    }

    const result = await handler.executeRevert();

    expect(result).toMatchObject({ success: true, partial: false, revertedCount: 3 });
    expect(mocks.revertSelectElementTranslation).toHaveBeenCalledOnce();
    expect(handler.revertLegacyTranslations).toHaveBeenCalledOnce();
    expect(mocks.warn).toHaveBeenCalledWith('Failed to send revert notification:', expect.any(Error));
  });

  it('records a thrown global Vue revert error and still attempts legacy revert', async () => {
    mocks.revertSelectElementTranslation.mockRejectedValue(new Error('global Vue revert failed'));

    const result = await handler.executeRevert();

    expect(result).toMatchObject({
      success: false,
      partial: false,
      revertedCount: 0,
      error: 'vue: global Vue revert failed',
      errors: [{ system: 'vue', error: 'global Vue revert failed' }],
    });
    expect(handler.getSelectElementManager).not.toHaveBeenCalled();
    expect(handler.revertLegacyTranslations).toHaveBeenCalledOnce();
  });

  it('keeps only one restoration active for concurrent requests', async () => {
    let finishRevert;
    handler.revertVueTranslations = vi.fn(() => new Promise(resolve => { finishRevert = resolve; }));
    const first = handler.executeRevert();
    await Promise.resolve();

    await expect(handler.executeRevert()).resolves.toEqual({ success: false, reason: 'already_executing' });
    expect(handler.revertVueTranslations).toHaveBeenCalledOnce();
    finishRevert(0);
    await first;
    expect(handler.revertLegacyTranslations).toHaveBeenCalledOnce();
  });
});
