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

vi.mock('@/shared/storage/core/StorageCore.js', () => ({ storageManager }));

const {
  DESKTOP_FAB_EXCLUSION_PREFIX,
  addDesktopFabExclusion,
  getDesktopFabExclusionKey,
  listDesktopFabExclusions,
  removeDesktopFabExclusion,
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
});
