import { LIVE_DUBBING_ACTIONS } from '../constants.js';

const { MEDIA_OBSERVER_HELLO: HELLO, MEDIA_OBSERVATION: OBSERVATION,
  MEDIA_OBSERVER_REFRESH: REFRESH, MEDIA_OBSERVER_STOP: STOP } = LIVE_DUBBING_ACTIONS;

/** Install the per-frame, consent-gated media playback observer. */
export function installMediaObserver({ runtime = globalThis.chrome?.runtime, document = globalThis.document } = {}) {
  if (!runtime?.sendMessage || !document) return () => {};

  let epoch = 0;
  let token;
  let sessionToken;
  let revision = 0;
  let playing = false;
  let observer;
  let armed = false;
  const media = new Set();

  const disarm = () => {
    epoch += 1;
    armed = false;
    observer?.disconnect();
    observer = undefined;
    document.removeEventListener('play', onMediaEvent, true);
    document.removeEventListener('playing', onMediaEvent, true);
    document.removeEventListener('pause', onMediaEvent, true);
    document.removeEventListener('ended', onMediaEvent, true);
    document.removeEventListener('volumechange', onMediaEvent, true);
    media.clear();
    playing = false;
    token = undefined;
    sessionToken = undefined;
  };

  const sendObservation = (frameStructureChanged = false) => {
    const sentToken = token;
    const sentEpoch = epoch;
    if (!armed || !sentToken) return;
    try {
      const result = runtime.sendMessage({
        action: OBSERVATION,
        data: {
          token: sentToken,
          revision,
          playing,
          ...(frameStructureChanged ? { frameStructureChanged: true } : {})
        }
      });
      result?.catch?.(() => {
        if (armed && epoch === sentEpoch && token === sentToken) disarm();
      });
    } catch {
      if (armed && epoch === sentEpoch && token === sentToken) disarm();
    }
  };

  const collect = () => {
    for (const element of media) if (!element.isConnected) media.delete(element);
    for (const element of document.querySelectorAll('audio, video')) media.add(element);
  };

  const readPlaying = () => {
    for (const element of media) {
      if (element.isConnected && !element.paused && !element.ended && !element.muted && element.volume > 0) return true;
    }
    return false;
  };

  function onMediaEvent(event) {
    if (!armed || !event.target?.matches?.('audio, video')) return;
    if (event.target.isConnected) media.add(event.target);
    else media.delete(event.target);
    const nextPlaying = readPlaying();
    if (nextPlaying === playing) return;
    playing = nextPlaying;
    revision += 1;
    sendObservation();
  }

  const snapshot = () => {
    collect();
    playing = readPlaying();
    revision += 1;
    sendObservation();
  };

  const authorize = async () => {
    const request = ++epoch;
    let response;
    try {
      response = await runtime.sendMessage({ action: HELLO });
    } catch {
      if (request === epoch) disarm();
      return;
    }
    if (request !== epoch) return;
    if (response?.observe !== true || typeof response.token !== 'string' || !response.token ||
      typeof response.sessionToken !== 'string' || !response.sessionToken) {
      disarm();
      return;
    }
    if (!armed) {
      armed = true;
      document.addEventListener('play', onMediaEvent, true);
      document.addEventListener('playing', onMediaEvent, true);
      document.addEventListener('pause', onMediaEvent, true);
      document.addEventListener('ended', onMediaEvent, true);
      document.addEventListener('volumechange', onMediaEvent, true);
      observer = new MutationObserver((records) => {
        if (!armed) return;
        const frameStructureChanged = records.some(({ removedNodes }) => [...removedNodes].some((node) =>
          node.nodeType === 1 && (node.matches('iframe') || node.querySelector('iframe'))));
        collect();
        const nextPlaying = readPlaying();
        if (nextPlaying !== playing || frameStructureChanged) {
          playing = nextPlaying;
          revision += 1;
          sendObservation(frameStructureChanged);
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
    token = response.token;
    sessionToken = response.sessionToken;
    if (request !== epoch) return;
    snapshot();
  };

  const onMessage = (message) => {
    if (message?.action === REFRESH) void authorize();
    else if (message?.action === STOP && typeof message.data?.sessionToken === 'string' &&
      message.data.sessionToken.length > 0 && message.data.sessionToken === sessionToken && sessionToken) {
      disarm();
    }
  };
  const onPageShow = () => void authorize();
  const onPageHide = (event) => {
    if (armed) {
      playing = false;
      revision += 1;
      sendObservation();
    }
    disarm();
    if (!event?.persisted) {
      runtime.onMessage?.removeListener(onMessage);
      document.defaultView?.removeEventListener('pagehide', onPageHide);
      document.defaultView?.removeEventListener('pageshow', onPageShow);
    }
  };

  runtime.onMessage?.addListener(onMessage);
  document.defaultView?.addEventListener('pagehide', onPageHide);
  document.defaultView?.addEventListener('pageshow', onPageShow);
  void authorize();
  return onPageHide;
}
