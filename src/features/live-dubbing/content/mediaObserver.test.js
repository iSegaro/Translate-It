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
    vi.unstubAllGlobals();
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

  it('discovers playing media in a late-attached shadow root on authorized refresh', async () => {
    const listeners = new Set();
    const messages = [];
    let authorizations = 0;
    const runtime = {
      sendMessage: vi.fn(async (message) => {
        messages.push(message);
        if (message.action === MEDIA_OBSERVER_HELLO) {
          authorizations += 1;
          return {
            observe: true,
            token: `refresh-${authorizations}`,
            sessionToken: `session-${authorizations}`,
          };
        }
      }),
      onMessage: {
        addListener: (listener) => listeners.add(listener),
        removeListener: (listener) => listeners.delete(listener),
      },
    };

    cleanup = installMediaObserver({ runtime, document });
    await vi.waitFor(() => expect(messages).toHaveLength(2));
    expect(messages[1].data).toEqual({ token: 'refresh-1', revision: 1, playing: false });

    const host = document.createElement('div');
    document.body.append(host);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const root = host.attachShadow({ mode: 'open' });
    const media = document.createElement('video');
    setPlayback(media, true);
    root.append(media);
    media.dispatchEvent(new Event('playing'));
    expect(messages).toHaveLength(2);

    [...listeners][0]({ action: MEDIA_OBSERVER_REFRESH });
    await vi.waitFor(() => expect(messages).toHaveLength(4));
    expect(messages[2]).toEqual({ action: MEDIA_OBSERVER_HELLO });
    expect(messages[3]).toEqual({
      action: MEDIA_OBSERVATION,
      data: { token: 'refresh-2', revision: 2, playing: true },
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

  it('walks only an added subtree for unrelated mutations in a large document', async () => {
    const runtime = {
      sendMessage: vi.fn(async (message) => message.action === MEDIA_OBSERVER_HELLO
        ? { observe: true, token: 'large-token', sessionToken: 'large-session' }
        : undefined),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    };
    document.body.replaceChildren(...Array.from({ length: 1500 }, () => document.createElement('div')));
    const nativeCreateTreeWalker = document.createTreeWalker.bind(document);
    let visitedElements = 0;
    const createTreeWalker = vi.spyOn(document, 'createTreeWalker').mockImplementation((root, ...args) => {
      const walker = nativeCreateTreeWalker(root, ...args);
      if (root.nodeType === Node.ELEMENT_NODE) visitedElements += 1;
      const nextNode = walker.nextNode.bind(walker);
      walker.nextNode = () => {
        const node = nextNode();
        if (node) visitedElements += 1;
        return node;
      };
      return walker;
    });
    try {
      cleanup = installMediaObserver({ runtime, document });
      await vi.waitFor(() => expect(runtime.sendMessage).toHaveBeenCalledTimes(2));
      const initialVisits = visitedElements;

      document.body.append(document.createElement('section'));
      await vi.waitFor(() => expect(visitedElements).toBeGreaterThan(initialVisits));

      expect(initialVisits).toBe(1503);
      expect(visitedElements - initialVisits).toBe(1);
      expect(createTreeWalker).toHaveBeenCalledTimes(2);
    } finally {
      createTreeWalker.mockRestore();
    }
  });

  it('walks overlapping added subtrees only once', async () => {
    const observers = [];
    class ControlledMutationObserver {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe(target) { this.target = target; }
      disconnect() {}
      takeRecords() { return []; }
    }
    vi.stubGlobal('MutationObserver', ControlledMutationObserver);
    const runtime = {
      sendMessage: vi.fn(async (message) => message.action === MEDIA_OBSERVER_HELLO
        ? { observe: true, token: 'overlap-token', sessionToken: 'overlap-session' }
        : undefined),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    };
    const nativeCreateTreeWalker = document.createTreeWalker.bind(document);
    let visitedElements = 0;
    const createTreeWalker = vi.spyOn(document, 'createTreeWalker').mockImplementation((root, ...args) => {
      const walker = nativeCreateTreeWalker(root, ...args);
      if (root.nodeType === Node.ELEMENT_NODE) visitedElements += 1;
      const nextNode = walker.nextNode.bind(walker);
      walker.nextNode = () => {
        const node = nextNode();
        if (node) visitedElements += 1;
        return node;
      };
      return walker;
    });
    try {
      cleanup = installMediaObserver({ runtime, document });
      await vi.waitFor(() => expect(runtime.sendMessage).toHaveBeenCalledTimes(2));
      const initialVisits = visitedElements;
      const parent = document.createElement('div');
      const child = document.createElement('section');
      child.append(document.createElement('video'));
      parent.append(child);
      document.body.append(parent);
      const documentObserver = observers.find(({ target }) => target === document.documentElement);

      documentObserver.callback([
        { addedNodes: [parent], removedNodes: [] },
        { addedNodes: [child], removedNodes: [] },
      ]);

      expect(visitedElements - initialVisits).toBe(3);
    } finally {
      createTreeWalker.mockRestore();
    }
  });

  it('keeps ancestor checks bounded for many sibling additions', async () => {
    const observers = [];
    class ControlledMutationObserver {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe(target) { this.target = target; }
      disconnect() {}
      takeRecords() { return []; }
    }
    vi.stubGlobal('MutationObserver', ControlledMutationObserver);
    const runtime = {
      sendMessage: vi.fn(async (message) => message.action === MEDIA_OBSERVER_HELLO
        ? { observe: true, token: 'siblings-token', sessionToken: 'siblings-session' }
        : undefined),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    };
    const nativeCreateTreeWalker = document.createTreeWalker.bind(document);
    let addedTreeWalks = 0;
    const createTreeWalker = vi.spyOn(document, 'createTreeWalker').mockImplementation((root, ...args) => {
      if (root.nodeType === Node.ELEMENT_NODE) addedTreeWalks += 1;
      return nativeCreateTreeWalker(root, ...args);
    });
    const contains = vi.spyOn(Element.prototype, 'contains');

    try {
      cleanup = installMediaObserver({ runtime, document });
      await vi.waitFor(() => expect(runtime.sendMessage).toHaveBeenCalledTimes(2));
      addedTreeWalks = 0;
      const siblings = Array.from({ length: 300 }, () => document.createElement('div'));
      document.body.append(...siblings);
      const documentObserver = observers.find(({ target }) => target === document.documentElement);

      documentObserver.callback([{ addedNodes: siblings, removedNodes: [] }]);

      expect(addedTreeWalks).toBe(300);
      expect(contains).not.toHaveBeenCalled();
    } finally {
      contains.mockRestore();
      createTreeWalker.mockRestore();
    }
  });

  it('discovers nested open shadow roots added after the initial snapshot', async () => {
    const runtime = {
      sendMessage: vi.fn(async (message) => message.action === MEDIA_OBSERVER_HELLO
        ? { observe: true, token: 'nested-token', sessionToken: 'nested-session' }
        : undefined),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    };
    const outerHost = document.createElement('div');
    outerHost.attachShadow({ mode: 'open' });
    document.body.append(outerHost);
    cleanup = installMediaObserver({ runtime, document });
    await vi.waitFor(() => expect(runtime.sendMessage).toHaveBeenCalledTimes(2));

    const nestedHost = document.createElement('div');
    const nestedRoot = nestedHost.attachShadow({ mode: 'open' });
    const media = document.createElement('video');
    setPlayback(media, false);
    nestedRoot.append(media);
    outerHost.shadowRoot.append(nestedHost);
    await new Promise((resolve) => setTimeout(resolve, 0));
    setPlayback(media, true);
    media.dispatchEvent(new Event('playing'));

    expect(runtime.sendMessage.mock.calls.at(-1)[0].data).toEqual({
      token: 'nested-token', revision: 2, playing: true,
    });
  });

  it('keeps moved media tracked and reports iframe removal in a nested shadow root', async () => {
    const runtime = {
      sendMessage: vi.fn(async (message) => message.action === MEDIA_OBSERVER_HELLO
        ? { observe: true, token: 'move-token', sessionToken: 'move-session' }
        : undefined),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    };
    const firstParent = document.createElement('div');
    const secondParent = document.createElement('div');
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    const nestedHost = document.createElement('div');
    const nestedRoot = nestedHost.attachShadow({ mode: 'open' });
    const frame = document.createElement('iframe');
    const media = document.createElement('video');
    setPlayback(media, true);
    nestedRoot.append(frame, media);
    root.append(nestedHost);
    firstParent.append(host);
    document.body.append(firstParent, secondParent);
    cleanup = installMediaObserver({ runtime, document });
    await vi.waitFor(() => expect(runtime.sendMessage).toHaveBeenCalledTimes(2));

    host.remove();
    secondParent.append(host);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(runtime.sendMessage).toHaveBeenCalledTimes(3);
    expect(runtime.sendMessage.mock.calls.at(-1)[0].data).toMatchObject({
      revision: 2, playing: true, frameStructureChanged: true,
    });
    setPlayback(media, false);
    media.dispatchEvent(new Event('pause'));
    expect(runtime.sendMessage.mock.calls.at(-1)[0].data).toMatchObject({ revision: 3, playing: false });

    frame.remove();
    await vi.waitFor(() => expect(runtime.sendMessage.mock.calls.at(-1)[0].data.frameStructureChanged).toBe(true));
  });

  it('deduplicates rapid add/remove/move records while preserving iframe change facts', async () => {
    const observers = [];
    class ControlledMutationObserver {
      constructor(callback) {
        this.callback = callback;
        observers.push(this);
      }
      observe(target) { this.target = target; }
      disconnect() {}
      takeRecords() { return []; }
    }
    vi.stubGlobal('MutationObserver', ControlledMutationObserver);
    const runtime = {
      sendMessage: vi.fn(async (message) => message.action === MEDIA_OBSERVER_HELLO
        ? { observe: true, token: 'batch-token', sessionToken: 'batch-session' }
        : undefined),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    };
    const firstParent = document.createElement('div');
    const secondParent = document.createElement('div');
    document.body.append(firstParent, secondParent);
    cleanup = installMediaObserver({ runtime, document });
    await vi.waitFor(() => expect(runtime.sendMessage).toHaveBeenCalledTimes(2));

    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    const frame = document.createElement('iframe');
    root.append(frame);
    const media = document.createElement('video');
    setPlayback(media, true);
    firstParent.append(host, media);
    secondParent.append(host, media);
    const documentObserver = observers.find(({ target }) => target === document.documentElement);
    documentObserver.callback([
      { addedNodes: [host, media], removedNodes: [] },
      { addedNodes: [], removedNodes: [host, media] },
      { addedNodes: [host, media], removedNodes: [] },
    ]);

    expect(runtime.sendMessage).toHaveBeenCalledTimes(3);
    expect(runtime.sendMessage.mock.calls.at(-1)[0].data).toEqual({
      token: 'batch-token', revision: 2, playing: true, frameStructureChanged: true,
    });
    expect(observers.filter(({ target }) => target === root)).toHaveLength(1);
    media.dispatchEvent(new Event('playing'));
    expect(runtime.sendMessage).toHaveBeenCalledTimes(3);
  });

  it('releases detached shadow roots while keeping connected roots and the document observer active', async () => {
    const runtime = {
      sendMessage: vi.fn(async (message) => message.action === MEDIA_OBSERVER_HELLO
        ? { observe: true, token: 'shadow-token', sessionToken: 'shadow-session' }
        : undefined),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    };
    const observedBy = new Map();
    const disconnected = new Set();
    const nativeObserve = MutationObserver.prototype.observe;
    const nativeDisconnect = MutationObserver.prototype.disconnect;
    const observe = vi.spyOn(MutationObserver.prototype, 'observe').mockImplementation(function (target, options) {
      observedBy.set(target, this);
      return nativeObserve.call(this, target, options);
    });
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect').mockImplementation(function () {
      disconnected.add(this);
      return nativeDisconnect.call(this);
    });
    const connectedHost = document.createElement('div');
    const connectedRoot = connectedHost.attachShadow({ mode: 'open' });
    const detachedRoots = [];
    const addHost = () => {
      const replacement = document.createElement('div');
      const root = replacement.attachShadow({ mode: 'open' });
      vi.spyOn(root, 'removeEventListener');
      detachedRoots.push(root);
      return replacement;
    };
    let currentHost = addHost();
    document.body.append(currentHost, connectedHost);
    cleanup = installMediaObserver({ runtime, document });
    await vi.waitFor(() => expect(runtime.sendMessage).toHaveBeenCalledTimes(2));

    for (let index = 0; index < 3; index += 1) {
      const replacement = addHost();
      currentHost.replaceWith(replacement);
      currentHost = replacement;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    await vi.waitFor(() => {
      for (const root of detachedRoots.slice(0, -1)) {
        expect(root.removeEventListener).toHaveBeenCalledWith('play', expect.any(Function), true);
        expect(disconnected.has(observedBy.get(root))).toBe(true);
      }
    });

    const documentObserver = observedBy.get(document.documentElement);
    expect(disconnected.has(documentObserver)).toBe(false);
    expect(disconnected.has(observedBy.get(connectedRoot))).toBe(false);

    const media = document.createElement('video');
    setPlayback(media, true);
    currentHost.shadowRoot.append(media);
    await vi.waitFor(() => expect(observedBy.has(media.getRootNode())).toBe(true));
    setPlayback(media, false);
    media.dispatchEvent(new Event('pause'));
    expect(runtime.sendMessage.mock.calls.at(-1)[0].data.playing).toBe(false);
    setPlayback(media, true);
    media.dispatchEvent(new Event('playing'));
    expect(runtime.sendMessage.mock.calls.at(-1)[0].data.playing).toBe(true);
    const currentRoot = currentHost.shadowRoot;
    const detachedObserver = observedBy.get(currentRoot);
    currentHost.remove();
    await vi.waitFor(() => expect(disconnected.has(detachedObserver)).toBe(true));
    const beforeStaleEvent = runtime.sendMessage.mock.calls.length;
    setPlayback(media, false);
    media.dispatchEvent(new Event('pause'));
    expect(runtime.sendMessage).toHaveBeenCalledTimes(beforeStaleEvent);
    document.body.append(currentHost);
    await vi.waitFor(() => expect(observe.mock.calls.filter(([target]) => target === currentRoot)).toHaveLength(2));
    expect(observedBy.get(currentRoot)).not.toBe(detachedObserver);
    for (const root of detachedRoots) root.removeEventListener.mockRestore();
    observe.mockRestore();
    disconnect.mockRestore();
  });

  it('reports iframe removal queued in a shadow root before its detached host is collected', async () => {
    const observers = [];
    class ControlledMutationObserver {
      constructor(callback) {
        this.callback = callback;
        this.records = [];
        observers.push(this);
      }
      observe(target) { this.target = target; }
      disconnect() {}
      takeRecords() {
        const records = this.records;
        this.records = [];
        return records;
      }
    }
    vi.stubGlobal('MutationObserver', ControlledMutationObserver);
    const runtime = {
      sendMessage: vi.fn(async (message) => message.action === MEDIA_OBSERVER_HELLO
        ? { observe: true, token: 'shadow-token', sessionToken: 'shadow-session' }
        : undefined),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    };
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    const frame = document.createElement('iframe');
    root.append(frame);
    const secondHost = document.createElement('div');
    const secondRoot = secondHost.attachShadow({ mode: 'open' });
    const secondFrame = document.createElement('iframe');
    secondRoot.append(secondFrame);
    document.body.append(host, secondHost);
    cleanup = installMediaObserver({ runtime, document });
    await vi.waitFor(() => expect(runtime.sendMessage).toHaveBeenCalledTimes(2));

    const rootObserver = observers.find(({ target }) => target === root);
    const secondRootObserver = observers.find(({ target }) => target === secondRoot);
    const documentObserver = observers.find(({ target }) => target === document.documentElement);
    const takeRecords = vi.spyOn(ControlledMutationObserver.prototype, 'takeRecords');
    rootObserver.records.push({ removedNodes: [frame] });
    secondRootObserver.records.push({ removedNodes: [secondFrame] });
    frame.remove();
    secondFrame.remove();
    host.remove();
    secondHost.remove();
    documentObserver.callback([{ addedNodes: [], removedNodes: [host, secondHost] }]);

    expect(runtime.sendMessage.mock.calls.at(-1)[0].data).toEqual({
      token: 'shadow-token', revision: 2, playing: false, frameStructureChanged: true,
    });
    expect(takeRecords).toHaveBeenCalledTimes(2);
  });

  it('reports an iframe that remains inside a detached shadow root', async () => {
    const observers = [];
    class ControlledMutationObserver {
      constructor(callback) {
        this.callback = callback;
        this.records = [];
        observers.push(this);
      }
      observe(target) { this.target = target; }
      disconnect() {}
      takeRecords() {
        const records = this.records;
        this.records = [];
        return records;
      }
    }
    vi.stubGlobal('MutationObserver', ControlledMutationObserver);
    const runtime = {
      sendMessage: vi.fn(async (message) => message.action === MEDIA_OBSERVER_HELLO
        ? { observe: true, token: 'shadow-token', sessionToken: 'shadow-session' }
        : undefined),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    };
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    const frame = document.createElement('iframe');
    root.append(frame);
    document.body.append(host);
    cleanup = installMediaObserver({ runtime, document });
    await vi.waitFor(() => expect(runtime.sendMessage).toHaveBeenCalledTimes(2));

    const documentObserver = observers.find(({ target }) => target === document.documentElement);
    const takeRecords = vi.spyOn(ControlledMutationObserver.prototype, 'takeRecords');
    host.remove();
    documentObserver.callback([{ addedNodes: [], removedNodes: [host] }]);

    expect(takeRecords).toHaveBeenCalledTimes(1);
    expect(runtime.sendMessage.mock.calls.at(-1)[0].data).toEqual({
      token: 'shadow-token', revision: 2, playing: false, frameStructureChanged: true,
    });
  });

  it('preserves pending iframe removal when a refresh snapshot collects a detached root first', async () => {
    const observers = [];
    const listeners = new Set();
    class ControlledMutationObserver {
      constructor(callback) {
        this.callback = callback;
        this.records = [];
        observers.push(this);
      }
      observe(target) { this.target = target; }
      disconnect() {}
      takeRecords() {
        const records = this.records;
        this.records = [];
        return records;
      }
    }
    vi.stubGlobal('MutationObserver', ControlledMutationObserver);
    const runtime = {
      sendMessage: vi.fn(async (message) => message.action === MEDIA_OBSERVER_HELLO
        ? { observe: true, token: 'refresh-token', sessionToken: 'refresh-session' }
        : undefined),
      onMessage: {
        addListener: (listener) => listeners.add(listener),
        removeListener: (listener) => listeners.delete(listener),
      },
    };
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    const frame = document.createElement('iframe');
    root.append(frame);
    document.body.append(host);
    cleanup = installMediaObserver({ runtime, document });
    await vi.waitFor(() => expect(runtime.sendMessage).toHaveBeenCalledTimes(2));

    const rootObserver = observers.find(({ target }) => target === root);
    const documentObserver = observers.find(({ target }) => target === document.documentElement);
    rootObserver.records.push({ removedNodes: [frame] });
    frame.remove();
    host.remove();
    [...listeners][0]({ action: MEDIA_OBSERVER_REFRESH });
    await vi.waitFor(() => expect(runtime.sendMessage).toHaveBeenCalledTimes(4));
    expect(runtime.sendMessage.mock.calls.at(-1)[0].data).toEqual({
      token: 'refresh-token', revision: 2, playing: false, frameStructureChanged: true,
    });

    documentObserver.callback([{ addedNodes: [], removedNodes: [host] }]);
    expect(runtime.sendMessage).toHaveBeenCalledTimes(4);
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
    const observers = [];
    const hello = deferred();
    const listeners = new Set();
    let helloCount = 0;
    class ControlledMutationObserver {
      constructor(callback) {
        this.callback = callback;
        observers.push(this);
      }
      observe(target) { this.target = target; }
      disconnect() {}
      takeRecords() { return []; }
    }
    vi.stubGlobal('MutationObserver', ControlledMutationObserver);
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
    const documentObserver = observers.find(({ target }) => target === document.documentElement);
    const media = document.createElement('video');
    document.body.append(media);
    [...listeners][0]({ action: MEDIA_OBSERVER_STOP, data: { sessionToken: 'current-session' } });
    documentObserver.callback([{ addedNodes: [media], removedNodes: [] }]);
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
