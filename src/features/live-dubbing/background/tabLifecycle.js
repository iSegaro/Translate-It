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
  const captureStatusChangedListener = (details) => {
    const tabId = details?.tabId;
    const status = details?.status;
    if (!Number.isInteger(tabId) || tabId < 0 || (status !== 'stopped' && status !== 'error')) return;
    void coordinator.handleCaptureStatusChanged({ tabId, status }).catch(() => {});
  };

  browserAPI.tabs?.onRemoved?.addListener(removedListener);
  browserAPI.webNavigation?.onCommitted?.addListener(committedListener);
  browserAPI.tabCapture?.onStatusChanged?.addListener(captureStatusChangedListener);
  registeredBrowsers.add(browserAPI);

  return () => {
    browserAPI.tabs?.onRemoved?.removeListener?.(removedListener);
    browserAPI.webNavigation?.onCommitted?.removeListener?.(committedListener);
    browserAPI.tabCapture?.onStatusChanged?.removeListener?.(captureStatusChangedListener);
    registeredBrowsers.delete(browserAPI);
  };
}
