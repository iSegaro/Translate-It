import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map();
const storageManager = {
  get: vi.fn(async () => Object.fromEntries(storage)),
  set: vi.fn(async data => {
    for (const [key, value] of Object.entries(data)) storage.set(key, value);
  }),
  remove: vi.fn(async keys => {
    for (const key of Array.isArray(keys) ? keys : [keys]) storage.delete(key);
  }),
  clear: vi.fn(async () => storage.clear()),
};

function deferred() {
  let resolve;
  const promise = new Promise(nextResolve => { resolve = nextResolve; });
  return { promise, resolve };
}

function resetStorageMocks() {
  storageManager.get.mockReset();
  storageManager.get.mockImplementation(async () => Object.fromEntries(storage));
  storageManager.set.mockImplementation(async data => {
    for (const [key, value] of Object.entries(data)) storage.set(key, value);
  });
  storageManager.remove.mockImplementation(async keys => {
    for (const key of Array.isArray(keys) ? keys : [keys]) storage.delete(key);
  });
}

vi.mock('@/shared/storage/core/StorageCore.js', () => ({ storageManager }));

const {
  DESKTOP_FAB_EXCLUSION_PREFIX,
  DESKTOP_FAB_EXCLUSIONS_EXPORT_KEY,
  addDesktopFabExclusion,
  getDesktopFabExclusionKey,
  listDesktopFabExclusions,
  parseDesktopFabExclusionsSection,
  removeDesktopFabExclusion,
  replaceDesktopFabExclusions,
  serializeDesktopFabExclusions,
} = await import('./desktopFabExclusions.js');

describe('desktop FAB exclusions', () => {
  beforeEach(() => {
    storage.clear();
    vi.clearAllMocks();
  });

  it('normalizes page URLs, protocols, ports, and trailing slashes', () => {
    expect(getDesktopFabExclusionKey('page', 'http://example.com/docs/?a=1#top'))
      .toBe(getDesktopFabExclusionKey('page', 'https://EXAMPLE.com/docs'));
    expect(getDesktopFabExclusionKey('page', 'http://example.com:8080/docs'))
      .toBe(getDesktopFabExclusionKey('page', 'https://example.com:8080/docs/'));
    expect(getDesktopFabExclusionKey('page', 'https://example.com:444/docs'))
      .not.toBe(getDesktopFabExclusionKey('page', 'https://example.com/docs'));
    expect(getDesktopFabExclusionKey('page', 'https://example.com/docs/child'))
      .not.toBe(getDesktopFabExclusionKey('page', 'https://example.com/docs'));
  });

  it('lists and removes original page keys with repeated slashes or explicit default port', async () => {
    // Hardcoded keys produced by the original getIdentity (single trailing-slash
    // strip, host as parsed, forced https://): from 'https://example.com/docs//'
    // and 'http://example.com:443/docs'. Must stay listable/removable.
    const slashKey = 'desktop-fab-exclusion:v1:page:https%3A%2F%2Fexample.com%2Fdocs%2F';
    const portKey = 'desktop-fab-exclusion:v1:page:https%3A%2F%2Fexample.com%3A443%2Fdocs';
    for (const [key, value] of [
      [slashKey, 'https://example.com/docs/'],
      [portKey, 'https://example.com:443/docs'],
    ]) {
      storage.clear();
      storage.set(key, true);
      expect(await listDesktopFabExclusions()).toEqual([{ key, scope: 'page', value }]);
      await removeDesktopFabExclusion(key);
      expect(storage.has(key)).toBe(false);
      expect(await listDesktopFabExclusions()).toEqual([]);
    }
  });

  it('lists original page and site keys and rejects malformed page keys', async () => {
    const validKeys = [
      ['desktop-fab-exclusion:v1:page:https%3A%2F%2Fexample.com%2Fdocs', 'https://example.com/docs'],
      ['desktop-fab-exclusion:v1:page:https%3A%2F%2Fexample.com%2F', 'https://example.com/'],
      ['desktop-fab-exclusion:v1:page:https%3A%2F%2Fexample.com%3A8080%2Fx', 'https://example.com:8080/x'],
      ['desktop-fab-exclusion:v1:page:file%3A%2F%2F%2Fhome%2Fuser%2Fpage.html', 'file:///home/user/page.html'],
    ];
    for (const [key, value] of validKeys) {
      storage.clear();
      storage.set(key, true);
      expect(await listDesktopFabExclusions()).toEqual([{ key, scope: 'page', value }]);
    }
    storage.clear();
    const siteKey = 'desktop-fab-exclusion:v1:site:example.org';
    storage.set(siteKey, true);
    expect(await listDesktopFabExclusions()).toEqual([{ key: siteKey, scope: 'site', value: 'example.org' }]);

    storage.clear();
    storage.set('desktop-fab-exclusion:v1:page:https%3A%2F%2Fexample.com%2Fdocs%3Fq%3D1', true);
    storage.set('desktop-fab-exclusion:v1:page:not-a-url', true);
    storage.set('desktop-fab-exclusion:v1:page:ftp%3A%2F%2Fexample.com%2F', true);
    storage.set('desktop-fab-exclusion:v1:page:https%3A%2F%2F', true);
    storage.set('other-prefix:v1:page:https%3A%2F%2Fexample.com%2Fdocs', true);
    expect(await listDesktopFabExclusions()).toEqual([]);
    for (const key of [...storage.keys()]) {
      await removeDesktopFabExclusion(key);
    }
    expect(storage.has('other-prefix:v1:page:https%3A%2F%2Fexample.com%2Fdocs')).toBe(true);
    expect([...storage.keys()]).toHaveLength(5);
  });
  it('rejects noncanonical page identities in list and remove', async () => {
    // Hardcoded noncanonical values: must be omitted from listing and removal
    // must be a safe no-op (keys remain untouched).
    const badKeys = [
      'desktop-fab-exclusion:v1:page:https%3A%2F%2FExAmple.com%2Fdocs',
      'desktop-fab-exclusion:v1:page:https%3A%2F%2Fexample.com%2Fa%2F..%2Fb',
      'desktop-fab-exclusion:v1:page:https%3A%2F%2Fexample.com%2Fdocs%3F',
      'desktop-fab-exclusion:v1:page:https%3A%2F%2Fexample.com%2Fdocs%23',
      'desktop-fab-exclusion:v1:page:https%3A%2F%2Fexample.com%2Fdocs%3Fq%3D1',
      'desktop-fab-exclusion:v1:page:https%3A%2F%2Fuser%3Apass%40example.com%2Fx',
      'desktop-fab-exclusion:v1:page:https%3A%2F%2Fexample.com%3A08443%2Fx',
    ];
    for (const key of badKeys) storage.set(key, true);
    expect(await listDesktopFabExclusions()).toEqual([]);
    for (const key of badKeys) {
      await removeDesktopFabExclusion(key);
      expect(storage.has(key)).toBe(true);
    }
    expect([...storage.keys()]).toHaveLength(badKeys.length);
  });

  it('lists preserved file page identities', async () => {
    const fileKeys = [
      ['desktop-fab-exclusion:v1:page:file%3A%2F%2F%2Fhome%2Fuser%2Fpage.html', 'file:///home/user/page.html'],
      ['desktop-fab-exclusion:v1:page:file%3A%2F%2Fhost%2Fa%2F', 'file://host/a/'],
    ];
    for (const [key, value] of fileKeys) {
      storage.clear();
      storage.set(key, true);
      expect(await listDesktopFabExclusions()).toEqual([{ key, scope: 'page', value }]);
      await removeDesktopFabExclusion(key);
      expect(await listDesktopFabExclusions()).toEqual([]);
    }
  });
  it('supports file hosts and paths while excluding query and hash', () => {
    expect(getDesktopFabExclusionKey('page', 'file://server/share/docs/?q=1#x'))
      .toBe(getDesktopFabExclusionKey('page', 'file://server/share/docs'));
    expect(getDesktopFabExclusionKey('page', 'file:///docs'))
      .not.toBe(getDesktopFabExclusionKey('page', 'file://server/docs'));
    expect(getDesktopFabExclusionKey('site', 'file://server/docs')).toBe('');
  });

  it('uses exact canonical HTTP(S) hostnames for sites', () => {
    expect(getDesktopFabExclusionKey('site', 'http://BÜCHER.example:8080/a'))
      .toBe(getDesktopFabExclusionKey('site', 'https://xn--bcher-kva.example/'));
    expect(getDesktopFabExclusionKey('site', 'https://sub.example.com'))
      .not.toBe(getDesktopFabExclusionKey('site', 'https://example.com'));
  });

  it('rejects invalid scopes, malformed URLs, and unsupported schemes', () => {
    for (const scope of ['other', null]) expect(getDesktopFabExclusionKey(scope, 'https://x.test')).toBe('');
    for (const url of ['', 'not a URL', 'ftp://example.com', 'javascript:alert(1)']) {
      expect(getDesktopFabExclusionKey('page', url)).toBe('');
    }
    expect(getDesktopFabExclusionKey('site', 'file:///tmp/a')).toBe('');
  });

  it('stores entries independently and same-key concurrent additions resolve to one entry', async () => {
    const [first, second, duplicate] = await Promise.all([
      addDesktopFabExclusion('page', 'https://one.test/a'),
      addDesktopFabExclusion('site', 'https://two.test'),
      addDesktopFabExclusion('page', 'http://one.test/a/'),
    ]);
    expect(first).toBe(duplicate);
    expect(second).not.toBe(first);
    expect([...storage.keys()]).toHaveLength(2);
    expect([...storage.values()]).toEqual([true, true]);
  });

  it('allows an add and a remove for different keys to proceed concurrently', async () => {
    const addStarted = deferred();
    const removeStarted = deferred();
    const allowAdd = deferred();
    const allowRemove = deferred();
    const addedKey = getDesktopFabExclusionKey('page', 'https://add.test/path');
    const removedKey = getDesktopFabExclusionKey('page', 'https://remove.test/path');
    storage.set(removedKey, true);
    storageManager.set.mockImplementationOnce(async data => {
      addStarted.resolve();
      await allowAdd.promise;
      for (const [key, value] of Object.entries(data)) storage.set(key, value);
    });
    storageManager.remove.mockImplementationOnce(async key => {
      removeStarted.resolve();
      await allowRemove.promise;
      storage.delete(key);
    });

    const adding = addDesktopFabExclusion('page', 'https://add.test/path');
    const removing = removeDesktopFabExclusion(removedKey);
    await Promise.all([addStarted.promise, removeStarted.promise]);
    expect(storageManager.set).toHaveBeenCalledWith({ [addedKey]: true });
    expect(storageManager.remove).toHaveBeenCalledWith(removedKey);

    allowAdd.resolve();
    allowRemove.resolve();
    await Promise.all([adding, removing]);
    expect(storage.get(addedKey)).toBe(true);
    expect(storage.has(removedKey)).toBe(false);
  });

  it('applies same-entry add and remove in submission order', async () => {
    const setStarted = deferred();
    const allowSet = deferred();
    const key = getDesktopFabExclusionKey('site', 'https://ordered.test');
    storageManager.set.mockImplementationOnce(async data => {
      setStarted.resolve();
      await allowSet.promise;
      for (const [entryKey, value] of Object.entries(data)) storage.set(entryKey, value);
    });

    const adding = addDesktopFabExclusion('site', 'https://ordered.test');
    await setStarted.promise;
    const removing = removeDesktopFabExclusion(key);
    expect(storageManager.remove).not.toHaveBeenCalled();
    allowSet.resolve();
    await Promise.all([adding, removing]);
    expect(storage.get(key)).toBeUndefined();
    expect(storageManager.set.mock.invocationCallOrder[0])
      .toBeLessThan(storageManager.remove.mock.invocationCallOrder[0]);
  });

  it('lists only valid enabled entries, removes owned keys, and leaves unrelated keys alone', async () => {
    const key = getDesktopFabExclusionKey('site', 'https://example.com/path');
    storage.set(key, true);
    storage.set(`${DESKTOP_FAB_EXCLUSION_PREFIX}unknown:abc`, true);
    storage.set(`${DESKTOP_FAB_EXCLUSION_PREFIX}site:%ZZ`, true);
    storage.set(getDesktopFabExclusionKey('page', 'https://off.test'), false);
    storage.set('unrelated', true);
    expect(await listDesktopFabExclusions()).toEqual([{ key, scope: 'site', value: 'example.com' }]);
    await removeDesktopFabExclusion(key);
    expect(storage.has(key)).toBe(false);
    await removeDesktopFabExclusion('unrelated');
    expect(storage.has('unrelated')).toBe(true);
  });

  it('propagates storage failures and clear removes feature keys as resetSettings does', async () => {
    storageManager.set.mockRejectedValueOnce(new Error('write failed'));
    await expect(addDesktopFabExclusion('site', 'https://example.com')).rejects.toThrow('write failed');
    storageManager.remove.mockRejectedValueOnce(new Error('remove failed'));
    await expect(removeDesktopFabExclusion(getDesktopFabExclusionKey('site', 'https://example.com')))
      .rejects.toThrow('remove failed');

    await addDesktopFabExclusion('page', 'https://example.com/path');
    await storageManager.clear();
    expect(await listDesktopFabExclusions()).toEqual([]);
  });

  it('propagates storage failures while listing entries', async () => {
    storageManager.get.mockRejectedValueOnce(new Error('list failed'));
    await expect(listDesktopFabExclusions()).rejects.toThrow('list failed');
  });

  it('serializes saved exclusions as plain scope/value pairs', async () => {
    expect(DESKTOP_FAB_EXCLUSIONS_EXPORT_KEY).toBe('_desktopFabExclusions');
    storage.set('desktop-fab-exclusion:v1:page:https%3A%2F%2Fexample.com%2Fdocs%2F', true);
    storage.set('desktop-fab-exclusion:v1:page:https%3A%2F%2Fexample.com%3A443%2Fdocs', true);
    storage.set('desktop-fab-exclusion:v1:site:example.org', true);
    storage.set('unrelated', true);
    storage.set('desktop-fab-exclusion:v1:page:https%3A%2F%2Foff.test%2F', false);
    expect(await serializeDesktopFabExclusions()).toEqual([
      { scope: 'page', value: 'https://example.com/docs/' },
      { scope: 'page', value: 'https://example.com:443/docs' },
      { scope: 'site', value: 'example.org' },
    ]);
  });

  it('parses a valid exclusions section and dedupes by key', async () => {
    const entries = parseDesktopFabExclusionsSection([
      { scope: 'page', value: 'https://example.com/docs' },
      { scope: 'site', value: 'example.org' },
      { scope: 'page', value: 'https://example.com/docs' },
    ]);
    expect(entries).toHaveLength(2);
    for (const { key } of entries) {
      expect(key.startsWith(DESKTOP_FAB_EXCLUSION_PREFIX)).toBe(true);
    }
    expect(entries[0].key).toBe(getDesktopFabExclusionKey('page', 'https://example.com/docs'));
    expect(entries[1].key).toBe(getDesktopFabExclusionKey('site', 'https://example.org'));
    expect(storageManager.set).not.toHaveBeenCalled();
    expect(storageManager.remove).not.toHaveBeenCalled();
    await replaceDesktopFabExclusions(entries);
    expect(await listDesktopFabExclusions()).toEqual(entries);
  });

  it('rejects invalid exclusions sections without touching storage', () => {
    const invalid = [
      undefined,
      {},
      'x',
      [null],
      [{ scope: 'other', value: 'x' }],
      [{ scope: 'page', value: 'https://ExAmple.com/x' }],
      [{ scope: 'site', value: 'https://example.com/x' }],
    ];
    for (const data of invalid) {
      expect(() => parseDesktopFabExclusionsSection(data)).toThrow('invalid_desktop_fab_exclusions');
    }
    expect(storageManager.set).not.toHaveBeenCalled();
    expect(storageManager.remove).not.toHaveBeenCalled();
    expect(storage.size).toBe(0);
  });

  it('replaces exclusions by diff, preserving unchanged keys', async () => {
    const kept = parseDesktopFabExclusionsSection([{ scope: 'page', value: 'https://example.com/docs' }])[0];
    const droppedKey = getDesktopFabExclusionKey('site', 'https://example.org');
    storage.set(kept.key, true);
    storage.set(droppedKey, true);
    const added = parseDesktopFabExclusionsSection([{ scope: 'page', value: 'https://example.com:8080/x' }])[0];
    await replaceDesktopFabExclusions([kept, added]);
    const setKeys = storageManager.set.mock.calls.flatMap(([data]) => Object.keys(data));
    expect(setKeys).not.toContain(kept.key);
    expect(setKeys).toContain(added.key);
    expect(storageManager.remove).toHaveBeenCalledWith(droppedKey);
    expect(await listDesktopFabExclusions()).toEqual([kept, added]);
  });

  it('clears feature keys on empty replace while leaving unrelated keys', async () => {
    const first = getDesktopFabExclusionKey('page', 'https://example.com/docs');
    const second = getDesktopFabExclusionKey('site', 'https://example.org');
    storage.set(first, true);
    storage.set(second, true);
    storage.set('unrelated', true);
    await replaceDesktopFabExclusions([]);
    expect(await listDesktopFabExclusions()).toEqual([]);
    expect(storage.has('unrelated')).toBe(true);
  });

  it('propagates storage failures from replace', async () => {
    const added = parseDesktopFabExclusionsSection([{ scope: 'page', value: 'https://example.com/docs' }])[0];
    storageManager.set.mockRejectedValueOnce(new Error('write failed'));
    await expect(replaceDesktopFabExclusions([added])).rejects.toThrow('write failed');

    const existing = getDesktopFabExclusionKey('site', 'https://example.org');
    storage.set(existing, true);
    storageManager.remove.mockRejectedValueOnce(new Error('remove failed'));
    await expect(replaceDesktopFabExclusions([])).rejects.toThrow('remove failed');
  });

  it('restores a key after a pending removal when replace keeps it', async () => {
    const [entry] = parseDesktopFabExclusionsSection([{ scope: 'page', value: 'https://keep.test/a' }]);
    storage.set(entry.key, true);
    const removeStarted = deferred();
    const allowRemove = deferred();
    storageManager.remove.mockImplementationOnce(async key => {
      removeStarted.resolve();
      await allowRemove.promise;
      storage.delete(key);
    });

    const removing = removeDesktopFabExclusion(entry.key);
    await removeStarted.promise;
    const replacing = replaceDesktopFabExclusions([entry]);
    allowRemove.resolve();
    await Promise.all([removing, replacing]);
    expect(storage.get(entry.key)).toBe(true);
    expect(storageManager.set.mock.invocationCallOrder[0])
      .toBeGreaterThan(storageManager.remove.mock.invocationCallOrder[0]);
  });

  it('clears a pending addition when an empty replace runs before it settles', async () => {
    const key = getDesktopFabExclusionKey('page', 'https://pending.test/a');
    const setStarted = deferred();
    const allowSet = deferred();
    storageManager.set.mockImplementationOnce(async data => {
      setStarted.resolve();
      await allowSet.promise;
      for (const [entryKey, value] of Object.entries(data)) storage.set(entryKey, value);
    });

    const adding = addDesktopFabExclusion('page', 'https://pending.test/a');
    await setStarted.promise;
    const replacing = replaceDesktopFabExclusions([]);
    allowSet.resolve();
    await Promise.all([adding, replacing]);
    expect(storage.has(key)).toBe(false);
    expect(await listDesktopFabExclusions()).toEqual([]);
  });

  it('does not rewrite unchanged keys when replacing with the same list', async () => {
    const entries = parseDesktopFabExclusionsSection([
      { scope: 'page', value: 'https://example.com/docs' },
      { scope: 'site', value: 'example.org' },
    ]);
    for (const { key } of entries) storage.set(key, true);
    await replaceDesktopFabExclusions(entries);
    expect(storageManager.set).not.toHaveBeenCalled();
    expect(storageManager.remove).not.toHaveBeenCalled();
    expect(await listDesktopFabExclusions()).toEqual(entries);
  });

  it('keeps per-key replace operations concurrent across independent keys', async () => {
    const droppedKey = getDesktopFabExclusionKey('page', 'https://drop.test/a');
    const [added] = parseDesktopFabExclusionsSection([{ scope: 'page', value: 'https://added.test/b' }]);
    storage.set(droppedKey, true);
    const removeStarted = deferred();
    const allowRemove = deferred();
    storageManager.remove.mockImplementationOnce(async key => {
      removeStarted.resolve();
      await allowRemove.promise;
      storage.delete(key);
    });

    const replacing = replaceDesktopFabExclusions([added]);
    await removeStarted.promise;
    expect(storageManager.remove).toHaveBeenCalledWith(droppedKey);
    expect(storageManager.set).toHaveBeenCalledWith({ [added.key]: true });
    expect(storage.get(added.key)).toBe(true);
    allowRemove.resolve();
    await replacing;
    expect(storage.has(droppedKey)).toBe(false);
    expect(await listDesktopFabExclusions()).toEqual([added]);
  });

  it('resolves without throwing when all replacement operations succeed', async () => {
    resetStorageMocks();
    const [kept] = parseDesktopFabExclusionsSection([{ scope: 'page', value: 'https://example.com/docs' }]);
    const [added] = parseDesktopFabExclusionsSection([{ scope: 'page', value: 'https://example.com:8080/x' }]);
    storage.set(kept.key, true);
    await expect(replaceDesktopFabExclusions([kept, added])).resolves.toBeUndefined();
    expect(await listDesktopFabExclusions()).toEqual([kept, added]);
  });

  it('restores previous exclusions when a replacement operation fails', async () => {
    resetStorageMocks();
    const existingKey = getDesktopFabExclusionKey('page', 'https://restore.test/a');
    const [added] = parseDesktopFabExclusionsSection([{ scope: 'page', value: 'https://added.test/b' }]);
    storage.set(existingKey, true);
    storageManager.set.mockImplementation(async data => {
      const key = Object.keys(data)[0];
      if (key === added.key) throw new Error('set boom');
      for (const [k, v] of Object.entries(data)) storage.set(k, v);
    });
    await expect(replaceDesktopFabExclusions([added])).rejects.toThrow('set boom');
    expect(storage.get(existingKey)).toBe(true);
    expect(storage.has(added.key)).toBe(false);
  });

  it('rolls back a successful addition when a later addition fails', async () => {
    resetStorageMocks();
    const [k1] = parseDesktopFabExclusionsSection([{ scope: 'page', value: 'https://one.test/a' }]);
    const [k2] = parseDesktopFabExclusionsSection([{ scope: 'page', value: 'https://two.test/b' }]);
    const setStarted = deferred();
    const allowSet = deferred();
    storageManager.set.mockImplementation(async data => {
      const key = Object.keys(data)[0];
      if (key === k1.key) {
        setStarted.resolve();
        await allowSet.promise;
        storage.set(key, true);
        return;
      }
      if (key === k2.key) throw new Error('set boom');
      storage.set(key, true);
    });
    const replacing = replaceDesktopFabExclusions([k1, k2]);
    await setStarted.promise;
    allowSet.resolve();
    await expect(replacing).rejects.toThrow('set boom');
    expect(storage.has(k1.key)).toBe(false);      // successful add rolled back
    expect(storage.has(k2.key)).toBe(false);
    expect(storageManager.remove.mock.invocationCallOrder[0])
      .toBeGreaterThan(storageManager.set.mock.invocationCallOrder[0]);
  });

  it('preserves a successful pending removal on a failed replace', async () => {
    resetStorageMocks();
    const existingKey = getDesktopFabExclusionKey('page', 'https://restore.test/a');
    const [added] = parseDesktopFabExclusionsSection([{ scope: 'page', value: 'https://added.test/b' }]);
    storage.set(existingKey, true);
    const removeStarted = deferred();
    const allowRemove = deferred();
    storageManager.remove.mockImplementation(async keys => {
      const key = Array.isArray(keys) ? keys[0] : keys;
      if (key === existingKey) {
        removeStarted.resolve();
        await allowRemove.promise;
      }
      storage.delete(key);
    });
    storageManager.set.mockImplementation(async data => {
      const key = Object.keys(data)[0];
      if (key === added.key) throw new Error('set boom');
      for (const [k, v] of Object.entries(data)) storage.set(k, v);
    });
    const removing = removeDesktopFabExclusion(existingKey);
    await removeStarted.promise;
    const replacing = replaceDesktopFabExclusions([added]);
    allowRemove.resolve();
    await removing;
    await expect(replacing).rejects.toThrow('set boom');
    expect(storage.has(existingKey)).toBe(false);
    expect(storage.has(added.key)).toBe(false);
  });

  it('keeps a pending addition that succeeds during a failed replace', async () => {
    resetStorageMocks();
    const existingKey = getDesktopFabExclusionKey('page', 'https://restore.test/a');
    const [added] = parseDesktopFabExclusionsSection([{ scope: 'page', value: 'https://added.test/c' }]);
    const pendingKey = getDesktopFabExclusionKey('page', 'https://pending.test/b');
    storage.set(existingKey, true);
    const setStarted = deferred();
    const allowSet = deferred();
    storageManager.set.mockImplementation(async data => {
      const key = Object.keys(data)[0];
      if (key === pendingKey) {
        setStarted.resolve();
        await allowSet.promise;
      }
      if (key === added.key) throw new Error('set boom');
      for (const [k, v] of Object.entries(data)) storage.set(k, v);
    });
    const adding = addDesktopFabExclusion('page', 'https://pending.test/b');
    await setStarted.promise;
    const replacing = replaceDesktopFabExclusions([added]);
    allowSet.resolve();
    await adding;
    await expect(replacing).rejects.toThrow('set boom');
    expect(storage.get(pendingKey)).toBe(true);
    expect(storage.get(existingKey)).toBe(true);
    expect(storage.has(added.key)).toBe(false);
    expect(storageManager.remove).not.toHaveBeenCalled();
  });

  it('does not restore a pending addition whose write failed during a failed replace', async () => {
    resetStorageMocks();
    const existingKey = getDesktopFabExclusionKey('page', 'https://restore.test/a');
    const [added] = parseDesktopFabExclusionsSection([{ scope: 'page', value: 'https://added.test/c' }]);
    const pendingKey = getDesktopFabExclusionKey('page', 'https://pending.test/b');
    storage.set(existingKey, true);
    const setStarted = deferred();
    const allowSet = deferred();
    storageManager.set.mockImplementation(async data => {
      const key = Object.keys(data)[0];
      if (key === pendingKey) {
        setStarted.resolve();
        await allowSet.promise;
        throw new Error('add boom');
      }
      if (key === added.key) throw new Error('set boom');
      for (const [k, v] of Object.entries(data)) storage.set(k, v);
    });
    const adding = addDesktopFabExclusion('page', 'https://pending.test/b');
    await setStarted.promise;
    const replacing = replaceDesktopFabExclusions([added]);
    allowSet.resolve();
    await expect(adding).rejects.toThrow('add boom');
    await expect(replacing).rejects.toThrow('set boom');
    expect(storage.has(pendingKey)).toBe(false);
    expect(storage.get(existingKey)).toBe(true);
    expect(storage.has(added.key)).toBe(false);
  });

  it('does not resurrect a key removed during the deferred storage read', async () => {
    resetStorageMocks();
    const urlK = 'https://keep.test/k';
    const Kkey = getDesktopFabExclusionKey('page', urlK);
    const [addedFail] = parseDesktopFabExclusionsSection([{ scope: 'page', value: 'https://added.test/c' }]);
    const readStarted = deferred();
    const allowRead = deferred();
    const setStarted = deferred();
    const allowSet = deferred();
    storageManager.get.mockImplementationOnce(async () => {
      readStarted.resolve();
      await allowRead.promise;
      return Object.fromEntries(storage);
    });
    storageManager.set.mockImplementation(async data => {
      const key = Object.keys(data)[0];
      if (key === Kkey) {
        setStarted.resolve();
        await allowSet.promise;
        storage.set(Kkey, true);
        return;
      }
      if (key === addedFail.key) throw new Error('set boom');
      for (const [k, v] of Object.entries(data)) storage.set(k, v);
    });
    storageManager.remove.mockImplementation(async keys => {
      for (const key of Array.isArray(keys) ? keys : [keys]) storage.delete(key);
    });
    const adding = addDesktopFabExclusion('page', urlK);
    await setStarted.promise;                       // add op blocked
    const replacing = replaceDesktopFabExclusions([addedFail]);
    allowSet.resolve();                             // release add (K present)
    await adding;
    await readStarted.promise;                      // replace is now in its (deferred) read
    const removing = removeDesktopFabExclusion(Kkey);   // queued during the read
    await removing;                                 // K removed
    allowRead.resolve();
    await expect(replacing).rejects.toThrow('set boom');
    expect(storage.has(Kkey)).toBe(false);
    expect(storage.has(addedFail.key)).toBe(false);
  });

  it('reports recovery failure distinctly when restore also fails', async () => {
    resetStorageMocks();
    const [k1] = parseDesktopFabExclusionsSection([{ scope: 'page', value: 'https://one.test/a' }]);
    const [k2] = parseDesktopFabExclusionsSection([{ scope: 'page', value: 'https://two.test/b' }]);
    storageManager.set.mockImplementation(async data => {
      const key = Object.keys(data)[0];
      if (key === k2.key) throw new Error('set boom');
      storage.set(key, true);
    });
    storageManager.remove.mockImplementation(async () => { throw new Error('remove boom'); });
    const error = await replaceDesktopFabExclusions([k1, k2]).catch(e => e);
    expect(error.message).toBe('desktop_fab_exclusions_recovery_failed');
    expect(error.cause.message).toBe('set boom');
  });

  it('rolls back only successful additions and never restores old entries', async () => {
    resetStorageMocks();
    const Akey = getDesktopFabExclusionKey('page', 'https://keep.test/a');
    const [k1] = parseDesktopFabExclusionsSection([{ scope: 'page', value: 'https://one.test/a' }]);
    const [k2] = parseDesktopFabExclusionsSection([{ scope: 'page', value: 'https://two.test/b' }]);
    storage.set(Akey, true);
    storageManager.set.mockImplementation(async data => {
      const key = Object.keys(data)[0];
      if (key === k2.key) throw new Error('set boom');
      storage.set(key, true);
    });
    await expect(replaceDesktopFabExclusions([k1, k2])).rejects.toThrow('set boom');
    expect(storage.get(Akey)).toBe(true);       // removals never ran
    expect(storage.has(k1.key)).toBe(false);    // successful add rolled back
    expect(storage.has(k2.key)).toBe(false);
    expect(storageManager.set.mock.calls.some(([data]) => Akey in data)).toBe(false);
  });

  it('preserves a cross-context removal during a failed import', async () => {
    resetStorageMocks();
    const Akey = getDesktopFabExclusionKey('page', 'https://keep.test/a');
    const [B] = parseDesktopFabExclusionsSection([{ scope: 'page', value: 'https://added.test/b' }]);
    storage.set(Akey, true);
    const setStarted = deferred();
    const allowSet = deferred();
    storageManager.set.mockImplementation(async data => {
      const key = Object.keys(data)[0];
      if (key === B.key) {
        setStarted.resolve();
        await allowSet.promise;
        throw new Error('set boom');
      }
      storage.set(key, true);
    });
    const replacing = replaceDesktopFabExclusions([B]);
    await setStarted.promise;
    storage.delete(Akey);           // independent context removes A during the import
    allowSet.resolve();
    await expect(replacing).rejects.toThrow('set boom');
    expect(storage.has(Akey)).toBe(false);
    expect(storage.has(B.key)).toBe(false);
    expect(storageManager.set.mock.calls.some(([data]) => Akey in data)).toBe(false);
  });

  it('does not roll back a failed removal phase', async () => {
    resetStorageMocks();
    const Akey = getDesktopFabExclusionKey('page', 'https://keep.test/a');
    const Bkey = getDesktopFabExclusionKey('page', 'https://drop.test/b');
    storage.set(Akey, true);
    storage.set(Bkey, true);
    storageManager.remove.mockImplementation(async keys => {
      const key = Array.isArray(keys) ? keys[0] : keys;
      if (key === Bkey) throw new Error('remove boom');
      storage.delete(key);
    });
    const [A] = parseDesktopFabExclusionsSection([{ scope: 'page', value: 'https://keep.test/a' }]);
    await expect(replaceDesktopFabExclusions([A])).rejects.toThrow('remove boom');
    expect(storage.get(Akey)).toBe(true);
    expect(storage.get(Bkey)).toBe(true);
    expect(storageManager.set).not.toHaveBeenCalled();
  });
});
