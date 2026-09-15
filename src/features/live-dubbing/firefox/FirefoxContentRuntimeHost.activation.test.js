import { describe, expect, it, vi } from 'vitest';
import { LIVE_DUBBING_ACTIONS } from '../constants.js';
import { LIVE_DUBBING_FEATURE_NAME } from '../handlers/LiveDubbingFeatureHandler.js';
import { FIREFOX_CONTENT_TARGET } from './firefoxContentContract.js';
import { FirefoxLiveDubbingContentHost } from './FirefoxContentRuntimeHost.js';

const browserAPI = {
  runtime: {
    id: 'extension-id',
    getURL: (path = '') => `chrome-extension://extension-id/${path}`,
  },
};

const backgroundSender = { id: 'extension-id' };

function createCountingLifecycle({ activateWith = {}, active = true } = {}) {
  return {
    requestActivation: vi.fn(async () => activateWith),
    deactivateFeature: vi.fn(async () => true),
    prepareRuntime: vi.fn(async () => true),
    isFeatureActive: vi.fn(() => active),
  };
}

function createHost(featureLifecycle) {
  return new FirefoxLiveDubbingContentHost({ browserAPI, featureLifecycle });
}

function prepareMessage(overrides = {}) {
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
      ...overrides,
    },
  };
}

function statusMessage(overrides = {}) {
  return { ...prepareMessage(overrides), action: LIVE_DUBBING_ACTIONS.STATUS };
}

function disposeMessage(overrides = {}) {
  const data = { ...prepareMessage(overrides).data };
  delete data.targetLanguage;
  return { target: FIREFOX_CONTENT_TARGET, action: LIVE_DUBBING_ACTIONS.DISPOSE, data };
}

describe('Firefox content host feature activation', () => {
  it('fences DISPOSE against a PREPARE that has not adopted local media yet', async () => {
    let resolvePreparation;
    const preparation = new Promise(resolve => { resolvePreparation = resolve; });
    const lifecycle = createCountingLifecycle();
    lifecycle.prepareRuntime.mockReturnValueOnce(preparation);
    const host = createHost(lifecycle);

    const preparing = host.handle(prepareMessage(), backgroundSender);
    await vi.waitFor(() => expect(lifecycle.prepareRuntime).toHaveBeenCalledOnce());

    await expect(host.handle(disposeMessage(), backgroundSender)).resolves.toMatchObject({
      success: true,
      ack: 'DISPOSED',
      disposed: true,
    });
    resolvePreparation(true);

    await expect(preparing).resolves.toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_SESSION_DISPOSED',
    });
    expect(host.session).toBeNull();
    expect(lifecycle.deactivateFeature).toHaveBeenCalledOnce();
  });

  it('fails PREPARE closed without a lifecycle and creates no partial session', async () => {
    const host = createHost(null);

    expect(await host.handle(prepareMessage(), backgroundSender))
      .toMatchObject({ success: false, error: 'LIVE_DUBBING_ACTIVATION_BLOCKED', ignored: true });

    // No partial PREPARED state: STATUS stays IDLE and DISPOSE stays inert.
    expect(await host.handle(statusMessage(), backgroundSender))
      .toMatchObject({ success: true, active: false, prepared: false, status: 'IDLE' });
    expect(await host.handle(disposeMessage(), backgroundSender))
      .toMatchObject({ success: true, ack: 'DISPOSED', disposed: true, idempotent: true });
  });

  it('activates on PREPARE and re-validates on retry without partial state', async () => {
    const lifecycle = createCountingLifecycle();
    const host = createHost(lifecycle);

    const first = await host.handle(prepareMessage(), backgroundSender);
    expect(first).toMatchObject({ success: true, ack: 'READY', active: true, prepared: true });
    expect(lifecycle.requestActivation).toHaveBeenCalledTimes(1);
    expect(lifecycle.requestActivation).toHaveBeenCalledWith(LIVE_DUBBING_FEATURE_NAME);

    const retry = await host.handle(prepareMessage(), backgroundSender);
    expect(retry).toMatchObject({ success: true, ack: 'READY', idempotent: true });
    expect(lifecycle.requestActivation).toHaveBeenCalledTimes(2);
  });

  it('fails blocked activation closed with no partial PREPARED session', async () => {
    const lifecycle = createCountingLifecycle({ activateWith: null });
    const host = createHost(lifecycle);

    expect(await host.handle(prepareMessage(), backgroundSender))
      .toMatchObject({ success: false, error: 'LIVE_DUBBING_ACTIVATION_BLOCKED', ignored: true });

    // Proof of no partial state: STATUS observes IDLE, never PREPARED.
    expect(await host.handle(statusMessage(), backgroundSender))
      .toMatchObject({ success: true, active: false, prepared: false, status: 'IDLE' });
    expect(lifecycle.deactivateFeature).not.toHaveBeenCalled();
  });

  it('fails closed when activation throws or reports inactive', async () => {
    const throwing = {
      requestActivation: vi.fn(async () => { throw new Error('manager unavailable'); }),
      deactivateFeature: vi.fn(async () => {}),
    };
    expect(await createHost(throwing).handle(prepareMessage(), backgroundSender))
      .toMatchObject({ success: false, error: 'LIVE_DUBBING_ACTIVATION_BLOCKED' });

    const inactive = createCountingLifecycle({ active: false });
    expect(await createHost(inactive).handle(prepareMessage(), backgroundSender))
      .toMatchObject({ success: false, error: 'LIVE_DUBBING_ACTIVATION_BLOCKED' });
  });

  it('keeps STATUS lightweight: it never activates', async () => {
    const lifecycle = createCountingLifecycle();
    const host = createHost(lifecycle);

    expect(await host.handle(statusMessage(), backgroundSender))
      .toMatchObject({ success: true, active: false, status: 'IDLE' });
    expect(lifecycle.requestActivation).not.toHaveBeenCalled();

    await host.handle(prepareMessage(), backgroundSender);
    expect(lifecycle.requestActivation).toHaveBeenCalledTimes(1);
    expect(await host.handle(statusMessage(), backgroundSender))
      .toMatchObject({ success: true, active: true, prepared: true });
    expect(lifecycle.requestActivation).toHaveBeenCalledTimes(1);
    expect(lifecycle.isFeatureActive).toHaveBeenCalledWith(LIVE_DUBBING_FEATURE_NAME);
  });

  it('reports the lifecycle active fact on STATUS without activating', async () => {
    const lifecycle = createCountingLifecycle();
    const host = createHost(lifecycle);

    // Activation succeeds (handler returned and active); the feature later
    // reports inactive, which STATUS surfaces as a scalar fact only.
    expect(await host.handle(prepareMessage(), backgroundSender))
      .toMatchObject({ success: true, ack: 'READY' });
    lifecycle.isFeatureActive.mockReturnValue(false);
    expect(await host.handle(statusMessage(), backgroundSender))
      .toMatchObject({ success: true, prepared: true, active: false });
    expect(lifecycle.requestActivation).toHaveBeenCalledTimes(1);
  });

  it('deactivates exactly once on DISPOSE, then disposes host state', async () => {
    const lifecycle = createCountingLifecycle();
    const host = createHost(lifecycle);
    await host.handle(prepareMessage(), backgroundSender);

    expect(await host.handle(disposeMessage(), backgroundSender))
      .toMatchObject({ success: true, ack: 'DISPOSED', disposed: true });
    expect(lifecycle.deactivateFeature).toHaveBeenCalledTimes(1);
    expect(lifecycle.deactivateFeature).toHaveBeenCalledWith(LIVE_DUBBING_FEATURE_NAME);

    // Repeated DISPOSE resolves through the tombstone without re-entering
    // feature deactivation.
    expect(await host.handle(disposeMessage(), backgroundSender))
      .toMatchObject({ success: true, ack: 'DISPOSED', idempotent: true });
    expect(lifecycle.deactivateFeature).toHaveBeenCalledTimes(1);
  });

  it('still disposes host state when feature deactivation throws', async () => {
    const lifecycle = createCountingLifecycle();
    lifecycle.deactivateFeature.mockRejectedValueOnce(new Error('teardown failed'));
    const host = createHost(lifecycle);
    await host.handle(prepareMessage(), backgroundSender);

    expect(await host.handle(disposeMessage(), backgroundSender))
      .toMatchObject({ success: true, ack: 'DISPOSED', disposed: true });
    expect(await host.handle(statusMessage(), backgroundSender))
      .toMatchObject({ success: true, active: false, status: 'IDLE' });
  });

  it('navigation-after-PREPARE deactivates once and terminals the old session', async () => {
    const lifecycle = createCountingLifecycle();
    const host = createHost(lifecycle);
    expect(await host.handle(prepareMessage(), backgroundSender))
      .toMatchObject({ success: true, ack: 'READY' });

    host.invalidate('NAVIGATION');
    expect(lifecycle.deactivateFeature).toHaveBeenCalledTimes(1);
    expect(lifecycle.deactivateFeature).toHaveBeenCalledWith(LIVE_DUBBING_FEATURE_NAME);

    // Old session terminal immediately: STATUS IDLE, same-session PREPARE
    // disposed, explicit DISPOSE tombstoned without re-entering deactivation.
    expect(await host.handle(statusMessage(), backgroundSender))
      .toMatchObject({ success: true, active: false, status: 'IDLE' });
    expect(await host.handle(prepareMessage(), backgroundSender))
      .toMatchObject({ success: false, error: 'LIVE_DUBBING_SESSION_DISPOSED' });
    expect(await host.handle(disposeMessage(), backgroundSender))
      .toMatchObject({ success: true, ack: 'DISPOSED', idempotent: true });
    expect(lifecycle.deactivateFeature).toHaveBeenCalledTimes(1);
  });

  it('repeated invalidation performs no duplicate cleanup', async () => {
    const lifecycle = createCountingLifecycle();
    const host = createHost(lifecycle);
    await host.handle(prepareMessage(), backgroundSender);

    host.invalidate('NAVIGATION');
    host.invalidate('NAVIGATION');
    host.invalidate('NAVIGATION');
    expect(lifecycle.deactivateFeature).toHaveBeenCalledTimes(1);
    expect(await host.handle(statusMessage(), backgroundSender))
      .toMatchObject({ success: true, active: false, status: 'IDLE' });
  });

  it('fresh session may still activate after navigation teardown', async () => {
    const lifecycle = createCountingLifecycle();
    const host = createHost(lifecycle);
    await host.handle(prepareMessage(), backgroundSender);
    host.invalidate('NAVIGATION');
    expect(lifecycle.deactivateFeature).toHaveBeenCalledTimes(1);

    expect(await host.handle(prepareMessage({ sessionId: 'session-2' }), backgroundSender))
      .toMatchObject({ success: true, ack: 'READY' });
    expect(lifecycle.requestActivation).toHaveBeenCalledTimes(2);
    expect(await host.handle(statusMessage({ sessionId: 'session-2' }), backgroundSender))
      .toMatchObject({ success: true, active: true, prepared: true });
  });

  it('resolved teardown releases a fresh adoption without duplicate cleanup', async () => {
    const lifecycle = createCountingLifecycle();
    let resolveTeardown;
    lifecycle.deactivateFeature.mockImplementationOnce(() => new Promise(resolve => {
      resolveTeardown = resolve;
    }));
    const host = createHost(lifecycle);
    await host.handle(prepareMessage(), backgroundSender);

    host.invalidate('NAVIGATION');
    expect(lifecycle.deactivateFeature).toHaveBeenCalledTimes(1);

    // The fresh session adopts only after the prior teardown settles, and
    // the late settlement touches no session state of its own.
    resolveTeardown(true);
    expect(await host.handle(prepareMessage({ sessionId: 'session-2' }), backgroundSender))
      .toMatchObject({ success: true, ack: 'READY' });
    expect(await host.handle(statusMessage({ sessionId: 'session-2' }), backgroundSender))
      .toMatchObject({ success: true, active: true, prepared: true });
    expect(lifecycle.deactivateFeature).toHaveBeenCalledTimes(1);
  });

  it('teardown failure cannot reopen the terminal session', async () => {
    const lifecycle = createCountingLifecycle();
    lifecycle.deactivateFeature.mockRejectedValueOnce(new Error('teardown failed'));
    const host = createHost(lifecycle);
    await host.handle(prepareMessage(), backgroundSender);

    host.invalidate('NAVIGATION');
    await Promise.resolve();
    await Promise.resolve();
    expect(await host.handle(statusMessage(), backgroundSender))
      .toMatchObject({ success: true, active: false, status: 'IDLE' });
    expect(await host.handle(prepareMessage(), backgroundSender))
      .toMatchObject({ success: false, error: 'LIVE_DUBBING_SESSION_DISPOSED' });
  });

  it('fresh PREPARE waits for prior teardown instead of overlapping activation', async () => {
    const lifecycle = createCountingLifecycle();
    let resolveTeardown;
    lifecycle.deactivateFeature.mockImplementationOnce(() => new Promise(resolve => {
      resolveTeardown = resolve;
    }));
    const host = createHost(lifecycle);
    expect(await host.handle(prepareMessage(), backgroundSender))
      .toMatchObject({ success: true, ack: 'READY' });

    host.invalidate('NAVIGATION');
    expect(lifecycle.deactivateFeature).toHaveBeenCalledTimes(1);

    let bSettled = false;
    const bPromise = host.handle(prepareMessage({ sessionId: 'session-2' }), backgroundSender)
      .then(response => {
        bSettled = true;
        return response;
      });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    // Teardown still in flight: B is neither adopted nor activated.
    expect(bSettled).toBe(false);
    expect(host.session).toBeNull();
    expect(lifecycle.requestActivation).toHaveBeenCalledTimes(1);

    resolveTeardown(true);
    const bReady = await bPromise;
    expect(bReady).toMatchObject({ success: true, ack: 'READY' });
    expect(host.session?.sessionId).toBe('session-2');
    expect(lifecycle.requestActivation).toHaveBeenCalledTimes(2);
    expect(await host.handle(statusMessage({ sessionId: 'session-2' }), backgroundSender))
      .toMatchObject({ success: true, active: true, prepared: true });
  });

  it('hung teardown fails fresh PREPARE closed with nothing adopted', async () => {
    const lifecycle = createCountingLifecycle();
    lifecycle.deactivateFeature.mockReturnValueOnce(new Promise(() => {}));
    const host = new FirefoxLiveDubbingContentHost({
      browserAPI,
      featureLifecycle: lifecycle,
      teardownTimeoutMs: 15,
    });
    await host.handle(prepareMessage(), backgroundSender);
    host.invalidate('NAVIGATION');

    const blocked = await host.handle(prepareMessage({ sessionId: 'session-2' }), backgroundSender);
    expect(blocked).toMatchObject({ success: false, error: 'LIVE_DUBBING_ACTIVATION_BLOCKED' });
    expect(host.session).toBeNull();
    expect(lifecycle.requestActivation).toHaveBeenCalledTimes(1);

    // Retry while still hung stays fail-closed and reuses the same cleanup.
    expect(await host.handle(prepareMessage({ sessionId: 'session-2' }), backgroundSender))
      .toMatchObject({ success: false, error: 'LIVE_DUBBING_ACTIVATION_BLOCKED' });
    expect(host.session).toBeNull();
    expect(lifecycle.deactivateFeature).toHaveBeenCalledTimes(1);
  });

  it('never deactivates for foreign-document or unknown-session DISPOSE', async () => {
    const lifecycle = createCountingLifecycle();
    const host = createHost(lifecycle);
    await host.handle(prepareMessage(), backgroundSender);

    expect(await host.handle(disposeMessage({ documentId: 'doc-2' }), backgroundSender))
      .toMatchObject({ success: false, error: 'LIVE_DUBBING_STALE_DOCUMENT' });
    expect(await host.handle(disposeMessage({ sessionId: 'other' }), backgroundSender))
      .toMatchObject({ success: true, ack: 'DISPOSED', ignored: true });
    expect(lifecycle.deactivateFeature).not.toHaveBeenCalled();

    // The adopted session survives both attempts untouched.
    expect(await host.handle(statusMessage(), backgroundSender))
      .toMatchObject({ success: true, active: true });
  });
});
