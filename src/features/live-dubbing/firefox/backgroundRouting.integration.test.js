import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { FIREFOX_CONTENT_RUNTIME_ACTIONS } from './firefoxContentRuntimeContract.js';
import { FIREFOX_YOUTUBE_SPIKE_MESSAGE_TARGET, FIREFOX_YOUTUBE_SPIKE_MESSAGE_ACTIONS } from '../spikes/firefox/spikeDevTransport.js';
import { LifecycleManager } from '@/core/managers/core/LifecycleManager.js';
import { FirefoxContentRuntimeRegistration } from './firefoxContentRuntimeRegistration.js';
import { installFirefoxSpikeBackgroundReceiver } from '../spikes/firefox/spikeDevBackground.js';

describe('Firefox background routing integration (LifecycleManager + coexistence)', () => {
  beforeEach(() => {
    vi.stubGlobal('__BROWSER__', 'firefox');
    vi.stubGlobal('__IS_DEVELOPMENT__', true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('real LifecycleManager registers expected background handlers (not undefined) and does not register READY', () => {
    const manager = new LifecycleManager();
    manager.registerMessageHandlers();

    // Core handlers that were previously blocked by spike returning Promise for unowned messages
    expect(manager.messageHandler.getHandlerForMessage(MessageActions.GET_LIVE_DUBBING_STATUS)).toEqual(expect.any(Function));
    expect(manager.messageHandler.getHandlerForMessage(MessageActions.START_LIVE_DUBBING)).toEqual(expect.any(Function));
    expect(manager.messageHandler.getHandlerForMessage(MessageActions.STOP_LIVE_DUBBING)).toEqual(expect.any(Function));
    expect(manager.messageHandler.getHandlerForMessage('getSelectElementState')).toEqual(expect.any(Function));
    expect(manager.messageHandler.getHandlerForMessage(MessageActions.GET_SELECT_ELEMENT_STATE)).toEqual(expect.any(Function));
    expect(manager.messageHandler.getHandlerForMessage('isCurrentPageExcluded')).toEqual(expect.any(Function));
    expect(manager.messageHandler.getHandlerForMessage(MessageActions.IS_Current_Page_Excluded)).toEqual(expect.any(Function));
    expect(manager.messageHandler.getHandlerForMessage(MessageActions.PAGE_TRANSLATE_GET_STATUS)).toEqual(expect.any(Function));
    expect(manager.messageHandler.getHandlerForMessage('page-translate-get-status')).toEqual(expect.any(Function));

    // READY must remain handled only by dedicated registration listener, not by LifecycleManager
    expect(manager.messageHandler.getHandlerForMessage(FIREFOX_CONTENT_RUNTIME_ACTIONS.READY)).toBeNull();
    expect(manager.messageHandler.getHandlerForMessage('FIREFOX_CONTENT_RUNTIME_READY')).toBeNull();
  }, 10000);

  it('coexistence: unowned normal Background message → registration/spike returns undefined → generic MessageHandler can respond', () => {
    const listeners = [];
    const fakeRuntime = {
      id: 'extension-id',
      onMessage: {
        addListener: fn => listeners.push(fn),
        removeListener: fn => {
          const idx = listeners.indexOf(fn);
          if (idx >= 0) listeners.splice(idx, 1);
        },
      },
      onConnect: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    };
    const browserAPI = {
      runtime: fakeRuntime,
      tabs: { sendMessage: vi.fn(() => Promise.resolve()) },
    };

    // Install dedicated registration listener (sync, returns undefined)
    const registration = new FirefoxContentRuntimeRegistration({ browserAPI }).install();
    expect(listeners).toHaveLength(1);
    const registrationListener = listeners[0];
    expect(registrationListener).toBeTypeOf('function');
    expect(registrationListener.constructor.name).not.toBe('AsyncFunction');

    // Install spike listener with sync ownership gate (must return undefined for unowned)
    const spikeReceiver = installFirefoxSpikeBackgroundReceiver({ browserAPI, isDevelopment: true });
    expect(spikeReceiver).toBeDefined();
    expect(listeners).toHaveLength(2);
    const spikeListener = listeners[1];
    expect(spikeListener).toBeTypeOf('function');
    expect(spikeListener.constructor.name).not.toBe('AsyncFunction');
    expect(spikeListener.toString().includes('async')).toBe(false);

    // Prepare real LifecycleManager handler
    const manager = new LifecycleManager();
    manager.registerMessageHandlers();
    const handlerListener = manager.messageHandler._handleMessage.bind(manager.messageHandler);
    listeners.push(handlerListener);
    expect(listeners).toHaveLength(3);

    function dispatch(message, sender) {
      for (const fn of listeners) {
        const ret = fn(message, sender, vi.fn());
        if (ret !== undefined && ret !== false) return ret;
      }
      return undefined;
    }

    const normalMessages = [
      { action: MessageActions.GET_LIVE_DUBBING_STATUS, data: {} },
      { action: MessageActions.START_LIVE_DUBBING, data: {} },
      { action: MessageActions.STOP_LIVE_DUBBING, data: {} },
      { action: 'getSelectElementState', data: {} },
      { action: 'isCurrentPageExcluded', data: {} },
      { action: 'page-translate-get-status', data: {} },
      { action: MessageActions.PAGE_TRANSLATE_GET_STATUS, data: {} },
      { action: 'TRANSLATE', data: {} },
    ];

    for (const msg of normalMessages) {
      const regRet = registrationListener(msg, { id: 'extension-id', tab: { id: 1 }, frameId: 0, documentId: 'doc-1' });
      expect(regRet).toBeUndefined();
      expect(regRet instanceof Promise).toBe(false);

      const spikeRet = spikeListener(msg, { id: 'extension-id', url: 'https://www.youtube.com/watch?v=1' });
      expect(spikeRet).toBeUndefined();
      expect(spikeRet instanceof Promise).toBe(false);
    }

    const edgeCases = [null, undefined, 'string', 123, {}, { target: 'other', action: 'x' }, { target: FIREFOX_YOUTUBE_SPIKE_MESSAGE_TARGET, action: 'UNKNOWN_ACTION' }];
    for (const msg of edgeCases) {
      expect(spikeListener(msg, { id: 'extension-id', url: 'https://www.youtube.com/watch?v=1' })).toBeUndefined();
      expect(registrationListener(msg, { id: 'extension-id', tab: { id: 1 }, frameId: 0, documentId: 'doc-1' })).toBeUndefined();
    }

    const sender = { id: 'extension-id' };
    for (const msg of normalMessages) {
      const claimed = dispatch(msg, sender);
      expect(claimed !== undefined && claimed !== false).toBe(true);
      const isPromise = claimed instanceof Promise;
      const isTrue = claimed === true;
      expect(isPromise || isTrue).toBe(true);
    }

    const validSpikeMsg = {
      target: FIREFOX_YOUTUBE_SPIKE_MESSAGE_TARGET,
      action: FIREFOX_YOUTUBE_SPIKE_MESSAGE_ACTIONS.SEND_MESSAGE,
      data: { source: 'original-audio-track', payload: { kind: 'audio', readyState: 'live' } },
    };
    const youtubeSender = { id: 'extension-id', url: 'https://www.youtube.com/watch?v=123' };
    const spikeOwnedRet = spikeListener(validSpikeMsg, youtubeSender);
    expect(spikeOwnedRet instanceof Promise).toBe(true);
    const managerRetForSpike = manager.messageHandler._handleMessage(validSpikeMsg, {}, vi.fn());
    expect(managerRetForSpike).toBe(false);
    const dispatchSpike = dispatch(validSpikeMsg, youtubeSender);
    expect(dispatchSpike instanceof Promise).toBe(true);

    const readyMsg = { target: 'live-dubbing-firefox-content-runtime', action: FIREFOX_CONTENT_RUNTIME_ACTIONS.READY, data: {} };
    const readySender = { id: 'extension-id', tab: { id: 7 }, frameId: 0, documentId: 'doc-1' };
    const readyRegRet = registrationListener(readyMsg, readySender);
    expect(readyRegRet).toBeUndefined();
    expect(registration.get(7, 0)).toEqual({ tabId: 7, frameId: 0, documentId: 'doc-1' });
    const readyManagerRet = manager.messageHandler._handleMessage(readyMsg, {}, vi.fn());
    expect(readyManagerRet).toBe(false);
    const dispatchReady = dispatch(readyMsg, readySender);
    expect(dispatchReady).toBeUndefined();

    const spy = vi.spyOn(spikeReceiver, 'handleMessage');
    spikeListener({ action: 'GET_LIVE_DUBBING_STATUS' }, youtubeSender);
    expect(spy).not.toHaveBeenCalled();
    spikeListener(validSpikeMsg, youtubeSender);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();

    const regHandleRet = registration._handleMessage({ action: 'GET_LIVE_DUBBING_STATUS' }, { id: 'extension-id', tab: { id: 1 }, frameId: 0, documentId: 'd' });
    expect(regHandleRet).toBeUndefined();
    expect(regHandleRet instanceof Promise).toBe(false);
  }, 10000);
});
