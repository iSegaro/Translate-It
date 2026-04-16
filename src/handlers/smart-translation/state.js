/**
 * Translation state management for Smart Translation Integration
 */
import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { MAX_AGE, MAX_PROCESSED_MESSAGE_IDS, MAX_COMPLETED_TOAST_IDS, CLEANUP_INTERVAL } from './constants.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'SmartTranslationState');

// Global resource tracker for this module
export const resourceTracker = new ResourceTracker('smart-translation-integration');

// Track message IDs to prevent duplicate processing
export const processedMessageIds = new Set();

// Track message sources to prevent duplicate processing (messageId -> source info)
export const messageSources = new Map();

// Track successfully completed toast IDs to prevent any post-processing
export const successfullyCompletedToastIds = new Set();

// Track active processing by messageId to prevent race conditions (messageId -> { promise })
export const activeProcessing = new Map();

/**
 * Clean up old data to prevent memory leaks
 */
export function cleanupOldData() {
  const initialSources = messageSources.size;
  const initialProcessed = processedMessageIds.size;
  const initialToasts = successfullyCompletedToastIds.size;
  
  const now = Date.now();

  // Clean up old message sources
  for (const [messageId, sourceInfo] of messageSources.entries()) {
    if (now - sourceInfo.timestamp > MAX_AGE) {
      messageSources.delete(messageId);
    }
  }

  // Clean up old processed message IDs
  if (processedMessageIds.size > MAX_PROCESSED_MESSAGE_IDS) {
    // Keep only recent ones (last 500)
    const recentIds = Array.from(processedMessageIds).slice(-500);
    processedMessageIds.clear();
    recentIds.forEach(id => processedMessageIds.add(id));
  }

  // Clean up old completed toast IDs
  if (successfullyCompletedToastIds.size > MAX_COMPLETED_TOAST_IDS) {
    // Keep only recent ones (last 50)
    const recentIds = Array.from(successfullyCompletedToastIds).slice(-50);
    successfullyCompletedToastIds.clear();
    recentIds.forEach(id => successfullyCompletedToastIds.add(id));
  }

  const removedSources = initialSources - messageSources.size;
  const removedProcessed = initialProcessed - processedMessageIds.size;
  const removedToasts = initialToasts - successfullyCompletedToastIds.size;

  if (removedSources > 0 || removedProcessed > 0 || removedToasts > 0) {
    logger.debug('Cleaned up old data', {
      current: {
        messageSources: messageSources.size,
        processedIds: processedMessageIds.size,
        completedToasts: successfullyCompletedToastIds.size
      },
      removed: {
        sources: removedSources,
        processed: removedProcessed,
        toasts: removedToasts
      }
    });
  }
}

// Schedule periodic cleanup using resource tracker
resourceTracker.trackInterval(cleanupOldData, CLEANUP_INTERVAL);
