import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { LIVE_DUBBING_ACTIONS } from '../constants.js';
import { FIREFOX_CONTENT_TARGET } from './firefoxContentContract.js';
import { FirefoxLiveDubbingContentHost } from './FirefoxContentRuntimeHost.js';

const browserAPI = {
  runtime: {
    id: 'extension-id',
    getURL: (path = '') => `chrome-extension://extension-id/${path}`,
  },
};

const backgroundSender = { id: 'extension-id' };

function createHost() {
  return new FirefoxLiveDubbingContentHost({ browserAPI });
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

function assertScalarResponse(response) {
  expect(response).toBeTypeOf('object');
  for (const value of Object.values(response)) {
    expect(['string', 'number', 'boolean'].includes(typeof value) || value === null).toBe(true);
  }
}

describe('Firefox content runtime host lifecycle', () => {
  it('exposes only the closed control vocabulary', () => {
    const host = createHost();
    expect(host.handles(LIVE_DUBBING_ACTIONS.PREPARE)).toBe(true);
    expect(host.handles(LIVE_DUBBING_ACTIONS.STATUS)).toBe(true);
    expect(host.handles(LIVE_DUBBING_ACTIONS.DISPOSE)).toBe(true);
    expect(host.handles(LIVE_DUBBING_ACTIONS.CONNECT_PROVIDER)).toBe(false);
    expect(host.handles(LIVE_DUBBING_ACTIONS.CONSUME)).toBe(false);
  });

  it('prepares idempotently for the exact identity', () => {
    const host = createHost();
    const first = host.handle(prepareMessage(), backgroundSender);
    expect(first).toMatchObject({
      success: true,
      ack: 'READY',
      sessionId: 'session-1',
      providerId: 'gemini',
      tabId: 7,
      frameId: 0,
      documentId: 'doc-1',
      eventSequence: 0,
      status: 'PREPARING_CAPTURE',
    });
    const second = host.handle(prepareMessage(), backgroundSender);
    expect(second).toMatchObject({ success: true, ack: 'READY', idempotent: true });
    assertScalarResponse(first);
    assertScalarResponse(second);
  });

  it('fails closed on conflicting, stale, or wrong identity', () => {
    const host = createHost();
    expect(host.handle(prepareMessage(), backgroundSender).success).toBe(true);

    expect(host.handle(prepareMessage({ providerId: 'openai' }), backgroundSender))
      .toMatchObject({ success: false, error: 'LIVE_DUBBING_SESSION_MISMATCH', ignored: true });
    expect(host.handle(prepareMessage({ eventSequence: 4 }), backgroundSender))
      .toMatchObject({ success: false, error: 'LIVE_DUBBING_EVENT_SEQUENCE_MISMATCH', ignored: true });
    expect(host.handle(statusMessage({ sessionId: 'other' }), backgroundSender))
      .toMatchObject({ success: false, error: 'LIVE_DUBBING_SESSION_MISMATCH', ignored: true });
    expect(host.handle(prepareMessage({ sessionId: 'session-2', targetLanguage: 'en' }), backgroundSender))
      .toMatchObject({ success: false, error: 'LIVE_DUBBING_SESSION_BUSY', ignored: true });
    expect(host.handle(prepareMessage({ targetLanguage: 'es' }), backgroundSender))
      .toMatchObject({ success: false, error: 'LIVE_DUBBING_TARGET_LANGUAGE_MISMATCH', ignored: true });
    // The conflicting attempts never disturb the adopted session.
    expect(host.handle(statusMessage(), backgroundSender))
      .toMatchObject({ success: true, active: true, status: 'PREPARING_CAPTURE' });
  });

  it('rejects new-session PREPARE with a non-zero sequence', () => {
    const host = createHost();
    expect(host.handle(prepareMessage({ eventSequence: 2 }), backgroundSender))
      .toMatchObject({ success: false, error: 'LIVE_DUBBING_EVENT_SEQUENCE_MISMATCH' });
  });

  it('reports STATUS without false success for unknown sessions', () => {
    const host = createHost();
    expect(host.handle(statusMessage(), backgroundSender))
      .toMatchObject({ success: true, active: false, prepared: false, status: 'IDLE' });

    host.handle(prepareMessage(), backgroundSender);
    expect(host.handle(statusMessage(), backgroundSender))
      .toMatchObject({ success: true, active: true, prepared: true, status: 'PREPARING_CAPTURE' });
  });

  it('disposes idempotently and terminalizes the exact session', () => {
    const host = createHost();
    host.handle(prepareMessage(), backgroundSender);

    const first = host.handle(disposeMessage(), backgroundSender);
    expect(first).toMatchObject({ success: true, ack: 'DISPOSED', disposed: true });
    const second = host.handle(disposeMessage(), backgroundSender);
    expect(second).toMatchObject({ success: true, ack: 'DISPOSED', disposed: true, idempotent: true });

    // The disposed identity cannot resurrect on this document.
    expect(host.handle(prepareMessage(), backgroundSender))
      .toMatchObject({ success: false, error: 'LIVE_DUBBING_SESSION_DISPOSED' });
    expect(host.handle(statusMessage(), backgroundSender))
      .toMatchObject({ success: true, active: false, status: 'IDLE' });

    // A fresh session id may still prepare after an explicit dispose.
    expect(host.handle(prepareMessage({ sessionId: 'session-2' }), backgroundSender))
      .toMatchObject({ success: true, ack: 'READY' });
  });

  it('isolates stale documents: a foreign document identity fails closed', () => {
    const host = createHost();
    expect(host.handle(prepareMessage(), backgroundSender).success).toBe(true);

    expect(host.handle(prepareMessage({ documentId: 'doc-2' }), backgroundSender))
      .toMatchObject({ success: false, error: 'LIVE_DUBBING_STALE_DOCUMENT', ignored: true });
    expect(host.handle(statusMessage({ documentId: 'doc-2' }), backgroundSender))
      .toMatchObject({ success: false, error: 'LIVE_DUBBING_STALE_DOCUMENT' });
    expect(host.handle(disposeMessage({ documentId: 'doc-2' }), backgroundSender))
      .toMatchObject({ success: false, error: 'LIVE_DUBBING_STALE_DOCUMENT' });

    // The bound document session is undisturbed by the stale attempt.
    expect(host.handle(statusMessage(), backgroundSender))
      .toMatchObject({ success: true, active: true, status: 'PREPARING_CAPTURE' });
  });

  it('invalidates the old host on navigation without resurrecting it', () => {
    const host = createHost();
    host.handle(prepareMessage(), backgroundSender);
    host.invalidate('NAVIGATION');

    expect(host.handle(statusMessage(), backgroundSender))
      .toMatchObject({ success: true, active: false, status: 'IDLE' });
    expect(host.handle(prepareMessage(), backgroundSender))
      .toMatchObject({ success: false, error: 'LIVE_DUBBING_SESSION_DISPOSED' });
    expect(host.handle(prepareMessage({ sessionId: 'session-2' }), backgroundSender))
      .toMatchObject({ success: true, ack: 'READY' });
  });

  it('rejects non-Background senders and malformed traffic without throwing', () => {
    const host = createHost();
    expect(host.handle(prepareMessage(), { id: 'extension-id', tab: { id: 7 } }))
      .toMatchObject({ success: false, error: 'LIVE_DUBBING_UNAUTHORIZED', ignored: true });
    expect(host.handle(prepareMessage(), { id: 'other-id' }))
      .toMatchObject({ success: false, error: 'LIVE_DUBBING_UNAUTHORIZED' });
    expect(host.handle({ target: FIREFOX_CONTENT_TARGET, action: 'LIVE_DUBBING_CONNECT_PROVIDER', data: {} }, backgroundSender))
      .toMatchObject({ success: false, error: 'LIVE_DUBBING_ACTION_UNSUPPORTED' });
    expect(host.handle(null, backgroundSender))
      .toMatchObject({ success: false, error: 'LIVE_DUBBING_ACTION_UNSUPPORTED' });
    expect(host.handle(prepareMessage({ streamId: 'stream-secret' }), backgroundSender))
      .toMatchObject({ success: false, error: 'LIVE_DUBBING_ACTION_UNSUPPORTED' });
  });

  it('never routes through the production offscreen singleton', async () => {
    const source = await readFile(join(process.cwd(), 'src/features/live-dubbing/firefox/FirefoxContentRuntimeHost.js'), 'utf8');
    expect(source).not.toContain('LiveDubbingController');
    expect(source).not.toContain('liveDubbingController');
    expect(source).not.toContain('offscreen/LiveDubbingController');
  });
});
