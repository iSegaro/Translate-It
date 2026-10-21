// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIVE_DUBBING_ACTIONS } from '../constants.js';
import { installMediaObserver } from './mediaObserver.js';

const { MEDIA_OBSERVER_HELLO, MEDIA_OBSERVATION, MEDIA_OBSERVER_REFRESH, MEDIA_OBSERVER_STOP } = LIVE_DUBBING_ACTIONS;

function setPlayback(element, isPlaying) {
  Object.defineProperty(element, 'paused', { configurable: true, get: () => !isPlaying });
  Object.defineProperty(element, 'ended', { configurable: true, get: () => false });
  Object.defineProperty(element, 'muted', { configurable: true, get: () => false });
  Object.defineProperty(element, 'volume', { configurable: true, get: () => 1 });
}

function setAudibility(element, muted, volume) {
  let isMuted = muted;
  let currentVolume = volume;
  Object.defineProperty(element, 'muted', { configurable: true, get: () => isMuted });
  Object.defineProperty(element, 'volume', { configurable: true, get: () => currentVolume });
  return (nextMuted, nextVolume) => { isMuted = nextMuted; currentVolume = nextVolume; };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('live dubbing media observer', () => {
  let cleanup;
  afterEach(() => {
    cleanup?.();
    document.body.replaceChildren();
  });

  it('does not install duplicate observers for the same document', async () => {
    const runtime = {
      sendMessage: vi.fn(async (message) => message.action === MEDIA_OBSERVER_HELLO
        ? { observe: true, token: 'once', sessionToken: 'once-session' }
        : undefined),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    };
    const firstCleanup = installMediaObserver({ runtime, document });
    const secondCleanup = installMediaObserver({ runtime, document });
    cleanup = firstCleanup;
    await vi.waitFor(() => expect(runtime.sendMessage).toHaveBeenCalledTimes(2));
    expect(secondCleanup).toBe(firstCleanup);
  });

  it('does not duplicate installation after the module is re-evaluated', async () => {
    const listeners = new Set();
    const runtime = {
      sendMessage: vi.fn(async (message) => message.action === MEDIA_OBSERVER_HELLO
        ? { observe: true, token: 'reloaded', sessionToken: 'reloaded-session' }
        : undefined),
      onMessage: {
        addListener: vi.fn((listener) => listeners.add(listener)),
        removeListener: vi.fn((listener) => listeners.delete(listener)),
      },
    };
    const addDocumentListener = vi.spyOn(document, 'addEventListener');
    cleanup = installMediaObserver({ runtime, document });
    await vi.waitFor(() => expect(runtime.sendMessage).toHaveBeenCalledTimes(2));

    vi.resetModules();
    const { installMediaObserver: reloadedInstall } = await import('./mediaObserver.js');
    const secondCleanup = reloadedInstall({ runtime, document });
    await Promise.resolve();

    expect(runtime.sendMessage.mock.calls.filter(([message]) => message.action === MEDIA_OBSERVER_HELLO)).toHaveLength(1);
    expect(runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
    expect(listeners.size).toBe(1);
    expect(addDocumentListener.mock.calls.filter(([name]) => ['play', 'playing', 'pause', 'ended', 'volumechange'].includes(name))).toHaveLength(5);
    expect(secondCleanup).toBe(cleanup);
    addDocumentListener.mockRestore();
  });

  it('waits for authorization, reports only aggregate playback, and refreshes snapshots', async () => {
    const messages = [];
    const listeners = new Set();
    let token = 'first';
    const runtime = {
      sendMessage: vi.fn(async (message) => {
        messages.push(message);
        if (message.action === MEDIA_OBSERVER_HELLO) return { observe: true, token, sessionToken: token };
      }),
      onMessage: {
        addListener: (listener) => listeners.add(listener),
        removeListener: (listener) => listeners.delete(listener),
      },
    };
    const media = document.createElement('video');
    setPlayback(media, true);
    document.body.append(media);

    cleanup = installMediaObserver({ runtime, document });
    expect(messages).toEqual([{ action: MEDIA_OBSERVER_HELLO }]);
    await vi.waitFor(() => expect(messages).toHaveLength(2));
    expect(messages[1]).toEqual({
      action: MEDIA_OBSERVATION,
      data: { token: 'first', revision: 1, playing: true },
    });

    setPlayback(media, false);
    media.dispatchEvent(new Event('pause'));
    expect(messages.at(-1).data).toEqual({ token: 'first', revision: 2, playing: false });

    token = 'second';
    [...listeners][0]({ action: MEDIA_OBSERVER_REFRESH });
    await vi.waitFor(() => expect(messages.at(-1).data.token).toBe('second'));
    expect(messages.at(-1).data.revision).toBe(3);
    expect(Object.keys(messages.at(-1).data).sort()).toEqual(['playing', 'revision', 'token']);
  });

  it('includes playing media in a pre-existing open shadow root in the authorized snapshot', async () => {
    const runtime = {
      sendMessage: vi.fn(async (message) => message.action === MEDIA_OBSERVER_HELLO
        ? { observe: true, token: 'shadow-token', sessionToken: 'shadow-session' }
        : undefined),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    };
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    const media = document.createElement('video');
    setPlayback(media, true);
    shadow.append(media);
    document.body.append(host);

    cleanup = installMediaObserver({ runtime, document });
    await vi.waitFor(() => expect(runtime.sendMessage).toHaveBeenCalledTimes(2));
    expect(runtime.sendMessage.mock.calls.at(-1)[0].data).toEqual({
      token: 'shadow-token', revision: 1, playing: true,
    });
  });

  it('tracks media added to an open shadow root and listens for its playback events', async () => {
    const runtime = {
      sendMessage: vi.fn(async (message) => message.action === MEDIA_OBSERVER_HELLO
        ? { observe: true, token: 'shadow-token', sessionToken: 'shadow-session' }
        : undefined),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    };
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    document.body.append(host);
    cleanup = installMediaObserver({ runtime, document });
    await vi.waitFor(() => expect(runtime.sendMessage).toHaveBeenCalledTimes(2));

    const media = document.createElement('audio');
    setPlayback(media, false);
    shadow.append(media);
    await Promise.resolve();
    await Promise.resolve();
    setPlayback(media, true);
    media.dispatchEvent(new Event('playing'));
    expect(runtime.sendMessage).toHaveBeenCalledTimes(3);
    expect(runtime.sendMessage.mock.calls.at(-1)[0].data).toEqual({
      token: 'shadow-token', revision: 2, playing: true,
    });
  });

  it('disarms on STOP and observes newly inserted media while authorized', async () => {
    const listeners = new Set();
    const runtime = {
      sendMessage: vi.fn(async (message) => message.action === MEDIA_OBSERVER_HELLO
        ? { observe: true, token: 't', sessionToken: 'session-t' }
        : undefined),
      onMessage: { addListener: (listener) => listeners.add(listener), removeListener: (listener) => listeners.delete(listener) },
    };
    cleanup = installMediaObserver({ runtime, document });
    await vi.waitFor(() => expect(runtime.sendMessage).toHaveBeenCalledTimes(2));
    const media = document.createElement('audio');
    setPlayback(media, true);
    document.body.append(media);
    await vi.waitFor(() => expect(runtime.sendMessage).toHaveBeenCalledTimes(3));
    [...listeners][0]({ action: MEDIA_OBSERVER_STOP, sessionToken: 'session-t' });
    setPlayback(media, false);
    media.dispatchEvent(new Event('pause'));
    expect(runtime.sendMessage).toHaveBeenCalledTimes(4);
    [...listeners][0]({ action: MEDIA_OBSERVER_STOP, data: { sessionToken: 'session-t' } });
    setPlayback(media, true);
    media.dispatchEvent(new Event('playing'));
    expect(runtime.sendMessage).toHaveBeenCalledTimes(4);
  });

  it('keeps the refreshed observer active when an older report rejects', async () => {
    const listeners = new Set();
    const oldReport = deferred();
    let helloCount = 0;
    let reportCount = 0;
    const runtime = {
      sendMessage: vi.fn((message) => {
        if (message.action === MEDIA_OBSERVER_HELLO) {
          helloCount += 1;
          const sessionToken = helloCount === 1 ? 'old-session' : 'new-session';
          return Promise.resolve({ observe: true, token: helloCount === 1 ? 'old' : 'new', sessionToken });
        }
        reportCount += 1;
        return reportCount === 1 ? oldReport.promise : Promise.resolve();
      }),
      onMessage: { addListener: (listener) => listeners.add(listener), removeListener: (listener) => listeners.delete(listener) },
    };
    const media = document.createElement('video');
    setPlayback(media, true);
    document.body.append(media);
    cleanup = installMediaObserver({ runtime, document });
    await vi.waitFor(() => expect(reportCount).toBe(1));
    [...listeners][0]({ action: MEDIA_OBSERVER_REFRESH });
    await vi.waitFor(() => expect(reportCount).toBe(2));
    oldReport.reject(new Error('stale report failure'));
    await Promise.resolve();

    setPlayback(media, false);
    media.dispatchEvent(new Event('pause'));
    expect(runtime.sendMessage.mock.calls.at(-1)[0].data).toEqual({ token: 'new', revision: 3, playing: false });
  });

  it('ignores a refresh HELLO response that arrives after matching STOP', async () => {
    const hello = deferred();
    const listeners = new Set();
    let helloCount = 0;
    const runtime = {
      sendMessage: vi.fn((message) => {
        if (message.action !== MEDIA_OBSERVER_HELLO) return Promise.resolve();
        helloCount += 1;
        return helloCount === 1 ? Promise.resolve({ observe: true, token: 'current', sessionToken: 'current-session' }) : hello.promise;
      }),
      onMessage: { addListener: (listener) => listeners.add(listener), removeListener: (listener) => listeners.delete(listener) },
    };
    cleanup = installMediaObserver({ runtime, document });
    await vi.waitFor(() => expect(runtime.sendMessage).toHaveBeenCalledTimes(2));
    [...listeners][0]({ action: MEDIA_OBSERVER_REFRESH });
    [...listeners][0]({ action: MEDIA_OBSERVER_STOP, data: { sessionToken: 'current-session' } });
    hello.resolve({ observe: true, token: 'late', sessionToken: 'late-session' });
    await Promise.resolve();
    expect(runtime.sendMessage).toHaveBeenCalledTimes(3);
    expect(listeners.size).toBe(1);
  });

  it('keeps aggregate playback true when one player pauses and reports false when the last is removed', async () => {
    const runtime = {
      sendMessage: vi.fn(async (message) => message.action === MEDIA_OBSERVER_HELLO
        ? { observe: true, token: 't', sessionToken: 'session-t' }
        : undefined),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    };
    const first = document.createElement('video');
    const second = document.createElement('audio');
    setPlayback(first, true);
    setPlayback(second, true);
    document.body.append(first, second);
    cleanup = installMediaObserver({ runtime, document });
    await vi.waitFor(() => expect(runtime.sendMessage).toHaveBeenCalledTimes(2));
    setPlayback(first, false);
    first.dispatchEvent(new Event('pause'));
    expect(runtime.sendMessage).toHaveBeenCalledTimes(2);
    second.remove();
    await vi.waitFor(() => expect(runtime.sendMessage).toHaveBeenCalledTimes(3));
    expect(runtime.sendMessage.mock.calls.at(-1)[0].data).toMatchObject({ token: 't', playing: false });
    expect(runtime.sendMessage.mock.calls.at(-1)[0].data.revision).toBe(2);
  });

  it('ignores an old session STOP after refresh authorizes a new session', async () => {
    const listeners = new Set();
    let helloCount = 0;
    const runtime = {
      sendMessage: vi.fn(async (message) => message.action === MEDIA_OBSERVER_HELLO
        ? { observe: true, token: `token-${++helloCount}`, sessionToken: `session-${helloCount}` }
        : undefined),
      onMessage: { addListener: (listener) => listeners.add(listener), removeListener: (listener) => listeners.delete(listener) },
    };
    const media = document.createElement('audio');
    setPlayback(media, true);
    document.body.append(media);
    cleanup = installMediaObserver({ runtime, document });
    await vi.waitFor(() => expect(runtime.sendMessage).toHaveBeenCalledTimes(2));
    const queuedOldStop = { action: MEDIA_OBSERVER_STOP, data: { sessionToken: 'session-1' } };
    [...listeners][0]({ action: MEDIA_OBSERVER_REFRESH });
    await vi.waitFor(() => expect(runtime.sendMessage).toHaveBeenCalledTimes(4));
    [...listeners][0](queuedOldStop);
    setPlayback(media, false);
    media.dispatchEvent(new Event('pause'));
    expect(runtime.sendMessage.mock.calls.at(-1)[0].data.token).toBe('token-2');
    expect(runtime.sendMessage).toHaveBeenCalledTimes(5);
  });

  it('reports false on pagehide and reauthorizes with a fresh snapshot on BFCache pageshow', async () => {
    const runtime = {
      sendMessage: vi.fn(async (message) => message.action === MEDIA_OBSERVER_HELLO
        ? { observe: true, token: 'frame-token', sessionToken: 'session-token' }
        : undefined),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    };
    const media = document.createElement('video');
    setPlayback(media, true);
    document.body.append(media);
    cleanup = installMediaObserver({ runtime, document });
    await vi.waitFor(() => expect(runtime.sendMessage).toHaveBeenCalledTimes(2));
    const pagehide = new Event('pagehide');
    Object.defineProperty(pagehide, 'persisted', { value: true });
    window.dispatchEvent(pagehide);
    expect(runtime.sendMessage.mock.calls.at(-1)[0].data).toEqual({ token: 'frame-token', revision: 2, playing: false });
    setPlayback(media, false);
    window.dispatchEvent(new Event('pageshow'));
    await vi.waitFor(() => expect(runtime.sendMessage).toHaveBeenCalledTimes(5));
    expect(runtime.sendMessage.mock.calls.at(-1)[0].data).toEqual({ token: 'frame-token', revision: 3, playing: false });
  });

  it('reports iframe removal even when its own media aggregate stays playing', async () => {
    const runtime = {
      sendMessage: vi.fn(async (message) => message.action === MEDIA_OBSERVER_HELLO
        ? { observe: true, token: 't', sessionToken: 's' }
        : undefined),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    };
    const media = document.createElement('video');
    const frame = document.createElement('iframe');
    setPlayback(media, true);
    document.body.append(media, frame);
    cleanup = installMediaObserver({ runtime, document });
    await vi.waitFor(() => expect(runtime.sendMessage).toHaveBeenCalledTimes(2));
    frame.remove();
    await vi.waitFor(() => expect(runtime.sendMessage).toHaveBeenCalledTimes(3));
    expect(runtime.sendMessage.mock.calls.at(-1)[0].data).toEqual({
      token: 't', revision: 2, playing: true, frameStructureChanged: true,
    });
  });

  it('ignores muted and zero-volume playback until it becomes audible', async () => {
    const runtime = {
      sendMessage: vi.fn(async (message) => message.action === MEDIA_OBSERVER_HELLO
        ? { observe: true, token: 't', sessionToken: 's' }
        : undefined),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    };
    const media = document.createElement('video');
    setPlayback(media, true);
    const setAudible = setAudibility(media, true, 1);
    document.body.append(media);
    cleanup = installMediaObserver({ runtime, document });
    await vi.waitFor(() => expect(runtime.sendMessage).toHaveBeenCalledTimes(2));
    expect(runtime.sendMessage.mock.calls.at(-1)[0].data.playing).toBe(false);
    setAudible(false, 0);
    media.dispatchEvent(new Event('volumechange'));
    expect(runtime.sendMessage).toHaveBeenCalledTimes(2);
    setAudible(false, 1);
    media.dispatchEvent(new Event('volumechange'));
    expect(runtime.sendMessage.mock.calls.at(-1)[0].data.playing).toBe(true);
    expect(runtime.sendMessage).toHaveBeenCalledTimes(3);
  });
});
