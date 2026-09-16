/**
 * Ephemeral Background registry of trusted Firefox content-runtime targets.
 *
 * Records contain only native tab/frame/document identity. The registry is a
 * discovery index, not a session owner: replacing a stale document for a
 * frame never mutates or rebinds an active Live Dubbing descriptor.
 */

function getRuntimeId(browserAPI) {
  try {
    const id = browserAPI?.runtime?.id;
    return typeof id === 'string' && id.trim() ? id : null;
  } catch {
    return null;
  }
}

function cloneIdentity(identity) {
  return identity ? { ...identity } : null;
}

function registryKey(tabId, frameId) {
  return `${tabId}:${frameId}`;
}

function normalizeDocumentId(value) {
  if (typeof value !== 'string') return null;
  const documentId = value.trim();
  return documentId && documentId.length <= 256 ? documentId : null;
}

/**
 * Read the only identity source accepted by the registry. Payload identity is
 * deliberately not an argument to this function.
 * @param {object|null} sender native runtime MessageSender
 * @param {object|null} browserAPI extension API
 * @returns {{tabId: number, frameId: number, documentId: string}|null}
 */
export function getTrustedFirefoxContentRuntimeIdentity(sender, browserAPI) {
  const runtimeId = getRuntimeId(browserAPI);
  const tabId = sender?.tab?.id;
  const frameId = sender?.frameId;
  const documentId = normalizeDocumentId(sender?.documentId);

  if (!runtimeId
    || sender?.id !== runtimeId
    || !Number.isInteger(tabId)
    || tabId < 0
    || frameId !== 0
    || !documentId) {
    return null;
  }

  return { tabId, frameId, documentId };
}

export class FirefoxContentRuntimeRegistry {
  constructor(options = {}) {
    this.browserAPI = options.browserAPI || null;
    this.records = new Map();
  }

  /**
   * Register a native content sender. A later document replaces the record
   * for the same frame; no session/provider data is accepted or retained.
   * @param {object|null} sender native runtime MessageSender
   * @returns {{tabId: number, frameId: number, documentId: string}|null}
   */
  register(sender) {
    const identity = getTrustedFirefoxContentRuntimeIdentity(sender, this.browserAPI);
    if (!identity) return null;
    this.records.set(registryKey(identity.tabId, identity.frameId), identity);
    return cloneIdentity(identity);
  }

  /**
   * Resolve an exact frame target without exposing mutable registry state.
   * @param {number} tabId
   * @param {number} frameId
   * @returns {{tabId: number, frameId: number, documentId: string}|null}
   */
  get(tabId, frameId = 0) {
    return cloneIdentity(this.records.get(registryKey(tabId, frameId)));
  }

  has(tabId, frameId = 0) {
    return this.records.has(registryKey(tabId, frameId));
  }

  clear() {
    this.records.clear();
  }

  get size() {
    return this.records.size;
  }
}

export function createFirefoxContentRuntimeRegistry(options = {}) {
  return new FirefoxContentRuntimeRegistry(options);
}
