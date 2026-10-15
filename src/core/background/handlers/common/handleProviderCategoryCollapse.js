import { storageManager } from '@/shared/storage/core/StorageCore.js';

const STORAGE_KEY = 'COLLAPSED_PROVIDER_CATEGORIES';
const CATEGORY_IDS = new Set(['custom-list', 'free', 'ai', 'local']);
const DEFAULT_STATE = { ids: [], revision: 0 };
let writeQueue = Promise.resolve();

function normalizeState(value) {
  const ids = Array.isArray(value) ? value : value?.ids;
  const revision = Number.isSafeInteger(value?.revision) && value.revision >= 0
    ? value.revision
    : 0;
  return {
    ids: Array.isArray(ids) ? [...new Set(ids.filter(id => CATEGORY_IDS.has(id)))] : [],
    revision
  };
}

export function handleSetProviderCategoryCollapsed(message) {
  const operation = writeQueue.then(async () => {
    const replace = message.replace === true;
    if (replace) {
      if (!Array.isArray(message.ids) || message.ids.some(id => !CATEGORY_IDS.has(id))) {
        throw new Error('Invalid provider category collapse state');
      }
    } else if (!CATEGORY_IDS.has(message.categoryId) || typeof message.collapsed !== 'boolean') {
      throw new Error('Invalid provider category collapse intent');
    }

    const stored = await storageManager.get({ [STORAGE_KEY]: DEFAULT_STATE });
    const current = normalizeState(stored?.[STORAGE_KEY]);
    const ids = replace ? [...new Set(message.ids)] : [...current.ids];
    if (!replace) {
      const index = ids.indexOf(message.categoryId);
      if (message.collapsed && index === -1) ids.push(message.categoryId);
      if (!message.collapsed && index !== -1) ids.splice(index, 1);
    }
    const state = { ids, revision: current.revision + 1 };
    await storageManager.set({ [STORAGE_KEY]: state });
    return { success: true, state };
  });
  writeQueue = operation.catch(() => {});
  return operation;
}
