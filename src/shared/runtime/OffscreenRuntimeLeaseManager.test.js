import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OFFSCREEN_IDLE_ALARM_NAME,
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
  withAlarms = true,
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

  let capturedAlarmListener = null;
  const alarms = withAlarms ? {
    create: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
    onAlarm: {
      addListener: vi.fn((listener) => {
        capturedAlarmListener = listener;
      }),
    },
  } : undefined;

  return {
    ...(withOffscreen ? { offscreen } : {}),
    storage: { session },
    ...(withAlarms ? { alarms } : {}),
    runtime: {
      getURL: vi.fn((url) => `chrome-extension://test/${url}`),
      ...runtime,
    },
    ...(clients === undefined ? {} : { clients }),
    setDocumentExists: (value) => {
      present = value;
    },
    fireAlarm: (name) => capturedAlarmListener?.({ name }),
  };
}

function wireIdleAlarms(browser, manager) {
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm?.name === OFFSCREEN_IDLE_ALARM_NAME) return manager._handleIdleCloseAlarm();
    return undefined;
  });
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
      reasons: ['AUDIO_PLAYBACK', 'WORKERS', 'USER_MEDIA', 'WEB_RTC'],
      justification: OFFSCREEN_RUNTIME_CONFIG.justification,
    });
    expect(manager.getSnapshot().leases).toEqual([
      lease('tts', 'playback', ['AUDIO_PLAYBACK']),
    ]);
    expect(manager.hasActiveLeases()).toBe(true);
  });

  it('shares one document across TTS/OCR/live-dubbing/WEB_RTC leases and still rejects unknown reasons', async () => {
    const browser = createBrowser();
    const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

    // Existing production leases are unchanged and share the document.
    await expect(manager.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK']))).resolves.toBe(true);
    await expect(manager.acquire(lease('screen-capture', 'ocr-1', ['WORKERS']))).resolves.toBe(true);
    await expect(manager.acquire(lease('live-dubbing', 'session-1', ['USER_MEDIA', 'AUDIO_PLAYBACK'])))
      .resolves.toBe(true);
    // The spike capture transaction reasons are accepted by the real manager.
    await expect(manager.acquire(lease('openai-spike-dev', 'tx-1', ['USER_MEDIA', 'AUDIO_PLAYBACK', 'WEB_RTC'])))
      .resolves.toBe(true);

    // One shared document, created once with the centralized reasons.
    expect(browser.offscreen.createDocument).toHaveBeenCalledTimes(1);
    expect(browser.offscreen.createDocument).toHaveBeenCalledWith({
      url: OFFSCREEN_RUNTIME_CONFIG.url,
      reasons: ['AUDIO_PLAYBACK', 'WORKERS', 'USER_MEDIA', 'WEB_RTC'],
      justification: OFFSCREEN_RUNTIME_CONFIG.justification,
    });
    expect(manager.getSnapshot().leases).toHaveLength(4);

    // Genuinely-unsupported reasons still fail closed with no lifecycle mutation.
    await expect(manager.acquire(lease('x', 'y', ['WEB_RTC', 'BOGUS_REASON']))).rejects.toThrow(
      'unsupported offscreen reason',
    );
    expect(browser.offscreen.createDocument).toHaveBeenCalledTimes(1);
    expect(manager.getSnapshot().leases).toHaveLength(4);
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

  it('keeps document while another owner remains and schedules idle close on final release', async () => {
    const browser = createBrowser();
    const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

    await manager.acquire(lease('one', 'playback', ['AUDIO_PLAYBACK']));
    await manager.acquire(lease('two', 'capture', ['USER_MEDIA']));
    await manager.release(lease('one', 'playback'));

    expect(browser.offscreen.closeDocument).not.toHaveBeenCalled();
    expect(browser.alarms.create).not.toHaveBeenCalled();
    expect(manager.getSnapshot().leases).toEqual([{
      owner: 'two',
      leaseId: 'capture',
      requiredReasons: ['USER_MEDIA'],
    }]);

    await manager.release(lease('two', 'capture'));
    expect(browser.offscreen.closeDocument).not.toHaveBeenCalled();
    expect(browser.alarms.create).toHaveBeenCalledWith(
      OFFSCREEN_IDLE_ALARM_NAME,
      { delayInMinutes: 0.5 },
    );
    expect(manager.getSnapshot().idleCloseScheduled).toBe(true);
    expect(manager.hasActiveLeases()).toBe(false);

    wireIdleAlarms(browser, manager);
    await browser.fireAlarm(OFFSCREEN_IDLE_ALARM_NAME);
    expect(browser.offscreen.closeDocument).toHaveBeenCalledTimes(1);
  });

  it('makes duplicate release safe', async () => {
    const browser = createBrowser();
    const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

    await manager.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK']));
    await manager.release(lease('tts', 'playback'));
    expect(browser.offscreen.closeDocument).not.toHaveBeenCalled();

    wireIdleAlarms(browser, manager);
    await browser.fireAlarm(OFFSCREEN_IDLE_ALARM_NAME);
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
    expect(browser.alarms.create).not.toHaveBeenCalled();
    expect(manager.getSnapshot()).toMatchObject({
      documentExists: true,
      ownership: 'owned',
      idleCloseScheduled: false,
      leases: [requestedLease],
    });

    await expect(manager.release(requestedLease)).resolves.toBe(true);
    expect(browser.offscreen.closeDocument).not.toHaveBeenCalled();
    expect(browser.alarms.create).toHaveBeenCalledWith(
      OFFSCREEN_IDLE_ALARM_NAME,
      { delayInMinutes: 0.5 },
    );

    wireIdleAlarms(browser, manager);
    await browser.fireAlarm(OFFSCREEN_IDLE_ALARM_NAME);
    expect(browser.offscreen.closeDocument).toHaveBeenCalledTimes(1);
  });

  it('retains safe ownership after close rejection and retries later', async () => {
    const browser = createBrowser();
    browser.offscreen.closeDocument.mockRejectedValueOnce(new Error('close failed'));
    const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

    await manager.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK']));
    await manager.release(lease('tts', 'playback'));

    expect(browser.offscreen.closeDocument).not.toHaveBeenCalled();
    expect(browser.alarms.create).toHaveBeenCalledTimes(1);

    wireIdleAlarms(browser, manager);
    await browser.fireAlarm(OFFSCREEN_IDLE_ALARM_NAME);

    expect(manager.getSnapshot()).toMatchObject({
      documentExists: true,
      ownership: 'owned',
      closePending: true,
      leases: [],
    });
    expect(browser.alarms.create).toHaveBeenCalledTimes(2);

    await manager.release(lease('tts', 'playback'));
    await browser.fireAlarm(OFFSCREEN_IDLE_ALARM_NAME);
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

    expect(browser.offscreen.closeDocument).not.toHaveBeenCalled();
    expect(browser.alarms.create).toHaveBeenCalledWith(
      OFFSCREEN_IDLE_ALARM_NAME,
      { delayInMinutes: 0.5 },
    );

    wireIdleAlarms(browser, recreatedManager);
    await browser.fireAlarm(OFFSCREEN_IDLE_ALARM_NAME);
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
    expect(browser.offscreen.closeDocument).not.toHaveBeenCalled();
    expect(browser.alarms.create).toHaveBeenCalledWith(
      OFFSCREEN_IDLE_ALARM_NAME,
      { delayInMinutes: 0.5 },
    );
    wireIdleAlarms(browser, manager);
    await expect(browser.fireAlarm(OFFSCREEN_IDLE_ALARM_NAME)).resolves.toBe(false);
    expect(clients.matchAll).toHaveBeenCalledTimes(3);
    expect(browser.offscreen.closeDocument).not.toHaveBeenCalled();
    expect(manager.getSnapshot()).toMatchObject({
      documentExists: false,
      ownership: 'none',
      closePending: false,
      leases: [],
    });
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
    wireIdleAlarms(browser, manager);
    await browser.fireAlarm(OFFSCREEN_IDLE_ALARM_NAME);
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
    expect(browser.offscreen.closeDocument).not.toHaveBeenCalled();
    wireIdleAlarms(browser, manager);
    await browser.fireAlarm(OFFSCREEN_IDLE_ALARM_NAME);
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
    expect(browser.offscreen.closeDocument).not.toHaveBeenCalled();
    wireIdleAlarms(browser, manager);
    await browser.fireAlarm(OFFSCREEN_IDLE_ALARM_NAME);
    expect(browser.offscreen.closeDocument).toHaveBeenCalledTimes(1);
    expect(clients.matchAll).toHaveBeenCalledTimes(2);
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
    expect(manager._supportsReasons(browser, ['WEB_RTC'])).toBe(true);
    expect(manager._supportsReasons(browser, ['AUDIO_PLAYBACK', 'WEB_RTC'])).toBe(false);
  });

  describe('idle grace close', () => {
    it('does not synchronously close on final lease release', async () => {
      const browser = createBrowser();
      const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

      await manager.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK']));
      await manager.release(lease('tts', 'playback'));

      expect(browser.offscreen.closeDocument).not.toHaveBeenCalled();
      expect(manager.getSnapshot()).toMatchObject({
        documentExists: true,
        ownership: 'owned',
        leases: [],
      });
    });

    it('schedules idle cleanup with the alarm name and grace delay', async () => {
      const browser = createBrowser();
      const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

      await manager.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK']));
      await manager.release(lease('tts', 'playback'));

      expect(browser.alarms.create).toHaveBeenCalledTimes(1);
      expect(browser.alarms.create).toHaveBeenCalledWith(
        OFFSCREEN_IDLE_ALARM_NAME,
        { delayInMinutes: 0.5 },
      );
      expect(manager.getSnapshot().idleCloseScheduled).toBe(true);
    });

    it('does not schedule a close while another lease remains', async () => {
      const browser = createBrowser();
      const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

      await manager.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK']));
      await manager.acquire(lease('screen-capture', 'ocr-1', ['WORKERS']));
      await manager.release(lease('tts', 'playback'));

      expect(browser.alarms.create).not.toHaveBeenCalled();
      expect(browser.offscreen.closeDocument).not.toHaveBeenCalled();
      expect(manager.getSnapshot().idleCloseScheduled).toBe(false);
    });

    it('reuses the existing document for acquire during idle grace', async () => {
      const browser = createBrowser();
      const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

      await manager.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK']));
      await manager.release(lease('tts', 'playback'));
      await manager.acquire(lease('screen-capture', 'ocr-1', ['WORKERS']));

      expect(browser.offscreen.createDocument).toHaveBeenCalledTimes(1);
      expect(browser.offscreen.closeDocument).not.toHaveBeenCalled();
      expect(manager.getSnapshot().leases).toHaveLength(1);
    });

    it('invalidates a pending idle close on acquire', async () => {
      const browser = createBrowser();
      const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

      await manager.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK']));
      await manager.release(lease('tts', 'playback'));
      expect(manager.getSnapshot().idleCloseScheduled).toBe(true);

      await manager.acquire(lease('screen-capture', 'ocr-1', ['WORKERS']));

      expect(browser.alarms.clear).toHaveBeenCalledWith(OFFSCREEN_IDLE_ALARM_NAME);
      expect(manager.getSnapshot().idleCloseScheduled).toBe(false);
    });

    it('preserves idle cleanup when lease persistence fails during grace', async () => {
      const browser = createBrowser();
      const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

      await manager.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK']));
      await manager.release(lease('tts', 'playback'));
      expect(manager.getSnapshot().idleCloseScheduled).toBe(true);

      browser.storage.session.set.mockRejectedValueOnce(new Error('session set failed'));
      await expect(manager.acquire(lease('screen-capture', 'ocr-1', ['WORKERS'])))
        .rejects.toThrow('session set failed');

      expect(browser.alarms.clear).not.toHaveBeenCalled();
      expect(manager.getSnapshot()).toMatchObject({
        idleCloseScheduled: true,
        leases: [],
      });

      wireIdleAlarms(browser, manager);
      await expect(browser.fireAlarm(OFFSCREEN_IDLE_ALARM_NAME)).resolves.toBe(true);
      expect(browser.offscreen.closeDocument).toHaveBeenCalledTimes(1);
      expect(manager.getSnapshot().documentExists).toBe(false);
    });

    it('does not strand an idle document when acquire fails before publication', async () => {
      const browser = createBrowser();
      const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

      await manager.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK']));
      await manager.release(lease('tts', 'playback'));
      expect(manager.getSnapshot().idleCloseScheduled).toBe(true);

      await expect(manager.acquire(lease('x', 'y', ['WEB_RTC', 'BOGUS_REASON'])))
        .rejects.toThrow('unsupported offscreen reason');

      expect(browser.alarms.clear).not.toHaveBeenCalled();
      expect(manager.getSnapshot().idleCloseScheduled).toBe(true);

      wireIdleAlarms(browser, manager);
      await expect(browser.fireAlarm(OFFSCREEN_IDLE_ALARM_NAME)).resolves.toBe(true);
      expect(browser.offscreen.closeDocument).toHaveBeenCalledTimes(1);
    });

    it('prevents a pending alarm from closing after a successful acquire', async () => {
      const browser = createBrowser();
      const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

      await manager.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK']));
      await manager.release(lease('tts', 'playback'));
      await manager.acquire(lease('screen-capture', 'ocr-1', ['WORKERS']));

      expect(browser.alarms.clear).toHaveBeenCalledTimes(1);
      wireIdleAlarms(browser, manager);
      await expect(browser.fireAlarm(OFFSCREEN_IDLE_ALARM_NAME)).resolves.toBe(false);

      expect(browser.offscreen.closeDocument).not.toHaveBeenCalled();
      expect(manager.getSnapshot().leases).toEqual([
        lease('screen-capture', 'ocr-1', ['WORKERS']),
      ]);
    });

    it('does not close on idle alarm while a lease is active', async () => {
      const browser = createBrowser();
      const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

      await manager.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK']));
      await manager.release(lease('tts', 'playback'));
      await manager.acquire(lease('screen-capture', 'ocr-1', ['WORKERS']));

      wireIdleAlarms(browser, manager);
      await expect(browser.fireAlarm(OFFSCREEN_IDLE_ALARM_NAME)).resolves.toBe(false);

      expect(browser.offscreen.closeDocument).not.toHaveBeenCalled();
      expect(manager.hasActiveLeases()).toBe(true);
    });

    it('closes on idle alarm with zero leases and owned document', async () => {
      const browser = createBrowser();
      const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

      await manager.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK']));
      await manager.release(lease('tts', 'playback'));

      wireIdleAlarms(browser, manager);
      await expect(browser.fireAlarm(OFFSCREEN_IDLE_ALARM_NAME)).resolves.toBe(true);

      expect(browser.offscreen.closeDocument).toHaveBeenCalledTimes(1);
      expect(manager.getSnapshot()).toMatchObject({
        documentExists: false,
        ownership: 'none',
        idleCloseScheduled: false,
      });
    });

    it('does not close on idle alarm without proven ownership', async () => {
      const browser = createBrowser({ documentExists: true });
      const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

      await manager.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK']));
      await manager.release(lease('tts', 'playback'));

      expect(browser.alarms.create).not.toHaveBeenCalled();
      wireIdleAlarms(browser, manager);
      await expect(browser.fireAlarm(OFFSCREEN_IDLE_ALARM_NAME)).resolves.toBe(false);

      expect(browser.offscreen.closeDocument).not.toHaveBeenCalled();
      expect(manager.getSnapshot()).toMatchObject({
        documentExists: true,
        ownership: 'unknown',
        leases: [],
      });
    });

    it('treats duplicate and stale alarms as harmless', async () => {
      const browser = createBrowser();
      const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

      await manager.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK']));
      await manager.acquire(lease('screen-capture', 'ocr-1', ['WORKERS']));
      wireIdleAlarms(browser, manager);

      await expect(browser.fireAlarm(OFFSCREEN_IDLE_ALARM_NAME)).resolves.toBe(false);
      await expect(browser.fireAlarm(OFFSCREEN_IDLE_ALARM_NAME)).resolves.toBe(false);
      expect(browser.offscreen.closeDocument).not.toHaveBeenCalled();

      await manager.release(lease('tts', 'playback'));
      await manager.release(lease('screen-capture', 'ocr-1'));
      await expect(browser.fireAlarm(OFFSCREEN_IDLE_ALARM_NAME)).resolves.toBe(true);
      expect(browser.offscreen.closeDocument).toHaveBeenCalledTimes(1);

      await expect(browser.fireAlarm(OFFSCREEN_IDLE_ALARM_NAME)).resolves.toBe(false);
      expect(browser.offscreen.closeDocument).toHaveBeenCalledTimes(1);
    });

    it('does not schedule an alarm when release persistence fails', async () => {
      const browser = createBrowser();
      const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });
      const requestedLease = lease('tts', 'playback', ['AUDIO_PLAYBACK']);

      await manager.acquire(requestedLease);
      browser.storage.session.set.mockRejectedValueOnce(new Error('session set failed'));

      await expect(manager.release(requestedLease)).rejects.toThrow('session set failed');

      expect(browser.alarms.create).not.toHaveBeenCalled();
      expect(browser.offscreen.closeDocument).not.toHaveBeenCalled();
      expect(manager.getSnapshot()).toMatchObject({
        idleCloseScheduled: false,
        leases: [requestedLease],
      });
    });

    it('keeps retryable state when close fails during idle alarm', async () => {
      const browser = createBrowser();
      browser.offscreen.closeDocument.mockRejectedValueOnce(new Error('close failed'));
      const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

      await manager.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK']));
      await manager.release(lease('tts', 'playback'));

      wireIdleAlarms(browser, manager);
      await expect(browser.fireAlarm(OFFSCREEN_IDLE_ALARM_NAME)).resolves.toBe(false);
      expect(manager.getSnapshot()).toMatchObject({
        documentExists: true,
        ownership: 'owned',
        closePending: true,
        leases: [],
      });
      expect(browser.alarms.create).toHaveBeenCalledTimes(2);

      await expect(browser.fireAlarm(OFFSCREEN_IDLE_ALARM_NAME)).resolves.toBe(true);
      expect(browser.offscreen.closeDocument).toHaveBeenCalledTimes(2);
      expect(manager.getSnapshot().documentExists).toBe(false);
    });

    it('clears state safely when the alarm finds the document already gone', async () => {
      const browser = createBrowser();
      const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

      await manager.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK']));
      await manager.release(lease('tts', 'playback'));
      browser.setDocumentExists(false);

      wireIdleAlarms(browser, manager);
      await expect(browser.fireAlarm(OFFSCREEN_IDLE_ALARM_NAME)).resolves.toBe(false);

      expect(browser.offscreen.closeDocument).not.toHaveBeenCalled();
      expect(manager.getSnapshot()).toMatchObject({
        documentExists: false,
        ownership: 'none',
        closePending: false,
        idleCloseScheduled: false,
        leases: [],
      });
    });

    it('never closes when alarm-time presence detection is uncertain', async () => {
      const browser = createBrowser();
      const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

      await manager.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK']));
      await manager.release(lease('tts', 'playback'));
      browser.offscreen.hasDocument = undefined;
      browser.runtime.getURL = undefined;

      wireIdleAlarms(browser, manager);
      await expect(browser.fireAlarm(OFFSCREEN_IDLE_ALARM_NAME)).resolves.toBe(false);

      expect(browser.offscreen.closeDocument).not.toHaveBeenCalled();
      expect(manager.getSnapshot()).toMatchObject({
        documentExists: true,
        ownership: 'owned',
        closePending: false,
        idleCloseScheduled: false,
        leases: [],
      });
    });

    it('never marks idle close scheduled without an alarms API', async () => {
      const browserWithoutAlarms = createBrowser({ withAlarms: false });
      const managerWithoutAlarms = new OffscreenRuntimeLeaseManager({ browserAPI: browserWithoutAlarms });

      await managerWithoutAlarms.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK']));
      await expect(managerWithoutAlarms.release(lease('tts', 'playback'))).resolves.toBe(true);

      expect(browserWithoutAlarms.offscreen.closeDocument).not.toHaveBeenCalled();
      expect(managerWithoutAlarms.getSnapshot().idleCloseScheduled).toBe(false);

      const browserWithoutCreate = createBrowser();
      browserWithoutCreate.alarms.create = null;
      const managerWithoutCreate = new OffscreenRuntimeLeaseManager({ browserAPI: browserWithoutCreate });

      await managerWithoutCreate.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK']));
      await expect(managerWithoutCreate.release(lease('tts', 'playback'))).resolves.toBe(true);

      expect(browserWithoutCreate.offscreen.closeDocument).not.toHaveBeenCalled();
      expect(managerWithoutCreate.getSnapshot().idleCloseScheduled).toBe(false);
    });

    it('serializes a concurrent acquire against an idle close', async () => {
      const browser = createBrowser();
      const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });
      wireIdleAlarms(browser, manager);

      const acquiring = manager.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK']));
      const alarming = browser.fireAlarm(OFFSCREEN_IDLE_ALARM_NAME);
      await Promise.all([acquiring, alarming]);

      expect(browser.offscreen.createDocument).toHaveBeenCalledTimes(1);
      expect(browser.offscreen.closeDocument).not.toHaveBeenCalled();
      expect(manager.getSnapshot().leases).toEqual([
        lease('tts', 'playback', ['AUDIO_PLAYBACK']),
      ]);
    });

    it('shares one document across TTS, OCR, and live-dubbing leases under idle grace', async () => {
      const browser = createBrowser();
      const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

      await manager.acquire(lease('tts', 'playback', ['AUDIO_PLAYBACK']));
      await manager.acquire(lease('screen-capture', 'ocr-1', ['WORKERS']));
      await manager.acquire(lease('live-dubbing', 'session-1', ['USER_MEDIA', 'AUDIO_PLAYBACK']));

      expect(browser.offscreen.createDocument).toHaveBeenCalledTimes(1);

      await manager.release(lease('tts', 'playback'));
      await manager.release(lease('screen-capture', 'ocr-1'));
      expect(browser.alarms.create).not.toHaveBeenCalled();
      expect(browser.offscreen.closeDocument).not.toHaveBeenCalled();

      await manager.release(lease('live-dubbing', 'session-1'));
      expect(browser.alarms.create).toHaveBeenCalledWith(
        OFFSCREEN_IDLE_ALARM_NAME,
        { delayInMinutes: 0.5 },
      );
      expect(browser.offscreen.closeDocument).not.toHaveBeenCalled();

      wireIdleAlarms(browser, manager);
      await browser.fireAlarm(OFFSCREEN_IDLE_ALARM_NAME);
      expect(browser.offscreen.closeDocument).toHaveBeenCalledTimes(1);
      expect(manager.hasActiveLeases()).toBe(false);
    });

    it('re-schedules idle close on restart with owned metadata and zero leases', async () => {
      const browser = createBrowser({
        documentExists: true,
        metadata: {
          version: 2,
          documentOwned: true,
          leases: [],
        },
      });
      const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

      await expect(manager.ensureDocument()).resolves.toBe(true);

      expect(browser.alarms.create).toHaveBeenCalledWith(
        OFFSCREEN_IDLE_ALARM_NAME,
        { delayInMinutes: 0.5 },
      );
      expect(manager.getSnapshot()).toMatchObject({
        documentExists: true,
        ownership: 'owned',
        idleCloseScheduled: true,
      });

      wireIdleAlarms(browser, manager);
      await browser.fireAlarm(OFFSCREEN_IDLE_ALARM_NAME);
      expect(browser.offscreen.closeDocument).toHaveBeenCalledTimes(1);
    });

    it('does not schedule idle close on restart with owned metadata and active leases', async () => {
      const browser = createBrowser({
        documentExists: true,
        metadata: {
          version: 2,
          documentOwned: true,
          leases: [lease('tts', 'playback', ['AUDIO_PLAYBACK'])],
        },
      });
      const manager = new OffscreenRuntimeLeaseManager({ browserAPI: browser });

      await expect(manager.ensureDocument()).resolves.toBe(true);

      expect(browser.alarms.create).not.toHaveBeenCalled();
      expect(manager.getSnapshot()).toMatchObject({
        ownership: 'owned',
        idleCloseScheduled: false,
        leases: [lease('tts', 'playback', ['AUDIO_PLAYBACK'])],
      });
    });
  });
});
