/**
 * Subtitle Batch Planner - Logic for optimal grouping of cues into translation batches.
 */
export class SubtitleBatchPlanner {
  /**
   * Plans batches for a set of cues based on provider limits.
   * @param {Array} cues - Array of cue objects
   * @param {Object} limits - { characterLimit, maxChunks }
   * @returns {Array} Array of batches (each batch is an array of cues)
   */
  static plan(cues, limits) {
    if (!cues || cues.length === 0) return [];

    const batches = [];
    let currentBatch = [];
    let currentBatchChars = 0;

    const { characterLimit, maxChunks } = limits;

    for (const cue of cues) {
      const cueChars = (cue.text || '').length;

      // Check if cue itself exceeds limits (very rare for subtitles, but possible)
      if (cueChars > characterLimit) {
        // If we have a current batch, finish it
        if (currentBatch.length > 0) {
          batches.push(currentBatch);
          currentBatch = [];
          currentBatchChars = 0;
        }
        // Add this oversized cue as its own batch (will likely be truncated by provider or need splitting)
        batches.push([cue]);
        continue;
      }

      // Check if adding this cue exceeds batch limits
      const wouldExceedChars = currentBatchChars + cueChars > characterLimit;
      const wouldExceedChunks = currentBatch.length + 1 > maxChunks;

      if (wouldExceedChars || wouldExceedChunks) {
        batches.push(currentBatch);
        currentBatch = [cue];
        currentBatchChars = cueChars;
      } else {
        currentBatch.push(cue);
        currentBatchChars += cueChars;
      }
    }

    // Add final batch
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
  }

  /**
   * Identifies identical cues to avoid redundant translation.
   * (Subtitles often have repeated cues like "[Music]" or "Yes.")
   */
  static deduplicate(cues) {
    const seen = new Map();
    const uniqueCues = [];
    const duplicates = [];

    for (const cue of cues) {
      const text = cue.text.trim();
      if (seen.has(text)) {
        duplicates.push({ cue, originalId: seen.get(text) });
      } else {
        seen.set(text, cue.id);
        uniqueCues.push(cue);
      }
    }

    return { uniqueCues, duplicates };
  }
}
