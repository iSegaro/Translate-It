import { beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';
import { translationUiSessionState } from './TranslationUiSessionState.js';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
}));

function deferred() {
  let resolve;
  const promise = new Promise(nextResolve => { resolve = nextResolve; });
  return { promise, resolve };
}

vi.mock('webextension-polyfill', () => ({
  default: { storage: { session: mocks } },
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({ warn: vi.fn() }),
}));

describe('translationUiSessionState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    browser.storage.session = mocks;
    mocks.get.mockReset().mockResolvedValue({});
    mocks.set.mockReset().mockResolvedValue(undefined);
    mocks.remove.mockReset().mockResolvedValue(undefined);
  });

  it('isolates popup and sidepanel keys', async () => {
    await translationUiSessionState.save('popup', { revision: 1, draftSource: 'popup' });
    await translationUiSessionState.save('sidepanel', { revision: 1, draftSource: 'sidepanel' });

    expect(mocks.set).toHaveBeenCalledWith({ 'translation-ui-session:popup': expect.any(Object) });
    expect(mocks.set).toHaveBeenCalledWith({ 'translation-ui-session:sidepanel': expect.any(Object) });
  });

  it('loads and clears only requested context', async () => {
    mocks.get.mockResolvedValue({ 'translation-ui-session:popup': { draftSource: 'draft' } });

    await expect(translationUiSessionState.load('popup')).resolves.toEqual({ draftSource: 'draft' });
    await translationUiSessionState.clear('popup', 2);

    expect(mocks.get).toHaveBeenCalledWith('translation-ui-session:popup');
    expect(mocks.remove).toHaveBeenCalledWith('translation-ui-session:popup');
  });

  it('rejects an older revision after a newer snapshot was accepted', async () => {
    await translationUiSessionState.save('sidepanel', { revision: 10, draftSource: 'new' });
    await expect(translationUiSessionState.save('sidepanel', { revision: 9, draftSource: 'old' })).resolves.toBe(false);

    expect(mocks.set).toHaveBeenCalledTimes(1);
    expect(mocks.set).toHaveBeenCalledWith({
      'translation-ui-session:sidepanel': expect.objectContaining({ draftSource: 'new' }),
    });
  });

  it('seeds revision protection from a loaded snapshot', async () => {
    mocks.get.mockResolvedValue({ 'translation-ui-session:popup': { revision: 10 } });

    await translationUiSessionState.load('popup');
    await expect(translationUiSessionState.save('popup', { revision: 9 })).resolves.toBe(false);

    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('rejects a stale clear without removing newer state', async () => {
    await translationUiSessionState.save('sidepanel', { revision: 20, draftSource: 'new' });

    await expect(translationUiSessionState.clear('sidepanel', 19)).resolves.toBe(false);

    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('skips a queued clear superseded by a newer revision', async () => {
    const firstSave = deferred();
    mocks.set
      .mockImplementationOnce(() => firstSave.promise)
      .mockResolvedValueOnce(undefined);

    const initial = translationUiSessionState.save('popup', { revision: 20, draftSource: 'old' });
    await Promise.resolve();
    const staleClear = translationUiSessionState.clear('popup', 20);
    const newer = translationUiSessionState.save('popup', { revision: 21, draftSource: 'new' });
    firstSave.resolve();

    await expect(initial).resolves.toBe(false);
    await expect(staleClear).resolves.toBe(false);
    await expect(newer).resolves.toBe(true);
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.set).toHaveBeenLastCalledWith({
      'translation-ui-session:popup': expect.objectContaining({ revision: 21, draftSource: 'new' }),
    });
  });

  it('fails safely without session storage or local fallback', async () => {
    browser.storage.session = undefined;

    await expect(translationUiSessionState.load('popup')).resolves.toBeNull();
    await expect(translationUiSessionState.save('popup', { revision: 1 })).resolves.toBe(false);
    await expect(translationUiSessionState.clear('popup', 1)).resolves.toBe(false);

    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('swallows write failures without a durable fallback', async () => {
    mocks.set.mockRejectedValue(new Error('quota'));

    await expect(translationUiSessionState.save('popup', { revision: 30 })).resolves.toBe(false);

    expect(mocks.set).toHaveBeenCalledTimes(1);
    expect(browser.storage.local).toBeUndefined();
  });
});
