/**
 * Subtitle Context Builder - Provides neighboring cue context for AI translation.
 * Helps AI understand the flow of dialogue for better gender and tone consistency.
 */
export class SubtitleContextBuilder {
  /**
   * Builds context for a specific cue within its parent list.
   * @param {number} cueIndex - Index of the current cue
   * @param {Array} allCues - The full list of cues
   * @param {Object} options - { windowSize: number }
   * @returns {Object} { previous: Array, next: Array }
   */
  static buildContext(cueIndex, allCues, options = { windowSize: 2 }) {
    const { windowSize } = options;
    
    const start = Math.max(0, cueIndex - windowSize);
    const end = Math.min(allCues.length, cueIndex + windowSize + 1);
    
    const previous = allCues.slice(start, cueIndex).map(c => c.text);
    const next = allCues.slice(cueIndex + 1, end).map(c => c.text);
    
    return { previous, next };
  }

  /**
   * Builds a compact string representation of the context for prompt injection.
   */
  static formatContextString(context) {
    let contextStr = '';
    if (context.previous.length > 0) {
      contextStr += `Previous cues: ${context.previous.join(' | ')}\n`;
    }
    if (context.next.length > 0) {
      contextStr += `Next cues: ${context.next.join(' | ')}\n`;
    }
    return contextStr.trim();
  }

  /**
   * Builds dialogue context for an entire batch to pass to DeepL.
   * DeepL's context parameter applies to the whole batch, not per-item.
   * @param {Array} batch - Cues in current batch
   * @param {Array} allCues - All cues in the subtitle file
   * @param {number} previousCueCount - Number of cues from previous batch to include as context
   * @returns {string} Compact dialogue context string (max ~800 chars for DeepL's 1024 limit)
   */
  static buildBatchContext(batch, allCues, previousCueCount = 3) {
    if (!batch || batch.length === 0) return '';

    const firstCue = batch[0];
    const firstCueIndex = allCues.findIndex(c => c.id === firstCue.id);

    if (firstCueIndex === -1) return '';

    // Get cues before this batch for continuity
    const contextStart = Math.max(0, firstCueIndex - previousCueCount);
    const previousCues = allCues.slice(contextStart, firstCueIndex).map(c => c.text);

    if (previousCues.length === 0) return '';

    // Format as subtitle dialogue snippet, limit to ~800 chars (DeepL's context limit is 1024)
    let dialogueContext = `Subtitle dialogue: ${previousCues.join(' | ')}`;
    if (dialogueContext.length > 800) {
      dialogueContext = dialogueContext.substring(0, 800) + '...';
    }

    return dialogueContext;
  }
}
