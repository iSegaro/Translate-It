import { storageManager } from '@/shared/storage/core/StorageCore.js';

export const DESKTOP_FAB_EXCLUSION_PREFIX = 'desktop-fab-exclusion:v1:';

function getIdentity(scope, value) {
  if (scope !== 'page' && scope !== 'site') return '';
  if (typeof value !== 'string' || !value.trim()) return '';

  try {
    const url = new URL(value);
    if (scope === 'site') {
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
      return url.hostname.toLowerCase();
    }

    if (url.protocol === 'file:') {
      let path = url.pathname;
      if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
      return `file://${url.host}${path}`;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';

    let path = url.pathname;
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    return `https://${url.host}${path}`;
  } catch {
    return '';
  }
}

function encodeKey(scope, identity) {
  return `${DESKTOP_FAB_EXCLUSION_PREFIX}${scope}:${encodeURIComponent(identity)}`;
}

/** Return a stable storage key for a supported desktop FAB exclusion. */
export function getDesktopFabExclusionKey(scope, url) {
  const identity = getIdentity(scope, url);
  return identity ? encodeKey(scope, identity) : '';
}

const pendingWrites = new Map();

function serializeKeyOperation(key, operation) {
  const previous = pendingWrites.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  pendingWrites.set(key, current);
  return current.finally(() => {
    if (pendingWrites.get(key) === current) pendingWrites.delete(key);
  });
}

/** Persist an exclusion as its own key, avoiding cross-entry read/modify/write races. */
export async function addDesktopFabExclusion(scope, url) {
  const key = getDesktopFabExclusionKey(scope, url);
  if (!key) return '';
  await serializeKeyOperation(key, () => storageManager.set({ [key]: true }));
  return key;
}

/** Remove an exclusion key owned by this feature. */
export async function removeDesktopFabExclusion(key) {
  if (typeof key !== 'string' || !key.startsWith(DESKTOP_FAB_EXCLUSION_PREFIX)) return;
  const entry = parseKey(key);
  if (!entry) return;
  await serializeKeyOperation(key, () => storageManager.remove(key));
}

function parseKey(key) {
  const match = key.match(/^desktop-fab-exclusion:v1:(page|site):(.+)$/);
  if (!match) return null;
  try {
    const value = decodeURIComponent(match[2]);
    if (!value || encodeKey(match[1], value) !== key) return null;
    if (match[1] === 'site') {
      const url = new URL(`https://${value}`);
      if (url.hostname !== value || url.host !== value || url.pathname !== '/') return null;
    } else if (getIdentity('page', value) !== value) {
      return null;
    }
    return { scope: match[1], value };
  } catch {
    return null;
  }
}

/** Enumerate recognized, enabled entries. Intended for Options, not content scripts. */
export async function listDesktopFabExclusions() {
  const saved = await storageManager.get();
  return Object.entries(saved || {}).flatMap(([key, enabled]) => {
    if (enabled !== true || !key.startsWith(DESKTOP_FAB_EXCLUSION_PREFIX)) return [];
    const entry = parseKey(key);
    return entry ? [{ key, ...entry }] : [];
  });
}
