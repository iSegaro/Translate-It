import { PageTranslationHelper } from '../PageTranslationHelper.js';
import { PAGE_TRANSLATION_TIMING } from '../PageTranslationConstants.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

/**
 * PageTranslationQueueFilter - Logic for filtering the translation queue.
 * Prioritizes Viewport items and fills remaining capacity with buffer items.
 */
export class PageTranslationQueueFilter {
  /**
   * Filter and prioritize items in the queue.
   * @param {Array} queue - Current scheduler queue
   * @param {number} chunkSize - Maximum batch size
   * @returns {Object} { batchItems, remainingItems, itemsToPurge }
   */
  static process(queue, chunkSize) {
    const logger = getScopedLogger(LOG_COMPONENTS.PAGE_TRANSLATION, 'QueueFilter');
    const viewportBuffer = PAGE_TRANSLATION_TIMING.VIEWPORT_BUFFER_PX || 100;

    const viewportItems = [];
    const bufferItems = [];
    const otherItems = [];

    for (const item of queue) {
      const targetNode = item.node || item.textNode || item;

      if (PageTranslationHelper.isInViewportWithMargin(targetNode, 0)) {
        viewportItems.push(item);
      } else if (PageTranslationHelper.isInViewportWithMargin(targetNode, viewportBuffer)) {
        bufferItems.push(item);
      } else {
        otherItems.push(item);
      }
    }

    // RULE: If no items in viewport, we don't start a batch just for buffer
    // (Except potentially for isFirstBatch, but that's handled by viewport logic anyway)
    if (viewportItems.length === 0) {
      return { batchItems: [], remainingItems: queue };
    }

    // Pick viewport items up to chunkSize
    const batchItems = viewportItems.slice(0, chunkSize);
    const remainingViewportItems = viewportItems.slice(chunkSize);

    let remainingItems = [...remainingViewportItems];

    // FILLING LOGIC: Only add buffer if there is remaining space in the batch
    if (batchItems.length < chunkSize) {
      const spaceLeft = chunkSize - batchItems.length;
      const bufferToPick = bufferItems.slice(0, spaceLeft);
      batchItems.push(...bufferToPick);

      // Items from buffer that weren't picked stay in queue
      remainingItems.push(...bufferItems.slice(spaceLeft));
    } else {
      // If viewport filled the batch, ALL buffer items stay in queue
      remainingItems.push(...bufferItems);
    }

    // Add off-screen items back
    remainingItems.push(...otherItems);

    logger.debugLazy(() => [
      'Filter Results (Smart Buffer):',
      {
        totalQueue: queue.length,
        batch: batchItems.length,
        viewportFound: viewportItems.length,
        bufferUsed: batchItems.length - Math.min(viewportItems.length, chunkSize),
        remaining: remainingItems.length
      }
    ]);

    return { batchItems, remainingItems };
  }
  }

