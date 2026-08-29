import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { handleDeactivateSelectElementMode } from './handleDeactivateSelectElementMode.js';

const logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'handleIframeSelectElementFinished');

/**
 * Deactivates Select Element mode after an extension-owned child-frame completion.
 * Browser-provided sender identity is authoritative; message payload identity is ignored.
 */
export async function handleIframeSelectElementFinished(message, sender) {
  const tabId = sender?.tab?.id;
  const frameId = sender?.frameId;

  if (!Number.isInteger(tabId) || !Number.isInteger(frameId) || frameId <= 0) {
    logger.warn('Rejected iframe Select Element completion from invalid sender', {
      tabId,
      frameId,
    });
    return {
      success: false,
      error: 'Invalid iframe Select Element completion sender',
    };
  }

  const trustedMessage = {
    action: MessageActions.DEACTIVATE_SELECT_ELEMENT_MODE,
  };

  if (typeof message?.data?.reason === 'string') {
    trustedMessage.data = { reason: message.data.reason };
  }

  return handleDeactivateSelectElementMode(trustedMessage, {
    tab: { id: tabId },
    frameId,
  });
}
