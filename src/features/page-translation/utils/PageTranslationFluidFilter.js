import { PageTranslationHelper } from '../PageTranslationHelper.js';
import { PAGE_TRANSLATION_TIMING } from '../PageTranslationConstants.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

/**
 * PageTranslationFluidFilter - Optimized filtering logic for "Fluid" mode.
 * Prioritizes Viewport items by score and fills remaining capacity with buffer items.
 */
export class PageTranslationFluidFilter {
  /**
   * Filter and prioritize items for a fluid translation batch.
   * @param {Array} queue - Current scheduler queue
   * @param {Object} config - Batch configuration (chunkSize, maxChars)
   * @returns {Object} { batchItems, remainingItems }
   */
  static process(queue, config) {
    const logger = getScopedLogger(LOG_COMPONENTS.PAGE_TRANSLATION, 'FluidFilter');
    const viewportBuffer = PAGE_TRANSLATION_TIMING.VIEWPORT_BUFFER_PX || 100;
    const { chunkSize, maxChars } = config;

    const viewportItems = [];
    const bufferItems = [];
    const otherItems = [];

    // 1. Partitioning (Categorize items by visibility)
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

    // RULE: If no items in viewport, we don't start a batch just for buffer/off-screen
    if (viewportItems.length === 0) {
      return { batchItems: [], remainingItems: queue };
    }

    // 2. Sorting: Within categories, prioritize by score (DESC)
    viewportItems.sort((a, b) => b.score - a.score);
    bufferItems.sort((a, b) => b.score - a.score);

    const batchItems = [];
    let currentChars = 0;

    // 3. Selection Phase A: Viewport Items (Up to chunkSize/maxChars)
    for (const item of viewportItems) {
      if (batchItems.length >= chunkSize) break;
      if (currentChars + item.text.length > maxChars && batchItems.length > 0) break;

      batchItems.push(item);
      currentChars += item.text.length;
    }

    // Identify remaining viewport items that didn't fit
    const selectedIds = new Set(batchItems.map(i => i.id || i));
    const remainingViewportItems = viewportItems.filter(i => !selectedIds.has(i.id || i));

    // 4. Selection Phase B: Smart Buffer Filling (Only if space is left)
    const usedBufferItems = [];
    if (batchItems.length < chunkSize) {
      for (const item of bufferItems) {
        if (batchItems.length >= chunkSize) break;
        if (currentChars + item.text.length > maxChars) break;

        batchItems.push(item);
        usedBufferItems.push(item);
        currentChars += item.text.length;
      }
    }

    const usedBufferIds = new Set(usedBufferItems.map(i => i.id || i));
    const remainingBufferItems = bufferItems.filter(i => !usedBufferIds.has(i.id || i));

    // 5. Finalizing Remaining Queue
    const remainingItems = [
      ...remainingViewportItems,
      ...remainingBufferItems,
      ...otherItems
    ];

    logger.debugLazy(() => [
      'Fluid Filter Results:',
      {
        total: queue.length,
        batch: batchItems.length,
        viewportFound: viewportItems.length,
        bufferUsed: usedBufferItems.length,
        remaining: remainingItems.length
      }
    ]);

    return { batchItems, remainingItems };
  }
}
