import browser from 'webextension-polyfill';
import { liveDubbingCoordinator } from './LiveDubbingCoordinator.js';

const registeredBrowsers = new WeakSet();

export function registerLiveDubbingTabLifecycle({
  browserAPI = browser,
  coordinator = liveDubbingCoordinator,
} = {}) {
  if (!browserAPI || (typeof browserAPI !== 'object' && typeof browserAPI !== 'function')) {
    return () => {};
  }
  if (registeredBrowsers.has(browserAPI)) return () => {};

  const removedListener = (tabId) => {
    void coordinator.handleTabRemoved(tabId).catch(() => {});
  };
  const committedListener = (details) => {
    if (details?.frameId !== 0) return;
    void coordinator.handleTopLevelNavigation(details.tabId).catch(() => {});
  };

  browserAPI.tabs?.onRemoved?.addListener(removedListener);
  browserAPI.webNavigation?.onCommitted?.addListener(committedListener);
  registeredBrowsers.add(browserAPI);

  return () => {
    browserAPI.tabs?.onRemoved?.removeListener?.(removedListener);
    browserAPI.webNavigation?.onCommitted?.removeListener?.(committedListener);
    registeredBrowsers.delete(browserAPI);
  };
}
