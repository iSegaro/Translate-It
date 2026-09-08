import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OFFSCREEN_RUNTIME_CONFIG,
  OFFSCREEN_RUNTIME_LEASE_STORAGE_KEY,
  OffscreenRuntimeLeaseManager,
} from './OffscreenRuntimeLeaseManager.js';

function createBrowser({
  documentExists = false,
  metadata,
  withSession = true,
  withHasDocument = true,
  withOffscreen = true,
  runtime = {},
  clients,
} = {}) {
  let present = documentExists;
  let storedMetadata = metadata;

  const session = withSession ? {
    get: vi.fn(async () => storedMetadata === undefined
      ? {}
      : { [OFFSCREEN_RUNTIME_LEASE_STORAGE_KEY]: storedMetadata }),
    set: vi.fn(async (values) => {
      if (Object.hasOwn(values, OFFSCREEN_RUNTIME_LEASE_STORAGE_KEY)) {
        storedMetadata = values[OFFSCREEN_RUNTIME_LEASE_STORAGE_KEY];
      }
    }),
    remove: vi.fn(async () => {
      storedMetadata = undefined;
    }),
  } : undefined;

  const offscreen = {
    ...(withHasDocument ? { hasDocument: vi.fn(async () => present) } : {}),
    createDocument: vi.fn(async () => {
      present = true;
    }),
    closeDocument: vi.fn(async () => {
      present = false;
    }),
  };

  return {
    ...(withOffscreen ? { offscreen } : {}),
    storage: { session },
    runtime: {
      getURL: vi.fn((url) => `chrome-extension://test/${url}`),
      ...runtime,
    },
    ...(clients === undefined ? {} : { clients }),
    setDocumentExists: (value) => {
      present = value;
    },
  };
}

function lease(owner, leaseId, requiredReasons) {
  return {
    owner,
    leaseId,
    ...(requiredReasons ? { requiredReasons } : {}),
  };
}

describe('OffscreenRuntimeLeaseManager', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates first document with centralized configuration and publishes lease', async () => {
    const browser = createBrowser();
    const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

    await manager.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK']));

    expect(browser.offscreen.createDocument).toHaveBeenCalledTimes(1);
    expect(browser.offscreen.createDocument).toHaveBeenCalledWith({
      url: OFFSCREEN_RUNTIME_CONFIG.url,
      reasons: ['AUDIO_PLAYBACK', 'WORKERS', 'USER_MEDIA'],
      justification: OFFSCREEN_RUNTIME_CONFIG.justification,
    });
    expect(manager.getSnapshot().leases).toEqual([
      lease('tts', 'playback', ['AUDIO_PLAYBACK']),
    ]);
    expect(manager.hasActiveLeases()).toBe(true);
  });

  it('treats duplicate identity as idempotent', async () => {
    const browser = createBrowser();
    const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

    await manager.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK']));
    await manager.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK']));

    expect(browser.offscreen.createDocument).toHaveBeenCalledTimes(1);
    expect(manager.getSnapshot().leases).toHaveLength(1);
  });

  it('serializes concurrent acquires into one creation', async () => {
    const browser = createBrowser();
    let resolveCreate;
    browser.offscreen.createDocument.mockImplementationOnce(() => new Promise((resolve) => {
      resolveCreate = () => {
        browser.setDocumentExists(true);
        resolve();
      };
    }));
    const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

    const first = manager.acquire(lease('one', 'playback', ['AUDIO_PLAYBACK']));
    const second = manager.acquire(lease('two', 'playback', ['AUDIO_PLAYBACK']));
    await vi.waitFor(() => expect(browser.offscreen.createDocument).toHaveBeenCalledTimes(1));
    resolveCreate();
    await Promise.all([first, second]);

    expect(browser.offscreen.createDocument).toHaveBeenCalledTimes(1);
    expect(manager.getSnapshot().leases).toHaveLength(2);
  });

  it('does not create a document without a named lease', async () => {
    const browser = createBrowser();
    const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

    await expect(manager.ensureDocument()).resolves.toBe(false);

    expect(browser.offscreen.createDocument).not.toHaveBeenCalled();
    expect(manager.hasActiveLeases()).toBe(false);
  });

  it('keeps document while another owner remains and closes on final release', async () => {
    const browser = createBrowser();
    const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

    await manager.acquire(lease('one', 'playback', ['AUDIO_PLAYBACK']));
    await manager.acquire(lease('two', 'capture', ['USER_MEDIA']));
    await manager.release(lease('one', 'playback'));

    expect(browser.offscreen.closeDocument).not.toHaveBeenCalled();
    expect(manager.getSnapshot().leases).toEqual([{
      owner: 'two',
      leaseId: 'capture',
      requiredReasons: ['USER_MEDIA'],
    }]);

    await manager.release(lease('two', 'capture'));
    expect(browser.offscreen.closeDocument).toHaveBeenCalledTimes(1);
    expect(manager.hasActiveLeases()).toBe(false);
  });

  it('makes duplicate release safe', async () => {
    const browser = createBrowser();
    const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

    await manager.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK']));
    await manager.release(lease('tts', 'playback'));
    await manager.release(lease('tts', 'playback'));

    expect(browser.offscreen.closeDocument).toHaveBeenCalledTimes(1);
    expect(manager.getSnapshot().documentExists).toBe(false);
  });

  it('does not recreate an existing document', async () => {
    const browser = createBrowser({ documentExists: true });
    const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

    await manager.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK']));

    expect(browser.offscreen.createDocument).not.toHaveBeenCalled();
    expect(manager.getSnapshot().ownership).toBe('unknown');
  });

  it('does not publish a lease when creation rejects', async () => {
    const browser = createBrowser();
    browser.offscreen.createDocument.mockRejectedValueOnce(new Error('create failed'));
    const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

    await expect(manager.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK']))).rejects.toThrow('create failed');

    expect(manager.hasActiveLeases()).toBe(false);
    expect(manager.getSnapshot().leases).toEqual([]);
  });

  it('recovers create collision as unknown ownership', async () => {
    const browser = createBrowser();
    browser.offscreen.createDocument.mockRejectedValueOnce(new Error('already exists'));
    browser.offscreen.hasDocument
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

    await expect(manager.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK']))).resolves.toBe(true);

    expect(browser.offscreen.hasDocument).toHaveBeenCalledTimes(2);
    expect(manager.getSnapshot()).toMatchObject({
      documentExists: true,
      ownership: 'unknown',
      ownershipProven: false,
      leases: [lease('tts', 'playback', ['AUDIO_PLAYBACK'])],
    });
    expect((await browser.storage.session.get())[OFFSCREEN_RUNTIME_LEASE_STORAGE_KEY])
      .toMatchObject({ documentOwned: false });
  });

  it('recovers Chrome 109 collision after stale absence and preserves lease metadata', async () => {
    const documentUrl = `chrome-extension://test/${OFFSCREEN_RUNTIME_CONFIG.url}`;
    const existingLease = lease('tts', 'playback', ['AUDIO_PLAYBACK']);
    const requestedLease = lease('screen-capture', 'capture-1', ['WORKERS']);
    const clients = {
      matchAll: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ url: documentUrl }]),
    };
    const browser = createBrowser({
      withHasDocument: false,
      clients,
      runtime: { getContexts: undefined },
      metadata: {
        version: 2,
        documentOwned: true,
        leases: [existingLease],
      },
    });
    browser.offscreen.createDocument.mockRejectedValueOnce(new Error('already exists'));
    const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });
    manager.creationRequiredAfterClose = true;

    await expect(manager.acquire(requestedLease)).resolves.toBe(true);

    expect(clients.matchAll).toHaveBeenCalledTimes(2);
    expect(manager.getSnapshot()).toMatchObject({
      documentExists: true,
      ownership: 'unknown',
      ownershipProven: false,
      leases: [existingLease, requestedLease],
    });
    expect((await browser.storage.session.get())[OFFSCREEN_RUNTIME_LEASE_STORAGE_KEY])
      .toMatchObject({
        documentOwned: false,
        leases: [existingLease, requestedLease],
      });
    expect(browser.storage.session.remove).not.toHaveBeenCalled();
  });

  it('preserves persisted leases across provisional absence and create collision', async () => {
    const existingLease = lease('tts', 'playback', ['AUDIO_PLAYBACK']);
    const newLease = lease('screen-capture', 'capture-1', ['WORKERS']);
    const browser = createBrowser({
      metadata: {
        version: 2,
        documentOwned: true,
        leases: [existingLease],
      },
    });
    browser.offscreen.createDocument.mockRejectedValueOnce(new Error('already exists'));
    browser.offscreen.hasDocument
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

    await expect(manager.acquire(newLease)).resolves.toBe(true);

    expect(manager.getSnapshot()).toMatchObject({
      ownership: 'unknown',
      leases: [existingLease, newLease],
    });
    expect((await browser.storage.session.get())[OFFSCREEN_RUNTIME_LEASE_STORAGE_KEY])
      .toMatchObject({
        documentOwned: false,
        leases: [existingLease, newLease],
      });
    expect(browser.storage.session.remove).not.toHaveBeenCalled();
  });

  it('does not mutate lifecycle or metadata when existence detection rejects', async () => {
    const detectionError = new Error('context detection failed');
    const browser = createBrowser({
      withHasDocument: false,
      runtime: { getContexts: vi.fn().mockRejectedValue(detectionError) },
    });
    const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

    await expect(manager.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK'])))
      .rejects.toThrow('context detection failed');

    expect(browser.offscreen.createDocument).not.toHaveBeenCalled();
    expect(browser.storage.session.get).not.toHaveBeenCalled();
    expect(browser.storage.session.set).not.toHaveBeenCalled();
    expect(browser.storage.session.remove).not.toHaveBeenCalled();
    expect(manager.getSnapshot()).toMatchObject({
      documentExists: null,
      ownership: 'unknown',
      leases: [],
    });
  });

  it('rejects acquisition when session persistence fails, cleans up, and retries', async () => {
    const browser = createBrowser();
    const persistenceError = new Error('session set failed');
    browser.storage.session.set.mockRejectedValueOnce(persistenceError);
    const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

    await expect(manager.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK']))).rejects.toThrow('session set failed');

    expect(browser.offscreen.closeDocument).toHaveBeenCalledTimes(1);
    expect(manager.getSnapshot()).toMatchObject({
      documentExists: false,
      leases: [],
    });
    expect(await browser.storage.session.get()).toEqual({});

    await expect(manager.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK']))).resolves.toBe(true);
    expect(browser.offscreen.createDocument).toHaveBeenCalledTimes(2);
    expect(manager.hasActiveLeases()).toBe(true);
  });

  it('retains lease safety when release persistence fails and retries', async () => {
    const browser = createBrowser();
    const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });
    const requestedLease = lease('tts', 'playback', ['AUDIO_PLAYBACK']);

    await manager.acquire(requestedLease);
    browser.storage.session.set.mockRejectedValueOnce(new Error('session set failed'));

    await expect(manager.release(requestedLease)).rejects.toThrow('session set failed');

    expect(browser.offscreen.closeDocument).not.toHaveBeenCalled();
    expect(manager.getSnapshot()).toMatchObject({
      documentExists: true,
      ownership: 'owned',
      leases: [requestedLease],
    });

    await expect(manager.release(requestedLease)).resolves.toBe(true);
    expect(browser.offscreen.closeDocument).toHaveBeenCalledTimes(1);
  });

  it('retains safe ownership after close rejection and retries later', async () => {
    const browser = createBrowser();
    browser.offscreen.closeDocument.mockRejectedValueOnce(new Error('close failed'));
    const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

    await manager.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK']));
    await manager.release(lease('tts', 'playback'));

    expect(manager.getSnapshot()).toMatchObject({
      documentExists: true,
      ownership: 'owned',
      closePending: true,
      leases: [],
    });

    await manager.release(lease('tts', 'playback'));
    expect(browser.offscreen.closeDocument).toHaveBeenCalledTimes(2);
    expect(manager.getSnapshot().documentExists).toBe(false);
  });

  it('recovers known session lease after manager recreation', async () => {
    const browser = createBrowser({
      documentExists: true,
      metadata: {
        version: 2,
        documentOwned: true,
        leases: [lease('tts', 'playback', ['AUDIO_PLAYBACK'])],
      },
    });
    const firstManager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });
    await firstManager.ensureDocument();

    const recreatedManager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });
    await recreatedManager.release(lease('tts', 'playback'));

    expect(browser.offscreen.closeDocument).toHaveBeenCalledTimes(1);
    expect(recreatedManager.hasActiveLeases()).toBe(false);
  });

  it('migrates valid legacy session metadata before using its leases', async () => {
    const browser = createBrowser({
      documentExists: true,
      metadata: {
        version: 1,
        documentOwned: true,
        leases: [lease('tts', 'playback', ['AUDIO_PLAYBACK'])],
      },
    });
    const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

    await expect(manager.ensureDocument()).resolves.toBe(true);

    expect((await browser.storage.session.get())[OFFSCREEN_RUNTIME_LEASE_STORAGE_KEY])
      .toMatchObject({
        version: 2,
        documentOwned: true,
        leases: [lease('tts', 'playback', ['AUDIO_PLAYBACK'])],
      });
  });

  it('never auto-closes existing document without session ownership metadata', async () => {
    const browser = createBrowser({ documentExists: true });
    const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

    await manager.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK']));
    await manager.release(lease('tts', 'playback'));

    expect(browser.offscreen.closeDocument).not.toHaveBeenCalled();
    expect(manager.getSnapshot()).toMatchObject({
      documentExists: true,
      ownership: 'unknown',
      leases: [],
    });
  });

  it('keeps unavailable session storage usable without proving ownership after restart', async () => {
    const browser = createBrowser({ withSession: false });
    const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

    await expect(manager.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK']))).resolves.toBe(true);

    const recreatedManager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });
    await expect(recreatedManager.release(lease('tts', 'playback'))).resolves.toBe(false);

    expect(browser.offscreen.closeDocument).not.toHaveBeenCalled();
    expect(recreatedManager.getSnapshot()).toMatchObject({
      documentExists: true,
      ownership: 'unknown',
      leases: [],
    });
  });

  it('rejects incompatible reasons before lifecycle mutation', async () => {
    const browser = createBrowser();
    const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

    await expect(manager.acquire(lease('tts', 'playback', ['CAPTURE']))).rejects.toThrow(
      'unsupported offscreen reason',
    );

    expect(browser.offscreen.hasDocument).not.toHaveBeenCalled();
    expect(browser.offscreen.createDocument).not.toHaveBeenCalled();
    expect(manager.getSnapshot().leases).toEqual([]);
  });

  it('requires explicit non-empty lease reasons', async () => {
    const browser = createBrowser();
    const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

    await expect(manager.acquire(lease('tts', 'playback'))).rejects.toThrow(
      'requiredReasons must be a non-empty array',
    );

    expect(browser.offscreen.hasDocument).not.toHaveBeenCalled();
    expect(browser.offscreen.createDocument).not.toHaveBeenCalled();
  });

  it('detects document with runtime contexts when hasDocument is unavailable', async () => {
    const browser = createBrowser({
      withHasDocument: false,
      runtime: {
        getContexts: vi.fn(async () => []),
      },
    });
    const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

    await expect(manager.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK']))).resolves.toBe(true);

    expect(browser.runtime.getContexts).toHaveBeenCalledWith({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [`chrome-extension://test/${OFFSCREEN_RUNTIME_CONFIG.url}`],
    });
    expect(browser.offscreen.createDocument).toHaveBeenCalledTimes(1);
  });

  it('prevents creation when exact runtime context exists', async () => {
    const documentUrl = `chrome-extension://test/${OFFSCREEN_RUNTIME_CONFIG.url}`;
    const browser = createBrowser({
      withHasDocument: false,
      runtime: {
        getContexts: vi.fn(async () => [{ documentUrl }]),
      },
    });
    const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

    await expect(manager.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK']))).resolves.toBe(true);

    expect(browser.runtime.getContexts).toHaveBeenCalledWith({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [documentUrl],
    });
    expect(browser.offscreen.createDocument).not.toHaveBeenCalled();
    expect(manager.getSnapshot().ownership).toBe('unknown');
  });

  it('detects Chrome 109 document with exact service-worker client URL', async () => {
    const documentUrl = `chrome-extension://test/${OFFSCREEN_RUNTIME_CONFIG.url}`;
    const clients = {
      matchAll: vi.fn(async () => []),
    };
    const browser = createBrowser({
      withHasDocument: false,
      clients,
      runtime: { getContexts: undefined },
    });
    clients.matchAll
      .mockResolvedValueOnce([{ url: 'chrome-extension://test/other.html' }])
      .mockResolvedValueOnce([{ url: documentUrl }])
      .mockResolvedValueOnce([]);
    const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

    await expect(manager.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK']))).resolves.toBe(true);
    expect(browser.offscreen.createDocument).toHaveBeenCalledTimes(1);
    expect(clients.matchAll).toHaveBeenCalledTimes(1);

    await expect(manager.release(lease('tts', 'playback'))).resolves.toBe(true);
    expect(clients.matchAll).toHaveBeenCalledTimes(2);
    expect(browser.offscreen.closeDocument).toHaveBeenCalledTimes(1);
    expect(manager.getSnapshot().documentExists).toBe(false);
    expect(manager.getSnapshot().closePending).toBe(false);
  });

  it('prevents creation when exact Chrome 109 client exists', async () => {
    const documentUrl = `chrome-extension://test/${OFFSCREEN_RUNTIME_CONFIG.url}`;
    const clients = {
      matchAll: vi.fn(async () => [
        { url: 'chrome-extension://test/other.html' },
        { url: documentUrl },
      ]),
    };
    const browser = createBrowser({
      withHasDocument: false,
      clients,
      runtime: { getContexts: undefined },
    });
    const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

    await expect(manager.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK']))).resolves.toBe(true);

    expect(browser.offscreen.createDocument).not.toHaveBeenCalled();
    expect(manager.getSnapshot().ownership).toBe('unknown');
  });

  it('creates again after close when Chrome 109 detector lags', async () => {
    const documentUrl = `chrome-extension://test/${OFFSCREEN_RUNTIME_CONFIG.url}`;
    const clients = { matchAll: vi.fn() };
    clients.matchAll
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ url: documentUrl }])
      .mockResolvedValueOnce([{ url: documentUrl }]);
    const browser = createBrowser({
      withHasDocument: false,
      clients,
      runtime: { getContexts: undefined },
    });
    const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

    await manager.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK']));
    await manager.release(lease('tts', 'playback'));
    await expect(manager.acquire(lease('screen-capture', 'capture-1', ['WORKERS'])))
      .resolves.toBe(true);

    expect(browser.offscreen.createDocument).toHaveBeenCalledTimes(2);
    expect(manager.getSnapshot()).toMatchObject({
      documentExists: true,
      ownership: 'owned',
      closePending: false,
    });
  });

  it('recovers known lease after restart through runtime contexts', async () => {
    const documentUrl = `chrome-extension://test/${OFFSCREEN_RUNTIME_CONFIG.url}`;
    const browser = createBrowser({
      withHasDocument: false,
      metadata: {
        version: 2,
        documentOwned: true,
        leases: [lease('tts', 'playback', ['AUDIO_PLAYBACK'])],
      },
      runtime: {
        getContexts: vi.fn(async () => [{ documentUrl }]),
      },
    });
    const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

    await expect(manager.release(lease('tts', 'playback'))).resolves.toBe(true);

    expect(browser.offscreen.createDocument).not.toHaveBeenCalled();
    expect(browser.runtime.getContexts).toHaveBeenCalledWith({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [documentUrl],
    });
    expect(browser.offscreen.closeDocument).toHaveBeenCalledTimes(1);
  });

  it('recovers known lease after restart through clients fallback', async () => {
    const documentUrl = `chrome-extension://test/${OFFSCREEN_RUNTIME_CONFIG.url}`;
    const clients = {
      matchAll: vi.fn(async () => [{ url: documentUrl }]),
    };
    const browser = createBrowser({
      withHasDocument: false,
      clients,
      metadata: {
        version: 2,
        documentOwned: true,
        leases: [lease('tts', 'playback', ['AUDIO_PLAYBACK'])],
      },
      runtime: { getContexts: undefined },
    });
    const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

    await expect(manager.release(lease('tts', 'playback'))).resolves.toBe(true);

    expect(browser.offscreen.createDocument).not.toHaveBeenCalled();
    expect(browser.offscreen.closeDocument).toHaveBeenCalledTimes(1);
    expect(clients.matchAll).toHaveBeenCalledTimes(1);
  });

  it('does not create or claim a lease when no exact detector is available', async () => {
    const browser = createBrowser({
      withHasDocument: false,
      runtime: { getURL: undefined },
    });
    const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

    await expect(manager.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK']))).resolves.toBe(false);

    expect(browser.offscreen.createDocument).not.toHaveBeenCalled();
    expect(manager.getSnapshot().leases).toEqual([]);
  });

  it('does not claim a lease when offscreen API is unavailable', async () => {
    const browser = createBrowser({ withOffscreen: false });
    const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

    await expect(manager.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK']))).resolves.toBe(false);
    expect(manager.getSnapshot().leases).toEqual([]);
  });

  it('does not create when feature gate reports WORKERS unavailable', async () => {
    const browser = createBrowser();
    const manager = new OffscreenRuntimeLeaseManager({
      browserAPI: browser,
      reasonSupport: (reason) => reason !== 'WORKERS',
    });

    await expect(manager.acquire(lease('screen-capture', 'capture-1', ['WORKERS'])))
      .resolves.toBe(false);

    expect(browser.offscreen.createDocument).not.toHaveBeenCalled();
    expect(manager.getSnapshot().leases).toEqual([]);
  });

  it('keeps shared reasons unavailable below Chromium 116', async () => {
    const browser = createBrowser();
    vi.stubGlobal('navigator', { userAgent: 'Chrome/115.0.0.0' });
    const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

    expect(manager._supportsReasons(browser, ['AUDIO_PLAYBACK'])).toBe(true);
    expect(manager._supportsReasons(browser, ['AUDIO_PLAYBACK', 'USER_MEDIA'])).toBe(false);
  });
});
