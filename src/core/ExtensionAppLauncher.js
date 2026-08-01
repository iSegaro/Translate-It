import browser from 'webextension-polyfill';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { EXTENSION_APPS } from '@/shared/constants';

/**
 * Opens an internal extension application by name.
 * Resolves app metadata, then dispatches to the background handler
 * using direct invocation (in-process) or runtime.sendMessage (cross-process).
 *
 * @param {string} appName — key from EXTENSION_APPS
 * @param {{ remoteUrl?: string }} [options]
 * @throws {Error} if appName is not registered
 */
export function openExtensionApp(appName, options = {}) {
  const app = EXTENSION_APPS[appName];
  if (!app) {
    throw new Error(`Unknown extension app: ${appName}`);
  }

  const messageData = { urlPath: app.urlPath, launchPolicy: app.launchPolicy };
  if (options.remoteUrl) {
    messageData.remoteUrl = options.remoteUrl;
  }

  const backgroundService = globalThis.backgroundService;
  if (backgroundService?.messageHandler) {
    const handler = backgroundService.messageHandler.getHandlerForMessage(
      MessageActions.LAUNCH_EXTENSION_APP,
    );
    if (!handler) {
      throw new Error(
        `Background handler not found for action: ${MessageActions.LAUNCH_EXTENSION_APP}`,
      );
    }
    return handler(
      { action: MessageActions.LAUNCH_EXTENSION_APP, data: messageData },
      { tab: null },
      () => {},
    );
  }

  return browser.runtime.sendMessage({
    action: MessageActions.LAUNCH_EXTENSION_APP,
    data: messageData,
  });
}
