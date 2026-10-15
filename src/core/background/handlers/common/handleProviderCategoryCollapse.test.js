import { beforeEach, describe, expect, it, vi } from 'vitest';
import { storageManager } from '@/shared/storage/core/StorageCore.js';
import { handleSetProviderCategoryCollapsed } from './handleProviderCategoryCollapse.js';

vi.mock('@/shared/storage/core/StorageCore.js', () => ({
  storageManager: { get: vi.fn(), set: vi.fn() }
}));

describe('provider category collapse serializer', () => {
  let storedState;

  beforeEach(() => {
    vi.clearAllMocks();
    storedState = { ids: ['free'], revision: 4 };
    storageManager.get.mockImplementation(async defaults => ({
      COLLAPSED_PROVIDER_CATEGORIES: storedState ?? defaults.COLLAPSED_PROVIDER_CATEGORIES
    }));
    storageManager.set.mockImplementation(async values => {
      storedState = values.COLLAPSED_PROVIDER_CATEGORIES;
      return true;
    });
  });

  it('serializes rapid set intents and preserves categories not named by each intent', async () => {
    const first = handleSetProviderCategoryCollapsed({ categoryId: 'ai', collapsed: true });
    const second = handleSetProviderCategoryCollapsed({ categoryId: 'local', collapsed: true });
    const third = handleSetProviderCategoryCollapsed({ categoryId: 'ai', collapsed: false });

    const results = await Promise.all([first, second, third]);

    expect(results.map(result => result.state)).toEqual([
      { ids: ['free', 'ai'], revision: 5 },
      { ids: ['free', 'ai', 'local'], revision: 6 },
      { ids: ['free', 'local'], revision: 7 }
    ]);
    expect(storedState).toEqual({ ids: ['free', 'local'], revision: 7 });
    expect(storageManager.get).toHaveBeenCalledTimes(3);
  });

  it('queues intents from separate callers behind an in-flight storage read', async () => {
    let releaseRead;
    storageManager.get.mockImplementationOnce(() => new Promise(resolve => {
      releaseRead = () => resolve({ COLLAPSED_PROVIDER_CATEGORIES: storedState });
    }));

    const first = handleSetProviderCategoryCollapsed({ categoryId: 'ai', collapsed: true });
    const second = handleSetProviderCategoryCollapsed({ categoryId: 'local', collapsed: true });
    await Promise.resolve();
    expect(storageManager.get).toHaveBeenCalledTimes(1);

    releaseRead();
    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult.state.revision).toBe(5);
    expect(secondResult.state).toEqual({ ids: ['free', 'ai', 'local'], revision: 6 });
  });

  it('replaces the IDs for explicit reset/import while keeping a monotonic revision', async () => {
    const result = await handleSetProviderCategoryCollapsed({ replace: true, ids: ['custom-list'] });

    expect(result.state).toEqual({ ids: ['custom-list'], revision: 5 });
    expect(storedState).toEqual(result.state);
  });

  it('does not report success if persistence fails', async () => {
    const error = new Error('storage unavailable');
    storageManager.set.mockRejectedValueOnce(error);

    await expect(handleSetProviderCategoryCollapsed({
      categoryId: 'ai',
      collapsed: true
    })).rejects.toBe(error);
    expect(storedState).toEqual({ ids: ['free'], revision: 4 });
  });
});
