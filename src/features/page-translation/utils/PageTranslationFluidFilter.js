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
      
      // Pass logger to identify why items are skipped
      if (PageTranslationHelper.isInViewportWithMargin(targetNode, 0, logger)) {
        viewportItems.push(item);
      } else if (PageTranslationHelper.isInViewportWithMargin(targetNode, viewportBuffer, logger)) {
        bufferItems.push(item);
      } else {
        otherItems.push(item);
      }
    }

    // RULE: If no items in viewport OR buffer, we don't start a batch in lazy mode.
    // This prevents unnecessary API calls for far-away content.
    const isLazy = config.lazyLoading !== false;
    if (viewportItems.length === 0 && bufferItems.length === 0 && isLazy) {
      return { batchItems: [], remainingItems: queue };
    }

    // 2. Sorting: Prioritize by Context, then Target-Script Match, then Score
    // This quarantines texts that match target script to prevent poisoning other items.
    const contextSorter = (a, b) => 
      (a.contextId - b.contextId) || 
      (Number(a.matchesTargetScript) - Number(b.matchesTargetScript)) || 
      (b.score - a.score);
    
    viewportItems.sort(contextSorter);
    bufferItems.sort(contextSorter);
    if (!isLazy) {
      otherItems.sort(contextSorter);
    }

    const batchItems = [];
    let currentChars = 0;
    let batchMatchesTarget = null;

    // 3. Selection Phase A: Viewport Items (Up to chunkSize/maxChars)
    for (const item of viewportItems) {
      if (batchItems.length >= chunkSize) break;
      if (currentChars + item.text.length > maxChars && batchItems.length > 0) break;
      
      // SCRIPT PURITY: Don't mix "target-script matches" with "other scripts"
      if (batchItems.length > 0 && item.matchesTargetScript !== batchMatchesTarget) break;
      
      if (batchItems.length === 0) batchMatchesTarget = item.matchesTargetScript;

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

    // 5. Selection Phase C: Off-Screen Filling (Only if NOT lazy and space is left)
    const usedOtherItems = [];
    if (!isLazy && batchItems.length < chunkSize) {
      for (const item of otherItems) {
        if (batchItems.length >= chunkSize) break;
        if (currentChars + item.text.length > maxChars) break;

        batchItems.push(item);
        usedOtherItems.push(item);
        currentChars += item.text.length;
      }
    }

    const usedOtherIds = new Set(usedOtherItems.map(i => i.id || i));
    const remainingOtherItems = otherItems.filter(i => !usedOtherIds.has(i.id || i));

    // 6. Finalizing Remaining Queue
    const remainingItems = [
      ...remainingViewportItems,
      ...remainingBufferItems,
      ...remainingOtherItems
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
