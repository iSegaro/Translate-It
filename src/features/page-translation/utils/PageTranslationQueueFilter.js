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
   * @returns {Object} { batchItems, remainingItems }
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
      // SMART PURGE: If the total queue is getting too large (e.g. > 1000) 
      // but nothing is visible, we should drop very far away items
      // to avoid continuous processing of thousands of off-screen nodes.
      if (queue.length > 1000) {
        const MAX_DISTANCE_PX = 3000;
        const purgeResult = this._purgeDistantItems(otherItems, MAX_DISTANCE_PX);
        
        if (purgeResult.purgedCount > 0) {
          logger.debug(`Purged ${purgeResult.purgedCount} items that were too far (> ${MAX_DISTANCE_PX}px)`);
          return { batchItems: [], remainingItems: [...bufferItems, ...purgeResult.remaining] };
        }
      }
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

  /**
   * Internal helper to filter out items that are physically far from the viewport.
   * Marks them as "ejected" so the scheduler can handle them specially.
   */
  static _purgeDistantItems(items, maxDistance) {
    const remaining = [];
    let purgedCount = 0;

    for (const item of items) {
      const targetNode = item.node || item.textNode || item;
      
      // If we can't determine distance or it's within range, keep it
      if (!targetNode || PageTranslationHelper.isInViewportWithMargin(targetNode, maxDistance)) {
        remaining.push(item);
      } else {
        // MARK FOR RETRY: Instead of final resolution, mark it as ejected.
        // The scheduler will resolve it with the original text but in a way 
        // that allows domtranslator to potentially try again later if it becomes visible.
        item.isEjected = true;
        purgedCount++;
      }
    }

    return { remaining, purgedCount, ejectedItems: items.filter(i => i.isEjected) };
  }
}
