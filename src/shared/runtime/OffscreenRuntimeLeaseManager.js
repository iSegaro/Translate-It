import browser from 'webextension-polyfill';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'OffscreenRuntimeLeaseManager');

export const OFFSCREEN_DOCUMENT_REASONS = Object.freeze([
  'AUDIO_PLAYBACK',
  'WORKERS',
  'USER_MEDIA',
]);

export const OFFSCREEN_RUNTIME_CONFIG = Object.freeze({
  url: 'src/html/offscreen.html',
  reasons: OFFSCREEN_DOCUMENT_REASONS,
  justification: 'Shared offscreen document supports audio playback, OCR workers, and approved tab-media capture.',
});

export const OFFSCREEN_RUNTIME_LEASE_STORAGE_KEY = '__translateItOffscreenRuntimeLeases';

const STORAGE_VERSION = 2;
const LEGACY_STORAGE_VERSION = 1;
const MIN_CHROMIUM_VERSION_FOR_SHARED_REASONS = 116;

function getChromiumMajorVersion() {
  try {
    const userAgentData = globalThis.navigator?.userAgentData;
    const brands = userAgentData?.brands || userAgentData?.fullVersionList;
    const brandVersion = brands?.find(({ brand }) => /Chrom|Edge|Opera/i.test(brand))?.version;
    const userAgent = globalThis.navigator?.userAgent || '';
    const userAgentVersion = userAgent.match(/(?:Chrome|Chromium|CriOS|Edg|OPR)\/(\d+)/i)?.[1];
    const version = brandVersion || userAgentVersion;

    const majorVersion = version ? Number.parseInt(version, 10) : NaN;
    return Number.isFinite(majorVersion) ? majorVersion : null;
  } catch {
    return null;
  }
}

function getSessionStorage(browserAPI) {
  try {
    return browserAPI?.storage?.session || null;
  } catch {
    return null;
  }
}

function getLeaseKey(owner, leaseId) {
  return JSON.stringify([owner, leaseId]);
}

function normalizeIdentity(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${name} must be a non-empty string`);
  }

  return value.trim();
}

function normalizeLeaseIdentity(request = {}) {
  const owner = normalizeIdentity(request.owner, 'owner');
  const leaseId = normalizeIdentity(request.leaseId, 'leaseId');

  return {
    owner,
    leaseId,
    key: getLeaseKey(owner, leaseId),
  };
}

function normalizeRequiredReasons(requiredReasons) {
  if (!Array.isArray(requiredReasons) || requiredReasons.length === 0) {
    throw new TypeError('requiredReasons must be a non-empty array');
  }

  const normalized = [...new Set(requiredReasons)];
  if (normalized.some((reason) => !OFFSCREEN_DOCUMENT_REASONS.includes(reason))) {
    throw new TypeError('requiredReasons contains an unsupported offscreen reason');
  }

  return normalized;
}

function normalizeLeaseRequest(request = {}) {
  const identity = normalizeLeaseIdentity(request);

  return {
    ...identity,
    requiredReasons: normalizeRequiredReasons(request.requiredReasons),
  };
}

function normalizeStoredLease(lease) {
  if (!lease || typeof lease !== 'object') return null;

  try {
    const normalized = normalizeLeaseRequest(lease);
    return {
      owner: normalized.owner,
      leaseId: normalized.leaseId,
      requiredReasons: normalized.requiredReasons,
      key: normalized.key,
    };
  } catch {
    return null;
  }
}

export class OffscreenRuntimeLeaseManager {
  constructor(options = {}) {
    const isBrowserAPI = options?.offscreen || options?.storage || options?.runtime;
    this.browserAPI = isBrowserAPI ? options : options.browserAPI || browser;
    this.log = options.logger || logger;
    this.supportedReasons = options.supportedReasons
      ?? options.offscreenSupportedReasons
      ?? (isBrowserAPI ? options.offscreen?.supportedReasons : undefined);
    this.reasonSupport = options.reasonSupport
      ?? options.supportsReason
      ?? (isBrowserAPI ? options.offscreen?.supportsReason : undefined);
    this.supportsWorkers = options.supportsWorkers;

    this.leases = new Map();
    this.documentPresent = null;
    this.documentOwnership = 'unknown';
    this.reconciled = false;
    this.closePending = false;
    this.creationRequiredAfterClose = false;
    this.transition = Promise.resolve();
  }

  /**
   * Acquire one named lease on shared offscreen runtime.
   * Duplicate identities are idempotent.
   */
  async acquire(request) {
    const lease = normalizeLeaseRequest(request);

    return this._enqueue(async () => {
      const browserAPI = await this._getBrowserAPI();
      const offscreen = this._getSupportedOffscreenAPI(browserAPI);
      if (!offscreen) return false;

      let createdDocument = false;
      if (this.creationRequiredAfterClose) {
        // Chrome 109 clients.matchAll() can lag behind a successful close.
        const detectedDocument = await this._detectDocument(browserAPI, offscreen);
        if (detectedDocument === null) return false;
        if (!detectedDocument) {
          // Keep metadata until create confirms absence; Chrome 109 can return a stale client list.
          this.documentPresent = false;
          this.documentOwnership = 'none';
          this.reconciled = false;
          this.closePending = false;
          this.creationRequiredAfterClose = true;
        }
        createdDocument = await this._createDocument(browserAPI, offscreen);
        if (createdDocument) {
          this.leases.clear();
          await this._clearMetadata(browserAPI);
        }
      } else {
        const hasDocument = await this._reconcile(browserAPI, offscreen, {
          preserveLeasesOnAbsence: true,
        });
        if (hasDocument === null) return false;
        if (!hasDocument) {
          createdDocument = await this._createDocument(browserAPI, offscreen);
          if (createdDocument) {
            this.leases.clear();
            await this._clearMetadata(browserAPI);
          }
        }
      }

      if (!this.leases.has(lease.key)) {
        this.leases.set(lease.key, lease);
        const persistence = await this._persistMetadata(browserAPI);
        if (persistence.available && !persistence.persisted) {
          this.leases.delete(lease.key);

          if (createdDocument && this.documentOwnership === 'owned') {
            await this._closeIfEligible(browserAPI, offscreen);
          }

          throw persistence.error || new Error('Could not persist offscreen lease metadata');
        }

        this.closePending = false;
      }

      return true;
    });
  }

  /**
   * Release one named lease. Releasing an unknown identity is safe.
   */
  async release(request) {
    const lease = normalizeLeaseIdentity(request);

    return this._enqueue(async () => {
      const browserAPI = await this._getBrowserAPI();
      const offscreen = this._getSupportedOffscreenAPI(browserAPI);
      if (!offscreen) return false;

      const hasDocument = await this._reconcile(browserAPI, offscreen);
      if (hasDocument === null) return false;

      const releasedLease = this.leases.get(lease.key);
      const released = this.leases.delete(lease.key);
      if (released) {
        const persistence = await this._persistMetadata(browserAPI);
        if (persistence.available && !persistence.persisted) {
          this.leases.set(lease.key, releasedLease);
          throw persistence.error || new Error('Could not persist offscreen lease metadata');
        }
      }

      await this._closeIfEligible(browserAPI, offscreen);
      return released;
    });
  }

  /**
   * Reconcile shared offscreen runtime without acquiring a lease.
   * Creation is reserved for named lease acquisition.
   */
  async ensureDocument() {
    return this._enqueue(async () => {
      const browserAPI = await this._getBrowserAPI();
      const offscreen = this._getSupportedOffscreenAPI(browserAPI);
      if (!offscreen) return false;

      const hasDocument = await this._reconcile(browserAPI, offscreen);
      return hasDocument === null ? false : hasDocument;
    });
  }

  hasActiveLeases() {
    return this.leases.size > 0;
  }

  /**
   * Report whether this browser can safely use the shared offscreen document.
   * Detection is required because creation without exact existence checks can
   * race with an already-open document on browsers without hasDocument().
   */
  supportsOffscreenDocument() {
    const browserAPI = this.browserAPI;
    const offscreen = this._getSupportedOffscreenAPI(browserAPI);
    return Boolean(offscreen && this._getDocumentDetector(browserAPI, offscreen));
  }

  getSnapshot() {
    const activeLeases = [...this.leases.values()].map(({ owner, leaseId, requiredReasons }) => ({
      owner,
      leaseId,
      requiredReasons: [...requiredReasons],
    }));

    return {
      documentExists: this.documentPresent,
      ownership: this.documentOwnership,
      ownershipProven: this.documentOwnership === 'owned',
      reconciled: this.reconciled,
      closePending: this.closePending,
      leases: activeLeases,
      activeLeases,
    };
  }

  _enqueue(operation) {
    const next = this.transition.then(operation, operation);
    this.transition = next.catch(() => {});
    return next;
  }

  async _getBrowserAPI() {
    return this.browserAPI;
  }

  _supportsReasons(browserAPI, requiredReasons) {
    const supportsWorkers = this.supportsWorkers ?? browserAPI?.offscreen?.supportsWorkers;
    if (supportsWorkers === false && requiredReasons.includes('WORKERS')) {
      return false;
    }

    const chromiumVersion = getChromiumMajorVersion();
    if (chromiumVersion !== null
      && chromiumVersion < MIN_CHROMIUM_VERSION_FOR_SHARED_REASONS
      && requiredReasons.length > 1) {
      return false;
    }

    const reasonSupport = this.reasonSupport ?? browserAPI?.offscreen?.supportsReason;
    if (typeof reasonSupport === 'function') {
      try {
        return requiredReasons.every((reason) => reasonSupport(reason) === true);
      } catch {
        return false;
      }
    }

    const supportedReasons = this.supportedReasons ?? browserAPI?.offscreen?.supportedReasons;
    if (supportedReasons === undefined) return true;

    if (!Array.isArray(supportedReasons) && !(supportedReasons instanceof Set)) {
      return false;
    }

    return requiredReasons.every((reason) => supportedReasons instanceof Set
      ? supportedReasons.has(reason)
      : supportedReasons.includes(reason));
  }

  _getSupportedOffscreenAPI(browserAPI, requiredReasons = OFFSCREEN_RUNTIME_CONFIG.reasons) {
    try {
      const offscreen = browserAPI?.offscreen;
      if (
        typeof offscreen?.createDocument !== 'function' ||
        typeof offscreen?.closeDocument !== 'function'
      ) {
        return null;
      }

      if (!this._supportsReasons(browserAPI, requiredReasons)) return null;

      return offscreen;
    } catch {
      return null;
    }
  }

  async _reconcile(browserAPI, offscreen, { preserveLeasesOnAbsence = false } = {}) {
    const hasDocument = await this._detectDocument(browserAPI, offscreen);
    if (hasDocument === null) return null;

    if (!hasDocument) {
      if (preserveLeasesOnAbsence) {
        this.documentPresent = false;
        this.documentOwnership = 'none';
        this.reconciled = false;
        this.closePending = false;
      } else {
        await this._markDocumentAbsent(browserAPI);
      }
      return false;
    }

    this.documentPresent = true;
    if (this.reconciled) return true;

    const metadata = await this._readMetadata(browserAPI);
    if (metadata.valid) {
      this.leases.clear();
      for (const lease of metadata.leases) {
        this.leases.set(lease.key, lease);
      }

      this.documentOwnership = metadata.documentOwned ? 'owned' : 'unknown';
      if (metadata.migrated) {
        await this._persistMetadata(browserAPI);
      }
    } else {
      this.leases.clear();
      this.documentOwnership = 'unknown';
      if (metadata.stale) await this._clearMetadata(browserAPI);
    }

    this.reconciled = true;
    return true;
  }

  async _createDocument(browserAPI, offscreen, { recoverCollision = true } = {}) {
    this.log.debug('Creating shared offscreen document');

    try {
      await offscreen.createDocument({
        url: OFFSCREEN_RUNTIME_CONFIG.url,
        reasons: [...OFFSCREEN_RUNTIME_CONFIG.reasons],
        justification: OFFSCREEN_RUNTIME_CONFIG.justification,
      });
    } catch (error) {
      // A concurrent creator can win between detection and creation.
      let detectedDocument = null;
      try {
        detectedDocument = await this._detectDocument(browserAPI, offscreen);
      } catch (detectionError) {
        this.log.debug('Could not recover after offscreen document creation failed', detectionError);
      }

      if (detectedDocument && recoverCollision) {
        const metadata = await this._readMetadata(browserAPI);
        if (metadata.valid) {
          for (const lease of metadata.leases) {
            if (!this.leases.has(lease.key)) this.leases.set(lease.key, lease);
          }
        }

        this.documentPresent = true;
        this.documentOwnership = 'unknown';
        this.reconciled = true;
        this.closePending = false;
        this.creationRequiredAfterClose = false;
        return false;
      }

      // Creation failure must not publish a lease or claim ownership.
      this.documentPresent = detectedDocument === false ? false : null;
      this.documentOwnership = detectedDocument === false ? 'none' : 'unknown';
      this.reconciled = false;
      this.closePending = false;
      throw error;
    }

    this.documentPresent = true;
    this.documentOwnership = 'owned';
    this.reconciled = true;
    this.closePending = false;
    this.creationRequiredAfterClose = false;
    return true;
  }

  async _closeIfEligible(browserAPI, offscreen) {
    if (this.leases.size > 0 || this.documentOwnership !== 'owned' || !this.documentPresent) {
      return false;
    }

    try {
      await offscreen.closeDocument();

      this.documentPresent = false;
      this.documentOwnership = 'none';
      this.reconciled = false;
      this.closePending = false;
      this.creationRequiredAfterClose = true;
      await this._clearMetadata(browserAPI);
      return true;
    } catch (error) {
      // Keep ownership and presence claims until a later transition retries close.
      this.documentPresent = true;
      this.documentOwnership = 'owned';
      this.closePending = true;
      this.creationRequiredAfterClose = false;
      this.log.warn('Could not close shared offscreen document; retaining ownership', error);
      return false;
    }
  }

  async _markDocumentAbsent(browserAPI) {
    this.documentPresent = false;
    this.documentOwnership = 'none';
    this.reconciled = false;
    this.closePending = false;
    this.leases.clear();
    await this._clearMetadata(browserAPI);
  }

  _getDocumentUrl(browserAPI) {
    try {
      const getURL = browserAPI?.runtime?.getURL;
      if (typeof getURL !== 'function') return null;

      const documentUrl = getURL(OFFSCREEN_RUNTIME_CONFIG.url);
      return typeof documentUrl === 'string' && documentUrl ? documentUrl : null;
    } catch {
      return null;
    }
  }

  _getDocumentDetector(browserAPI, offscreen) {
    try {
      if (typeof offscreen?.hasDocument === 'function') {
        return { type: 'hasDocument' };
      }

      const runtime = browserAPI?.runtime;
      const documentUrl = this._getDocumentUrl(browserAPI);
      if (!documentUrl) return null;

      if (typeof runtime?.getContexts === 'function') {
        return { type: 'getContexts', runtime, documentUrl };
      }

      const clients = browserAPI?.clients || globalThis.clients;
      if (typeof clients?.matchAll === 'function') {
        return { type: 'clients', clients, documentUrl };
      }
    } catch {
      return null;
    }

    return null;
  }

  async _detectDocument(browserAPI, offscreen) {
    const detector = this._getDocumentDetector(browserAPI, offscreen);
    if (!detector) return null;

    if (detector.type === 'hasDocument') {
      return Boolean(await offscreen.hasDocument());
    }

    if (detector.type === 'getContexts') {
      const contexts = await detector.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [detector.documentUrl],
      });
      return Boolean(contexts?.length);
    }

    const clients = await detector.clients.matchAll();
    return Boolean(clients?.some((client) => client?.url === detector.documentUrl));
  }

  async _readMetadata(browserAPI) {
    const sessionStorage = getSessionStorage(browserAPI);
    if (typeof sessionStorage?.get !== 'function') {
      return { valid: false, leases: [], documentOwned: false, stale: false };
    }

    try {
      const stored = await sessionStorage.get(OFFSCREEN_RUNTIME_LEASE_STORAGE_KEY);
      const metadata = stored?.[OFFSCREEN_RUNTIME_LEASE_STORAGE_KEY];
      if (!metadata || ![LEGACY_STORAGE_VERSION, STORAGE_VERSION].includes(metadata.version)
        || !Array.isArray(metadata.leases)) {
        return {
          valid: false,
          leases: [],
          documentOwned: false,
          stale: Boolean(metadata),
        };
      }

      const leases = metadata.leases.map(normalizeStoredLease);
      if (leases.some((lease) => !lease)) {
        return { valid: false, leases: [], documentOwned: false, stale: true };
      }

      return {
        valid: true,
        leases,
        migrated: metadata.version === LEGACY_STORAGE_VERSION,
        // Active records from older metadata are ownership evidence too.
        documentOwned: metadata.documentOwned === undefined
          ? leases.length > 0
          : metadata.documentOwned === true,
      };
    } catch (error) {
      this.log.debug('Could not read offscreen lease metadata', error);
      return { valid: false, leases: [], documentOwned: false, stale: false };
    }
  }

  async _persistMetadata(browserAPI) {
    const sessionStorage = getSessionStorage(browserAPI);
    if (typeof sessionStorage?.set !== 'function') {
      return { available: false, persisted: false };
    }

    const metadata = {
      version: STORAGE_VERSION,
      documentOwned: this.documentOwnership === 'owned',
      leases: [...this.leases.values()].map(({ owner, leaseId, requiredReasons }) => ({
        owner,
        leaseId,
        requiredReasons: [...requiredReasons],
      })),
    };

    try {
      await sessionStorage.set({ [OFFSCREEN_RUNTIME_LEASE_STORAGE_KEY]: metadata });
      return { available: true, persisted: true };
    } catch (error) {
      // Optional session storage stays nonfatal; callers roll back transactions when available storage rejects.
      this.log.debug('Could not persist offscreen lease metadata', error);
      return { available: true, persisted: false, error };
    }
  }

  async _clearMetadata(browserAPI) {
    const sessionStorage = getSessionStorage(browserAPI);
    if (!sessionStorage) return;

    try {
      if (typeof sessionStorage.remove === 'function') {
        await sessionStorage.remove(OFFSCREEN_RUNTIME_LEASE_STORAGE_KEY);
      } else if (typeof sessionStorage.set === 'function') {
        await sessionStorage.set({ [OFFSCREEN_RUNTIME_LEASE_STORAGE_KEY]: null });
      }
    } catch (error) {
      this.log.debug('Could not clear offscreen lease metadata', error);
    }
  }
}

export const offscreenRuntimeLeaseManager = new OffscreenRuntimeLeaseManager();
