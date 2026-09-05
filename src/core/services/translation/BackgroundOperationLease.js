import browser from 'webextension-polyfill';

const HEARTBEAT_INTERVAL_MS = 22_000;
const LEASE_STORAGE_KEY = '__translateItBackgroundOperationLease';
const activeOperationCounts = new Map();
let heartbeatTimer = null;

function getSessionStorage() {
  try {
    return browser?.storage?.session;
  } catch {
    return null;
  }
}

function touchBackgroundLease() {
  const sessionStorage = getSessionStorage();
  if (typeof sessionStorage?.set !== 'function') return;

  try {
    Promise.resolve(sessionStorage.set({ [LEASE_STORAGE_KEY]: Date.now() })).catch(() => {});
  } catch {
    // Unsupported or unavailable storage must not affect translation execution.
  }
}

function startHeartbeat() {
  if (heartbeatTimer !== null || typeof setInterval !== 'function') return;
  if (typeof getSessionStorage()?.set !== 'function') return;

  touchBackgroundLease();
  heartbeatTimer = setInterval(touchBackgroundLease, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat() {
  if (heartbeatTimer === null) return;
  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

function normalizeOperationId(operationId) {
  if (operationId === null || operationId === undefined) return null;
  const normalized = String(operationId).trim();
  return normalized || null;
}

function releaseOperation(operationId) {
  const normalizedId = normalizeOperationId(operationId);
  if (!normalizedId) return false;

  const count = activeOperationCounts.get(normalizedId);
  if (!count) return false;

  if (count === 1) activeOperationCounts.delete(normalizedId);
  else activeOperationCounts.set(normalizedId, count - 1);

  if (activeOperationCounts.size === 0) stopHeartbeat();
  return true;
}

function acquireOperation(operationId) {
  const normalizedId = normalizeOperationId(operationId);
  if (!normalizedId) return { release: () => {} };

  activeOperationCounts.set(
    normalizedId,
    (activeOperationCounts.get(normalizedId) || 0) + 1,
  );
  startHeartbeat();

  let released = false;
  return {
    release: () => {
      if (released) return false;
      released = true;
      return releaseOperation(normalizedId);
    },
  };
}

export async function withBackgroundOperationLease(operationId, operation) {
  const lease = acquireOperation(operationId);
  try {
    return await operation();
  } finally {
    lease.release();
  }
}

export const backgroundOperationLease = {
  acquire: acquireOperation,
  release: releaseOperation,
  getStatus() {
    return {
      activeOperationIds: [...activeOperationCounts.keys()],
      activeOperationCount: [...activeOperationCounts.values()]
        .reduce((total, count) => total + count, 0),
      timer: heartbeatTimer,
      timerActive: heartbeatTimer !== null,
    };
  },
};
