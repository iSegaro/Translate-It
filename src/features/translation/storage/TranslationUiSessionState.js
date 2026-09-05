import browser from 'webextension-polyfill';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'translation-ui-session');
const CONTEXTS = new Set(['popup', 'sidepanel']);
const revisions = new Map();
const queues = new Map();

function getKey(context) {
  if (!CONTEXTS.has(context)) throw new Error(`Unsupported translation UI context: ${context}`);
  return `translation-ui-session:${context}`;
}

function getSessionStorage() {
  try {
    return browser?.storage?.session;
  } catch {
    return null;
  }
}

function enqueue(key, operation) {
  const previous = queues.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(operation);
  queues.set(key, next);
  return next.finally(() => {
    if (queues.get(key) === next) queues.delete(key);
  });
}

export const translationUiSessionState = {
  getKey,

  async load(context) {
    const storage = getSessionStorage();
    if (typeof storage?.get !== 'function') return null;

    const key = getKey(context);
    try {
      const snapshot = (await storage.get(key))[key] || null;
      const revision = Number(snapshot?.revision);
      if (Number.isFinite(revision)) {
        revisions.set(key, Math.max(revisions.get(key) || 0, revision));
      }
      return snapshot;
    } catch (error) {
      logger.warn(`[${context}] Failed to load translation UI session state:`, error);
      return null;
    }
  },

  save(context, snapshot) {
    const storage = getSessionStorage();
    if (typeof storage?.set !== 'function') return Promise.resolve(false);

    const key = getKey(context);
    const revision = Number(snapshot?.revision) || 0;
    if (revision < (revisions.get(key) || 0)) return Promise.resolve(false);
    revisions.set(key, revision);

    return enqueue(key, async () => {
      if (revision !== revisions.get(key)) return false;
      try {
        await storage.set({ [key]: snapshot });
        return true;
      } catch (error) {
        logger.warn(`[${context}] Failed to save translation UI session state:`, error);
        return false;
      }
    });
  },

  clear(context, revision = 0) {
    const storage = getSessionStorage();
    if (typeof storage?.remove !== 'function') return Promise.resolve(false);

    const key = getKey(context);
    if (revision < (revisions.get(key) || 0)) return Promise.resolve(false);
    revisions.set(key, revision);

    return enqueue(key, async () => {
      if (revision !== revisions.get(key)) return false;
      try {
        await storage.remove(key);
        return true;
      } catch (error) {
        logger.warn(`[${context}] Failed to clear translation UI session state:`, error);
        return false;
      }
    });
  },
};
