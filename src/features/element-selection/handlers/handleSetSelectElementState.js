import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'handleSetSelectElementState');

/**
 * Acknowledge a content-reported Select Element state without changing
 * authoritative Background state.
 */
export async function handleSetSelectElementState(message, sender) {
  const data = message?.data;
  const hasCanonicalActive = data !== null
    && typeof data === 'object'
    && Object.prototype.hasOwnProperty.call(data, 'active');
  // `active` is canonical; accept `activate` only for legacy callers.
  const active = hasCanonicalActive ? data.active === true : data?.activate === true;
  const tabId = sender?.tab?.id || message?.data?.tabId;

  // Log meaningful state changes with proper context
  if (active) {
    logger.info(`Select Element mode activated for tab ${tabId} from ${sender?.tab?.id ? 'content' : 'internal'} source`);
  } else {
    logger.info(`Select Element mode deactivated for tab ${tabId} from ${sender?.tab?.id ? 'content' : 'internal'} source`);
  }
  // logger.operation('handleSetSelectElementState called', {
  //   activate,
  //   tabId,
  //   frameId,
  //   from: sender?.tab?.id ? 'content' : 'internal',
  // });

  if (!tabId) {
    return { success: false, error: 'No tabId available' };
  }

  logger.debug('Ignoring non-authoritative Select Element state report', {
    tabId,
    active,
  });

  return { success: true, tabId, active };
}
