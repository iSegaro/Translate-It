import browser from 'webextension-polyfill';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { EXTENSION_APPS } from '@/shared/constants';

/**
 * Opens an internal extension application by name.
 * Resolves app metadata, then dispatches to the background handler
 * using direct invocation (in-process) or runtime.sendMessage (cross-process).
 *
 * @param {string} appName — key from EXTENSION_APPS
 * @throws {Error} if appName is not registered
 */
export function openExtensionApp(appName) {
  const app = EXTENSION_APPS[appName];
  if (!app) {
    throw new Error(`Unknown extension app: ${appName}`);
  }

  const backgroundService = globalThis.backgroundService;
  if (backgroundService?.messageHandler) {
    const handler = backgroundService.messageHandler.getHandlerForMessage(
      MessageActions.FOCUS_OR_CREATE_TAB,
    );
    if (!handler) {
      throw new Error(
        `Background handler not found for action: ${MessageActions.FOCUS_OR_CREATE_TAB}`,
      );
    }
    return handler(
      { action: MessageActions.FOCUS_OR_CREATE_TAB, data: { urlPath: app.urlPath } },
      { tab: null },
      () => {},
    );
  }

  return browser.runtime.sendMessage({
    action: MessageActions.FOCUS_OR_CREATE_TAB,
    data: { urlPath: app.urlPath },
  });
}
