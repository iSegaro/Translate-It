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
// Monotonic counter bumped whenever a feature write is queued. Used to detect a
// write that starts during a snapshot read so the read can be retried.
let writeSeq = 0;

function serializeKeyOperation(key, operation) {
  const previous = pendingWrites.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  const settled = current.finally(() => {
    if (pendingWrites.get(key) === settled) pendingWrites.delete(key);
  });
  pendingWrites.set(key, settled);
  writeSeq += 1;
  return settled;
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

function isNormalizedPageIdentity(value) {
  if (/[?#]/.test(value)) return false;
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'file:') return false;
  if (url.username || url.password) return false;
  const prefix = `${url.protocol}//`;
  if (!value.startsWith(prefix)) return false;
  const rest = value.slice(prefix.length);
  const slash = rest.indexOf('/');
  const authority = slash === -1 ? rest : rest.slice(0, slash);
  const path = slash === -1 ? '' : rest.slice(slash);
  // Canonical host casing, no credentials.
  if (authority !== authority.toLowerCase() || authority.includes('@')) return false;
  // The parsed host, allowing an explicit default https port (from original http:443).
  const authorityOk = url.protocol === 'https:'
    ? (authority === url.host || authority === `${url.hostname}:443`)
    : authority === url.host;
  if (!authorityOk) return false;
  // Parser-normalized path: rejects dot-segments and, with the guard above, raw ?/#.
  if (path !== url.pathname) return false;
  if (url.protocol === 'https:' && url.hostname === '') return false;
  return true;
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
    } else if (!isNormalizedPageIdentity(value)) {
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

/** Dedicated, feature-owned section key in the exported settings JSON. */
export const DESKTOP_FAB_EXCLUSIONS_EXPORT_KEY = '_desktopFabExclusions';

/**
 * Plain-text snapshot of saved exclusions for settings export.
 * Reads persisted entries only; temporary FAB visibility overrides are in-memory
 * and therefore never included.
 */
export async function serializeDesktopFabExclusions() {
  const entries = await listDesktopFabExclusions();
  return entries.map(({ scope, value }) => ({ scope, value }));
}

/**
 * Validate an imported exclusions section with the same feature-owned key rules
 * used for stored entries. Pure: returns canonical entries (with their original
 * storage keys reconstructed) or throws; it never touches storage, so callers can
 * reject invalid data before modifying anything.
 */
export function parseDesktopFabExclusionsSection(data) {
  if (!Array.isArray(data)) throw new Error('invalid_desktop_fab_exclusions');
  const seen = new Set();
  const entries = [];
  for (const item of data) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('invalid_desktop_fab_exclusions');
    }
    const { scope, value } = item;
    if (typeof scope !== 'string' || typeof value !== 'string') {
      throw new Error('invalid_desktop_fab_exclusions');
    }
    const key = encodeKey(scope, value);
    if (!parseKey(key)) throw new Error('invalid_desktop_fab_exclusions');
    if (!seen.has(key)) {
      seen.add(key);
      entries.push({ key, scope, value });
    }
  }
  return entries;
}

/**
 * Replace persisted exclusions with the given canonical entries. First lets all
 * in-flight feature writes settle and reads a stable snapshot (retrying if a
 * write starts during the read), so the baseline reflects the actual outcome of
 * settled operations rather than stale intents. Keys already in the requested
 * state are skipped; every other affected key gets one authoritative operation
 * enqueued on its own per-key serializer (independent keys stay concurrent).
 *
 * If any operation fails, every started operation is allowed to settle first,
 * then the pre-replacement snapshot is restored (recovery ops are enqueued last
 * per key, so they win over late writes). The original failure is rethrown; if
 * recovery itself fails, a distinct error is thrown so callers never report
 * success. Storage failures therefore cannot silently drop saved exclusions.
 */
export async function replaceDesktopFabExclusions(entries) {
  const nextKeys = new Set(entries.map((entry) => entry.key));

  // Settle in-flight writes and read a snapshot only while no write is pending,
  // retrying if a write starts during the read. The snapshot is the actual
  // settled state and therefore a reliable rollback baseline.
  let existing;
  for (;;) {
    if (pendingWrites.size > 0) {
      await Promise.allSettled([...pendingWrites.values()]);
      continue;
    }
    const seq = writeSeq;
    existing = await listDesktopFabExclusions();
    if (writeSeq === seq) break;
  }

  const existingKeys = new Set(existing.map((entry) => entry.key));
  const candidateKeys = new Set([...existingKeys, ...nextKeys]);

  const plan = [...candidateKeys].map((key) => {
    const shouldExist = nextKeys.has(key);
    if (shouldExist === existingKeys.has(key)) return { key, operation: null };
    return {
      key,
      operation: serializeKeyOperation(key, () =>
        shouldExist ? storageManager.set({ [key]: true }) : storageManager.remove(key)
      ),
    };
  });

  // Settle every started operation before deciding: a late write must not be
  // able to undo the recovery performed below.
  const results = await Promise.allSettled(plan.map((entry) => entry.operation));
  const failedIndex = results.findIndex((result) => result.status === 'rejected');
  if (failedIndex === -1) return;

  // Restore the pre-replacement snapshot for every key we attempted to change.
  const recovery = plan
    .filter((entry) => entry.operation !== null)
    .map((entry) => {
      const shouldExist = existingKeys.has(entry.key);
      return serializeKeyOperation(entry.key, () =>
        shouldExist ? storageManager.set({ [entry.key]: true }) : storageManager.remove(entry.key)
      );
    });
  const recoveryResults = await Promise.allSettled(recovery);
  if (recoveryResults.some((result) => result.status === 'rejected')) {
    const error = new Error('desktop_fab_exclusions_recovery_failed');
    error.cause = results[failedIndex].reason;
    throw error;
  }

  throw results[failedIndex].reason;
}
