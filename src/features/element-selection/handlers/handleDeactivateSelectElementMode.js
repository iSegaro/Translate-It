import {
  compensateInvalidatedActivationAttempts,
  getCompatibilityFrames,
  getParticipants,
  getProvisionalCleanupFrames,
  invalidateActivationAttempts,
  removeCompatibilityFrame,
  removeProvisionalCleanupFrame,
  removeParticipant,
  setStateForTab,
} from './selectElementStateManager.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import browser from 'webextension-polyfill';
import { MessageFormat, MessagingContexts } from '@/shared/messaging/core/MessagingCore.js';
// import { generateBackgroundMessageId } from '@/utils/messaging/messageId.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'handleDeactivateSelectElementMode');

/**
 * Handle deactivation for every registered frame and publish inactive state only
 * after each participant confirms cleanup or disappears.
 */
export async function handleDeactivateSelectElementMode(message, sender) {
  const tabId = sender?.tab?.id || message?.data?.tabId;

  logger.operation('handleDeactivateSelectElementMode called', {
    tabId,
    from: sender?.tab?.id ? 'content' : 'internal',
  });

  if (!tabId) {
    return { success: false, error: 'No tabId available' };
  }

  try {
    // Invalidate pending activation ACKs before checking participant state.
    const invalidatedAttempts = invalidateActivationAttempts(tabId);
    const participantSnapshot = getParticipants(tabId);
    const compatibilitySnapshot = getCompatibilityFrames(tabId);
    const provisionalSnapshot = getProvisionalCleanupFrames(tabId);
    const participantFrameIds = [...participantSnapshot.entries()];
    let staleGenerationDetected = false;
    const removeSnapshotParticipant = (frameId, generation) => {
      const currentGeneration = getParticipants(tabId).get(frameId);
      if (currentGeneration !== undefined && currentGeneration !== generation) {
        staleGenerationDetected = true;
      }
      return removeParticipant(tabId, frameId, generation);
    };
    const retireMissingParticipant = async (frameId, generation) => {
      try {
        const frames = await browser.webNavigation.getAllFrames({ tabId });
        const frameStillExists = Array.isArray(frames)
          && frames.some(frame => frame?.frameId === frameId);

        if (!frameStillExists) {
          removeSnapshotParticipant(frameId, generation);
        }
      } catch {
        // Keep participant when frame existence cannot be confirmed.
      }
    };
    const isFrameLive = async frameId => {
      try {
        const frames = await browser.webNavigation.getAllFrames({ tabId });
        return Array.isArray(frames) && frames.some(frame => frame?.frameId === frameId);
      } catch {
        return true;
      }
    };

    const participantCleanup = Promise.all(participantFrameIds.map(async ([frameId, generation]) => {
      let response;
      const deactivationMessage = MessageFormat.create(
        MessageActions.DEACTIVATE_SELECT_ELEMENT_MODE,
        {
          mode: 'normal',
          active: false,
          fromBackground: true,
          activationGeneration: generation,
          // Mark this as an explicit deactivation request
          isExplicitDeactivation: true
        },
        MessagingContexts.CONTENT
      );

      try {
        response = await browser.tabs.sendMessage(
          tabId,
          deactivationMessage,
          { frameId }
        );

        if (
          response?.success === true
          && response?.cleanupCompleted === true
          && response?.activated === false
        ) {
          removeSnapshotParticipant(frameId, generation);
        }
      } catch (error) {
        logger.warn('Failed to deactivate Select Element frame:', { tabId, frameId, error });
      }

      if (!(
        response?.success === true
        && response?.cleanupCompleted === true
        && response?.activated === false
      )) {
        await retireMissingParticipant(frameId, generation);
      }
    }));
    const compatibilityCleanup = Promise.all([...compatibilitySnapshot.entries()].map(async ([frameId]) => {
      let response;
      try {
        response = await browser.tabs.sendMessage(
          tabId,
          MessageFormat.create(
            MessageActions.DEACTIVATE_SELECT_ELEMENT_MODE,
            {
              mode: 'normal',
              active: false,
              fromBackground: true,
              isExplicitDeactivation: true,
            },
            MessagingContexts.CONTENT,
          ),
          { frameId },
        );
      } catch (error) {
        logger.warn('Failed to deactivate compatibility Select Element frame:', { tabId, frameId, error });
      }

      if (
        response?.success === true
        && response?.cleanupCompleted === true
        && response?.activated === false
      ) {
        removeCompatibilityFrame(tabId, frameId);
      } else if (!(await isFrameLive(frameId))) {
        removeCompatibilityFrame(tabId, frameId);
      }
    }));
    const provisionalAttempts = [
      ...invalidatedAttempts,
      ...provisionalSnapshot.map(({ frameId, generation }) => ({ generation, frameIds: [frameId] })),
    ];
    const [compensationResults] = await Promise.all([
      compensateInvalidatedActivationAttempts(tabId, provisionalAttempts),
      participantCleanup,
      compatibilityCleanup,
    ]);

    for (const result of compensationResults) {
      if (!result.settled && await isFrameLive(result.frameId)) {
        return {
          success: false,
          error: 'Could not deactivate Select Element mode.',
        };
      }
      if (!result.settled) {
        removeProvisionalCleanupFrame(tabId, result.frameId, result.generation);
      }
    }

    if (staleGenerationDetected) {
      return {
        success: false,
        error: 'Could not deactivate Select Element mode.',
      };
    }

    if (
      getParticipants(tabId).size > 0
      || getCompatibilityFrames(tabId).size > 0
      || getProvisionalCleanupFrames(tabId).length > 0
    ) {
      return {
        success: false,
        error: 'Could not deactivate Select Element mode.',
      };
    }

    setStateForTab(tabId, false);
    return { success: true, tabId, active: false };
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
}
