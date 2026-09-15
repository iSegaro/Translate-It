import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { LIVE_DUBBING_ACTIONS } from '../constants.js';
import { FIREFOX_CONTENT_TARGET } from './firefoxContentContract.js';
import { FirefoxLiveDubbingContentHost } from './FirefoxContentRuntimeHost.js';
import { registerFirefoxLiveDubbingContentRuntime } from './registerFirefoxContentRuntime.js';

// The contract module owns the forbidden-key denylist by design, so it is
// covered by the closed-vocabulary tests instead of this token scan.
const PRODUCTION_FILES = [
  'src/features/live-dubbing/firefox/FirefoxContentRuntimeHost.js',
  'src/features/live-dubbing/firefox/firefoxContentAddressing.js',
  'src/features/live-dubbing/firefox/registerFirefoxContentRuntime.js',
];

function createRuntime() {
  const listeners = new Set();
  return {
    id: 'extension-id',
    getURL: (path = '') => `chrome-extension://extension-id/${path}`,
    onMessage: {
      addListener: vi.fn(listener => listeners.add(listener)),
      removeListener: vi.fn(listener => listeners.delete(listener)),
      listeners,
    },
  };
}

function createWindowStub() {
  const listeners = new Map();
  return {
    addEventListener: (type, listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener: (type, listener) => {
      const scoped = listeners.get(type);
      if (scoped) scoped.delete(listener);
    },
    dispatchEvent: event => {
      for (const listener of [...(listeners.get(event?.type) || [])]) listener(event);
      return true;
    },
  };
}

function prepareMessage() {
  return {
    target: FIREFOX_CONTENT_TARGET,
    action: LIVE_DUBBING_ACTIONS.PREPARE,
    data: {
      sessionId: 'session-1',
      providerId: 'gemini',
      tabId: 7,
      frameId: 0,
      documentId: 'doc-1',
      targetLanguage: 'en',
      eventSequence: 0,
    },
  };
}

function emit(runtime, message, sender = { id: 'extension-id' }) {
  const [listener] = [...runtime.onMessage.listeners];
  expect(listener).toBeTypeOf('function');
  return listener(message, sender);
}

describe('Firefox content runtime registration', () => {
  it('owns a per-document host instead of the offscreen singleton', () => {
    const runtime = createRuntime();
    const unregister = registerFirefoxLiveDubbingContentRuntime({ browserAPI: { runtime } });
    try {
      expect(runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
      const response = emit(runtime, prepareMessage());
      expect(response).toMatchObject({ success: true, ack: 'READY', sessionId: 'session-1' });
      const repeat = emit(runtime, prepareMessage());
      expect(repeat).toMatchObject({ success: true, idempotent: true });
    } finally {
      unregister();
    }
  });

  it('accepts an injected host and answers STATUS through it', () => {
    const runtime = createRuntime();
    const host = new FirefoxLiveDubbingContentHost({
      browserAPI: { runtime: { id: 'extension-id' } },
    });
    const unregister = registerFirefoxLiveDubbingContentRuntime({ browserAPI: { runtime }, host });
    try {
      expect(emit(runtime, prepareMessage())).toMatchObject({ success: true });
      expect(emit(runtime, { ...prepareMessage(), action: LIVE_DUBBING_ACTIONS.STATUS }))
        .toMatchObject({ success: true, active: true });
    } finally {
      unregister();
    }
  });

  it('ignores unrelated traffic and rejects unauthorized senders closed', () => {
    const runtime = createRuntime();
    const unregister = registerFirefoxLiveDubbingContentRuntime({ browserAPI: { runtime } });
    try {
      expect(emit(runtime, { target: 'offscreen', action: LIVE_DUBBING_ACTIONS.PREPARE, data: {} }))
        .toBeUndefined();
      expect(emit(runtime, { target: FIREFOX_CONTENT_TARGET, action: 'LIVE_DUBBING_CONSUME', data: {} }))
        .toBeUndefined();
      expect(emit(runtime, null)).toBeUndefined();
      expect(emit(runtime, prepareMessage(), { id: 'extension-id', tab: { id: 7 } }))
        .toMatchObject({ success: false, error: 'LIVE_DUBBING_UNAUTHORIZED' });
    } finally {
      unregister();
    }
  });

  it('invalidates the host on navigation and unregisters cleanly', () => {
    // Node/vitest has no globalThis.window; stub the minimal
    // addEventListener/dispatchEvent/removeEventListener surface the
    // registration uses, then restore it.
    const windowStub = createWindowStub();
    vi.stubGlobal('window', windowStub);
    const runtime = createRuntime();
    const unregister = registerFirefoxLiveDubbingContentRuntime({ browserAPI: { runtime } });
    try {
      expect(emit(runtime, prepareMessage())).toMatchObject({ success: true });
      windowStub.dispatchEvent({ type: 'pagehide' });
      expect(emit(runtime, { ...prepareMessage(), action: LIVE_DUBBING_ACTIONS.STATUS }))
        .toMatchObject({ success: true, active: false, status: 'IDLE' });
      expect(emit(runtime, prepareMessage()))
        .toMatchObject({ success: false, error: 'LIVE_DUBBING_SESSION_DISPOSED' });
    } finally {
      unregister();
      vi.unstubAllGlobals();
    }
    expect(runtime.onMessage.removeListener).toHaveBeenCalledTimes(1);
  });

  it('answers for any site without site-specific logic', () => {
    const runtime = createRuntime();
    const unregister = registerFirefoxLiveDubbingContentRuntime({ browserAPI: { runtime } });
    try {
      const sender = { id: 'extension-id' };
      expect(emit(runtime, prepareMessage(), sender)).toMatchObject({ success: true });
    } finally {
      unregister();
    }
  });

  it('keeps the production boundary free of site, media, page-world, and bootstrap material', async () => {
    const sources = await Promise.all(PRODUCTION_FILES.map(file =>
      readFile(join(process.cwd(), file), 'utf8')));
    const forbiddenTokens = [
      'youtube',
      'youtu.be',
      'captureStream',
      'getUserMedia',
      'MediaStream',
      'AudioContext',
      'wrappedJSObject',
      'cloneInto',
      'exportFunction',
      'Xray',
      '__translateItFirefox',
      'querySelector',
      'getElementById',
      'hostname',
      'BootstrapService',
      'mintEphemeral',
      'mintClientSecret',
    ];
    for (const source of sources) {
      for (const token of forbiddenTokens) {
        expect(source).not.toContain(token);
      }
    }
    for (const source of sources) {
      expect(source.toLowerCase()).not.toContain('transcript');
      expect(source).not.toContain('liveDubbingController');
      expect(source).not.toContain('LiveDubbingController');
    }
  });

  it('wires production registration in the top-frame content entry without site gates', async () => {
    const source = await readFile(join(process.cwd(), 'src/core/content-scripts/index-main.js'), 'utf8');
    expect(source).toContain('firefox/registerFirefoxContentRuntime.js');
    expect(source).toContain('registerFirefoxLiveDubbingContentRuntime');
  });

  it('gates production registration fail-closed to Firefox builds only', async () => {
    const source = await readFile(join(process.cwd(), 'src/core/content-scripts/index-main.js'), 'utf8');
    const anchor = source.indexOf('content-runtime host (Phase 2)');
    const importIndex = source.indexOf('firefox/registerFirefoxContentRuntime.js');
    expect(anchor).toBeGreaterThan(-1);
    expect(importIndex).toBeGreaterThan(anchor);
    const guard = source.slice(anchor, importIndex);
    // Fail-closed: unknown build targets (including undefined __BROWSER__)
    // never register the production host. No undefined-as-Firefox fallback.
    expect(guard).toContain("typeof __BROWSER__ !== 'undefined' && __BROWSER__ === 'firefox'");
    expect(guard).not.toContain('||');
  });
});
