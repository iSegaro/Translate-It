import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useMobileStore } from './mobile.js';

describe('mobile store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('resets failed page translations', () => {
    const store = useMobileStore();
    store.setPageTranslation({ failedCount: 3 });

    store.resetPageTranslation();

    expect(store.pageTranslationData.failedCount).toBe(0);
  });
});
