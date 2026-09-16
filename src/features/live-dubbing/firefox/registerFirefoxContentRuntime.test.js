import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { LIVE_DUBBING_ACTIONS } from '../constants.js';
import { FIREFOX_CONTENT_TARGET } from './firefoxContentContract.js';
import {
  createFirefoxContentRuntimeDiscoveryMessage,
  FIREFOX_CONTENT_RUNTIME_ACTIONS,
  FIREFOX_CONTENT_RUNTIME_TARGET,
} from './firefoxContentRuntimeContract.js';
import { FirefoxLiveDubbingContentHost } from './FirefoxContentRuntimeHost.js';
import { registerFirefoxLiveDubbingContentRuntime } from './registerFirefoxContentRuntime.js';

// The contract module owns the forbidden-key denylist by design, so it is
// covered by the closed-vocabulary tests instead of this token scan.
const PRODUCTION_FILES = [
  'src/features/live-dubbing/firefox/FirefoxContentRuntimeHost.js',
  'src/features/live-dubbing/firefox/firefoxContentAddressing.js',
  'src/features/live-dubbing/firefox/FirefoxContentRuntimeRegistry.js',
  'src/features/live-dubbing/firefox/firefoxContentRuntimeContract.js',
  'src/features/live-dubbing/firefox/firefoxContentRuntimeRegistration.js',
  'src/features/live-dubbing/firefox/firefoxContentRuntimeMessenger.js',
  'src/features/live-dubbing/firefox/registerFirefoxContentRuntime.js',
  'src/core/content-scripts/contentRuntimeBootstrap.js',
];

function createRuntime() {
  const listeners = new Set();
  return {
    id: 'extension-id',
    getURL: (path = '') => `chrome-extension://extension-id/${path}`,
    sendMessage: vi.fn(() => Promise.resolve()),
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

function createActiveLifecycle() {
  return {
    requestActivation: async () => ({ activated: true }),
    deactivateFeature: async () => true,
    prepareRuntime: async () => true,
    isFeatureActive: () => true,
  };
}

function createHost(browserAPI, featureLifecycle = createActiveLifecycle()) {
  return new FirefoxLiveDubbingContentHost({ browserAPI, featureLifecycle });
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

async function emit(runtime, message, sender = { id: 'extension-id' }) {
  const [listener] = [...runtime.onMessage.listeners];
  expect(listener).toBeTypeOf('function');
  return listener(message, sender);
}

describe('Firefox content runtime registration', () => {
  it('emits readiness only after the host listener is installed', async () => {
    const events = [];
    const runtime = createRuntime();
    runtime.onMessage.addListener = vi.fn(listener => {
      events.push('listener-installed');
      runtime.onMessage.listeners.add(listener);
    });
    runtime.sendMessage.mockImplementation(message => {
      events.push('ready-emitted');
      return Promise.resolve(message);
    });

    const unregister = registerFirefoxLiveDubbingContentRuntime({
      browserAPI: { runtime },
      host: createHost({ runtime }),
    });
    try {
      expect(events).toEqual(['listener-installed', 'ready-emitted']);
      expect(runtime.sendMessage).toHaveBeenCalledWith({
        target: FIREFOX_CONTENT_RUNTIME_TARGET,
        action: FIREFOX_CONTENT_RUNTIME_ACTIONS.READY,
        data: {},
      });
    } finally {
      unregister();
    }
  });

  it('answers discovery through a separate nonce-bearing ready message', async () => {
    const runtime = createRuntime();
    const host = createHost({ runtime });
    const unregister = registerFirefoxLiveDubbingContentRuntime({ browserAPI: { runtime }, host });
    try {
      runtime.sendMessage.mockClear();
      expect(await emit(runtime, createFirefoxContentRuntimeDiscoveryMessage('nonce-1')))
        .toBeUndefined();
      expect(runtime.sendMessage).toHaveBeenCalledWith({
        target: FIREFOX_CONTENT_RUNTIME_TARGET,
        action: FIREFOX_CONTENT_RUNTIME_ACTIONS.READY,
        data: { nonce: 'nonce-1' },
      });
      expect(host.session).toBeNull();
    } finally {
      unregister();
    }
  });

  it('owns a per-document host instead of the offscreen singleton', async () => {
    const runtime = createRuntime();
    const host = createHost({ runtime });
    const unregister = registerFirefoxLiveDubbingContentRuntime({ browserAPI: { runtime }, host });
    try {
      expect(runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
      const response = await emit(runtime, prepareMessage());
      expect(response).toMatchObject({ success: true, ack: 'READY', sessionId: 'session-1' });
      const repeat = await emit(runtime, prepareMessage());
      expect(repeat).toMatchObject({ success: true, idempotent: true });
    } finally {
      unregister();
    }
  });

  it('fails PREPARE closed when the registered host has no lifecycle seam', async () => {
    const runtime = createRuntime();
    const unregister = registerFirefoxLiveDubbingContentRuntime({ browserAPI: { runtime } });
    try {
      expect(await emit(runtime, prepareMessage()))
        .toMatchObject({ success: false, error: 'LIVE_DUBBING_ACTIVATION_BLOCKED' });
    } finally {
      unregister();
    }
  });

  it('accepts an injected host and answers STATUS through it', async () => {
    const runtime = createRuntime();
    const host = new FirefoxLiveDubbingContentHost({
      browserAPI: { runtime: { id: 'extension-id' } },
      featureLifecycle: createActiveLifecycle(),
    });
    const unregister = registerFirefoxLiveDubbingContentRuntime({ browserAPI: { runtime }, host });
    try {
      expect(await emit(runtime, prepareMessage())).toMatchObject({ success: true });
      expect(await emit(runtime, { ...prepareMessage(), action: LIVE_DUBBING_ACTIONS.STATUS }))
        .toMatchObject({ success: true, active: true });
    } finally {
      unregister();
    }
  });

  it('ignores unrelated traffic and rejects unauthorized senders closed', async () => {
    const runtime = createRuntime();
    const host = createHost({ runtime });
    const unregister = registerFirefoxLiveDubbingContentRuntime({ browserAPI: { runtime }, host });
    try {
      expect(await emit(runtime, { target: 'offscreen', action: LIVE_DUBBING_ACTIONS.PREPARE, data: {} }))
        .toBeUndefined();
      expect(await emit(runtime, { target: FIREFOX_CONTENT_TARGET, action: 'LIVE_DUBBING_CONSUME', data: {} }))
        .toBeUndefined();
      expect(await emit(runtime, null)).toBeUndefined();
      expect(await emit(runtime, prepareMessage(), { id: 'extension-id', tab: { id: 7 } }))
        .toMatchObject({ success: false, error: 'LIVE_DUBBING_UNAUTHORIZED' });
    } finally {
      unregister();
    }
  });

  it('invalidates the host on navigation and unregisters cleanly', async () => {
    // Node/vitest has no globalThis.window; stub the minimal
    // addEventListener/dispatchEvent/removeEventListener surface the
    // registration uses, then restore it.
    const windowStub = createWindowStub();
    vi.stubGlobal('window', windowStub);
    const runtime = createRuntime();
    const featureLifecycle = createActiveLifecycle();
    const deactivate = vi.spyOn(featureLifecycle, 'deactivateFeature');
    const host = createHost({ runtime }, featureLifecycle);
    const unregister = registerFirefoxLiveDubbingContentRuntime({ browserAPI: { runtime }, host });
    try {
      expect(await emit(runtime, prepareMessage())).toMatchObject({ success: true });
      windowStub.dispatchEvent({ type: 'pagehide' });
      windowStub.dispatchEvent({ type: 'pagehide' });
      // Navigation teardown deactivates the managed feature exactly once.
      expect(deactivate).toHaveBeenCalledTimes(1);
      expect(await emit(runtime, { ...prepareMessage(), action: LIVE_DUBBING_ACTIONS.STATUS }))
        .toMatchObject({ success: true, active: false, status: 'IDLE' });
      expect(await emit(runtime, prepareMessage()))
        .toMatchObject({ success: false, error: 'LIVE_DUBBING_SESSION_DISPOSED' });
    } finally {
      unregister();
      vi.unstubAllGlobals();
    }
    expect(runtime.onMessage.removeListener).toHaveBeenCalledTimes(1);
  });

  it('answers for any site without site-specific logic', async () => {
    const runtime = createRuntime();
    const host = createHost({ runtime });
    const unregister = registerFirefoxLiveDubbingContentRuntime({ browserAPI: { runtime }, host });
    try {
      const sender = { id: 'extension-id' };
      expect(await emit(runtime, prepareMessage(), sender)).toMatchObject({ success: true });
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
      'window.top',
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

  it('wires one generic infrastructure bootstrap in the content entry', async () => {
    const source = await readFile(join(process.cwd(), 'src/core/content-scripts/index-main.js'), 'utf8');
    // Exactly one generic call site; the DEV-only spike wiring below it is
    // a separate, explicitly gated block and stays untouched.
    expect(source.match(/bootstrapContentRuntimeInfrastructure/g)?.length ?? 0).toBe(1);
    const anchor = source.indexOf('Content-runtime infrastructure bootstrap');
    const importIndex = source.indexOf('core/content-scripts/contentRuntimeBootstrap.js');
    expect(anchor).toBeGreaterThan(-1);
    expect(importIndex).toBeGreaterThan(anchor);
    const region = source.slice(anchor, importIndex).toLowerCase();
    expect(region).not.toContain('livedubbing');
    expect(region).not.toContain('live-dubbing');
    expect(region).not.toContain('registerfirefox');
  });

  it('gates the generic bootstrap fail-closed to Firefox builds only', async () => {
    const source = await readFile(join(process.cwd(), 'src/core/content-scripts/index-main.js'), 'utf8');
    const anchor = source.indexOf('Content-runtime infrastructure bootstrap');
    const importIndex = source.indexOf('core/content-scripts/contentRuntimeBootstrap.js');
    expect(anchor).toBeGreaterThan(-1);
    expect(importIndex).toBeGreaterThan(anchor);
    const guard = source.slice(anchor, importIndex);
    // Fail-closed: unknown build targets (including undefined __BROWSER__)
    // never bootstrap. No undefined-as-Firefox fallback.
    expect(guard).toContain("typeof __BROWSER__ !== 'undefined' && __BROWSER__ === 'firefox'");
    expect(guard).not.toContain('||');
  });
});
