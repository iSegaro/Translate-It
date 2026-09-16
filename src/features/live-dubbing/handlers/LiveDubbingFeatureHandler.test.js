import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FEATURE_CONFIG } from '@/core/managers/content/FeatureConfig.js';
import { MainFeatureLoader } from '@/core/content-scripts/main/MainFeatureLoader.js';
import {
  LIVE_DUBBING_FEATURE_NAME,
  LiveDubbingFeatureHandler,
} from './LiveDubbingFeatureHandler.js';

function descriptor(overrides = {}) {
  return {
    sessionId: 'session-1',
    providerId: 'gemini',
    tabId: 7,
    frameId: 0,
    documentId: 'document-1',
    targetLanguage: 'en',
    eventSequence: 0,
    ...overrides,
  };
}

function sourceHandle() {
  return {
    stream: { getTracks: () => [] },
    dispose: vi.fn(),
  };
}

describe('LiveDubbingFeatureHandler lifecycle', () => {
  it('exposes the shared feature name', () => {
    expect(LIVE_DUBBING_FEATURE_NAME).toBe('liveDubbing');
  });

  it('is injectable and starts inactive', () => {
    const manager = { name: 'fake-manager' };
    const handler = new LiveDubbingFeatureHandler({ featureManager: manager });
    expect(handler.featureManager).toBe(manager);
    expect(handler.isActive()).toBe(false);
    expect(new LiveDubbingFeatureHandler().featureManager).toBeNull();
  });

  it('activates and deactivates idempotently with lifecycle-only state', async () => {
    const handler = new LiveDubbingFeatureHandler({});
    expect(await handler.activate()).toBe(true);
    expect(handler.isActive()).toBe(true);
    expect(await handler.activate()).toBe(true);
    expect(await handler.deactivate()).toBe(true);
    expect(handler.isActive()).toBe(false);
    expect(await handler.deactivate()).toBe(true);
  });

  it('prepares through the injected local runtime in order and retries without recapture', async () => {
    const calls = [];
    const source = sourceHandle();
    const controller = {
      prepare: vi.fn(async (...args) => {
        calls.push(['prepare', ...args]);
        return { success: true };
      }),
      consumeSource: vi.fn(async (...args) => {
        calls.push(['consumeSource', ...args]);
        return { success: true, sourceAccepted: true, eventSequence: 1 };
      }),
      connectProvider: vi.fn(async () => ({
        success: true,
        ack: 'PROVIDER_READY',
        eventSequence: 3,
        setupComplete: true,
      })),
      dispose: vi.fn(async () => ({ success: true, disposed: true })),
    };
    const resolver = { resolve: vi.fn(() => {
      calls.push(['resolve']);
      return { success: true, source: 'media-element' };
    }) };
    const captureAdapter = { capture: vi.fn(() => {
      calls.push(['capture', 'media-element']);
      return source;
    }) };
    const handler = new LiveDubbingFeatureHandler({ controller, resolver, captureAdapter });
    const localDescriptor = descriptor();
    await handler.activate();

    await expect(handler.prepareRuntime(localDescriptor)).resolves.toMatchObject({ success: true, runtimeEventSequence: 1 });
    expect(calls.map(([name]) => name)).toEqual([
      'prepare',
      'resolve',
      'capture',
      'consumeSource',
    ]);
    expect(controller.consumeSource).toHaveBeenCalledWith(
      localDescriptor.sessionId,
      localDescriptor.providerId,
      source,
      localDescriptor.eventSequence + 1,
    );

    await expect(handler.prepareRuntime({ ...localDescriptor })).resolves.toMatchObject({ success: true, runtimeEventSequence: 1 });
    expect(resolver.resolve).toHaveBeenCalledOnce();
    expect(captureAdapter.capture).toHaveBeenCalledOnce();
    expect(controller.consumeSource).toHaveBeenCalledOnce();

    await expect(handler.connectRuntime({
      ...localDescriptor,
      eventSequence: 2,
      runtimeEventSequence: 1,
    })).resolves.toMatchObject({
      success: true,
      runtimeEventSequence: 3,
    });
    expect(handler.getRuntimeEventSequence()).toBe(3);
    expect(controller.connectProvider).toHaveBeenCalledWith('session-1', 'gemini', 'en', 2);
  });

  it('passes only the injected runtime callbacks to the browser-neutral Controller', async () => {
    const requestBootstrap = vi.fn(async request => ({ request }));
    const notifyTerminal = vi.fn(async notification => ({ notification }));
    const handler = new LiveDubbingFeatureHandler({
      runtimeMessenger: { requestBootstrap, notifyTerminal },
    });
    const controller = await handler._getController();
    const request = { action: 'BOOTSTRAP', data: { eventSequence: 2 } };
    const notification = { action: 'TERMINAL', data: { eventSequence: 3 } };

    await expect(controller.requestBootstrap(request)).resolves.toEqual({ request });
    await expect(controller.notify(notification)).resolves.toEqual({ notification });
    expect(requestBootstrap).toHaveBeenCalledWith(request, null);
    expect(notifyTerminal).toHaveBeenCalledWith(notification, null);
  });

  it('rejects a provider result that skips the next local runtime sequence', async () => {
    const controller = {
      prepare: vi.fn(async () => ({ success: true })),
      consumeSource: vi.fn(async () => ({ success: true, sourceAccepted: true, eventSequence: 1 })),
      connectProvider: vi.fn(async () => ({
        success: true,
        eventSequence: 9,
        setupComplete: true,
      })),
      dispose: vi.fn(async () => ({ success: true, disposed: true })),
    };
    const handler = new LiveDubbingFeatureHandler({
      controller,
      resolver: { resolve: () => ({ success: true, source: 'media-element' }) },
      captureAdapter: { capture: () => sourceHandle() },
    });
    await handler.activate();
    await expect(handler.prepareRuntime(descriptor())).resolves.toMatchObject({ success: true });

    await expect(handler.connectRuntime({
      ...descriptor(),
      eventSequence: 2,
      runtimeEventSequence: 1,
    })).resolves.toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_PROVIDER_SETUP_INCOMPLETE',
    });
    expect(handler.getRuntimeEventSequence()).toBe(1);
    await handler.deactivate();
  });

  it('disposes an unadopted source once when controller adoption rejects', async () => {
    const source = sourceHandle();
    const controller = {
      prepare: vi.fn(async () => ({ success: true })),
      consumeSource: vi.fn(async () => ({ success: false, sourceAccepted: false })),
      dispose: vi.fn(async () => ({ success: true, disposed: true })),
    };
    const handler = new LiveDubbingFeatureHandler({
      controller,
      resolver: { resolve: () => ({ success: true, source: 'media-element' }) },
      captureAdapter: { capture: () => source },
    });
    await handler.activate();

    await expect(handler.prepareRuntime(descriptor())).resolves.toMatchObject({ success: false });
    expect(source.dispose).toHaveBeenCalledOnce();
    expect(controller.dispose).toHaveBeenCalledOnce();
    await handler.deactivate();
    expect(source.dispose).toHaveBeenCalledOnce();
    expect(controller.dispose).toHaveBeenCalledOnce();
  });

  it('defers source cleanup to Controller after accepted adoption even on failure', async () => {
    const source = sourceHandle();
    const controller = {
      prepare: vi.fn(async () => ({ success: true })),
      consumeSource: vi.fn(async () => ({
        success: false,
        error: 'LIVE_DUBBING_AUDIO_PIPELINES_FAILED',
        sourceAccepted: true,
      })),
      dispose: vi.fn(async () => ({ success: true, disposed: true })),
    };
    const handler = new LiveDubbingFeatureHandler({
      controller,
      resolver: { resolve: () => ({ success: true, source: 'media-element' }) },
      captureAdapter: { capture: () => source },
    });
    await handler.activate();

    await expect(handler.prepareRuntime(descriptor())).resolves.toMatchObject({ success: false, error: 'LIVE_DUBBING_AUDIO_PIPELINES_FAILED' });

    expect(source.dispose).not.toHaveBeenCalled();
    expect(controller.dispose).toHaveBeenCalledOnce();
  });

  it('fences a late capture and disposes it without handing it to the Controller', async () => {
    let resolveCapture;
    const captureResult = new Promise(resolve => { resolveCapture = resolve; });
    const source = sourceHandle();
    const controller = {
      prepare: vi.fn(async () => ({ success: true })),
      consumeSource: vi.fn(),
      dispose: vi.fn(async () => ({ success: true, disposed: true })),
    };
    const handler = new LiveDubbingFeatureHandler({
      controller,
      resolver: { resolve: () => ({ success: true, source: 'media-element' }) },
      captureAdapter: { capture: () => captureResult },
    });
    await handler.activate();

    const preparation = handler.prepareRuntime(descriptor());
    await vi.waitFor(() => expect(controller.prepare).toHaveBeenCalledOnce());
    const deactivation = handler.deactivate();
    resolveCapture(source);

    await expect(preparation).resolves.toMatchObject({ success: false });
    await expect(deactivation).resolves.toBe(true);
    expect(controller.consumeSource).not.toHaveBeenCalled();
    expect(source.dispose).toHaveBeenCalledOnce();
    expect(controller.dispose).toHaveBeenCalledOnce();
  });

  it('keeps Controller ownership after exact source adoption during deactivation', async () => {
    const source = sourceHandle();
    const controller = {
      prepare: vi.fn(async () => ({ success: true })),
      consumeSource: vi.fn(async () => ({ success: true, sourceAccepted: true })),
      dispose: vi.fn(async () => ({ success: true, disposed: true })),
    };
    const handler = new LiveDubbingFeatureHandler({
      controller,
      resolver: { resolve: () => ({ success: true, source: 'media-element' }) },
      captureAdapter: { capture: () => source },
    });
    await handler.activate();

    await expect(handler.prepareRuntime(descriptor())).resolves.toMatchObject({ success: true });
    await expect(handler.deactivate()).resolves.toBe(true);
    expect(controller.dispose).toHaveBeenCalledOnce();
    expect(source.dispose).not.toHaveBeenCalled();
  });
});

describe('liveDubbing feature registration conventions', () => {
  it('registers host-addressable policy without a user setting', () => {
    const config = FEATURE_CONFIG.liveDubbing;
    expect(config).toBeDefined();
    expect(config.alwaysEnabled).toBeUndefined();
    expect(config.settingKey).toBeUndefined();
    expect(config.settings ?? []).toEqual([]);
    expect(config.isEnabled()).toBe(true);
  });

  it('stays out of every MainFeatureLoader startup category', () => {
    const loader = new MainFeatureLoader(null, async () => ({}));
    const categorized = Object.values(loader.FEATURE_CATEGORIES).flat();
    expect(categorized).not.toContain(LIVE_DUBBING_FEATURE_NAME);
  });

  it('keeps the handler free of Firefox, site, browser messaging, and page APIs', async () => {
    const source = await readFile(
      join(process.cwd(), 'src/features/live-dubbing/handlers/LiveDubbingFeatureHandler.js'),
      'utf8',
    );
    const forbiddenTokens = [
      'firefox',
      'youtube',
      'getUserMedia',
      'MediaStream',
      'AudioContext',
      'transcript',
      'sdp',
      'payload',
      'window.',
      'window.top',
      'querySelector',
      'chrome.',
      'browser.',
      'tabs.',
      'currentSession',
      '_controllerOwnsSource',
      '.sourceHandle',
    ];
    for (const token of forbiddenTokens) {
      expect(source).not.toContain(token);
    }
    expect(source).toContain('consumed?.sourceAccepted === true');
  });
});
