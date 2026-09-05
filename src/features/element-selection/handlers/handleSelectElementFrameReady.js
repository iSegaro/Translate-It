import { reconcileNewFrameIfActive } from './selectElementStateManager.js';
import browser from 'webextension-polyfill';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'handleSelectElementFrameReady');

/**
 * Narrow readiness signal from iframe ContentMessageHandler.
 * Does NOT grant authority; only indicates receiver is ready for reconciliation.
 */
export async function handleSelectElementFrameReady(message, sender) {
  const tabId = sender?.tab?.id;
  const frameId = sender?.frameId;

  if (!Number.isInteger(tabId) || !Number.isInteger(frameId) || frameId < 0) {
    logger.debug('Ignoring frame-ready without valid tab/frame', { tabId, frameId });
    return { success: false, error: 'Invalid sender' };
  }

  // Authority identity: sender.documentId or browser webNavigation; payload documentId is not trusted.
  let documentId = sender?.documentId || null;
  if (typeof documentId !== 'string' || !documentId.trim()) {
    documentId = null;
    try {
      if (browser.webNavigation?.getAllFrames) {
        const frames = await browser.webNavigation.getAllFrames({ tabId });
        const match = Array.isArray(frames) ? frames.find(f => f?.frameId === frameId) : null;
        if (match && typeof match.documentId === 'string' && match.documentId.trim()) {
          documentId = match.documentId;
        }
      }
    } catch {
      // ignore
    }
  }

  try {
    const joined = await reconcileNewFrameIfActive(tabId, frameId, documentId);
    return { success: true, joined: !!joined, tabId, frameId, documentId };
  } catch (error) {
    logger.warn('Frame-ready reconciliation failed', { tabId, frameId, error });
    return { success: false, error: error?.message || String(error) };
  }
}
