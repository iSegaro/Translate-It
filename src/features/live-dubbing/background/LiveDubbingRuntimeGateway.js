import browser from 'webextension-polyfill';

/**
 * Thin platform boundary for Live Dubbing runtime, tab, and capture APIs.
 * Policy, message construction, and lifecycle interpretation remain in the
 * Coordinator.
 */
export class LiveDubbingRuntimeGateway {
  constructor(options = {}) {
    this.browserAPI = options.browserAPI || browser;
    this.chromeAPI = options.chromeAPI || globalThis.chrome || this.browserAPI;
  }

  supportsTabCapture() {
    return typeof this.chromeAPI?.tabCapture?.getMediaStreamId === 'function';
  }

  sendMessage(message) {
    const sendMessage = this.browserAPI?.runtime?.sendMessage;
    if (typeof sendMessage !== 'function') {
      return Promise.reject(new Error('offscreen messaging unavailable'));
    }
    return sendMessage.call(this.browserAPI.runtime, message);
  }

  sendTabMessage(tabId, message, options = {}) {
    const sendMessage = this.browserAPI?.tabs?.sendMessage;
    if (typeof sendMessage !== 'function') {
      return Promise.reject(new Error('tab messaging unavailable'));
    }
    return sendMessage.call(this.browserAPI.tabs, tabId, message, {
      ...options,
      frameId: 0,
    });
  }

  getMediaStreamId(tabId) {
    const getMediaStreamId = this.chromeAPI?.tabCapture?.getMediaStreamId;
    if (typeof getMediaStreamId !== 'function') return undefined;
    return getMediaStreamId.call(this.chromeAPI.tabCapture, { targetTabId: tabId });
  }

  getTab(tabId) {
    const getTab = this.browserAPI?.tabs?.get;
    if (typeof getTab !== 'function') return undefined;
    return getTab.call(this.browserAPI.tabs, tabId);
  }

  getActiveTab() {
    const query = this.browserAPI?.tabs?.query;
    if (typeof query !== 'function') return undefined;
    return Promise.resolve(query.call(this.browserAPI.tabs, { active: true, currentWindow: true }))
      .then(tabs => tabs?.[0] || null);
  }

  getCapturedTabs() {
    const getCapturedTabs = this.chromeAPI?.tabCapture?.getCapturedTabs;
    if (typeof getCapturedTabs !== 'function') return undefined;
    return getCapturedTabs.call(this.chromeAPI.tabCapture);
  }

  async probeTabPresence(tabId) {
    if (typeof this.browserAPI?.tabs?.get !== 'function') return null;

    try {
      const tab = await this.getTab(tabId);
      return tab === undefined ? null : Boolean(tab);
    } catch {
      return false;
    }
  }

  async getCurrentCaptureState(tabId) {
    try {
      const capturedTabs = await this.getCapturedTabs();
      if (capturedTabs === undefined || !Array.isArray(capturedTabs)) return null;

      const matchingTabs = capturedTabs.filter(entry => entry?.tabId === tabId);
      if (matchingTabs.length === 0) return false;
      if (matchingTabs.some(entry => typeof entry?.status !== 'string')) return null;
      return matchingTabs.some(entry => entry.status !== 'stopped' && entry.status !== 'error');
    } catch {
      return null;
    }
  }

  isExtensionPageSender(sender) {
    const extensionUrl = this.browserAPI.runtime?.getURL?.('');
    return typeof sender?.url === 'string'
      && typeof extensionUrl === 'string'
      && sender.url.startsWith(extensionUrl);
  }

  async resolveTabFromSender(sender = {}) {
    const senderTabId = sender?.tab?.id;
    if (!this.isExtensionPageSender(sender)
      && Number.isInteger(senderTabId)
      && senderTabId >= 0) {
      try {
        const tab = await this.getTab(senderTabId);
        return tab === undefined ? sender.tab : tab;
      } catch {
        return null;
      }
    }

    return (await this.getActiveTab()) || null;
  }
}
